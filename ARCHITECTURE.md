# Architecture — groundTruth

This document describes how every part of the system fits together: packages, data flows, MCP protocol internals, CI pipelines, and the agent workflow.

**Scope note:** this document covers the build-time system (MCP server, token pipeline, CI). The runtime LLM features in `apps/todolistvite` (smart-add, breakdown) have their own write-ups: [`docs/smart-add-eval.md`](docs/smart-add-eval.md) and [`docs/production-notes.md`](docs/production-notes.md). Deploy infrastructure (Vercel, Render) is covered in the README's ["Live demo"](README.md#live-demo) section.

---

## 1. System Overview

The monorepo solves a single problem: AI agents write frontend code using wrong names — wrong component variant names, wrong token names, wrong API field names. These mistakes look correct, pass TypeScript, and fail at runtime.

The solution is a live query layer (the MCP server) that gives agents exact values from the actual source files before they write any code.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        groundTruth monorepo                      │
│                                                                     │
│  packages/                        apps/                             │
│  ┌──────────────────┐             ┌──────────────────┐              │
│  │   @acme/tokens   │             │  todolistvite    │              │
│  │  (no React dep,  │             │  (demo app +     │              │
│  │  re-exports      │             │  smart-add/      │              │
│  │  acme-ui's       │             │  breakdown, on   │              │
│  │  tokens.json)    │             │  Vercel)         │              │
│  └──────────────────┘             └──────────────────┘              │
│  ┌──────────────────┐             ┌──────────────────┐              │
│  │   @acme/ui       │◄────────────│  todolistvite    │              │
│  │                  │  Vite alias │  (demo app)      │              │
│  │  Button, Input   │             └──────────────────┘              │
│  │  Card, Badge     │             ┌──────────────────┐              │
│  │  tokens.json     │◄────────────│  ui-docs         │              │
│  │  index.css       │  imports    │  (Storybook)     │              │
│  └────────┬─────────┘             └──────────────────┘              │
│           │ reads                                                    │
│           ▼                                                          │
│  ┌──────────────────┐             ┌──────────────────┐              │
│  │  groundtruth-mcp │             │ eslint-plugin-   │              │
│  │                  │             │ acme             │              │
│  │  MCP server      │             │                  │              │
│  │  (tools, stdio + │             │ no-hardcoded-    │              │
│  │  HTTP, on Render)│             │ colors           │              │
│  └────────┬─────────┘             └──────────────────┘              │
│           │ serves                                                   │
│           ▼                                                          │
│  ┌──────────────────┐                                               │
│  │   AI Agent       │  scripts/                                     │
│  │  (Claude Code,   │  ┌─────────────────────────────────────┐     │
│  │   Cursor, etc.)  │  │ review-pr.js   generate-docs.js     │     │
│  └──────────────────┘  │ generate-stories.js                 │     │
│                         └─────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

**`@acme/tokens` note:** it exports `allTokens`/`getToken`/`getTokensByCategory` for non-React consumers (native apps, email templates). It used to ship its own copy of `tokens.json` that nothing imported and that had already drifted from `packages/acme-ui/src/tokens.json` (missing `color.brand.accentForeground`) — the exact failure mode this project exists to prevent, happening to its own token data. Fixed: `packages/tokens/src/index.ts` now imports `../../acme-ui/src/tokens.json` directly (a relative path reaching outside the package, which is fine for an internal import — only `package.json`'s `exports` map is restricted to the package's own directory), so there's one `tokens.json` on disk, not two.

**`no-silent-catch` ESLint rule:** referenced in §9 as planned — it does not exist yet. Removed from this diagram; don't treat it as shipped.

---

## 2. Package Dependency Graph

```
                    ┌─────────────┐
                    │  tokens.json│  (source of truth for all colors,
                    │  (acme-ui)  │   spacing, typography, radius)
                    └──────┬──────┘
                           │ generate-tokens.js
                           ▼
                    ┌─────────────┐
                    │  index.css  │  (CSS custom properties,
                    │  (acme-ui)  │   generated — never edit by hand)
                    └──────┬──────┘
                           │ imported by
              ┌────────────┼────────────┐
              ▼            ▼            ▼
       ┌──────────┐  ┌──────────┐  ┌──────────┐
       │acme-ui   │  │todolist  │  │ ui-docs  │
       │components│  │  vite    │  │(Storybook│
       │(TSX)     │  │          │  │          │
       └────┬─────┘  └────┬─────┘  └──────────┘
            │              │
            │ reads .tsx   │ imports components
            ▼              │ via @acme/ui alias
     ┌──────────────┐      │
     │ groundtruth- │      │
     │     mcp      │◄─────┘
     │              │
     │ exposes tools│
     └──────┬───────┘
            │
            ▼
      ┌─────────┐
      │ AI Agent│
      └─────────┘
```

---

## 3. MCP Architecture — Full Detail

### 3.1 What MCP is

MCP (Model Context Protocol) is a JSON-RPC 2.0 protocol. The AI agent (client) sends method calls; the MCP server returns structured results. No HTTP REST, no GraphQL — plain JSON messages over a transport layer.

```
Agent (client)                          MCP Server
      │                                      │
      │  {"jsonrpc":"2.0","id":1,            │
      │   "method":"tools/call",             │
      │   "params":{                         │
      │     "name":"get_component_api",      │
      │     "arguments":{"name":"button"}    │
      │   }}                                 │
      │─────────────────────────────────────►│
      │                                      │
      │                                      │  loadComponents()
      │                                      │  reads button.tsx
      │                                      │  parses cva() variants
      │                                      │
      │  {"jsonrpc":"2.0","id":1,            │
      │   "result":{                         │
      │     "content":[{                     │
      │       "type":"text",                 │
      │       "text":"button\nProps:\n       │
      │         - variant: 'default'|..."}]  │
      │   }}                                 │
      │◄─────────────────────────────────────│
```

### 3.2 Transport layer

The server supports **two** transports, both built from the exact same `createMcpServer()` — the tool set is defined once and cannot drift between them.

```
┌─────────────────────────────────────────────────────────────┐
│                     createMcpServer()                        │
│                    (src/server.ts)                           │
│                                                             │
│   list_tokens    get_token    find_token_for_value           │
│   list_components   get_component_api                       │
│   list_endpoints    get_endpoint                             │
└───────────┬───────────────────────────┬─────────────────────┘
            │                           │
            ▼                           ▼
 ┌─────────────────────┐    ┌───────────────────────────┐
 │ StdioServerTransport│    │ StreamableHTTPServerTransport│
 │ (src/index.ts)      │    │ (src/http.ts)              │
 │                     │    │                             │
 │ zero-config default │    │ POST /mcp, stateless — a    │
 │ — the client spawns │    │ fresh transport instance    │
 │ the process         │    │ per request                 │
 │                     │    │                             │
 │ npm start           │    │ npm run start:http          │
 │ (.mcp.json:         │    │ → localhost:3100            │
 │  command + args)    │    │ (or the public Render deploy)│
 │                     │    │                             │
 │                     │    │ AUTH_TOKEN opt-in: unset =   │
 │                     │    │ open (local default);        │
 │                     │    │ set = Bearer token required   │
 │                     │    │ on /mcp (not /health)         │
 └─────────────────────┘    └───────────────────────────┘
```

**stdio is the default** — solo use, zero config, the client owns the process lifecycle. **HTTP is for the shared-server case** — one long-running process (locally, or the public `groundtruth-mcp.onrender.com` deploy) that every client points at instead of spawning its own. Both are stateless in the sense that matters: no cache, no session state — every tool call re-reads the source files, so there's nothing to invalidate and nothing to lose between requests or between transports.

**Auth (HTTP only):** opt-in via `AUTH_TOKEN`. Unset, any request is accepted — the pre-auth default, fine for localhost. Set, and `isAuthorized()` requires `Authorization: Bearer <token>` on `/mcp`, checked with `crypto.timingSafeEqual` so a near-miss token can't be brute-forced via response timing. `/health` stays open regardless, for load balancers and uptime monitors.

**Before using the MCP tools, start the server:**
```bash
npm start            # stdio
npm run start:http   # HTTP, http://localhost:3100/mcp
```

### 3.3 Internal call flow — HTTP

```
Agent (MCP client)               HTTP Server (dist/http.js)
──────────────────               ──────────────────────────
                                 main()
                                   └─ createMcpServer() per request
                                        └─ server.tool("list_tokens", ...)
                                        └─ server.tool("get_component_api", ...)
                                        └─ server.tool("get_endpoint", ...)
                                   └─ new StreamableHTTPServerTransport()
                                   └─ server.connect(transport)

POST /mcp ── JSON-RPC request ──► isAuthorized(req)?
                                        └─ AUTH_TOKEN unset → true (open)
                                        └─ AUTH_TOKEN set → check Bearer header
                                        └─ fails → 401, transport never touched
                                   transport.handleRequest(req, res)
                                        └─ McpServer routes to handler
                                        └─ handler calls loadComponents()
                                              └─ readFileSync(SHARED_UI_PATH)
                                              └─ parse .tsx files
                                              └─ return ComponentDef[]
                                        └─ handler formats text response
HTTP 200  ◄── JSON-RPC response ─  transport.send(response)
```

### 3.4 Tool registration pattern

```
src/server.ts
─────────────
export function createMcpServer(): McpServer {
  const server = new McpServer({ name, version });

  server.tool(
    "tool_name",          ← name the agent calls
    "description",        ← what the AI sees in its tool list
    { param: z.string() } ← Zod schema → validated before handler runs
    async ({ param }) => {
      const data = loadSomething();  ← always a loader, never inline readFileSync
      return { content: [{ type: "text", text: "..." }] };
    }
  );

  return server;
}
```

Every tool follows the same contract:
- Input validated by Zod before the handler runs
- Handler calls a loader from `src/loaders.ts` — never calls `readFileSync` directly
- Returns `{ content: [{ type: "text", text }] }` on success
- Returns `{ content: [...], isError: true }` on failure (does NOT throw)

### 3.5 Loader pattern

```
src/loaders.ts                        File system
──────────────                        ───────────

loadTokens()
  └─ path = process.env.SHARED_UI_PATH + "/tokens.json"
  └─ readFileSync(path, "utf8")   ──────────────────────► tokens.json
  └─ JSON.parse(...)
  └─ return DesignToken[]

loadComponents()
  └─ path = process.env.SHARED_UI_PATH
  └─ readdirSync recursive          ──────────────────────► button.tsx
  └─ filter .tsx files                                      input.tsx
  └─ for each file:                                         badge.tsx
       parseCvaVariants(src)                                card.tsx
       or parseInterfaceProps(src)
  └─ return ComponentDef[]

loadApiContracts()
  └─ path = process.env.API_CONTRACT_PATH
  └─ readFileSync(path, "utf8")   ──────────────────────► api.json
  └─ JSON.parse(...)
  └─ return ApiEndpoint[]
```

**Loaders always read from env vars.** No path is ever hardcoded. This means the same server binary works in every environment — local dev, CI, team server — just by changing the env vars.

### 3.6 Component parser — brace-counting

The most subtle piece of the system. Given a `.tsx` source file, it needs to extract the variant options from a `cva()` call:

```tsx
// input: button.tsx
const buttonVariants = cva("base-classes", {
  variants: {
    variant: {
      default: "bg-brand text-white",
      destructive: "bg-red-600 text-white",
      outline: "border border-brand",
    },
    size: {
      sm: "h-8 px-3 text-sm",
      md: "h-10 px-4",
      lg: "h-12 px-6 text-lg",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "md",
  },
});
```

**Why not regex?** Tailwind's arbitrary value syntax uses `{` and `}` inside class strings:
```tsx
"w-[calc(100%-theme(spacing.4))]"
//                              ↑ this { breaks a regex parser
```

**Brace-counting algorithm:**
```
1. Find "variants: {" in source
2. Set depth = 1, start reading characters after the opening {
3. For each character:
   - If '{' → depth++
   - If '}' → depth--
   - If depth == 0 → we've found the closing brace → stop
4. The substring between open and close is the variants object
5. For each top-level key (variant group):
   - Extract the sub-object
   - Read the keys → these are the option names
6. Map to ComponentProp[]
```

This handles arbitrary nesting inside class strings without ever being confused by embedded `{`.

---

## 4. Token Pipeline

How a color change in `tokens.json` reaches the browser and the MCP server simultaneously.

```
┌─────────────────┐
│  tokens.json    │  Source of truth. Structured as:
│                 │  {
│  (edit this)    │    "color": {
│                 │      "brand": {
└────────┬────────┘        "primary": { "value": "#6D28D9",
         │                              "description": "..." }
         │                }
         │              }
         ▼           }
┌─────────────────┐
│ generate-tokens │  Node.js script. Reads tokens.json,
│     .js         │  flattens to dot-notation keys,
│                 │  converts hex → RGB space-separated,
│                 │  writes CSS custom properties.
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   index.css     │  Generated output. Never edit by hand.
│                 │
│  :root {        │  Hex is converted to RGB so values can be
│    --brand-     │  used with opacity:
│    primary:     │    rgb(var(--brand-primary) / 0.5)
│    109 40 217;  │
│  }              │
└────────┬────────┘
         │ imported by
    ┌────┴────┐
    ▼         ▼
┌───────┐  ┌───────┐        ┌────────────────────┐
│todo   │  │ui-docs│        │  groundtruth-mcp   │
│listvite  │(Story │        │                    │
│       │  │book)  │        │  loadTokens()      │
└───────┘  └───────┘        │  reads tokens.json │
                            │  directly (not CSS)│
                            └────────────────────┘
```

**Token drift protection:** If `tokens.json` is changed in a PR without regenerating `index.css`, the CI workflow `token-drift.yml` reruns `generate-tokens.js` and fails if the output differs.

```
PR touches tokens.json
        │
        ▼
token-drift.yml triggers
        │
        ▼
node generate-tokens.js
        │
        ▼
git diff --exit-code index.css
        │
   ┌────┴────┐
   │ clean   │  ✅ CI passes
   │ diff?   │
   └────┬────┘
        │ dirty diff
        ▼
   CI fails with message:
   "Run 'npm run generate-tokens'
    and commit the updated index.css"
```

---

## 5. Agent Workflow

How an AI agent is supposed to use the system. Each rule maps to a mandatory MCP call.

```
Agent receives task: "Add a delete button to TodoListItem"
         │
         ▼
┌────────────────────────────────┐
│ Rule 1: Need a Button?         │
│ → call get_component_api       │
│   ("button")                   │
│                                │
│ Result: variant options are    │
│   default | outline | ghost |  │
│   destructive | accent         │
│                                │
│ Agent writes:                  │
│   <Button variant="destructive"│
│     NOT variant="danger"       │
└────────────┬───────────────────┘
             │
             ▼
┌────────────────────────────────┐
│ Rule 2: Need a color?          │
│ → call get_token               │
│   ("color.feedback.error")     │
│                                │
│ Result: #B91C1C                │
│                                │
│ Agent writes:                  │
│   color: rgb(var(--feedback-   │
│     error))                    │
│   NOT color: "#B91C1C"         │
└────────────┬───────────────────┘
             │
             ▼
┌────────────────────────────────┐
│ Rule 3: Need to fetch data?    │
│ → call list_endpoints          │
│ → call get_endpoint("/todos")  │
│                                │
│ Result: flat array, field      │
│   names are id/title/          │
│   completed/userId             │
│                                │
│ Agent writes:                  │
│   todo.title                   │
│   NOT todo.name                │
└────────────┬───────────────────┘
             │
             ▼
        Writes code
             │
             ▼
┌────────────────────────────────┐
│ ESLint catches at write time:  │
│  @acme/no-hardcoded-colors     │
│  (no-silent-catch: planned,    │
│   not implemented — see §9)    │
└────────────┬───────────────────┘
             │
             ▼
┌────────────────────────────────┐
│ PR review catches at PR time:  │
│  review-pr.js (Claude API)     │
│  checks: scope creep, any      │
│  types, dangerouslySetInner    │
│  HTML, loader pattern, etc.    │
└────────────────────────────────┘
```

---

## 6. CI/CD Pipeline

```
Developer pushes a branch
         │
         ▼
┌─────────────────────────────────────────────┐
│              GitHub Actions                  │
│                                             │
│  pr-review.yml          token-drift.yml     │
│  ────────────           ────────────────    │
│  Triggers on:           Triggers on:        │
│    any PR               PR touching         │
│                         tokens.json         │
│  Steps:                                     │
│  1. checkout            Steps:              │
│  2. setup Node          1. checkout         │
│  3. npm ci              2. setup Node       │
│  4. git diff            3. npm ci           │
│     origin/main...      4. node generate-   │
│     HEAD |                 tokens.js        │
│     node scripts/       5. git diff         │
│     review-pr.js           --exit-code      │
│  5. post result            index.css        │
│     as PR comment                           │
│                                             │
│  Uses:                  Fails with clear    │
│    ANTHROPIC_API_KEY    message if          │
│    (secret)             index.css is stale  │
│    GITHUB_TOKEN                             │
│    (automatic)                              │
└─────────────────────────────────────────────┘
```

---

## 7. Storybook Story Generation

Stories are generated from live MCP output, not maintained by hand. This prevents `argTypes` from drifting when component variants change.

```
node scripts/generate-stories.js
         │
         ▼
  call list_components
         │
         ▼
  ["badge","button","card","input"]
         │
         for each component
         ▼
  call get_component_api(name)
         │
         ▼
  parse response text:
    - Union type → control:"select", options:[...]
    - boolean    → control:"boolean"
    - string     → control:"text"
         │
         ▼
  generate .stories.tsx:
    - argTypes from live options
    - named story per variant
    - size stories (skip "icon")
    - Card: render() with sub-components
         │
         ▼
  write to apps/ui-docs/stories/
    Badge.stories.tsx   ← overwritten
    Button.stories.tsx  ← overwritten
    Card.stories.tsx    ← overwritten
    Input.stories.tsx   ← overwritten
```

**Invariant:** `argTypes` in stories always matches the `cva()` variants in source. Adding a new variant to `button.tsx` and rerunning the generator is all it takes to expose it in Storybook controls.

---

## 8. PR Review Script Architecture

```
git diff main | node scripts/review-pr.js
         │
         ▼
  read diff from stdin
         │
         ▼
  Anthropic SDK
  client.messages.create({
    model: "claude-sonnet-4-6",
    system: SYSTEM_PROMPT,  ← prompt-cached (static, reused across calls)
    messages: [{ role:"user",
      content: "Review this diff: ..." }]
  })
         │
         ▼
  SYSTEM_PROMPT checks (the actual 5 — see scripts/review-pr.js):
  ┌──────────────────────────────────────┐
  │ 1. No hardcoded file paths in src/,  │
  │    must come from env vars — but     │
  │    NOT test code seeding env vars    │
  │    for a spawned subprocess          │
  │ 2. Loaders in loaders.ts, called     │
  │    from server.ts — never inline     │
  │    readFileSync in a tool handler    │
  │ 3. design-system.ts ↔ loaders.ts     │
  │    must stay in sync                 │
  │ 4. No console.log in MCP src         │
  │ 5. No hardcoded hex colors           │
  └──────────────────────────────────────┘
         │
         ▼
  print findings to stdout
  (posted as PR comment by CI)
```

**Prompt caching:** The `SYSTEM_PROMPT` is marked `cache_control: { type: "ephemeral" }`. On repeated calls (e.g., two PRs in the same hour), Anthropic serves the cached prompt prefix, cutting cost and latency.

**Fail-soft vs. fail-hard:** the `messages.create()` call is wrapped separately from the rest of `main()`. An auth/permission error (401/403 — a misconfigured `ANTHROPIC_API_KEY` secret) re-throws and hard-fails the CI job, since that's a real misconfiguration worth surfacing loudly. Any other error (rate limit, overload, network blip) prints `"Automated review unavailable: ..."` and exits 0 — a transient API hiccup shouldn't turn into a hard-failing check on an unrelated PR.

---

## 9. ESLint Plugin Architecture

```
packages/eslint-plugin-acme/
│
├── index.js          ← exports { meta, rules }
│
└── rules/
    ├── no-hardcoded-colors.js
    │     visits: JSXExpressionContainer, TemplateLiteral,
    │             JSXAttribute (className/class only — the arbitrary-value
    │             Tailwind form, e.g. className="bg-[#B91C1C]", is a bare
    │             string literal, never wrapped in an expression container)
    │     flags: string literals matching /#[0-9a-fA-F]{3,8}/
    │     message: "Use rgb(var(--token)). Run list_tokens."
    │
    └── no-silent-catch.js   (planned)
          visits: CatchClause
          flags: empty body, or body with no throw/console.error
          message: "Re-throw or log the error."
```

Both rules are wired into `apps/todolistvite/eslint.config.js` as `"error"` severity. This means a developer gets an inline red underline the moment they type a hardcoded color — before running ESLint manually, before a PR.

---

## 10. Auditor Agent Architecture

Every tool in sections 6-9 is either read-only (the MCP itself) or single-shot
(`review-pr.js`, `generate-stories.js`, `generate-docs.js` — one call in, one
file out). `packages/auditor-agent` is neither: it's a multi-step
[LangGraph](https://github.com/langchain-ai/langgraphjs) graph that writes to
source files, gated behind explicit human approval before every write.

```
START ──▶ scan ──▶ lookupToken ──▶ approve ──▶ applyOrSkip ──▶ report ──▶ END
                        ▲          (interrupt)                   │
                        │                                        │
                        └──────── loop while matches remain ─────┘

scan          — walks a directory for .tsx files, regex-matches hardcoded
                hex literals (same pattern @acme/no-hardcoded-colors flags)
lookupToken   — calls the real groundtruth-mcp server's find_token_for_value
                for the current match, over the same spawn-over-stdio
                transport generate-docs.js/generate-stories.js already use
approve       — calls interrupt(payload); execution pauses (persisted via a
                MemorySaver checkpointer) until the CLI resumes with
                new Command({ resume: { approved: boolean } })
applyOrSkip   — writes the file only if approved; otherwise just logs the skip
report        — prints a summary once every match in every file is resolved
```

**Why this one needs human-in-the-loop and the MCP server itself doesn't:**
`groundtruth-mcp` is deliberately read-only (§3.2) — there is nothing there
for a human to approve. This agent edits files on disk, a real and
consequential action, so pausing for explicit approval before every write is
the correct amount of caution, not decoration.

**A real gotcha, found by running it, not by reading the code:** resuming
with `new Command({ resume: false })` throws `EmptyInputError` — LangGraph
checks whether a resume value was *provided* by testing truthiness, so a
literal `false` is indistinguishable from "no value given at all". Fixed by
always resuming with an object, `{ approved: false }`, never a bare boolean.
`packages/auditor-agent/test/cli.test.mjs` exercises the rejection path so
this can't regress silently.

Full write-up, including a second gotcha about how *not* to test a CLI that
pauses for input: [`packages/auditor-agent/README.md`](packages/auditor-agent/README.md).

---

## 11. How data flows end-to-end for a single agent task

Full trace: developer asks agent "add an error state to the Input":

```
1. Agent reads CLAUDE.md
   → sees Rule 1: call get_component_api before writing JSX

2. Agent calls get_component_api("input")
   → MCP reads packages/acme-ui/src/components/ui/input.tsx
   → parser finds cva() call, extracts variants
   → returns: variant: 'default'|'error'|'ghost'

3. Agent writes:
   <Input variant="error" />
   NOT <Input variant="invalid" />

4. Agent needs the error color
   → calls get_token("color.feedback.error")
   → MCP reads tokens.json
   → returns: #B91C1C

5. Agent writes:
   style={{ borderColor: "rgb(var(--feedback-error))" }}

6. ESLint checks the file on save:
   → @acme/no-hardcoded-colors passes (CSS variable used, not hex)

7. Developer creates PR
   → token-drift.yml: tokens.json unchanged → skipped
   → pr-review.yml: runs review-pr.js
      → diff shows correct variant name, correct CSS variable
      → "No issues found."

8. PR merges. No runtime errors.
```

Compare to without the system:

```
Without MCP:
  Agent writes <Input variant="invalid" />
  TypeScript doesn't catch it (string is assignable)
  Runtime: variant prop falls through to default styles
  Bug looks like a styling issue, not a wrong prop name
  Developer spends time debugging
```

---

## Summary table

| Component | File(s) | Role |
|---|---|---|
| Design tokens | `packages/acme-ui/src/tokens.json` | Single source of truth for all colors, spacing, radius |
| Token generator | `packages/acme-ui/scripts/generate-tokens.js` | Converts tokens.json → CSS custom properties |
| Component library | `packages/acme-ui/src/components/ui/*.tsx` | Shared React components using cva() |
| MCP server factory | `packages/groundtruth-mcp/src/server.ts` | All tool definitions in one place |
| stdio entry point | `packages/groundtruth-mcp/src/index.ts` | Wires McpServer to StdioServerTransport |
| HTTP entry point | `packages/groundtruth-mcp/src/http.ts` | Wires McpServer to StreamableHTTPServerTransport |
| Loaders | `packages/groundtruth-mcp/src/loaders.ts` | All file reads — one function per data source |
| Data interfaces | `packages/groundtruth-mcp/src/design-system.ts` | TypeScript types for all loaded data |
| ESLint plugin | `packages/eslint-plugin-acme/` | Custom rules enforced at write time |
| Story generator | `scripts/generate-stories.js` | Writes story files from live MCP output |
| Docs generator | `scripts/generate-docs.js` | Writes README from live MCP output |
| PR review | `scripts/review-pr.js` | Claude API review on every diff |
| Token drift CI | `.github/workflows/token-drift.yml` | Fails if index.css is stale |
| PR review CI | `.github/workflows/pr-review.yml` | Posts AI review as PR comment |
| Demo app | `apps/todolistvite/` | Consumes @acme/ui, proves the MCP workflow. Also hosts smart-add/breakdown — see `docs/smart-add-eval.md` |
| Storybook | `apps/ui-docs/` | Interactive docs for every component variant |
| Standalone tokens package | `packages/tokens/` | No-React consumer of tokens.json, re-exports acme-ui's copy directly — see note in §1 |
| Vercel functions | `api/parse-todo.js`, `api/breakdown.js` | Serverless handlers for todolistvite, at repo root (not nested) — see `vercel.json` |
| Vercel deploy config | `vercel.json` | Root Directory left unset so the build can still reach `packages/acme-ui`; buildCommand/outputDirectory scoped into `apps/todolistvite` |
| Render deploy config | `render.yaml` | Blueprint for groundtruth-mcp's HTTP transport, `AUTH_TOKEN` set as an unsynced secret |
| Demo recording script | `scripts/demo-storyboard.sh` | Scripted before/after terminal recording for the project GIF |
| Auditor agent | `packages/auditor-agent/` | LangGraph agent: finds hardcoded hex, resolves via MCP, applies fixes only with human-in-the-loop approval — see §10 |

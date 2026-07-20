# Architecture — groundTruth

This document describes how every part of the system fits together: packages, data flows, MCP protocol internals, CI pipelines, and the agent workflow.

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
│  │  (tools)         │             │ no-hardcoded-    │              │
│  └────────┬─────────┘             │ colors           │              │
│           │ serves                │ no-silent-catch  │              │
│           ▼                       └──────────────────┘              │
│  ┌──────────────────┐                                               │
│  │   AI Agent       │  scripts/                                     │
│  │  (Claude Code,   │  ┌─────────────────────────────────────┐     │
│  │   Cursor, etc.)  │  │ review-pr.js   generate-docs.js     │     │
│  └──────────────────┘  │ generate-stories.js                 │     │
│                         └─────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

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

The server uses HTTP exclusively via `StreamableHTTPServerTransport`.

```
┌─────────────────────────────────────────────────────────────┐
│                     createMcpServer()                        │
│                    (src/server.ts)                           │
│                                                             │
│   list_tokens    get_token    list_components               │
│   get_component_api          list_endpoints                 │
│   get_endpoint                                              │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
             ┌─────────────────────┐
             │ StreamableHTTP      │
             │ ServerTransport     │
             │ (src/http.ts)       │
             │                     │
             │ POST /mcp           │
             │ stateless, per-req  │
             │ transport instance  │
             │                     │
             │ npm start           │
             │ → localhost:3100    │
             │                     │
             │ .mcp.json:          │
             │ { "url": "http://   │
             │  localhost:3100/mcp"│
             └─────────────────────┘
```

**HTTP transport design:** Stateless by choice — no sessions, no in-memory state. A new `StreamableHTTPServerTransport` instance is created for each request. This is safe because all state is in the files the server reads; there is nothing to lose between requests.

**Before using the MCP tools, start the server:**
```bash
npm start   # in packages/groundtruth-mcp
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

POST /mcp ── JSON-RPC request ──► transport.handleRequest(req, res)
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
│  @acme/no-silent-catch         │
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
  SYSTEM_PROMPT checks:
  ┌──────────────────────────────────┐
  │ 1. No hardcoded file paths       │
  │ 2. Loaders in server.ts, not     │
  │    inline in tool handlers       │
  │ 3. design-system.ts ↔ loaders.ts │
  │    must stay in sync             │
  │ 4. No console.log in MCP src     │
  │ 5. MCP src change → dist rebuilt │
  │ 6. No hardcoded hex colors       │
  │ 7. No silent catch blocks        │
  │ 8. No dangerouslySetInnerHTML    │
  │ 9. No new `any` types            │
  │ 10. No hardcoded spacing/font px │
  └──────────────────────────────────┘
         │
         ▼
  print findings to stdout
  (posted as PR comment by CI)
```

**Prompt caching:** The `SYSTEM_PROMPT` is marked `cache_control: { type: "ephemeral" }`. On repeated calls (e.g., two PRs in the same hour), Anthropic serves the cached prompt prefix, cutting cost and latency.

---

## 9. ESLint Plugin Architecture

```
packages/eslint-plugin-acme/
│
├── index.js          ← exports { meta, rules }
│
└── rules/
    ├── no-hardcoded-colors.js
    │     visits: JSXExpressionContainer, TemplateLiteral
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

## 10. How data flows end-to-end for a single agent task

Full trace: developer asks agent "add an error state to the Input":

```
1. Agent reads CLAUDE.md
   → sees Rule 1: call get_component_api before writing JSX

2. Agent calls get_component_api("input")
   → MCP reads apps/acme-ui/src/components/ui/input.tsx
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
| Demo app | `apps/todolistvite/` | Consumes @acme/ui, proves the MCP workflow |
| Storybook | `apps/ui-docs/` | Interactive docs for every component variant |

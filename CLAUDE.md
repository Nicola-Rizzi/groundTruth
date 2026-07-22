# groundTruth — Agent Guide

This file is read automatically by Claude Code and any MCP-compatible agent when the project is opened. It tells the agent how to work in this repo without guessing.

---

## What this repo is

A monorepo that solves one problem: AI agents generate frontend code that looks correct but breaks at runtime — wrong prop names, hardcoded colors that don't match the design system, API fields that don't exist.

The fix is an MCP server that exposes the project's source of truth as queryable tools. Before writing any code, an agent calls a tool and gets the exact value from the live source files. No pasting docs into chat. No stale context files.

---

## Monorepo structure

```
packages/
  tokens/              @acme/tokens          — design tokens only, no React dependency
  acme-ui/             @acme/ui              — React components (Button, Input, Card, Badge)
  groundtruth-mcp/                           — MCP server: reads tokens + components + API contracts
  eslint-plugin-acme/  @acme/eslint-plugin   — ESLint rule: no-hardcoded-colors
  auditor-agent/       @acme/auditor-agent   — LangGraph agent: finds hardcoded hex, resolves via MCP,
                                                applies fixes only with human-in-the-loop approval
apps/
  todolistvite/                              — consumer demo app, wired to @acme/ui via Vite alias
                                                (deployed on Vercel — see root vercel.json)
  ui-docs/                                   — Storybook: interactive docs for every component variant
api/                                         — Vercel functions for todolistvite's smart-add/breakdown.
                                                Lives at repo root, not apps/todolistvite/api, because Vercel
                                                Functions must sit under the project's Root Directory, and Root
                                                Directory has to stay unset for the build to reach packages/acme-ui
scripts/
  review-pr.js                               — calls Claude API to review a git diff against project rules
  generate-docs.js                           — generates acme-ui README from live MCP tool output
  generate-stories.js                        — generates Storybook story files from live MCP tool output
  demo-storyboard.sh                         — scripted before/after terminal recording for the project GIF
.github/workflows/
  pr-review.yml                              — runs review-pr.js on every PR, posts result as comment
  token-drift.yml                            — fails if tokens.json changed without regenerating index.css
vercel.json                                  — deploy config for apps/todolistvite (buildCommand/outputDirectory
                                                scoped into the app; Root Directory left unset, see api/ above)
render.yaml                                  — Render blueprint for groundtruth-mcp's HTTP transport
```

---

## Rules for agents — MANDATORY before writing code

### Rule 1 — Before writing any JSX that uses a component
Call `get_component_api(<name>)`. Variant names are specific to this library and cannot be guessed.

```
get_component_api("button")
→ variant: 'default' | 'outline' | 'ghost' | 'destructive' | 'accent'
→ size: 'sm' | 'md' | 'lg' | 'icon'
```

What agents write wrong without this:
- Delete button → `variant="danger"` — correct is `variant="destructive"`
- Error input → `variant="invalid"` — correct is `variant="error"`

### Rule 2 — Before writing any fetch() or data hook
Call `list_endpoints`, then `get_endpoint(<path>)` for the full contract.

```
get_endpoint("/todos")
→ Flat array — NOT { items: [] } or { data: [] }
→ Fields: id, userId, title, completed — NOT name, done, user
```

### Rule 3 — Never hardcode colors
Use `get_token(<name>)`. In JSX use CSS variables, not hex:

```tsx
// correct
style={{ color: "rgb(var(--feedback-error))" }}

// wrong — breaks when the token changes, and the ESLint rule will flag it
style={{ color: "#B91C1C" }}
```

Hardcoded hex is also caught at write time by `@acme/no-hardcoded-colors` (ESLint) and at PR time by `scripts/review-pr.js` (Claude API).

---

## Token pipeline — how a color change reaches the browser

```
packages/acme-ui/src/tokens.json          ← edit this
        ↓
npm run generate-tokens                    ← run this (CI enforces this via token-drift.yml)
        ↓
packages/acme-ui/src/index.css            ← generated, never edit by hand
        ↓
apps/todolistvite and apps/ui-docs        ← import index.css directly
```

Never duplicate CSS variables in app-level stylesheets — they will drift from tokens.json.

If you change `tokens.json` without running `generate-tokens` before pushing, the `token-drift.yml` CI job will fail and tell you exactly what to run.

---

## How to add a new MCP tool

**Step 1 — Add the data interface** to `packages/groundtruth-mcp/src/design-system.ts`:
```typescript
export interface MyData {
  id: string;
  value: string;
}
```

**Step 2 — Add a loader** to `packages/groundtruth-mcp/src/loaders.ts`:
```typescript
export function loadMyData(): MyData[] {
  const path = process.env.MY_DATA_PATH ?? "./path/to/data.json";
  return JSON.parse(readFileSync(path, "utf8"));
}
```

**Step 3 — Register the tool** in `packages/groundtruth-mcp/src/server.ts` inside `createMcpServer()` — **not** in `index.ts` or `http.ts`:
```typescript
server.tool(
  "get_my_data",
  "Description of what this returns.",
  { id: z.string().describe("The item id.") },
  async ({ id }) => {
    const item = loadMyData().find(d => d.id === id);
    if (!item) return { content: [{ type: "text", text: `Not found: ${id}` }], isError: true };
    return { content: [{ type: "text", text: `${item.id} = ${item.value}` }] };
  }
);
```

**Step 4 — Rebuild and test:**
```bash
cd packages/groundtruth-mcp && npm run build

echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_my_data","arguments":{"id":"test"}}}' \
  | node dist/index.js 2>/dev/null
```

**Loader rules (mandatory):**
- Always read from an env var — never hardcode a path
- Never call `readFileSync` inline inside a `server.tool()` handler — always via a loader
- `design-system.ts` and `loaders.ts` must stay in sync: if you add a field to one, update the other

---

## How to add a new component to @acme/ui

1. Create `packages/acme-ui/src/components/ui/<name>.tsx`
2. Use `cva()` from `class-variance-authority` — the MCP parser reads the variants live
3. Use `rgb(var(--<token>))` for all colors — never hardcode hex
4. Export as a named export: `export const MyComponent = ...`

The MCP picks up new components automatically — no MCP rebuild needed.

After adding a component, regenerate the Storybook stories so the new component gets a story file:
```bash
node scripts/generate-stories.js
```

---

## Storybook stories

Story files in `apps/ui-docs/stories/` are **auto-generated** — do not edit them by hand, edits will be overwritten.

They are generated from the live MCP output, so `argTypes` and named stories always match the actual `cva()` variants in the source.

To regenerate after any component change:
```bash
node scripts/generate-stories.js
```

---

## ESLint

The `@acme/no-hardcoded-colors` rule (from `packages/eslint-plugin-acme/`) is wired into `apps/todolistvite/eslint.config.js`. It flags any hex literal in JSX with:

```
Hardcoded color "#B91C1C". Use a CSS variable instead: rgb(var(--<token>)).
Run `list_tokens` in the MCP to find the right token.
```

To run manually:
```bash
node node_modules/.bin/eslint apps/todolistvite/src
```

---

## MCP server

Two transports, same tool set (both call `createMcpServer()` in `src/server.ts`):

```bash
cd packages/groundtruth-mcp

npm start            # stdio — the client spawns this as a subprocess (default, zero-config)
npm run build        # required after any src/ change

npm run start:http   # HTTP — one long-running server the whole team points at
PORT=4000 npm run start:http   # custom port (default 3100)
```

- **stdio** is the zero-config default: the root `.mcp.json` uses `command` + `args`, so each developer's client spawns its own process. Good for solo work.
- **HTTP** is for the shared-server case: run it once (locally or on a shared host) and point every client's config at `http://<host>:3100/mcp` instead of a command. Health check at `/health` (stays open with no token, even when auth is on).
- **Auth on HTTP is opt-in via `AUTH_TOKEN`** — unset, any request is accepted (matches the pre-auth default); set it and clients need `Authorization: Bearer <token>` on every `/mcp` request. See `src/http.ts` and the README's "Live demo" section (the public Render deploy runs with auth on).

Rules specific to `packages/groundtruth-mcp/src/`:
- All tool registrations go in `src/server.ts` (`createMcpServer()`). Never add tools to `index.ts` or `http.ts` — those are just transport entry points.
- No in-memory state, no file caching, no outbound HTTP requests. Reads source files on every tool call — intentional.
- After any `src/` change: `npm run build`.
- Validate the parser after touching `loaders.ts`: `npm run eval`.

---

## How to change which AI agent/client you use

The MCP server is client-agnostic. Only the config file location changes:

| Client | Config file |
|---|---|
| Claude Code | `.mcp.json` in project root (already present) |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Cursor | `~/.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |

That table is for the **stdio** default (`command` + `args`). For the **HTTP** transport, run `npm run start:http` and replace the `command`/`args` block with `"url": "http://your-server:3100/mcp"`.

The agent rules in this `CLAUDE.md` are Claude-specific. Cursor uses `.cursorrules`, Windsurf uses `.windsurfrules` — same content, different filename.

---

## CI workflows

| Workflow | Triggers on | What it does |
|---|---|---|
| `pr-review.yml` | Every PR (opened or updated) | Runs `scripts/review-pr.js`, posts Claude's review as a PR comment |
| `token-drift.yml` | PRs that touch `tokens.json` | Reruns `generate-tokens.js`, fails if `index.css` is stale |

## PR review script

```bash
git diff main | ANTHROPIC_API_KEY=... node scripts/review-pr.js
```

The system prompt enforces project-specific rules: no hardcoded paths, no `console.log` in MCP src, loaders must be separate functions, `design-system.ts` and `loaders.ts` must stay in sync, no hardcoded hex colors.

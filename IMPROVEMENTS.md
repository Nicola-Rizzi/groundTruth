# Improvement Plans & Use Cases

---

## Proposed improvements

### ~~Plan A — Redux store as a 4th data source~~ DROPPED

Redux was removed from the project. No state management library is in use — the app uses React hooks (`useState`, `useEffect`) directly.

---

### ~~Plan B — Token drift CI check~~ ✅ DONE

**What was done:**
- Added `.github/workflows/token-drift.yml`
- Triggers only when `tokens.json` is changed in a PR
- Reruns `generate-tokens.js` and fails if `index.css` is stale
- Error message tells the developer exactly what to run to fix it

---

### ~~Plan C — Shared HTTP MCP server~~ ✅ DONE

**What was done:**
- Extracted all tool registrations to `packages/groundtruth-mcp/src/server.ts` (`createMcpServer()` factory)
- Added `packages/groundtruth-mcp/src/http.ts` — stateless `StreamableHTTPServerTransport`, default port 3100
- `npm run start:http` starts the HTTP server
- `npm start` still runs stdio (no breaking change for existing clients)
- Team members point their client config at `http://your-server:3100/mcp`

---

### ~~Plan D — Storybook stories generated from MCP output~~ ✅ DONE

**What was done:**
- Added `scripts/generate-stories.js`
- Queries `list_components` then `get_component_api` for each component
- Parses union variant types → `argTypes` with `control: "select"` and live options
- Generates named stories for each variant option with contextual children text
- Generates size stories for components with a `size` prop
- Card uses `render()` stories with sub-components (CardHeader, CardTitle, CardContent)
- All 4 story files are marked auto-generated at the top
- Run: `node scripts/generate-stories.js`

---

### ~~Plan E — ESLint rule: no hardcoded hex in JSX~~ ✅ DONE

**What was done:**
- Created `packages/eslint-plugin-acme/` workspace package (`@acme/eslint-plugin`)
- Rule `@acme/no-hardcoded-colors` flags hex literals in JSX expressions and template literals
- Error message names the exact MCP tool to run to find the right token
- Wired into `apps/todolistvite/eslint.config.js` as `"error"` severity
- Root `eslint.config.js` covers all apps if app-level config doesn't exist
- Verified: zero violations on the current clean codebase; fires correctly on planted test

---

## Use cases to test each feature

### MCP server — token tools

| Use case | How to test |
|---|---|
| List all color tokens | `list_tokens({ category: "color" })` → 14 tokens returned |
| List all spacing tokens | `list_tokens({ category: "spacing" })` → 6 tokens returned |
| Resolve a known token | `get_token("color.brand.primary")` → returns `#6D28D9` |
| Resolve new accent-fg token | `get_token("color.brand.accentForeground")` → returns `#FFFFFF` |
| Typo in token name | `get_token("color.brand.primry")` → error + suggestions |
| Token category filter | `list_tokens({ category: "radius" })` → only radius tokens |

### MCP server — component tools

| Use case | How to test |
|---|---|
| List all components | `list_components()` → badge, button, card, input |
| Get button variants | `get_component_api("button")` → destructive listed, NOT danger |
| Get input variants | `get_component_api("input")` → error listed, NOT invalid |
| Case insensitive | `get_component_api("Button")` → same as lowercase |
| Missing component | `get_component_api("dialog")` → error + available list |
| New component auto-detected | Add a `.tsx` file to acme-ui/src, call `list_components` — appears without rebuild |

### MCP server — API contract tools

| Use case | How to test |
|---|---|
| List all endpoints | `list_endpoints()` → 5 endpoints with method + description |
| GET /todos contract | `get_endpoint("/todos")` → flat array, items have title not name |
| POST /todos body | `get_endpoint("/todos")` POST → body: `{title, completed, userId}` |
| Parameterized path | `get_endpoint("/todos/:id")` → single item shape |
| DELETE contract | `get_endpoint("/todos/:id")` DELETE → response is `{}` |
| Unknown path | `get_endpoint("/users")` → error + available paths listed |

### Token pipeline

| Use case | How to test |
|---|---|
| Change a token | Edit `color.brand.primary` in tokens.json, run generate-tokens, check index.css updated |
| CSS variable correct format | index.css should have RGB space-separated values, not hex |
| New token propagates | Add a new token, run generate-tokens, call `get_token` → returned |
| Storybook uses updated token | Run Storybook build after token change → new color visible |

### PR review script

| Use case | How to test |
|---|---|
| Detects console.log in MCP src | Add `console.log("x")` to loaders.ts, diff → flagged |
| Detects hardcoded hex | Add `style={{ color: "#ff0000" }}` to a component, diff → flagged |
| Detects inline readFileSync | Add `readFileSync("path")` inside a tool handler, diff → flagged |
| Clean diff | Make a clean change, diff → "No issues found" |
| Caching works | Run twice on the same diff → second call uses cached system prompt |

### useTodos hook

| Use case | How to test |
|---|---|
| Fetches on mount | Open the app → todos load from JSONPlaceholder |
| Response parsed correctly | Todos display `title` field (not `name`) |
| Add todo | Submit form → POST called, new item appears at top |
| Remove todo | Click Remove → item gone immediately, no 5s delay |
| Toggle complete | Click Complete/Undo → `completed` flips, badge updates |
| Empty form validation | Submit empty form → error shown in `rgb(var(--feedback-error))` color |

### Storybook

| Use case | How to test |
|---|---|
| Build succeeds | `node_modules/.bin/storybook build --config-dir apps/ui-docs/.storybook` → exits 0 |
| All 4 stories render | Badge, Button, Card, Input stories all visible |
| Variant controls match source | Button controls show exactly: default, outline, ghost, destructive, accent |
| Token colors applied | Brand primary visible as correct violet, not hardcoded |
| CSS from acme-ui | Change a token, regenerate, rebuild Storybook → color updates |

### Story generator (generate-stories.js)

| Use case | How to test |
|---|---|
| Generates all 4 story files | `node scripts/generate-stories.js` → Badge, Button, Card, Input stories written |
| argTypes match live variants | Button story has `options: ["default", "outline", "ghost", "destructive", "accent"]` — not a stale hardcoded list |
| Named stories per variant | Button file has `Default`, `Outline`, `Ghost`, `Destructive`, `Accent` exports |
| Contextual children text | `Destructive` story has `children: "Delete"`, not generic "Button" |
| Size stories generated | Button has `Sm`, `Md`, `Lg` stories; `icon` size is skipped (needs special content) |
| Card uses render() | Card stories use `render()` with `CardHeader`/`CardTitle`/`CardContent` sub-components |
| New variant auto-appears | Add a new variant to `button.tsx`, run generator → new named story appears in output |
| New component auto-appears | Add a new `.tsx` component to acme-ui, run generator → new story file created |
| Generator is idempotent | Run twice in a row → no diff |

### Token drift CI (token-drift.yml)

| Use case | How to test |
|---|---|
| Passes when index.css is up to date | Push a PR with tokens.json change + regenerated index.css → green |
| Fails when index.css is stale | Push a PR with tokens.json change but no index.css update → CI fails with clear message |
| Does not run on unrelated changes | Push a PR touching only app code → workflow does not trigger |
| Error message is actionable | Failed run output says: "Run 'npm run generate-tokens' and commit the updated index.css." |

### ESLint rule (@acme/no-hardcoded-colors)

| Use case | How to test |
|---|---|
| Flags hex in style prop | Add `style={{ color: "#B91C1C" }}` to any `.tsx` in todolistvite → ESLint error |
| Flags 3-char hex | `style={{ color: "#fff" }}` → flagged |
| Flags 8-char hex with alpha | `style={{ color: "#B91C1CFF" }}` → flagged |
| Flags hex in template literal | `` const s = `color: #B91C1C` `` → flagged |
| Does not flag CSS variable | `style={{ color: "rgb(var(--feedback-error))" }}` → no error |
| Does not flag non-color strings | `className="bg-red-700"` → no error (Tailwind class, not a hex literal) |
| Error message names the fix | Message says: "Run `list_tokens` in the MCP to find the right token." |
| Clean codebase has zero violations | `node node_modules/.bin/eslint apps/todolistvite/src` → no output |

### MCP HTTP transport (http.ts)

| Use case | How to test |
|---|---|
| Server starts on default port | `npm run start:http` in groundtruth-mcp → listening on 3100 |
| Custom port via env var | `PORT=4000 npm run start:http` → listening on 4000 |
| POST /mcp returns tool result | `curl -X POST http://localhost:3100/mcp -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_tokens","arguments":{}}}' -H "Content-Type: application/json"` → token list |
| Wrong URL returns 404 | `curl http://localhost:3100/` → "Not found" |
| Stateless — no session required | Call POST twice without any session header → both succeed independently |
| Concurrent requests work | Send two tool calls simultaneously → both return correct results |
| stdio still works | `npm start` still runs stdio transport with no changes |
| AUTH_TOKEN unset — open by default | `npm run start:http` (no `AUTH_TOKEN`) → `/mcp` accepts requests with no `Authorization` header |
| AUTH_TOKEN set — no header rejected | `AUTH_TOKEN=secret npm run start:http`, then POST `/mcp` with no `Authorization` header → 401 |
| AUTH_TOKEN set — wrong token rejected | Same, with `Authorization: Bearer wrong` → 401 |
| AUTH_TOKEN set — malformed header rejected | `Authorization: secret` (no `Bearer` scheme) → 401 |
| AUTH_TOKEN set — correct token accepted | `Authorization: Bearer secret` → tool result, not 401 |
| /health stays open regardless | `AUTH_TOKEN` set, `curl http://localhost:3100/health` with no header → 200 `{"status":"ok",...}` |

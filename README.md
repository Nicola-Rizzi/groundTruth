# groundTruth

*Grounding AI in your project's real source of truth — at build time and at runtime.*

AI is only as reliable as what it's working from. Left to training-data instincts it guesses: wrong prop names, hardcoded hex, API fields that don't exist, todo data parsed out of prose. **groundTruth** is the layer that gives the model real structure instead — so an agent writing code reads the actual design system, and an LLM feature in the product returns validated, typed output. Two ends of the lifecycle, one idea: ground the model in truth, and keep a human owning the judgment.

## The problem

AI agents hallucinate component prop names, hardcode wrong hex values, and use incorrect API field names. Every generated file needs a manual review pass. The agent is guessing from training data, not reading your actual project.

## The core idea

An MCP (Model Context Protocol) server exposes your project's source of truth as structured tools. Before writing any code, the agent queries the server and gets exact values — token hex codes, component variant names, API response shapes — from the live source files.

```
@acme/tokens          ← design tokens (source of truth)
     ↓
@acme/ui              ← components (Button, Input, Card, Badge)
     ↓
groundtruth-mcp       ← exposes tokens + component APIs + API contracts to agents
     ↓
agent queries MCP     ← gets real prop names, variant options, response shapes
     ↓
todolistvite          ← consumer app — generated code compiles first time
```

### Proof point

`Button` `variant="destructive"` for a delete action. Without the MCP, an agent writes `"danger"` or `"delete"` or `"red"`. With the MCP, it queries `get_component_api("Button")` and gets the real options: `'default' | 'outline' | 'ghost' | 'destructive' | 'accent'`. One query, correct code.

## AI across the workflow, not just code-gen

The MCP solves correctness at write time. But the same source-of-truth approach is applied at five distinct stages of the lifecycle — the point being that AI is wired across the workflow, with one shared source of truth and a human owning the judgment at each step.

| Stage | What runs | Where |
|---|---|---|
| **Code generation** | Agent queries the MCP for real tokens / component APIs / API contracts before writing | `groundtruth-mcp`, [`prompts/`](prompts) |
| **Review** | Claude API reviews every PR diff against project-specific rules, posts comments | [`scripts/review-pr.js`](scripts/review-pr.js), CI |
| **Testing** | Storybook stories generated from live MCP output, so coverage tracks the real variants | [`scripts/generate-stories.js`](scripts/generate-stories.js) |
| **Documentation** | Component docs generated from live MCP output | [`scripts/generate-docs.js`](scripts/generate-docs.js) |
| **Remediation** | Agent finds hardcoded hex, resolves the real token via MCP, fixes it only with human approval | [`packages/auditor-agent`](packages/auditor-agent) |

The first four are single-shot: one call to the MCP, one file out. Remediation is different in kind, not just in name — it's a multi-step [LangGraph](https://github.com/langchain-ai/langgraphjs) graph (scan → look up → **pause for approval** → apply or skip → loop), because it's the first stage in this table that actually writes to source files. Everything else in this repo that touches the MCP is read-only; this one isn't, so it's the one place a human-in-the-loop gate is load-bearing rather than decorative.

The [`prompts/`](prompts) directory holds versioned, parameterized prompts for each stage — shared and reviewable, not chat one-offs. [`docs/agentic-workflow.md`](docs/agentic-workflow.md) is a worked, honest write-up of a real multi-step agentic run.

## AI in the product, not just the toolchain

Everything above is **build-time** AI — it helps developers and agents write correct code. The repo also has the other axis: **runtime** AI, where an LLM is a feature the end user touches. Same principle — give the model structure instead of hoping it guesses — applied at the other end of the lifecycle.

**Smart-add** ([`apps/todolistvite`](apps/todolistvite)) lets you type a todo in natural language — *"call the dentist next Tuesday, urgent"* — and an LLM returns a **structured todo** (clean title, priority, resolved due date, tags) via tool-calling. The key stays server-side; the model output is validated before it's trusted; the UI renders the result with the design system's real `Badge` variants.

The interesting half is the **eval**: a non-deterministic feature needs a different kind of test. [`eval/smart-add.eval.mjs`](apps/todolistvite/eval/smart-add.eval.mjs) grades a golden set two ways — deterministic checks for the structured fields (dates asserted against a fixed reference), and **LLM-as-judge** for the title, where there's no single right string. It gates on both check- and case-level pass rates, and ships with an offline self-test that proves the eval rewards correct output and catches regressions — no API key needed. [`eval/smart-add.multi-model.eval.mjs`](apps/todolistvite/eval/smart-add.multi-model.eval.mjs) runs the same golden set across models (Sonnet vs. Haiku) side by side, with the judge model pinned independently so the rubric doesn't shift with the model under test. Full write-up: [`docs/smart-add-eval.md`](docs/smart-add-eval.md).

**Break-down** is the streaming counterpart: click "Break down" on any todo and an LLM streams 3–6 subtasks that appear token by token. It shows the other half of frontend-AI work — consuming a server stream (Server-Sent Events), parsing partial output incrementally so completed subtasks render before the response finishes, and a cursor on the line still arriving. The incremental parser ([`src/ai/parseSubtaskStream.ts`](apps/todolistvite/src/ai/parseSubtaskStream.ts)) is pure and unit-tested. Smart-add uses structured tool-calling (one resolved object); break-down uses text streaming (live UX) — the two output modes a frontend-AI engineer needs to handle.

Both features are instrumented for cost and latency: every model call logs token counts, wall-clock latency, time-to-first-token (for the stream), and an estimated cost, at a single SDK seam. That's table stakes for shipping an LLM feature; the line between this and a full observability stack is drawn deliberately in [`docs/production-notes.md`](docs/production-notes.md).

## What this deliberately does NOT automate

The MCP automates the *lookup* of what already exists. It does not make the design decisions:

- **What props a component should have, and what the variants mean.** `get_component_api` guarantees a variant *exists*; it can't tell you which one *means the right thing* (a "pending" state is `muted`, not `error` — both are valid, only one is correct).
- **Accessibility intent**, beyond the mechanical checks.
- **Which state belongs in the global store vs. local component state.**

These need product context, design intent, and team knowledge an agent doesn't have and can't be handed through a context file. Knowing where that line falls — lookup vs. judgment — is the actual skill. The whole repo is built to make that line legible.

## Trust boundary: what the MCP server reads

The server re-reads `tokens.json`, the component `.tsx` sources, and `api.json` live on every call — no caching, so it always reflects the current checkout (see [Design decisions](#design-decisions)). That data lands verbatim in tool results, which land verbatim in the calling model's context.

Here, that's a non-issue: the source is the repo itself, trusted at the same level as the code an agent is already editing. The boundary would move if any of these files started coming from somewhere the repo doesn't control — a CMS-authored token description, a design tool's free-text field, a third-party API contract — since at that point a data field could carry adversarial instructions. That's a data-provenance problem, not an MCP-specific one, but it's exactly the kind of question worth asking before pointing a server at a new source: *who last wrote this file, and do I trust them as much as I trust my own commits?*

## What's in this repo

| Package | What it is |
|---|---|
| [`packages/tokens`](packages/tokens) | Design tokens only — colors, spacing, radius, shadow. No React, no CSS-framework dependency. |
| [`packages/acme-ui`](packages/acme-ui) | React component library on Tailwind + shadcn patterns. Button, Input, Card, Badge. Each uses `cva()` for typed variant props. |
| [`packages/groundtruth-mcp`](packages/groundtruth-mcp) | The MCP server. Reads from `tokens.json`, component `.tsx` source, and `api.json`. Seven tools: `list_tokens`, `get_token`, `find_token_for_value` (reverse lookup — raw value in, matching token out), `list_components`, `get_component_api`, `list_endpoints`, `get_endpoint`; plus one prompt, `component_from_spec`. `list_*` tools paginate (`limit`/`offset`) so results stay bounded at scale. Ships an eval (`npm run eval`) that proves the parser stays faithful to source, plus an e2e suite (`npm test`) that drives the server through the real MCP SDK client — in-memory and over a live stdio subprocess. |
| [`packages/eslint-plugin-acme`](packages/eslint-plugin-acme) | `no-hardcoded-colors` — catches hex literals at write time. |
| [`packages/auditor-agent`](packages/auditor-agent) | LangGraph agent — finds hardcoded hex, resolves the token via the MCP server's own `find_token_for_value`, applies the fix only with human-in-the-loop approval (`interrupt()`/`Command`). The one MCP consumer in this repo that writes files, so the only one that needs the gate. `npm run demo` for an immediate walkthrough. |
| [`apps/todolistvite`](apps/todolistvite) | Consumer demo. Components rewritten from MCP output, imported from the real package via a Vite alias. Also hosts the **smart-add** runtime LLM feature ([`server/`](apps/todolistvite/server), [`eval/`](apps/todolistvite/eval)) — natural-language → structured todo, with its own eval suite, per-IP rate limiting, and a per-deploy model override (`SMART_ADD_MODEL`/`BREAKDOWN_MODEL`). Deployed on Vercel — see [Live demo](#live-demo). |
| [`apps/ui-docs`](apps/ui-docs) | Storybook — every variant of every component, generated from live MCP output. |

## Try it

```bash
npm install
cd packages/groundtruth-mcp && npm run build

# Query the server directly over stdio:
SHARED_UI_PATH=../acme-ui/src \
API_CONTRACT_PATH=../../apps/todolistvite/api.json \
sh -c 'echo "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"get_component_api\",\"arguments\":{\"name\":\"Button\"}}}" | node dist/index.js 2>/dev/null'

# What you get back:
# Button
# import { Button } from "@acme/ui/button";
# variant: 'default' | 'outline' | 'ghost' | 'destructive' | 'accent'
# size: 'sm' | 'md' | 'lg' | 'icon'
# — exact names, not guesses

# Validate the parser against the real components:
npm run eval
```

## Live demo

- **App:** [ground-truth-todolistvite-ks4b.vercel.app](https://ground-truth-todolistvite-ks4b.vercel.app) — smart-add and task breakdown running against the real Anthropic API.
- **MCP server:** `https://groundtruth-mcp.onrender.com/mcp` — the same server described above, publicly reachable, bearer-token protected.

Point any MCP-compatible client at the public server in about 30 seconds — no cloning, no local build. In your client's config (see the table below for the file location), swap the `command`/`args` block for:

```json
{
  "mcpServers": {
    "groundTruth": {
      "url": "https://groundtruth-mcp.onrender.com/mcp",
      "headers": {
        "Authorization": "Bearer <ask the repo owner for the token>"
      }
    }
  }
}
```

The token isn't published here — it's a real credential gating a live server, not a demo value. Ask for it, or spin up your own instance (see "HTTP (shared server)" below) and set your own `AUTH_TOKEN`.

The Render free tier spins down after inactivity — the first request after a quiet period can take 20-30s to wake it back up. `/health` is what a keep-alive (e.g. a free UptimeRobot monitor hitting it every 5 minutes) would ping to avoid that cold start.

## Connect to your AI client

The MCP protocol is client-agnostic. Two ways to run it:

**stdio (default, zero-config).** The root `.mcp.json` is already set up — the client spawns the server as a subprocess. Same JSON format across clients; only the file location changes:

| Client | Config file |
|---|---|
| Claude Code | `.mcp.json` in the project root (already included) |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Cursor | `~/.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |

```json
{
  "mcpServers": {
    "groundTruth": {
      "command": "node",
      "args": ["./packages/groundtruth-mcp/dist/index.js"],
      "env": {
        "SHARED_UI_PATH": "./packages/acme-ui/src",
        "API_CONTRACT_PATH": "./apps/todolistvite/api.json",
        "PROMPTS_PATH": "./prompts"
      }
    }
  }
}
```

**HTTP (shared server).** Run one server the whole team points at:

```bash
cd packages/groundtruth-mcp && npm run start:http   # http://localhost:3100/mcp
```

Then in the client config, replace the `command`/`args` block with `"url": "http://your-server:3100/mcp"`.

**Auth is opt-in.** Unset `AUTH_TOKEN`, the server accepts any request — fine for localhost or a trusted network, and matches the default before this option existed. Set it before exposing the port beyond that:

```bash
AUTH_TOKEN=some-long-random-value npm run start:http
```

Clients then need `Authorization: Bearer some-long-random-value` on every request to `/mcp`. `/health` stays open either way — a load balancer needs to probe liveness without holding a credential, and it leaks nothing beyond "the process is up." Token comparison is constant-time (`crypto.timingSafeEqual`), so a wrong guess can't be brute-forced via response timing.

The agent rules live in [`CLAUDE.md`](CLAUDE.md) (Claude-specific). Cursor uses `.cursorrules`, Windsurf uses `.windsurfrules` — same content, different filename.

## Design decisions

- **Filesystem-only.** The server reads files on every tool call — no database, no network calls beyond MCP itself. Auth on the HTTP transport is opt-in (`AUTH_TOKEN`, see above); stdio has no separate auth layer since the client already controls what it spawns.
- **Tokens are a separate package.** `@acme/tokens` has no React dependency — native apps, email templates, or CSS-in-JS can consume tokens without pulling in components.
- **One server factory, two transports.** `createMcpServer()` is called by both `index.ts` (stdio) and `http.ts` (HTTP), so the tool set is defined once and can't drift between them.
- **`cva()` variant extraction uses brace-counting, not regex.** Tailwind's arbitrary-value syntax contains `{` characters, which breaks regex parsers. The brace-counter handles arbitrary nesting correctly — and `npm run eval` proves it stays correct.

## Read more

- [`prompts/`](prompts) — versioned, parameterized prompts for each lifecycle stage
- [`docs/agentic-workflow.md`](docs/agentic-workflow.md) — a worked, honest agentic run
- [`docs/smart-add-eval.md`](docs/smart-add-eval.md) — the runtime LLM feature and how it's evaluated (deterministic checks + LLM-as-judge)
- [`docs/production-notes.md`](docs/production-notes.md) — cost, latency, and token instrumentation on the runtime features, and where it stops on purpose
- [`packages/groundtruth-mcp/STORY.md`](packages/groundtruth-mcp/STORY.md) — full STAR-format write-up
- [`CLAUDE.md`](CLAUDE.md) — the context-engineering file agents read when working in this repo
- [`packages/acme-ui/docs/dark-mode-adr.md`](packages/acme-ui/docs/dark-mode-adr.md) — architecture decision record for dark-mode token design

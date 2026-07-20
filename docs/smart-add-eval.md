# Smart-add: an LLM feature, and how it's evaluated

Everything else in this repo is **build-time** AI — tooling that helps developers and agents produce correct code. Smart-add is the other axis: **runtime** AI, where an LLM is a feature the end user touches. It's the same principle applied at the other end of the lifecycle — give the model structure instead of hoping it guesses right — but now the structure is a tool schema and the output flows into the product, not into a developer's editor.

## The feature

The todo input accepts natural language — *"call the dentist next Tuesday, urgent"* — and the model returns a **structured todo**: a clean imperative title, a priority, a resolved due date, and topic tags. The UI shows what it extracted (using the design system's `Badge` variants — the real ones the MCP exposes) before committing it.

## How it's built (the boundary)

```
browser  ──POST /api/parse-todo──▶  dev server  ──▶  Anthropic (tool-calling)
  │                                     │
useSmartAdd hook                  server/lib/parseTodo.mjs
(knows only ParsedTodo)           (prompt + schema + validation)
```

- **The key never reaches the browser.** The frontend only knows the endpoint and the `ParsedTodo` type. The Anthropic key lives server-side. In production the dev server becomes a serverless function; the handler logic doesn't change.
- **Structured output via tool-calling.** The model is forced to call a `create_todo` tool whose schema *is* the contract. We get a typed object, not prose to parse.
- **The model is never trusted.** `validateParsed()` is the gate — wrong shape, bad enum, malformed date all get rejected as a `502` (bad upstream), distinct from a `500`. An LLM returning bad data is a runtime reality, not an edge case.
- **One core, three callers.** `parseTodo()` takes an injected `complete` function rather than importing the SDK, so the identical logic runs in the server, the eval, and the offline self-test without drift — the same separation the MCP server uses (`server.ts` transport vs `loaders.ts` logic).

## How it's evaluated (the part most teams skip)

A non-deterministic feature needs a different kind of test. `eval/smart-add.eval.mjs` runs a golden set against the real model and grades two ways:

- **Deterministic checks** for the structured fields — `isTask`, the resolved `dueDate` (asserted against a *fixed* reference date, so relative-date math is testable), `priority`, tags. These have one right answer.
- **LLM-as-judge** for the title — there's no single correct string, so a second model call scores fidelity against a rubric (0–1, pass at ≥ 0.7). This is the part you can't unit-test, and the part that silently drifts when you change a prompt.

The suite gates on **both** a check-level and a case-level pass rate (a case counts only if *all* its checks pass). Run it in CI; change the prompt or bump the model and you see immediately whether quality moved.

### An honest note on eval design

The case-level gate exists because the self-test caught a flaw. The first version gated only on a global check-rate: with ~23 checks, two real regressions still scored 91% and slipped past a 90% bar. The offline self-test (`eval/harness.selftest.mjs`, no API key needed) runs the harness against a *stub* model in two scenarios — a faithful one that must pass, and a deliberately regressed one that must fail — and it surfaced that the threshold was too coarse. Adding case-level gating (6/8 cases = 75%, well under the bar) made a two-case regression fail like it should. The eval testing the feature needed a test of its own.

## Run it

```bash
# the feature (two processes)
ANTHROPIC_API_KEY=... npm run dev:api    # server-side parser
npm run dev                              # the app, proxying /api to it

# the eval against the real model
ANTHROPIC_API_KEY=... npm run eval:smart-add

# the harness self-test — offline, no key, proves the eval rewards correct
# output and catches regressions
npm run eval:smart-add:selftest
```

## What this is not

The demo backend (JSONPlaceholder) doesn't persist the enrichment — priority, due date, and tags are shown in the parse preview but the stored todo keeps the existing shape. The point being demonstrated is the structured-output parse and its evaluation, not the persistence layer. Wiring the enrichment through would mean extending the API contract — a mechanical change, deliberately left out to keep the feature focused on the AI surface.

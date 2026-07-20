# A worked agentic workflow

Most "AI wrote my code" demos show the happy path: one prompt, clean output. That's not the interesting part. The interesting part is what happens across a multi-step task — where the agent goes wrong, what keeps it on rails, and what a human deliberately keeps for themselves. This is one real run, written up honestly.

## The task

Add a feature to the consumer app: each todo item shows a **status badge** — "done" or "pending" — using the existing `Badge` component, driven by the `completed` field from the API.

Small on purpose. It touches three things the agent loves to get wrong: a component's variant names, an API field, and a color. That's exactly where the MCP earns its place.

## The setup that makes it work

Before any prompt, two things are already in place:

- **`CLAUDE.md`** at the repo root — read automatically by the agent. It states the mandatory rules: query `get_component_api` before using a component, query `get_endpoint` before touching data, never hardcode hex.
- **The `groundTruth` MCP** connected, exposing the live tokens, component APIs, and API contracts.

The agent isn't being trusted to know the repo. It's being given the tools to read it.

## The run, step by step

**Step 1 — the agent queries before writing.** Prompted with the task, it calls `get_component_api("Badge")` and gets back the real variant set: `default | outline | success | error | accent | muted`. Then `get_endpoint("/todos")` — the `completed` field is a `boolean`.

This is the whole game. Left to training-data instincts, an agent writes `<Badge variant="green">` or `variant="complete"`. Neither exists. Because it read the API first, it picks from the real set.

**Step 2 — the first attempt, and where it went wrong.** The agent maps `completed === true` → `variant="success"`, `false` → `variant="error"`. The code compiles. But "pending" as a red **error** badge is wrong — pending isn't an error, it's a neutral in-progress state. The agent made a *semantic* mistake the type system can't catch: every value it used was valid, the meaning was off.

**Step 3 — the correction.** This is a human call, not a tool call. `error` → `muted` for the pending state. The MCP guarantees the variant *exists*; it can't tell you which variant *means the right thing*. That judgment is the reviewer's.

**Step 4 — color.** A subtle "done" tint was wanted behind the row. The agent, reminded by `CLAUDE.md`, calls `get_token` rather than reaching for `#dcfce7`, and uses `rgb(var(--feedback-success))`. The ESLint rule and the PR-review prompt would both have caught a raw hex — but the point is it didn't get that far, because the context told it the rule up front.

## What was delegated, and what wasn't

**Delegated** — the mechanical, verifiable parts: looking up the variant set, reading the API field, wiring the boolean to a prop, resolving the token name. Fast, and easy to check against the MCP output.

**Not delegated** — the meaning: that "pending" should read as neutral, not as an error. That's a product and design decision. An agent can be handed the facts of the system; it can't be handed the intent behind it. Knowing where that line falls — what's a lookup versus what's a judgment — is the actual skill, and it's the thing the whole repo is built to make legible.

## The honest takeaway

The MCP didn't make the agent "correct." It made the agent's mistakes *shift category* — from "used an API that doesn't exist" (silent, expensive, caught late) to "used a real API to express the wrong intent" (visible, cheap, caught in review). That's the win: not zero errors, but errors a human can actually see and fix.

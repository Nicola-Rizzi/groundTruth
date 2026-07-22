# Production notes: cost, latency, and where instrumentation stops

Shipping an LLM feature is not done when it works in dev. Every call to the model costs money and takes time, and both vary with input. This is the minimum production-awareness the two runtime features carry, and an honest statement of what they deliberately don't.

## What's instrumented

Every model call passes through one seam — the SDK adapters in [`server/lib/anthropicClient.mjs`](../apps/todolistvite/server/lib/anthropicClient.mjs) — so instrumentation lives there and nothing else has to know about it. Each call emits one structured line ([`server/lib/usage.mjs`](../apps/todolistvite/server/lib/usage.mjs)):

```
[usage] {"t":"…","label":"create_todo","model":"claude-sonnet-4-6","in_tokens":420,"out_tokens":38,"latency_ms":910,"est_usd":0.00183}
[usage] {"t":"…","label":"breakdown","model":"claude-sonnet-4-6","in_tokens":95,"out_tokens":120,"latency_ms":2400,"ttft_ms":380,"est_usd":0.002085}
```

- **`label`** — derived from the forced tool (`create_todo`, `grade`) or `breakdown`, so the three call sites are distinguishable in aggregate with zero extra wiring.
- **token counts** — read from the response (`usage`) for non-streaming, and accumulated from the `message_start` / `message_delta` envelope events for streaming.
- **`latency_ms`** — wall-clock around the call.
- **`ttft_ms`** (streaming only) — time to first token. For a streamed feature this matters more than total latency: it's when the user stops looking at a blank panel.
- **`est_usd`** — token counts times a rate table.

A single structured line per call is enough to ship to any log drain and aggregate (cost per feature per day, p95 latency, token outliers) without a tracing stack.

> **The cost numbers are illustrative.** The per-token rates in `usage.mjs` are placeholders — set them from current pricing (or via `PRICE_IN_PER_MTOK` / `PRICE_OUT_PER_MTOK`) before trusting `est_usd`. The mechanism is the point; the constants are yours to fill in.

## Reading the two features through this lens

- **Cost is dominated by input, not output, here.** Smart-add sends a system prompt plus a tool schema on every call to extract a tiny object — input tokens dwarf output. The levers: keep the system prompt tight, cap `max_tokens` (already 512 / 400), and if volume grew, prompt-cache the static system+schema prefix so repeated calls don't re-pay for it.
- **Latency is a UX decision, not just a number.** Smart-add is request/response: the user waits for the whole object, so total latency is the experience — keep it modest and show a pending state. Break-down streams: total time can be *longer* and still feel faster, because `ttft_ms` is small and content appears immediately. That's the entire reason break-down streams and smart-add doesn't.
- **The judge doubles eval cost.** Each eval case that scores title fidelity makes a second (grade) call. That's a deliberate trade — quality signal on non-deterministic output is worth it — but it's visible in the `grade`-labelled usage lines, which is the point of labelling them.

## Where this stops, on purpose

This is instrumentation, not an observability platform. The line is drawn here deliberately — a portfolio repo that bolts on a tracing stack would be sprawl, not signal. A production deployment at scale would add, roughly in order of payoff:

- ~~**Rate limiting**, so a runaway client can't run up a bill.~~ **Built** — [`server/lib/rateLimit.mjs`](../apps/todolistvite/server/lib/rateLimit.mjs), 20 req/min per IP. It's a speed bump against casual abuse (in-memory, resets per instance/deploy), not a hard cap — the actual backstop against a runaway bill is a low spend limit set directly on the Anthropic console, which no amount of application code can substitute for. **The budget is per-instance, not truly shared**: the dev server imports one module instance for both routes (20/min total across `/api/parse-todo` and `/api/breakdown` combined), but on Vercel each function is bundled separately, so in production an IP gets 20/min *per endpoint* — a real gap between what the code looks like it guarantees and what it guarantees, documented here rather than left implicit.
- **Per-user / per-day spend caps** — still not built. IP-based rate limiting slows down abuse from one source; it doesn't stop a determined attacker with many IPs, or account for legitimate variance in usage.
- **Distributed tracing** — request IDs threaded from the browser through the server to the model call, so a slow request is debuggable end-to-end.
- **Prompt/version tagging** — stamp each call with the prompt version (the `prompts/` library already versions them) so a quality or cost regression can be traced to a specific change.
- **Eval-in-prod sampling** — run a slice of real traffic through the offline eval's judge to catch quality drift that a fixed golden set won't.
- **Alerting** — on error rate (including the `502` "model returned junk" path the server already distinguishes), p95 latency, and daily cost.

Rate limiting aside, none of that is built. It's listed because knowing the path — and choosing not to walk all of it in a portfolio piece — is part of the judgment the repo is meant to show.

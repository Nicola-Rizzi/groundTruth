/**
 * Lightweight production instrumentation for the LLM features.
 *
 * Every model call shipped to users costs money and takes time. This module is
 * the minimum that any real AI feature needs: per-request token counts, latency,
 * and an estimated cost — logged as one structured line you can ship to a log
 * drain and aggregate. It is deliberately NOT a full observability platform
 * (no tracing, no dashboards, no prompt-version store); see docs/production-notes.md
 * for where that line is drawn and what a heavier setup would add.
 */

// Illustrative per-million-token rates. SET THESE from current pricing before
// trusting the cost numbers — they are placeholders, not a source of truth.
// Override at runtime with PRICE_IN_PER_MTOK / PRICE_OUT_PER_MTOK if you prefer.
const RATES_USD_PER_MTOK = {
  "claude-sonnet-4-6": {
    input: Number(process.env.PRICE_IN_PER_MTOK ?? 3.0),
    output: Number(process.env.PRICE_OUT_PER_MTOK ?? 15.0),
  },
};

export function estimateCostUsd(model, usage) {
  const r = RATES_USD_PER_MTOK[model];
  if (!r || !usage) return null;
  const inTok = usage.input_tokens ?? 0;
  const outTok = usage.output_tokens ?? 0;
  return (inTok * r.input + outTok * r.output) / 1_000_000;
}

/**
 * Emit one structured usage record. Goes to stderr so it never mixes with the
 * SSE/JSON written to the client on stdout-equivalent channels.
 */
export function logUsage({ label, model, usage, latencyMs, ttftMs }) {
  const cost = estimateCostUsd(model, usage);
  const record = {
    t: new Date().toISOString(),
    label,
    model,
    in_tokens: usage?.input_tokens ?? null,
    out_tokens: usage?.output_tokens ?? null,
    latency_ms: latencyMs != null ? Math.round(latencyMs) : null,
    ...(ttftMs != null ? { ttft_ms: Math.round(ttftMs) } : {}),
    ...(cost != null ? { est_usd: Number(cost.toFixed(6)) } : {}),
  };
  console.error("[usage] " + JSON.stringify(record));
  return record;
}

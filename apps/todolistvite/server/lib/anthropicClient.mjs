/**
 * Real model client. Wraps the Anthropic SDK into the thin `complete(request)`
 * contract the parsing core expects. This is the only file that imports the SDK,
 * which is what keeps the core runtime-agnostic and the SDK out of the browser bundle.
 *
 * It is also the natural seam for instrumentation: every model call passes through
 * here, so token usage and latency are logged here (via lib/usage.mjs) without the
 * core, the endpoints, or the frontend knowing anything about it.
 */
import Anthropic from "@anthropic-ai/sdk";
import { logUsage } from "./usage.mjs";

// Label a call by the tool it forces (create_todo / grade), else a generic tag.
const labelFor = (request) => request?.tools?.[0]?.name ?? "completion";

export function makeComplete(apiKey = process.env.ANTHROPIC_API_KEY) {
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set. Export it before running the server or eval.");
  }
  const client = new Anthropic({ apiKey });
  return async function complete(request) {
    const start = performance.now();
    const response = await client.messages.create(request);
    logUsage({
      label: labelFor(request),
      model: request.model,
      usage: response.usage,
      latencyMs: performance.now() - start,
    });
    return response;
  };
}

/**
 * Streaming variant: returns an async generator that yields text deltas from a
 * streamed Anthropic response. This is the only place the SDK's streaming API is
 * touched, keeping the breakdown core (lib/breakdown.mjs) transport-agnostic.
 *
 * Usage for a stream arrives in the envelope events (message_start carries input
 * tokens, message_delta the output count), so we accumulate those alongside the
 * text deltas and log once at the end — including time-to-first-token, the metric
 * that actually matters for streaming UX.
 */
export function makeStreamText(apiKey = process.env.ANTHROPIC_API_KEY) {
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set. Export it before running the server.");
  }
  const client = new Anthropic({ apiKey });
  return async function* streamText(request) {
    const start = performance.now();
    let ttftMs = null;
    const usage = { input_tokens: 0, output_tokens: 0 };

    const stream = client.messages.stream(request);
    for await (const event of stream) {
      if (event.type === "message_start") {
        usage.input_tokens = event.message?.usage?.input_tokens ?? usage.input_tokens;
      } else if (event.type === "message_delta" && event.usage) {
        usage.output_tokens = event.usage.output_tokens ?? usage.output_tokens;
      } else if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        if (ttftMs === null) ttftMs = performance.now() - start;
        yield event.delta.text;
      }
    }

    logUsage({
      label: "breakdown",
      model: request.model,
      usage,
      latencyMs: performance.now() - start,
      ttftMs,
    });
  };
}

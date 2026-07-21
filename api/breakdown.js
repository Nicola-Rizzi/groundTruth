/**
 * Vercel serverless function for the streaming "break a task into subtasks"
 * feature. The handler logic is identical to the dev server
 * (apps/todolistvite/server/index.mjs) — only this transport shell differs,
 * per the injected-client architecture in server/lib. Requires a raised
 * `maxDuration` (see vercel.json) since the response stays open for the full
 * SSE stream.
 *
 * Lives at repo-root /api (not apps/todolistvite/api) — see the note in
 * api/parse-todo.js for why.
 */
import { buildBreakdownRequest, MAX_INPUT_LENGTH } from "../apps/todolistvite/server/lib/breakdown.mjs";
import { makeStreamText } from "../apps/todolistvite/server/lib/anthropicClient.mjs";
import { isRateLimited } from "../apps/todolistvite/server/lib/rateLimit.mjs";
import { clientIp } from "../apps/todolistvite/server/lib/clientIp.mjs";

const streamText = makeStreamText(); // throws early if no key — fail fast, not mid-request

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  if (isRateLimited(clientIp(req))) {
    res.status(429).json({ error: "Too many requests. Try again in a minute." });
    return;
  }

  const { input } = req.body ?? {};
  if (typeof input !== "string" || !input.trim()) {
    res.status(400).json({ error: "Body must be { input: string }." });
    return;
  }
  if (input.length > MAX_INPUT_LENGTH) {
    res.status(400).json({ error: `Input exceeds ${MAX_INPUT_LENGTH} characters.` });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const frame = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  try {
    for await (const text of streamText(buildBreakdownRequest(input))) {
      frame({ type: "delta", text });
    }
    frame({ type: "done" });
  } catch (err) {
    // Mid-stream failures can't change the HTTP status (headers already sent),
    // so the error is delivered as a stream event the client handles.
    console.error("stream error:", err);
    frame({ type: "error", message: "Stream failed." });
  }
  res.end();
}

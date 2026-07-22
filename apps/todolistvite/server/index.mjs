#!/usr/bin/env node
/**
 * Dev API server for the smart-add feature.
 *
 * Why a server at all: the Anthropic API key must never reach the browser. The
 * frontend POSTs natural language to /api/parse-todo; the key lives only here,
 * server-side. In production this would be a serverless function — the handler
 * logic (server/lib/parseTodo.mjs) is identical; only this transport shell changes.
 */
import { createServer } from "node:http";
import { parseTodo, ParseError, MAX_INPUT_LENGTH as MAX_PARSE_INPUT_LENGTH } from "./lib/parseTodo.mjs";
import { buildBreakdownRequest, MAX_INPUT_LENGTH as MAX_BREAKDOWN_INPUT_LENGTH } from "./lib/breakdown.mjs";
import { makeComplete, makeStreamText } from "./lib/anthropicClient.mjs";
import { isRateLimited } from "./lib/rateLimit.mjs";
import { clientIp } from "./lib/clientIp.mjs";

const PORT = Number(process.env.API_PORT ?? 8787);
const complete = makeComplete();       // throws early if no key — fail fast, not mid-request
const streamText = makeStreamText();   // same, for the streaming endpoint

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, { status: "ok" });
  }
  if (req.method !== "POST" || (req.url !== "/api/parse-todo" && req.url !== "/api/breakdown")) {
    return send(res, 404, { error: "Not found. POST /api/parse-todo or /api/breakdown." });
  }

  if (isRateLimited(clientIp(req))) {
    return send(res, 429, { error: "Too many requests. Try again in a minute." });
  }

  // ── Streaming: break a task into subtasks (Server-Sent Events) ───────────────
  if (req.url === "/api/breakdown") {
    let input;
    try {
      ({ input } = await readJson(req));
    } catch {
      return send(res, 400, { error: "Invalid JSON body." });
    }
    if (typeof input !== "string" || !input.trim()) {
      return send(res, 400, { error: "Body must be { input: string }." });
    }
    if (input.length > MAX_BREAKDOWN_INPUT_LENGTH) {
      return send(res, 400, { error: `Input exceeds ${MAX_BREAKDOWN_INPUT_LENGTH} characters.` });
    }
    // SSE headers: stream frames as they arrive, no buffering.
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    // If the client disconnects mid-stream, abort the upstream Anthropic call
    // (no point paying for tokens nobody reads) and stop writing to the dead
    // socket — a write to a closed response is itself a source of an uncaught
    // error, including from inside the catch block's own error frame below.
    const abortController = new AbortController();
    let clientGone = false;
    req.on("close", () => {
      clientGone = true;
      abortController.abort();
    });
    const frame = (obj) => {
      if (clientGone) return;
      try {
        res.write(`data: ${JSON.stringify(obj)}\n\n`);
      } catch {
        clientGone = true;
      }
    };
    try {
      for await (const text of streamText(buildBreakdownRequest(input), { signal: abortController.signal })) {
        frame({ type: "delta", text });
      }
      frame({ type: "done" });
    } catch (err) {
      // Mid-stream failures can't change the HTTP status (headers already sent),
      // so the error is delivered as a stream event the client handles — unless
      // the client is the reason the stream stopped, in which case there's no
      // one to deliver it to.
      if (!clientGone) {
        console.error("stream error:", err);
        frame({ type: "error", message: "Stream failed." });
      }
    }
    if (!clientGone) res.end();
    return;
  }

  // ── Non-streaming: parse natural language into a structured todo ─────────────
  let input;
  try {
    ({ input } = await readJson(req));
  } catch {
    return send(res, 400, { error: "Invalid JSON body." });
  }
  if (typeof input !== "string" || !input.trim()) {
    return send(res, 400, { error: "Body must be { input: string }." });
  }
  if (input.length > MAX_PARSE_INPUT_LENGTH) {
    return send(res, 400, { error: `Input exceeds ${MAX_PARSE_INPUT_LENGTH} characters.` });
  }
  try {
    const parsed = await parseTodo(input, complete);
    return send(res, 200, parsed);
  } catch (err) {
    // A ParseError means the model returned something we won't trust — that's a
    // 502 (bad upstream), not a 500. The distinction matters for observability.
    if (err instanceof ParseError) {
      console.error("parse rejected:", err.message);
      return send(res, 502, { error: "Could not parse a todo from that input." });
    }
    console.error("server error:", err);
    return send(res, 500, { error: "Internal error." });
  }
});

server.listen(PORT, () => {
  console.error(`groundtruth API on http://localhost:${PORT}  (POST /api/parse-todo, /api/breakdown)`);
});

/**
 * Vercel serverless function for the smart-add feature. The handler logic is
 * identical to the dev server (apps/todolistvite/server/index.mjs) — only this
 * transport shell differs, per the injected-client architecture in server/lib.
 *
 * Lives at repo-root /api (not apps/todolistvite/api) because Vercel Functions
 * must sit under the project's configured Root Directory, and Root Directory
 * is left unset here so the build can still reach packages/acme-ui — see
 * vercel.json at the repo root.
 */
import { parseTodo, ParseError, MAX_INPUT_LENGTH } from "../apps/todolistvite/server/lib/parseTodo.mjs";
import { makeComplete } from "../apps/todolistvite/server/lib/anthropicClient.mjs";
import { isRateLimited } from "../apps/todolistvite/server/lib/rateLimit.mjs";
import { clientIp } from "../apps/todolistvite/server/lib/clientIp.mjs";

const complete = makeComplete(); // throws early if no key — fail fast, not mid-request

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

  try {
    const parsed = await parseTodo(input, complete);
    res.status(200).json(parsed);
  } catch (err) {
    if (err instanceof ParseError) {
      console.error("parse rejected:", err.message);
      res.status(502).json({ error: "Could not parse a todo from that input." });
      return;
    }
    console.error("server error:", err);
    res.status(500).json({ error: "Internal error." });
  }
}

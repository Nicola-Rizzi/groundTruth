/**
 * Minimal in-memory per-IP rate limiter for the demo deploy. It resets on
 * restart and doesn't share state across serverless instances — acceptable
 * here because it's a speed bump against casual abuse, not the real leash.
 * The real leash is a low spend limit on the Anthropic console: this can be
 * bypassed by an attacker with many IPs, that can't.
 *
 * Concretely, this module is a singleton per Node process. In the dev server
 * (server/index.mjs) both /api/parse-todo and /api/breakdown import the same
 * process-wide instance, so an IP's 20/min budget is shared across both
 * routes. On Vercel, api/parse-todo.js and api/breakdown.js are bundled and
 * invoked as two separate functions, each importing its own module instance
 * — so in production an IP effectively gets 20/min *per endpoint* (40/min
 * total), not one shared 20/min budget as in dev. Fixing that for real would
 * mean an external store (e.g. Upstash Redis), deliberately not added at this
 * project's scale — see docs/production-notes.md.
 */
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const SWEEP_EVERY_N_CALLS = 500; // bounds Map growth on a long-running process

const hits = new Map();
let callsSinceSweep = 0;

/** Drops any IP with no hits inside the current window — otherwise every distinct
 * IP that ever calls the server leaves a permanent (eventually empty) array behind. */
function sweep(now) {
  for (const [ip, timestamps] of hits) {
    const recent = timestamps.filter((t) => now - t < WINDOW_MS);
    if (recent.length === 0) hits.delete(ip);
    else hits.set(ip, recent);
  }
}

/** @returns {boolean} true if `ip` has exceeded the request budget for this window. */
export function isRateLimited(ip, now = Date.now()) {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);

  if (++callsSinceSweep >= SWEEP_EVERY_N_CALLS) {
    callsSinceSweep = 0;
    sweep(now);
  }

  return recent.length > MAX_REQUESTS_PER_WINDOW;
}

/** Test-only: clear all recorded hits so tests don't leak state into each other. */
export function _resetRateLimitState() {
  hits.clear();
  callsSinceSweep = 0;
}

/** Test-only: how many distinct IPs are currently tracked, to verify the sweep frees memory. */
export function _rateLimitEntryCount() {
  return hits.size;
}

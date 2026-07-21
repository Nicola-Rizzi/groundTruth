/**
 * Minimal in-memory per-IP rate limiter for the demo deploy. It resets on
 * restart and doesn't share state across serverless instances — acceptable
 * here because it's a speed bump against casual abuse, not the real leash.
 * The real leash is a low spend limit on the Anthropic console: this can be
 * bypassed by an attacker with many IPs, that can't.
 */
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;

const hits = new Map();

/** @returns {boolean} true if `ip` has exceeded the request budget for this window. */
export function isRateLimited(ip, now = Date.now()) {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_REQUESTS_PER_WINDOW;
}

/** Test-only: clear all recorded hits so tests don't leak state into each other. */
export function _resetRateLimitState() {
  hits.clear();
}

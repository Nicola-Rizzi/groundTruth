import { describe, it, expect, beforeEach } from "vitest";
import { isRateLimited, _resetRateLimitState, _rateLimitEntryCount } from "./rateLimit.mjs";

describe("isRateLimited", () => {
  beforeEach(() => {
    _resetRateLimitState();
  });

  it("allows requests under the budget", () => {
    for (let i = 0; i < 20; i++) {
      expect(isRateLimited("1.2.3.4")).toBe(false);
    }
  });

  it("blocks the request that exceeds the budget", () => {
    for (let i = 0; i < 20; i++) isRateLimited("1.2.3.4");
    expect(isRateLimited("1.2.3.4")).toBe(true);
  });

  it("tracks each IP independently", () => {
    for (let i = 0; i < 20; i++) isRateLimited("1.2.3.4");
    expect(isRateLimited("1.2.3.4")).toBe(true);
    expect(isRateLimited("5.6.7.8")).toBe(false);
  });

  it("forgets hits once the window has passed", () => {
    const start = Date.now();
    for (let i = 0; i < 20; i++) isRateLimited("1.2.3.4", start);
    expect(isRateLimited("1.2.3.4", start + 61_000)).toBe(false);
  });

  it("sweeps stale IPs out of memory instead of growing forever", () => {
    const start = Date.now();
    // 500 distinct IPs, all now stale (window long expired).
    for (let i = 0; i < 500; i++) isRateLimited(`10.0.0.${i}`, start);
    expect(_rateLimitEntryCount()).toBe(500);

    // The 500th call after that (SWEEP_EVERY_N_CALLS) triggers a sweep at a time
    // when every one of those 500 entries is outside the window.
    const long_after = start + 61_000;
    for (let i = 0; i < 500; i++) isRateLimited(`10.1.0.${i}`, long_after);

    // Without the sweep, the map would hold all 1000 (500 stale + 500 fresh).
    // The 500th call of this batch triggers a sweep that purges the stale
    // first batch, leaving only the fresh one.
    expect(_rateLimitEntryCount()).toBe(500);
  });
});

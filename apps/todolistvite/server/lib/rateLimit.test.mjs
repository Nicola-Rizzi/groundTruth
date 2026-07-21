import { describe, it, expect, beforeEach } from "vitest";
import { isRateLimited, _resetRateLimitState } from "./rateLimit.mjs";

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
});

import { describe, expect, it } from "vitest";
import { RateLimiter } from "../../src/api/rate-limit";

describe("RateLimiter", () => {
  it("allows 60 a minute per key and refills one token a second", () => {
    const r = new RateLimiter(60, 60_000);
    for (let i = 0; i < 60; i++) expect(r.take("a", 0).ok).toBe(true);
    expect(r.take("a", 0)).toEqual({ ok: false, remaining: 0, retryAfterS: 1 });
    expect(r.take("b", 0).ok).toBe(true);
    expect(r.take("a", 999).ok).toBe(false);
    expect(r.take("a", 1000).ok).toBe(true);
  });
});

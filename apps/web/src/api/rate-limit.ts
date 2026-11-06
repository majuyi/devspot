/**
 * docs/02 §7: 60 requests a minute per IP, counted per serverless instance. Good enough on
 * Hobby, where the CDN answers most GETs before they reach a function; Upstash is the upgrade.
 */
export const RATE_LIMIT = 60;
const WINDOW_MS = 60_000;

type Bucket = { tokens: number; at: number };

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  constructor(
    private readonly limit = RATE_LIMIT,
    private readonly windowMs = WINDOW_MS,
  ) {}

  /** Takes one token. A token comes back every windowMs / limit. */
  take(key: string, now = Date.now()): { ok: boolean; remaining: number; retryAfterS: number } {
    const refillMs = this.windowMs / this.limit;
    const b = this.buckets.get(key) ?? { tokens: this.limit, at: now };
    b.tokens = Math.min(this.limit, b.tokens + (now - b.at) / refillMs);
    b.at = now;
    const ok = b.tokens >= 1;
    if (ok) b.tokens -= 1;
    this.buckets.set(key, b);
    if (this.buckets.size > 10_000) this.prune(now);
    return {
      ok,
      remaining: Math.floor(b.tokens),
      retryAfterS: ok ? 0 : Math.ceil(((1 - b.tokens) * refillMs) / 1000),
    };
  }

  /** Drops buckets that have refilled completely, so memory stays bounded. */
  private prune(now: number) {
    for (const [key, b] of this.buckets) {
      if (now - b.at >= this.windowMs) this.buckets.delete(key);
    }
  }
}

// Fixed-window in-memory limiter for login attempts. One web instance is the MVP
// deployment; a multi-instance setup would move this into Postgres (see SECURITY.md).

type Bucket = { count: number; resetAt: number };

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Returns true when the attempt is allowed. */
  hit(key: string, now = Date.now()): boolean {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      this.sweep(now);
      return true;
    }
    bucket.count += 1;
    return bucket.count <= this.limit;
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  private sweep(now: number): void {
    if (this.buckets.size < 1000) return;
    for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
  }
}

const globalLimiter = globalThis as unknown as { __victorLoginLimiter?: RateLimiter };
export const loginLimiter = (globalLimiter.__victorLoginLimiter ??= new RateLimiter(
  5,
  10 * 60 * 1000,
));

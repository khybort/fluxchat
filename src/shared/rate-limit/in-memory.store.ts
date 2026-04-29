import type { IRateLimitStore, RateLimitDecision } from './rate-limit.types.js';

interface Bucket {
  tokens: number;
  refilledAt: number;
}

/**
 * Single-instance, fixed-window-with-refill rate limiter. Each `(key, limit)`
 * gets `limit` tokens that reset every `windowMs`. Suitable for development and
 * single-process deployments. For multi-instance, use {@link RedisRateLimitStore}.
 */
export class InMemoryRateLimitStore implements IRateLimitStore {
  private readonly buckets = new Map<string, Bucket>();

  public consume(key: string, limit: number, windowMs: number): Promise<RateLimitDecision> {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: limit, refilledAt: now };
      this.buckets.set(key, bucket);
    }

    const elapsed = now - bucket.refilledAt;
    if (elapsed >= windowMs) {
      bucket.tokens = limit;
      bucket.refilledAt = now;
    }

    if (bucket.tokens <= 0) {
      const retryAfterMs = Math.max(0, windowMs - elapsed);
      return Promise.resolve({ allowed: false, remaining: 0, retryAfterMs });
    }

    bucket.tokens -= 1;
    return Promise.resolve({ allowed: true, remaining: bucket.tokens, retryAfterMs: 0 });
  }

  /** Test-only — clear all buckets. */
  public reset(): void {
    this.buckets.clear();
  }
}

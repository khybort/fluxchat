import { RATE_LIMIT } from '../constants.js';
import type { IRateLimitStore, RateLimitDecision } from './rate-limit.types.js';

interface Bucket {
  tokens: number;
  refilledAt: number;
}

/**
 * Single-instance, fixed-window-with-refill rate limiter. Each `(key, limit)`
 * gets `limit` tokens that reset every `windowMs`. Suitable for development and
 * single-process deployments. For multi-instance, use {@link RedisRateLimitStore}.
 *
 * Memory hygiene: opportunistically evicts buckets older than
 * `windowMs * RATE_LIMIT.STALE_FACTOR` on each `consume()`. If the live size
 * still exceeds `RATE_LIMIT.MAX_BUCKETS`, drops the oldest entries (Map preserves
 * insertion order, so iteration starts at the oldest).
 */
export class InMemoryRateLimitStore implements IRateLimitStore {
  private readonly buckets = new Map<string, Bucket>();

  public consume(key: string, limit: number, windowMs: number): Promise<RateLimitDecision> {
    const now = Date.now();
    this.evictStale(now, windowMs);

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

  private evictStale(now: number, windowMs: number): void {
    const staleThreshold = windowMs * RATE_LIMIT.STALE_FACTOR;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.refilledAt > staleThreshold) {
        this.buckets.delete(key);
      }
    }
    while (this.buckets.size > RATE_LIMIT.MAX_BUCKETS) {
      const oldest = this.buckets.keys().next().value;
      if (oldest === undefined) break;
      this.buckets.delete(oldest);
    }
  }
}

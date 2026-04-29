import type { IRateLimitStore, RateLimitDecision } from './rate-limit.types.js';

/**
 * The minimal Redis surface this store needs. Both `ioredis` and the official
 * `redis` v4+ client satisfy this shape, so consumers may bring their own
 * client without forcing a dependency at this module boundary.
 */
export interface MinimalRedisClient {
  incr(key: string): Promise<number>;
  pexpire(key: string, ttlMs: number): Promise<unknown>;
  pttl(key: string): Promise<number>;
}

/**
 * Multi-instance fixed-window rate limiter backed by Redis.
 *
 * Algorithm: hash the request into a key like `ratelimit:{key}:{floor(now/windowMs)}`,
 * `INCR` it, set `PEXPIRE` on the first hit, and reject when the counter exceeds
 * `limit`. Window edges are aligned across instances because every node computes
 * the same bucket id from the same wall-clock time. Atomic on Redis (single key,
 * single command per request).
 */
export class RedisRateLimitStore implements IRateLimitStore {
  constructor(private readonly client: MinimalRedisClient) {}

  public async consume(key: string, limit: number, windowMs: number): Promise<RateLimitDecision> {
    const windowId = Math.floor(Date.now() / windowMs);
    const redisKey = `ratelimit:${key}:${windowId}`;

    const count = await this.client.incr(redisKey);
    if (count === 1) {
      // First hit in this window — set its TTL so the key auto-expires.
      await this.client.pexpire(redisKey, windowMs);
    }

    if (count > limit) {
      const ttl = await this.client.pttl(redisKey);
      const retryAfterMs = ttl > 0 ? ttl : windowMs;
      return { allowed: false, remaining: 0, retryAfterMs };
    }

    return { allowed: true, remaining: limit - count, retryAfterMs: 0 };
  }
}

import type { Request, RequestHandler } from 'express';

import { RateLimitError } from '../errors/app-error.js';
import { FeatureFlagService } from '../feature-flags/feature-flag.service.js';
import type { IRateLimitStore } from '../rate-limit/rate-limit.types.js';

const DEFAULT_WINDOW_MS = 60_000;

export interface RateLimitMiddlewareOptions {
  /** The pluggable backend (in-memory or Redis-backed). Required — DI provides it. */
  store: IRateLimitStore;
  /** Where the bucket key comes from. Defaults to the authenticated user, with IP fallback. */
  keyBy?: 'user' | 'ip';
  /** Override the per-window ceiling. Defaults to the RATE_LIMIT_PER_MINUTE feature flag. */
  limit?: number;
  /** Window in milliseconds. Defaults to 60_000 (1 minute). */
  windowMs?: number;
}

const buildKey = (
  req: Request,
  keyBy: NonNullable<RateLimitMiddlewareOptions['keyBy']>,
): string => {
  if (keyBy === 'user' && req.user?.id) {
    return `user:${req.user.id}`;
  }
  return `ip:${req.ip ?? 'unknown'}`;
};

/**
 * Per-route rate limiter (CLAUDE.md §11/§15). The actual storage is pluggable —
 * see {@link InMemoryRateLimitStore} and {@link RedisRateLimitStore}. The middleware
 * itself does not know which one is wired; DI picks based on `REDIS_URL`.
 */
export const rateLimitPerRoute = (options: RateLimitMiddlewareOptions): RequestHandler => {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;

  return (req, res, next) => {
    const limit = options.limit ?? FeatureFlagService.getInstance().get('RATE_LIMIT_PER_MINUTE');
    const key = buildKey(req, options.keyBy ?? 'user');

    options.store
      .consume(key, limit, windowMs)
      .then((decision) => {
        res.setHeader('X-RateLimit-Limit', String(limit));
        res.setHeader('X-RateLimit-Remaining', String(decision.remaining));

        if (!decision.allowed) {
          const retryAfterSeconds = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
          res.setHeader('Retry-After', String(retryAfterSeconds));
          next(new RateLimitError(retryAfterSeconds));
          return;
        }

        next();
      })
      .catch(next);
  };
};

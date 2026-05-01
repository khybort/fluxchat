import type { Request, RequestHandler } from 'express';

import { RateLimitError } from '../errors/app-error.js';
import { flagContextFrom } from '../feature-flags/context.js';
import { FeatureFlagService } from '../feature-flags/feature-flag.service.js';
import type { IRateLimitStore } from '../rate-limit/rate-limit.types.js';

const DEFAULT_WINDOW_MS = 60_000;

export interface RateLimitMiddlewareOptions {
  /** The pluggable backend (in-memory or Redis-backed). Required — DI provides it. */
  store: IRateLimitStore;
  /**
   * Where the bucket key comes from.
   *   - `'user'` (default): per-user bucket, IP fallback.
   *   - `'ip'`: per-IP bucket regardless of auth state.
   *   - `'user+client'`: per `(user, clientType)` pair so a user's mobile and
   *     web sessions don't share quota. IP fallback when unauthenticated.
   */
  keyBy?: 'user' | 'ip' | 'user+client';
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
  if (keyBy === 'user+client' && req.user?.id) {
    return `user:${req.user.id}:client:${req.clientType ?? 'web'}`;
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
    // Pass the request-scoped flag context so role-aware rules fire — admins
    // get a higher ceiling than regular users via the rule in flag-defaults.ts.
    const limit =
      options.limit ??
      FeatureFlagService.getInstance().get('RATE_LIMIT_PER_MINUTE', flagContextFrom(req));
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

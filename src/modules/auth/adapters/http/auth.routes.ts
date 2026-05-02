import { Router, type RequestHandler } from 'express';

import type { AuthController } from './auth.controller.js';
import { LoginBodySchema, RegisterBodySchema } from './auth.dto.js';
import { AUTH } from '../../../../shared/constants.js';
import { asyncHandler } from '../../../../shared/middleware/async-handler.js';
import type { RateLimiterFactory } from '../../../../shared/middleware/rate-limit.js';
import { validateRequest } from '../../../../shared/middleware/validate-request.js';

/**
 * Builds two routers:
 *   - `publicRouter` is mounted BEFORE the global `authMiddleware` (login/register
 *     can't require a JWT they don't have yet). App-check + clientType still apply.
 *   - `protectedRouter` is mounted AFTER `authMiddleware` for endpoints like /me.
 *
 * Both apply per-route rate limiting via the injected limiter factory. The
 * `authMiddleware` handler is also injected so this builder doesn't have to
 * import `Config` itself — DI keeps the dependency direction clean.
 */
export const buildAuthRouters = (
  controller: AuthController,
  rateLimiter: RateLimiterFactory,
  authMiddleware: RequestHandler,
): { publicRouter: Router; protectedRouter: Router } => {
  const publicRouter = Router();

  publicRouter.post(
    '/register',
    validateRequest({ body: RegisterBodySchema }),
    rateLimiter.perRoute({ keyBy: 'ip', limit: AUTH.RATE_LIMIT_PER_MINUTE }),
    asyncHandler(controller.register),
  );

  publicRouter.post(
    '/login',
    validateRequest({ body: LoginBodySchema }),
    rateLimiter.perRoute({ keyBy: 'ip', limit: AUTH.RATE_LIMIT_PER_MINUTE }),
    asyncHandler(controller.login),
  );

  const protectedRouter = Router();

  protectedRouter.get(
    '/me',
    authMiddleware,
    rateLimiter.perRoute({ keyBy: 'user' }),
    asyncHandler(controller.me),
  );

  return { publicRouter, protectedRouter };
};

import { Router } from 'express';

import type { AuthController } from './auth.controller.js';
import { LoginBodySchema, RegisterBodySchema } from './auth.dto.js';
import { authMiddleware } from '../../shared/middleware/auth.js';
import { rateLimitPerRoute } from '../../shared/middleware/rate-limit.js';
import { validateRequest } from '../../shared/middleware/validate-request.js';
import type { IRateLimitStore } from '../../shared/rate-limit/rate-limit.types.js';

/**
 * Builds two routers:
 *   - `publicRouter` is mounted BEFORE the global `authMiddleware` (login/register
 *     can't require a JWT they don't have yet). App-check + clientType still apply.
 *   - `protectedRouter` is mounted AFTER `authMiddleware` for endpoints like /me.
 *
 * Both apply per-route rate limiting via the injected store.
 */
export const buildAuthRouters = (
  controller: AuthController,
  rateLimitStore: IRateLimitStore,
): { publicRouter: Router; protectedRouter: Router } => {
  const publicRouter = Router();

  publicRouter.post(
    '/register',
    validateRequest({ body: RegisterBodySchema }),
    rateLimitPerRoute({ keyBy: 'ip', store: rateLimitStore, limit: 10 }),
    controller.register,
  );

  publicRouter.post(
    '/login',
    validateRequest({ body: LoginBodySchema }),
    rateLimitPerRoute({ keyBy: 'ip', store: rateLimitStore, limit: 10 }),
    controller.login,
  );

  const protectedRouter = Router();

  // `/me` requires a valid JWT — re-apply auth here in case the route is mounted
  // standalone in tests. In `app.ts` it's mounted after the global authMiddleware
  // so this is idempotent.
  protectedRouter.get(
    '/me',
    authMiddleware,
    rateLimitPerRoute({ keyBy: 'user', store: rateLimitStore }),
    controller.me,
  );

  return { publicRouter, protectedRouter };
};

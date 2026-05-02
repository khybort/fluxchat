import { Router } from 'express';

import type { AdminController } from './admin.controller.js';
import {
  EvaluateFlagBodySchema,
  FlagDefinitionSchema,
  FlagNameParamSchema,
  ListUsersQuerySchema,
} from './admin.dto.js';
import { asyncHandler } from '../../../../shared/middleware/async-handler.js';
import type { RateLimiterFactory } from '../../../../shared/middleware/rate-limit.js';
import { requireRole } from '../../../../shared/middleware/role.js';
import { validateRequest } from '../../../../shared/middleware/validate-request.js';

/**
 * Admin UI surface. Mounted under /api/admin so it sits behind the global
 * JWT middleware — every handler can rely on `req.user`. The token-gated
 * /admin/* surface is for ops/CI and lives in app.ts; this one is for
 * admin-role human users via the React UI.
 */
export const buildAdminRouter = (
  controller: AdminController,
  rateLimiter: RateLimiterFactory,
): Router => {
  const router = Router();

  // Every admin endpoint runs `requireRole('admin')` first, then the usual
  // validate + rate-limit pair. Non-admin users get 403; non-authed users
  // never reach this router (global JWT middleware throws first).
  router.get(
    '/flags',
    requireRole('admin'),
    rateLimiter.perRoute({ keyBy: 'user' }),
    asyncHandler(controller.listFlags),
  );

  router.patch(
    '/flags/:name',
    requireRole('admin'),
    validateRequest({ params: FlagNameParamSchema, body: FlagDefinitionSchema }),
    rateLimiter.perRoute({ keyBy: 'user' }),
    asyncHandler(controller.updateFlag),
  );

  router.delete(
    '/flags/:name',
    requireRole('admin'),
    validateRequest({ params: FlagNameParamSchema }),
    rateLimiter.perRoute({ keyBy: 'user' }),
    asyncHandler(controller.clearFlag),
  );

  router.post(
    '/flags/reload',
    requireRole('admin'),
    rateLimiter.perRoute({ keyBy: 'user' }),
    asyncHandler(controller.reloadFlags),
  );

  router.post(
    '/flags/:name/evaluate',
    requireRole('admin'),
    validateRequest({ params: FlagNameParamSchema, body: EvaluateFlagBodySchema }),
    rateLimiter.perRoute({ keyBy: 'user' }),
    asyncHandler(controller.evaluateFlag),
  );

  // User listing for the per-user flag-override picker. Cursor-paginated.
  router.get(
    '/users',
    requireRole('admin'),
    validateRequest({ query: ListUsersQuerySchema }),
    rateLimiter.perRoute({ keyBy: 'user' }),
    asyncHandler(controller.listUsers),
  );

  return router;
};

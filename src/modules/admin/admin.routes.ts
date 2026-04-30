import { Router } from 'express';

import type { AdminController } from './admin.controller.js';
import { EvaluateFlagBodySchema, FlagDefinitionSchema, FlagNameParamSchema } from './admin.dto.js';
import { rateLimitPerRoute } from '../../shared/middleware/rate-limit.js';
import { requireRole } from '../../shared/middleware/role.js';
import { validateRequest } from '../../shared/middleware/validate-request.js';
import type { IRateLimitStore } from '../../shared/rate-limit/rate-limit.types.js';

/**
 * Admin UI surface. Mounted under /api/admin so it sits behind the global
 * JWT middleware — every handler can rely on `req.user`. The token-gated
 * /admin/* surface is for ops/CI and lives in app.ts; this one is for
 * admin-role human users via the React UI.
 */
export const buildAdminRouter = (
  controller: AdminController,
  rateLimitStore: IRateLimitStore,
): Router => {
  const router = Router();

  // Every admin endpoint runs `requireRole('admin')` first, then the usual
  // validate + rate-limit pair. Non-admin users get 403; non-authed users
  // never reach this router (global JWT middleware throws first).
  router.get(
    '/flags',
    requireRole('admin'),
    rateLimitPerRoute({ keyBy: 'user', store: rateLimitStore }),
    controller.listFlags,
  );

  router.patch(
    '/flags/:name',
    requireRole('admin'),
    validateRequest({ params: FlagNameParamSchema, body: FlagDefinitionSchema }),
    rateLimitPerRoute({ keyBy: 'user', store: rateLimitStore }),
    controller.updateFlag,
  );

  router.delete(
    '/flags/:name',
    requireRole('admin'),
    validateRequest({ params: FlagNameParamSchema }),
    rateLimitPerRoute({ keyBy: 'user', store: rateLimitStore }),
    controller.clearFlag,
  );

  router.post(
    '/flags/reload',
    requireRole('admin'),
    rateLimitPerRoute({ keyBy: 'user', store: rateLimitStore }),
    controller.reloadFlags,
  );

  router.post(
    '/flags/:name/evaluate',
    requireRole('admin'),
    validateRequest({ params: FlagNameParamSchema, body: EvaluateFlagBodySchema }),
    rateLimitPerRoute({ keyBy: 'user', store: rateLimitStore }),
    controller.evaluateFlag,
  );

  return router;
};

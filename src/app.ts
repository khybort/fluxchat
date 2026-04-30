// Side-effect imports — keep at the very top so the zod-openapi extension
// is wired in BEFORE any module-level *.openapi.ts file evaluates.
import './shared/openapi/zod.js';
import './modules/auth/auth.openapi.js';
import './modules/chat/chat.openapi.js';
import './modules/healthz.openapi.js';

import cors from 'cors';
import express, { json as expressJson, type Express, type Request, type Response } from 'express';
import helmet from 'helmet';

import type { AppContainer } from './di/container.js';
import { REQUEST_BODY_LIMIT } from './shared/constants.js';
import { errorHandler, notFoundHandler } from './shared/errors/error-handler.js';
import { appCheckMiddleware } from './shared/middleware/app-check.js';
import { authMiddleware } from './shared/middleware/auth.js';
import { clientTypeMiddleware } from './shared/middleware/client-type.js';
import { requestLoggerMiddleware } from './shared/middleware/request-logger.js';
import { mountDocs } from './shared/openapi/docs.middleware.js';

/**
 * Builds the Express app without starting it. `server.ts` owns lifecycle.
 *
 * Middleware order is fixed (CLAUDE.md §11, AppNation case §1):
 *   1. requestLogger    -> requestId + child logger
 *   2. helmet/cors/json -> security + parsing
 *   3. appCheck         -> Firebase mock                     (case position #1)
 *   4. publicAuth router -> /api/auth/{register,login}       (mounted before JWT,
 *                          cannot require a token they don't have yet)
 *   5. authMiddleware   -> JWT verification, sets req.user   (case position #2)
 *   6. clientType       -> sets req.clientType + rebinds log (case position #3)
 *   7. protectedAuth + chat routers                          (case position #4: per-route validation)
 *   8. /docs (when DOCS_ENABLED) — mounted earlier, no auth required
 *   9. notFoundHandler
 *  10. errorHandler     -> last                              (case position #5)
 */
export const createApp = (container: AppContainer): Express => {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestLoggerMiddleware);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(buildCors(container));
  app.use(expressJson({ limit: REQUEST_BODY_LIMIT }));

  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      flags: container.flags.snapshot(),
    });
  });

  mountAdminFlagsReload(app, container);

  // OpenAPI docs are mounted BEFORE appCheck/JWT — Swagger UI is meant to be
  // browsable without a token. Access is governed entirely by DOCS_ENABLED;
  // when off, both /docs and /docs.json fall through to a 404. Production
  // deployments that want stricter gating should keep DOCS_ENABLED=false and
  // expose the spec via a private route instead.
  mountDocs(app, {
    enabled: container.config.values.app.docsEnabled,
    logger: container.logger,
  });

  app.use(appCheckMiddleware);

  // Public auth routes are mounted BEFORE the global JWT middleware — login and
  // register can't require a token they don't have yet. App Check still applies.
  app.use('/api/auth', container.routers.authPublic);

  // Case order: App Check → Auth (JWT) → Client type. Auth runs first so the
  // child logger we bind in clientTypeMiddleware can include req.user.id later.
  app.use(authMiddleware);
  app.use(clientTypeMiddleware);

  app.use('/api/auth', container.routers.authProtected);
  app.use('/api/admin', container.routers.admin);
  app.use('/api', container.routers.chat);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

const buildCors = (container: AppContainer): ReturnType<typeof cors> => {
  const origins = container.config.values.app.corsOrigins;
  return cors({
    origin: origins.length > 0 ? origins : false,
    credentials: true,
  });
};

/**
 * Two admin surfaces, both gated by `ADMIN_TOKEN`:
 *
 *   - POST /admin/flags/reload — serverless-friendly equivalent of `kill -HUP $PID`.
 *     SIGHUP can't reach a Vercel function instance; this asks the live
 *     FeatureFlagService to re-read its sources and emit a diff log line.
 *
 *   - GET  /admin/flags — returns the FULL rich form (defaults + rules +
 *     percentages) for ops/dashboard surfaces. Public `/healthz` only sees
 *     the evaluated default snapshot.
 *
 * Fail-closed: when `ADMIN_TOKEN` is unset, both endpoints 404. With the
 * wrong token, also 404 — same shape so callers can't distinguish "off"
 * from "wrong token".
 */
const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Admin endpoints disabled' } };

const mountAdminFlagsReload = (app: Express, container: AppContainer): void => {
  const adminToken = container.config.values.app.adminToken;
  if (!adminToken) {
    app.post('/admin/flags/reload', (_req: Request, res: Response) => {
      res.status(404).json(NOT_FOUND);
    });
    app.get('/admin/flags', (_req: Request, res: Response) => {
      res.status(404).json(NOT_FOUND);
    });
    return;
  }

  const requireAdminToken = (req: Request, res: Response): boolean => {
    const presented = req.header('x-admin-token');
    if (!presented || presented !== adminToken) {
      res.status(404).json(NOT_FOUND);
      return false;
    }
    return true;
  };

  app.post('/admin/flags/reload', async (req: Request, res: Response) => {
    if (!requireAdminToken(req, res)) return;
    await container.flags.reload();
    container.logger.pino.info({ via: 'admin_endpoint' }, 'feature_flags_reloaded_admin');
    res.status(200).json({
      status: 'reloaded',
      flags: container.flags.snapshot(),
    });
  });

  app.get('/admin/flags', (req: Request, res: Response) => {
    if (!requireAdminToken(req, res)) return;
    res.status(200).json({
      definitions: container.flags.definitions(),
      snapshot: container.flags.snapshot(),
    });
  });
};

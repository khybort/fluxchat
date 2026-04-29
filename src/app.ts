// Side-effect imports — keep at the very top so the zod-openapi extension
// is wired in BEFORE any module-level *.openapi.ts file evaluates.
import './shared/openapi/zod.js';
import './modules/auth/auth.openapi.js';
import './modules/chat/chat.openapi.js';
import './modules/healthz.openapi.js';

import cors from 'cors';
import express, { type Express } from 'express';
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
 * Middleware order is fixed (CLAUDE.md §11):
 *   1. requestLogger    -> requestId + child logger
 *   2. helmet/cors/json -> security + parsing
 *   3. appCheck         -> Firebase mock
 *   4. auth             -> JWT mock, sets req.user
 *   5. clientType       -> sets req.clientType
 *   6. routes
 *   7. /docs (when DOCS_ENABLED) — mounted AFTER routes so /docs doesn't shadow anything
 *   8. notFoundHandler
 *   9. errorHandler     -> last
 */
export const createApp = (container: AppContainer): Express => {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestLoggerMiddleware);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(buildCors(container));
  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));

  app.get('/healthz', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      flags: container.flags.snapshot(),
    });
  });

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
  app.use(clientTypeMiddleware);

  // Public auth routes are mounted BEFORE the global JWT middleware — login and
  // register can't require a token they don't have yet. App Check still applies.
  app.use('/api/auth', container.routers.authPublic);

  app.use(authMiddleware);

  app.use('/api/auth', container.routers.authProtected);
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

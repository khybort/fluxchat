// OpenAPI side-effect imports — must precede any registry consumer (mountDocs).
import '../../src/shared/openapi/zod.js';
import '../../src/modules/auth/auth.openapi.js';
import '../../src/modules/chat/chat.openapi.js';
import '../../src/modules/healthz.openapi.js';

import cors from 'cors';
import express, { type Request, json as expressJson, type Express } from 'express';
import helmet from 'helmet';
// jsonwebtoken is CJS-only — keep the default import for ESM interop.
// eslint-disable-next-line import/no-named-as-default
import jwt from 'jsonwebtoken';

import { InMemoryChatRepository, InMemoryMessageRepository } from './in-memory-repositories.js';
import { InMemoryUserRepository } from './in-memory-user-repository.js';
import { Config } from '../../src/config/config.js';
import { wireApp } from '../../src/di/wire-app.js';
import type { IAiProvider } from '../../src/infrastructure/ai/ai.provider.js';
import { MockAiProvider } from '../../src/infrastructure/ai/mock.provider.js';
import { Logger } from '../../src/infrastructure/logger/logger.js';
import { REQUEST_BODY_LIMIT } from '../../src/shared/constants.js';
import { errorHandler, notFoundHandler } from '../../src/shared/errors/error-handler.js';
import { FeatureFlagService } from '../../src/shared/feature-flags/feature-flag.service.js';
import { clientTypeMiddleware } from '../../src/shared/middleware/client-type.js';
import { requestLoggerMiddleware } from '../../src/shared/middleware/request-logger.js';
import { mountDocs } from '../../src/shared/openapi/docs.middleware.js';
import { InMemoryRateLimitStore } from '../../src/shared/rate-limit/in-memory.store.js';
import type { IRateLimitStore } from '../../src/shared/rate-limit/rate-limit.types.js';

export interface TestAppHandles {
  app: Express;
  chats: InMemoryChatRepository;
  messages: InMemoryMessageRepository;
  users: InMemoryUserRepository;
  flags: FeatureFlagService;
  ai: IAiProvider;
  rateLimitStore: IRateLimitStore;
  signToken: (userId: string, email?: string, role?: 'user' | 'admin') => string;
  authHeaders: (userId: string, email?: string) => Record<string, string>;
  adminHeaders: (userId?: string, email?: string) => Record<string, string>;
  appCheckHeaders: () => Record<string, string>;
}

export const buildTestApp = (
  overrides: { ai?: IAiProvider; rateLimitStore?: IRateLimitStore } = {},
): TestAppHandles => {
  const config = Config.getInstance();
  const logger = Logger.getInstance();
  const flags = FeatureFlagService.getInstance();

  const chats = new InMemoryChatRepository();
  const messages = new InMemoryMessageRepository();
  const users = new InMemoryUserRepository();
  const ai = overrides.ai ?? new MockAiProvider(logger);
  const rateLimitStore = overrides.rateLimitStore ?? new InMemoryRateLimitStore();

  // Identical wiring as production — see src/di/wire-app.ts. Tests differ
  // only in the upstream deps (in-memory repos + mock AI), which keeps the
  // strategy → service → controller → router graph drift-free between prod
  // and test.
  const wired = wireApp({
    config,
    logger,
    flags,
    rateLimitStore,
    aiPrime: ai,
    repos: { chats, messages, users },
  });

  const app = express();
  app.disable('x-powered-by');
  app.use(requestLoggerMiddleware);
  app.use(helmet());
  app.use(cors());
  app.use(expressJson({ limit: REQUEST_BODY_LIMIT }));
  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok', flags: flags.snapshot() });
  });

  // Mirror app.ts admin endpoints so their behavior is integration-tested.
  const adminToken = config.values.app.adminToken;
  const requireAdmin = (req: Request): boolean => {
    const presented = req.header('x-admin-token');
    return Boolean(adminToken && presented && presented === adminToken);
  };
  app.post('/admin/flags/reload', async (req, res) => {
    if (!requireAdmin(req)) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Admin endpoints disabled' },
      });
    }
    await flags.reload();
    return res.status(200).json({ status: 'reloaded', flags: flags.snapshot() });
  });
  app.get('/admin/flags', (req, res) => {
    if (!requireAdmin(req)) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Admin endpoints disabled' },
      });
    }
    return res.status(200).json({
      definitions: flags.definitions(),
      snapshot: flags.snapshot(),
    });
  });

  // Mirror app.ts: docs come before appCheck so they're browsable without a token.
  mountDocs(app, { enabled: config.values.app.docsEnabled, logger });

  app.use(wired.middleware.appCheck);
  app.use('/api/auth', wired.routers.authPublic);
  app.use(wired.middleware.auth);
  app.use(clientTypeMiddleware);
  app.use('/api/auth', wired.routers.authProtected);
  app.use('/api/admin', wired.routers.admin);
  app.use('/api', wired.routers.chat);

  app.use(notFoundHandler);
  app.use(errorHandler);

  const signToken = (
    userId: string,
    email = `${userId}@example.test`,
    role: 'user' | 'admin' = 'user',
  ): string =>
    // eslint-disable-next-line import/no-named-as-default-member
    jwt.sign({ sub: userId, email, role }, config.values.auth.jwtSecret);

  const appCheckHeaders = (): Record<string, string> => ({
    'x-firebase-app-check': config.values.app.appCheckToken,
    'x-client-type': 'web',
  });

  const authHeaders = (userId: string, email?: string): Record<string, string> => ({
    Authorization: `Bearer ${signToken(userId, email)}`,
    ...appCheckHeaders(),
  });

  const adminHeaders = (userId = 'admin-user', email?: string): Record<string, string> => ({
    Authorization: `Bearer ${signToken(userId, email, 'admin')}`,
    ...appCheckHeaders(),
  });

  return {
    app,
    chats,
    messages,
    users,
    flags,
    ai,
    rateLimitStore,
    signToken,
    authHeaders,
    adminHeaders,
    appCheckHeaders,
  };
};

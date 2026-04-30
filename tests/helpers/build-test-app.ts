// OpenAPI side-effect imports — must precede any registry consumer (mountDocs).
import '../../src/shared/openapi/zod.js';
import '../../src/modules/auth/auth.openapi.js';
import '../../src/modules/chat/chat.openapi.js';
import '../../src/modules/healthz.openapi.js';

import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';

import { InMemoryChatRepository, InMemoryMessageRepository } from './in-memory-repositories.js';
import { InMemoryUserRepository } from './in-memory-user-repository.js';
import { Config } from '../../src/config/config.js';
import type { IAiProvider } from '../../src/infrastructure/ai/ai.provider.js';
import { MockAiProvider } from '../../src/infrastructure/ai/mock.provider.js';
import { Logger } from '../../src/infrastructure/logger/logger.js';
import { AuthController } from '../../src/modules/auth/auth.controller.js';
import { buildAuthRouters } from '../../src/modules/auth/auth.routes.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { ChatController } from '../../src/modules/chat/chat.controller.js';
import { buildChatRouter } from '../../src/modules/chat/chat.routes.js';
import { ChatService } from '../../src/modules/chat/chat.service.js';
import { CompletionService } from '../../src/modules/chat/completion.service.js';
import { HistoryService } from '../../src/modules/chat/history.service.js';
import { CompletionStrategyFactory } from '../../src/modules/chat/strategies/completion-strategy.factory.js';
import { HistoryStrategyFactory } from '../../src/modules/chat/strategies/history-strategy.factory.js';
import { REQUEST_BODY_LIMIT } from '../../src/shared/constants.js';
import { errorHandler, notFoundHandler } from '../../src/shared/errors/error-handler.js';
import { FeatureFlagService } from '../../src/shared/feature-flags/feature-flag.service.js';
import { appCheckMiddleware } from '../../src/shared/middleware/app-check.js';
import { authMiddleware } from '../../src/shared/middleware/auth.js';
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
  signToken: (userId: string, email?: string) => string;
  authHeaders: (userId: string, email?: string) => Record<string, string>;
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
  const ai = overrides.ai ?? new MockAiProvider();
  const rateLimitStore = overrides.rateLimitStore ?? new InMemoryRateLimitStore();

  const completionFactory = new CompletionStrategyFactory(ai, flags);
  const historyFactory = new HistoryStrategyFactory(messages, flags);

  const authService = new AuthService(users, config);
  const chatService = new ChatService(chats, flags);
  const historyService = new HistoryService(chatService, historyFactory, flags);
  const completionService = new CompletionService(chatService, messages, completionFactory, logger);

  const authController = new AuthController(authService);
  const chatController = new ChatController(chatService, completionService, historyService);
  const authRouters = buildAuthRouters(authController, rateLimitStore);

  const app = express();
  app.disable('x-powered-by');
  app.use(requestLoggerMiddleware);
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok', flags: flags.snapshot() });
  });

  // Mirror app.ts: docs come before appCheck so they're browsable without a token.
  mountDocs(app, { enabled: config.values.app.docsEnabled, logger });

  app.use(appCheckMiddleware);
  app.use('/api/auth', authRouters.publicRouter);
  app.use(authMiddleware);
  app.use(clientTypeMiddleware);
  app.use('/api/auth', authRouters.protectedRouter);
  app.use('/api', buildChatRouter(chatController, rateLimitStore));

  app.use(notFoundHandler);
  app.use(errorHandler);

  const signToken = (userId: string, email = `${userId}@example.test`): string =>
    jwt.sign({ sub: userId, email }, config.values.auth.jwtSecret);

  const appCheckHeaders = (): Record<string, string> => ({
    'x-firebase-app-check': config.values.app.appCheckToken,
    'x-client-type': 'web',
  });

  const authHeaders = (userId: string, email?: string): Record<string, string> => ({
    Authorization: `Bearer ${signToken(userId, email)}`,
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
    appCheckHeaders,
  };
};

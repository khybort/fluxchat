import type { RequestHandler, Router } from 'express';

import type { Config } from '../config/config.js';
import type { IAiProvider } from '../infrastructure/ai/ai.provider.js';
import type { Logger } from '../infrastructure/logger/logger.js';
import { AdminController } from '../modules/admin/admin.controller.js';
import { buildAdminRouter } from '../modules/admin/admin.routes.js';
import { AuthController } from '../modules/auth/auth.controller.js';
import { buildAuthRouters } from '../modules/auth/auth.routes.js';
import { AuthService } from '../modules/auth/auth.service.js';
import { ChatController } from '../modules/chat/chat.controller.js';
import {
  type IChatRepository,
  type IMessageRepository,
} from '../modules/chat/chat.repository.interface.js';
import { buildChatRouter } from '../modules/chat/chat.routes.js';
import { ChatService } from '../modules/chat/chat.service.js';
import { CompletionService } from '../modules/chat/completion.service.js';
import { HistoryService } from '../modules/chat/history.service.js';
import { CompletionStrategyFactory } from '../modules/chat/strategies/completion-strategy.factory.js';
import { HistoryStrategyFactory } from '../modules/chat/strategies/history-strategy.factory.js';
import type { IUserRepository } from '../modules/user/user.repository.interface.js';
import type { FeatureFlagService } from '../shared/feature-flags/feature-flag.service.js';
import { buildAppCheckMiddleware } from '../shared/middleware/app-check.js';
import { buildAuthMiddleware } from '../shared/middleware/auth.js';
import { RateLimiterFactory } from '../shared/middleware/rate-limit.js';
import type { IRateLimitStore } from '../shared/rate-limit/rate-limit.types.js';

/**
 * Inputs to the shared wiring step. Production fills these from the real
 * Prisma + Redis + AI providers; tests fill them from in-memory doubles +
 * the mock provider. The downstream graph (services → controllers → routers)
 * is built identically by {@link wireApp}, so prod and test cannot drift.
 */
export interface AppDependencies {
  config: Config;
  logger: Logger;
  flags: FeatureFlagService;
  rateLimitStore: IRateLimitStore;
  /** Chat-completion provider (`prime` in production wiring). */
  aiPrime: IAiProvider;
  repos: {
    chats: IChatRepository;
    messages: IMessageRepository;
    users: IUserRepository;
  };
}

/**
 * The downstream surface produced by wiring — middleware bound to Config,
 * controllers, and routers. Whatever the caller still needs from the upstream
 * deps (Prisma client, Redis shutdown, AI fast provider) it composes itself.
 */
export interface WiredApp {
  middleware: {
    auth: RequestHandler;
    appCheck: RequestHandler;
  };
  controllers: {
    chat: ChatController;
    auth: AuthController;
    admin: AdminController;
  };
  routers: {
    chat: Router;
    authPublic: Router;
    authProtected: Router;
    admin: Router;
  };
}

/**
 * Single source of truth for the strategy → service → controller → router
 * graph. The composition root ({@link buildContainer}) and the test harness
 * both call this so a service-signature change ripples through one file, not
 * two — eliminates the prod/test drift that audit flagged in the refactor plan.
 */
export const wireApp = (deps: AppDependencies): WiredApp => {
  const { config, logger, flags, rateLimitStore, aiPrime, repos } = deps;

  // Strategy factories — chat completion uses the prime provider per spec.
  const completionFactory = new CompletionStrategyFactory(aiPrime, flags);
  const historyFactory = new HistoryStrategyFactory(repos.messages, flags);

  // Services.
  const authService = new AuthService(repos.users, config);
  const chatService = new ChatService(repos.chats, flags);
  const historyService = new HistoryService(chatService, historyFactory, flags);
  const completionService = new CompletionService(
    chatService,
    repos.messages,
    completionFactory,
    logger,
  );

  // Middleware bound to this deps' Config — eliminates implicit singleton
  // lookups inside the request hot path.
  const authMiddleware = buildAuthMiddleware(config);
  const appCheckMiddleware = buildAppCheckMiddleware(config);
  const rateLimiter = new RateLimiterFactory(rateLimitStore, flags);

  // Controllers + routers.
  const authController = new AuthController(authService);
  const chatController = new ChatController(chatService, completionService, historyService);
  const adminController = new AdminController(flags, repos.users);
  const chatRouter = buildChatRouter(chatController, rateLimiter);
  const authRouters = buildAuthRouters(authController, rateLimiter, authMiddleware);
  const adminRouter = buildAdminRouter(adminController, rateLimiter);

  return {
    middleware: { auth: authMiddleware, appCheck: appCheckMiddleware },
    controllers: { chat: chatController, auth: authController, admin: adminController },
    routers: {
      chat: chatRouter,
      authPublic: authRouters.publicRouter,
      authProtected: authRouters.protectedRouter,
      admin: adminRouter,
    },
  };
};

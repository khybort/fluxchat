import type { RequestHandler, Router } from 'express';

import type { Config } from '../config/config.js';
import type { IAiProvider } from '../infrastructure/ai/ai.provider.js';
import type { Logger } from '../infrastructure/logger/logger.js';
import { AdminController } from '../modules/admin/adapters/http/admin.controller.js';
import { buildAdminRouter } from '../modules/admin/adapters/http/admin.routes.js';
import type { AdminUseCases } from '../modules/admin/application/use-cases/admin.use-cases.js';
import { ClearAllFeatureFlagsUseCase } from '../modules/admin/application/use-cases/clear-all-feature-flags.use-case.js';
import { ClearFeatureFlagUseCase } from '../modules/admin/application/use-cases/clear-feature-flag.use-case.js';
import { EvaluateFeatureFlagUseCase } from '../modules/admin/application/use-cases/evaluate-feature-flag.use-case.js';
import { ListFeatureFlagsUseCase } from '../modules/admin/application/use-cases/list-feature-flags.use-case.js';
import { ListUsersAdminUseCase } from '../modules/admin/application/use-cases/list-users-admin.use-case.js';
import { ReloadFeatureFlagsUseCase } from '../modules/admin/application/use-cases/reload-feature-flags.use-case.js';
import { UpdateFeatureFlagUseCase } from '../modules/admin/application/use-cases/update-feature-flag.use-case.js';
import { AuthController } from '../modules/auth/adapters/http/auth.controller.js';
import { buildAuthRouters } from '../modules/auth/adapters/http/auth.routes.js';
import { AuthTokenIssuer } from '../modules/auth/application/services/auth-token.issuer.js';
import type { AuthUseCases } from '../modules/auth/application/use-cases/auth.use-cases.js';
import { GetCurrentUserFlagsUseCase } from '../modules/auth/application/use-cases/get-current-user-flags.use-case.js';
import { GetCurrentUserUseCase } from '../modules/auth/application/use-cases/get-current-user.use-case.js';
import { LoginUserUseCase } from '../modules/auth/application/use-cases/login-user.use-case.js';
import { RegisterUserUseCase } from '../modules/auth/application/use-cases/register-user.use-case.js';
import { ChatController } from '../modules/chat/adapters/http/chat.controller.js';
import { buildChatRouter } from '../modules/chat/adapters/http/chat.routes.js';
import { ChatAccessPolicy } from '../modules/chat/application/policies/chat-access.policy.js';
import { MessagePersistencePolicy } from '../modules/chat/application/policies/message-persistence.policy.js';
import type { IChatRepository } from '../modules/chat/application/ports/chat.repository.port.js';
import type { IMessageRepository } from '../modules/chat/application/ports/message.repository.port.js';
import { CompletionStrategyFactory } from '../modules/chat/application/strategies/completion-strategy.factory.js';
import { HistoryStrategyFactory } from '../modules/chat/application/strategies/history-strategy.factory.js';
import { ArchiveChatUseCase } from '../modules/chat/application/use-cases/archive-chat.use-case.js';
import type { ChatUseCases } from '../modules/chat/application/use-cases/chat.use-cases.js';
import { CreateChatUseCase } from '../modules/chat/application/use-cases/create-chat.use-case.js';
import { DeleteChatUseCase } from '../modules/chat/application/use-cases/delete-chat.use-case.js';
import { GetChatHistoryUseCase } from '../modules/chat/application/use-cases/get-chat-history.use-case.js';
import { ListArchivedChatsUseCase } from '../modules/chat/application/use-cases/list-archived-chats.use-case.js';
import { ListChatsUseCase } from '../modules/chat/application/use-cases/list-chats.use-case.js';
import { RegenerateCompletionUseCase } from '../modules/chat/application/use-cases/regenerate-completion.use-case.js';
import { RunCompletionUseCase } from '../modules/chat/application/use-cases/run-completion.use-case.js';
import { UnarchiveChatUseCase } from '../modules/chat/application/use-cases/unarchive-chat.use-case.js';
import type { IUserRepository } from '../modules/user/application/ports/user.repository.port.js';
import type { FeatureFlagService } from '../shared/feature-flags/feature-flag.service.js';
import { buildAppCheckMiddleware } from '../shared/middleware/app-check.js';
import { buildAuthMiddleware } from '../shared/middleware/auth.js';
import { RateLimiterFactory } from '../shared/middleware/rate-limit.js';
import type { IRateLimitStore } from '../shared/rate-limit/rate-limit.types.js';

/**
 * Inputs to the shared wiring step. Production fills these from the real
 * Prisma + Redis + AI providers; tests fill them from in-memory doubles +
 * the mock provider. The downstream graph (policies → use cases → controllers
 * → routers) is built identically by {@link wireApp}, so prod and test cannot
 * drift.
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
 * Single source of truth for the policy → use case → controller → router
 * graph. The composition root ({@link buildContainer}) and the test harness
 * both call this so a use case constructor change ripples through one file,
 * not two.
 */
export const wireApp = (deps: AppDependencies): WiredApp => {
  const { config, logger, flags, rateLimitStore, aiPrime, repos } = deps;

  // Application policies (shared by use cases).
  const chatAccess = new ChatAccessPolicy(repos.chats);
  const messagePersistence = new MessagePersistencePolicy(repos.messages, logger);
  const tokenIssuer = new AuthTokenIssuer(config);

  // Strategy factories — chat completion uses the prime provider per spec.
  const completionFactory = new CompletionStrategyFactory(aiPrime, flags);
  const historyFactory = new HistoryStrategyFactory(repos.messages, flags);

  // Chat use case bag.
  const chatUseCases: ChatUseCases = {
    listChats: new ListChatsUseCase(repos.chats, flags),
    listArchivedChats: new ListArchivedChatsUseCase(repos.chats, flags),
    createChat: new CreateChatUseCase(repos.chats),
    deleteChat: new DeleteChatUseCase(repos.chats),
    archiveChat: new ArchiveChatUseCase(repos.chats),
    unarchiveChat: new UnarchiveChatUseCase(repos.chats),
    getHistory: new GetChatHistoryUseCase(chatAccess, historyFactory, flags),
    runCompletion: new RunCompletionUseCase(
      chatAccess,
      repos.messages,
      messagePersistence,
      completionFactory,
      logger,
    ),
    regenerateCompletion: new RegenerateCompletionUseCase(
      chatAccess,
      repos.messages,
      messagePersistence,
      completionFactory,
      logger,
    ),
  };

  // Auth use case bag.
  const authUseCases: AuthUseCases = {
    register: new RegisterUserUseCase(repos.users, tokenIssuer),
    login: new LoginUserUseCase(repos.users, tokenIssuer),
    getCurrentUser: new GetCurrentUserUseCase(repos.users, tokenIssuer),
    getCurrentUserFlags: new GetCurrentUserFlagsUseCase(flags),
  };

  // Admin use case bag.
  const adminUseCases: AdminUseCases = {
    listFlags: new ListFeatureFlagsUseCase(flags),
    updateFlag: new UpdateFeatureFlagUseCase(flags),
    clearFlag: new ClearFeatureFlagUseCase(flags),
    clearAllFlags: new ClearAllFeatureFlagsUseCase(flags),
    reloadFlags: new ReloadFeatureFlagsUseCase(flags),
    evaluateFlag: new EvaluateFeatureFlagUseCase(flags),
    listUsers: new ListUsersAdminUseCase(repos.users),
  };

  // Middleware bound to this deps' Config — eliminates implicit singleton
  // lookups inside the request hot path.
  const authMiddleware = buildAuthMiddleware(config);
  const appCheckMiddleware = buildAppCheckMiddleware(config);
  const rateLimiter = new RateLimiterFactory(rateLimitStore, flags);

  // Controllers + routers.
  const authController = new AuthController(authUseCases);
  const chatController = new ChatController(chatUseCases);
  const adminController = new AdminController(adminUseCases);
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

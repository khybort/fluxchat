import type { Router } from 'express';
import Redis from 'ioredis';

import { Config } from '../config/config.js';
import type { IAiProvider } from '../infrastructure/ai/ai.provider.js';
import { AnthropicProvider } from '../infrastructure/ai/anthropic.provider.js';
import { FallbackAiProvider } from '../infrastructure/ai/fallback.provider.js';
import { GroqProvider } from '../infrastructure/ai/groq.provider.js';
import { MockAiProvider } from '../infrastructure/ai/mock.provider.js';
import { OpenAiProvider } from '../infrastructure/ai/openai.provider.js';
import { PrismaService } from '../infrastructure/database/prisma.service.js';
import { PrismaFlagOverrideStore } from '../infrastructure/feature-flags/prisma-override-store.js';
import { Logger } from '../infrastructure/logger/logger.js';
import { AdminController } from '../modules/admin/admin.controller.js';
import { buildAdminRouter } from '../modules/admin/admin.routes.js';
import { AuthController } from '../modules/auth/auth.controller.js';
import { buildAuthRouters } from '../modules/auth/auth.routes.js';
import { AuthService } from '../modules/auth/auth.service.js';
import { ChatController } from '../modules/chat/chat.controller.js';
import { ChatRepository } from '../modules/chat/chat.repository.js';
import { buildChatRouter } from '../modules/chat/chat.routes.js';
import { ChatService } from '../modules/chat/chat.service.js';
import { CompletionService } from '../modules/chat/completion.service.js';
import { HistoryService } from '../modules/chat/history.service.js';
import { MessageRepository } from '../modules/chat/message.repository.js';
import { CompletionStrategyFactory } from '../modules/chat/strategies/completion-strategy.factory.js';
import { HistoryStrategyFactory } from '../modules/chat/strategies/history-strategy.factory.js';
import { UserRepository } from '../modules/user/user.repository.js';
import { FeatureFlagService } from '../shared/feature-flags/feature-flag.service.js';
import { InMemoryRateLimitStore } from '../shared/rate-limit/in-memory.store.js';
import type { IRateLimitStore } from '../shared/rate-limit/rate-limit.types.js';
import { RedisRateLimitStore } from '../shared/rate-limit/redis.store.js';

/**
 * Composition root (CLAUDE.md §7.4). The ONLY place that calls `new` on
 * concrete services and repositories. Tests build their own container with
 * mocks — they should not call `buildContainer()`.
 *
 * AI provider wiring (per architecture spec):
 *   - prime  = Anthropic Claude Sonnet 4.6 (direct Anthropic SDK)
 *   - fast   = Groq gpt-oss-120b with Anthropic fallback (Fallback(Groq, Anthropic))
 *   - extra  = OpenAI (also supported, picked when Anthropic is absent)
 *   - chat completion endpoint uses `prime`
 *   - `fast` is exposed for analysis/tool-agent code paths
 *
 * Rate limiting:
 *   - `RedisRateLimitStore` when REDIS_URL is set (multi-instance safe)
 *   - `InMemoryRateLimitStore` otherwise (single instance only)
 */
export interface AppContainer {
  config: Config;
  logger: Logger;
  prisma: PrismaService;
  flags: FeatureFlagService;
  rateLimitStore: IRateLimitStore;
  ai: {
    prime: IAiProvider;
    fast: IAiProvider;
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
  /** Resources opened by the container (e.g. Redis client) for orderly shutdown. */
  shutdown: () => Promise<void>;
}

interface ProviderBuilders {
  anthropic: () => AnthropicProvider;
  groq: () => GroqProvider;
  openai: () => OpenAiProvider;
}

const buildProviderBuilders = (config: Config, logger: Logger): Partial<ProviderBuilders> => {
  const builders: Partial<ProviderBuilders> = {};
  const ai = config.values.ai;
  if (ai.anthropicApiKey) {
    builders.anthropic = () =>
      AnthropicProvider.create({
        apiKey: ai.anthropicApiKey ?? '',
        model: ai.anthropicModel,
        logger,
      });
  }
  if (ai.groqApiKey) {
    builders.groq = () =>
      new GroqProvider({
        apiKey: ai.groqApiKey ?? '',
        model: ai.groqModel,
        baseUrl: ai.groqBaseUrl,
        logger,
      });
  }
  if (ai.openAiApiKey) {
    builders.openai = () =>
      new OpenAiProvider({
        apiKey: ai.openAiApiKey ?? '',
        model: ai.openAiModel,
        logger,
      });
  }
  return builders;
};

const buildPrimeProvider = (builders: Partial<ProviderBuilders>, logger: Logger): IAiProvider => {
  // Chat completion path: Anthropic → Groq fallback when both keys exist
  // (quality primary + resilience fallback). Otherwise pick the first
  // configured provider, finally a mock when nothing is set.
  if (builders.anthropic && builders.groq) {
    return new FallbackAiProvider(builders.anthropic(), builders.groq(), logger, 'anthropic->groq');
  }
  if (builders.anthropic) return builders.anthropic();
  if (builders.openai) {
    logger.pino.warn('ANTHROPIC_API_KEY missing; using OpenAI for the chat (prime) path');
    return builders.openai();
  }
  if (builders.groq) {
    logger.pino.warn('ANTHROPIC_API_KEY missing; using Groq for the chat (prime) path');
    return builders.groq();
  }
  logger.pino.warn('no_ai_keys_configured_using_mock_provider');
  return new MockAiProvider();
};

const buildFastProvider = (builders: Partial<ProviderBuilders>, logger: Logger): IAiProvider => {
  // Tool-agent analysis: try Groq first, fall back to Anthropic (per spec).
  if (builders.groq && builders.anthropic) {
    return new FallbackAiProvider(builders.groq(), builders.anthropic(), logger, 'groq->anthropic');
  }
  if (builders.groq) return builders.groq();
  if (builders.anthropic) return builders.anthropic();
  if (builders.openai) return builders.openai();
  return new MockAiProvider();
};

interface RateLimitWiring {
  store: IRateLimitStore;
  shutdown: () => Promise<void>;
}

const buildRateLimitStore = (config: Config, logger: Logger): RateLimitWiring => {
  const url = config.values.redisUrl;
  if (!url) {
    return { store: new InMemoryRateLimitStore(), shutdown: () => Promise.resolve() };
  }
  const redis = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 });
  redis.on('error', (err) => {
    logger.pino.error({ err }, 'redis_rate_limit_error');
  });
  return {
    store: new RedisRateLimitStore(redis),
    shutdown: async () => {
      await redis.quit().catch(() => undefined);
    },
  };
};

export const buildContainer = (): AppContainer => {
  const config = Config.getInstance();
  const logger = Logger.getInstance();
  const prisma = PrismaService.getInstance();
  const flags = FeatureFlagService.getInstance();

  // Wire the DB-backed flag override store. server.ts then awaits the first
  // `flags.reload()` so the in-memory state has DB rows merged before the
  // HTTP server starts accepting requests.
  flags.configureOverrideStore(new PrismaFlagOverrideStore(prisma));

  const builders = buildProviderBuilders(config, logger);
  const prime = buildPrimeProvider(builders, logger);
  const fast = buildFastProvider(builders, logger);

  const rateLimit = buildRateLimitStore(config, logger);

  // Repositories (DIP — services depend on the interfaces).
  const chatRepo = new ChatRepository(prisma);
  const messageRepo = new MessageRepository(prisma);
  const userRepo = new UserRepository(prisma);

  // Strategy factories — chat completion uses the prime provider per spec.
  const completionFactory = new CompletionStrategyFactory(prime, flags);
  const historyFactory = new HistoryStrategyFactory(messageRepo, flags);

  // Services.
  const authService = new AuthService(userRepo, config);
  const chatService = new ChatService(chatRepo, flags);
  const historyService = new HistoryService(chatService, historyFactory, flags);
  const completionService = new CompletionService(
    chatService,
    messageRepo,
    completionFactory,
    logger,
  );

  // Controllers + routers.
  const authController = new AuthController(authService);
  const chatController = new ChatController(chatService, completionService, historyService);
  const adminController = new AdminController(flags, userRepo);
  const chatRouter = buildChatRouter(chatController, rateLimit.store);
  const authRouters = buildAuthRouters(authController, rateLimit.store);
  const adminRouter = buildAdminRouter(adminController, rateLimit.store);

  return {
    config,
    logger,
    prisma,
    flags,
    rateLimitStore: rateLimit.store,
    ai: { prime, fast },
    controllers: { chat: chatController, auth: authController, admin: adminController },
    routers: {
      chat: chatRouter,
      authPublic: authRouters.publicRouter,
      authProtected: authRouters.protectedRouter,
      admin: adminRouter,
    },
    shutdown: rateLimit.shutdown,
  };
};

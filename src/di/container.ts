import type { RequestHandler, Router } from 'express';
import Redis from 'ioredis';

import { wireApp } from './wire-app.js';
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
import type { AdminController } from '../modules/admin/adapters/http/admin.controller.js';
import type { AuthController } from '../modules/auth/adapters/http/auth.controller.js';
import type { ChatController } from '../modules/chat/adapters/http/chat.controller.js';
import { ChatPrismaRepository } from '../modules/chat/adapters/persistence/chat.prisma.repository.js';
import { MessagePrismaRepository } from '../modules/chat/adapters/persistence/message.prisma.repository.js';
import { UserPrismaRepository } from '../modules/user/adapters/persistence/user.prisma.repository.js';
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
  middleware: {
    /** JWT verification middleware bound to this container's Config. */
    auth: RequestHandler;
    /** Firebase App Check middleware bound to this container's Config. */
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
  return new MockAiProvider(logger);
};

const buildFastProvider = (builders: Partial<ProviderBuilders>, logger: Logger): IAiProvider => {
  // Tool-agent analysis: try Groq first, fall back to Anthropic (per spec).
  if (builders.groq && builders.anthropic) {
    return new FallbackAiProvider(builders.groq(), builders.anthropic(), logger, 'groq->anthropic');
  }
  if (builders.groq) return builders.groq();
  if (builders.anthropic) return builders.anthropic();
  if (builders.openai) return builders.openai();
  return new MockAiProvider(logger);
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

  // Repositories (DIP — use cases depend on the port interfaces, the container
  // injects the Prisma-backed concretions).
  const chats = new ChatPrismaRepository(prisma);
  const messages = new MessagePrismaRepository(prisma);
  const users = new UserPrismaRepository(prisma);

  // Strategy → service → controller → router graph. Identical wiring runs
  // in tests with in-memory repos + a mock AI provider, so a signature change
  // here lands in both code paths in one edit.
  const wired = wireApp({
    config,
    logger,
    flags,
    rateLimitStore: rateLimit.store,
    aiPrime: prime,
    repos: { chats, messages, users },
  });

  return {
    config,
    logger,
    prisma,
    flags,
    rateLimitStore: rateLimit.store,
    ai: { prime, fast },
    middleware: wired.middleware,
    controllers: wired.controllers,
    routers: wired.routers,
    shutdown: rateLimit.shutdown,
  };
};

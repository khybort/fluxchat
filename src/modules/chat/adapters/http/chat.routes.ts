import { Router } from 'express';

import type { ChatController } from './chat.controller.js';
import {
  ChatIdParamSchema,
  CompletionBodySchema,
  CreateChatBodySchema,
  HistoryQuerySchema,
  ListChatsQuerySchema,
} from './chat.dto.js';
import { asyncHandler } from '../../../../shared/middleware/async-handler.js';
import { featureFlagGuard } from '../../../../shared/middleware/feature-flag-guard.js';
import type { RateLimiterFactory } from '../../../../shared/middleware/rate-limit.js';
import { validateRequest } from '../../../../shared/middleware/validate-request.js';

/**
 * Routes are pure wiring (CLAUDE.md §11): global middleware lives in app.ts,
 * route-specific guards (validate, rate-limit, feature-flag-guard) attach here.
 * The rate-limit store is injected by the composition root so the same router
 * works against in-memory state in tests and Redis in production.
 */
export const buildChatRouter = (
  controller: ChatController,
  rateLimiter: RateLimiterFactory,
): Router => {
  const router = Router();

  router.get(
    '/chats',
    validateRequest({ query: ListChatsQuerySchema }),
    rateLimiter.perRoute({ keyBy: 'user' }),
    asyncHandler(controller.listChats),
  );

  // Literal '/chats/archived' must be declared before any '/chats/:chatId/...'
  // pattern so Express resolves it to listArchivedChats, not the param route.
  router.get(
    '/chats/archived',
    validateRequest({ query: ListChatsQuerySchema }),
    rateLimiter.perRoute({ keyBy: 'user' }),
    asyncHandler(controller.listArchivedChats),
  );

  router.post(
    '/chats',
    validateRequest({ body: CreateChatBodySchema }),
    rateLimiter.perRoute({ keyBy: 'user' }),
    asyncHandler(controller.createChat),
  );

  router.get(
    '/chats/:chatId/history',
    validateRequest({ params: ChatIdParamSchema, query: HistoryQuerySchema }),
    rateLimiter.perRoute({ keyBy: 'user' }),
    asyncHandler(controller.getHistory),
  );

  router.delete(
    '/chats/:chatId',
    validateRequest({ params: ChatIdParamSchema }),
    rateLimiter.perRoute({ keyBy: 'user' }),
    asyncHandler(controller.deleteChat),
  );

  router.post(
    '/chats/:chatId/archive',
    validateRequest({ params: ChatIdParamSchema }),
    rateLimiter.perRoute({ keyBy: 'user' }),
    asyncHandler(controller.archiveChat),
  );

  router.post(
    '/chats/:chatId/unarchive',
    validateRequest({ params: ChatIdParamSchema }),
    rateLimiter.perRoute({ keyBy: 'user' }),
    asyncHandler(controller.unarchiveChat),
  );

  router.post(
    '/chats/:chatId/completion',
    featureFlagGuard('COMPLETION_ENABLED'),
    validateRequest({ params: ChatIdParamSchema, body: CompletionBodySchema }),
    rateLimiter.perRoute({ keyBy: 'user+client' }),
    asyncHandler(controller.completion),
  );

  router.post(
    '/chats/:chatId/regenerate',
    featureFlagGuard('COMPLETION_ENABLED'),
    validateRequest({ params: ChatIdParamSchema }),
    rateLimiter.perRoute({ keyBy: 'user+client' }),
    asyncHandler(controller.regenerate),
  );

  return router;
};

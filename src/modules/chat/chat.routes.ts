import { Router } from 'express';

import type { ChatController } from './chat.controller.js';
import {
  ChatIdParamSchema,
  CompletionBodySchema,
  CreateChatBodySchema,
  HistoryQuerySchema,
  ListChatsQuerySchema,
} from './chat.dto.js';
import { rateLimitPerRoute } from '../../shared/middleware/rate-limit.js';
import { validateRequest } from '../../shared/middleware/validate-request.js';
import type { IRateLimitStore } from '../../shared/rate-limit/rate-limit.types.js';

/**
 * Routes are pure wiring (CLAUDE.md §11): global middleware lives in app.ts,
 * route-specific guards (validate, rate-limit, feature-flag-guard) attach here.
 * The rate-limit store is injected by the composition root so the same router
 * works against in-memory state in tests and Redis in production.
 */
export const buildChatRouter = (
  controller: ChatController,
  rateLimitStore: IRateLimitStore,
): Router => {
  const router = Router();

  router.get(
    '/chats',
    validateRequest({ query: ListChatsQuerySchema }),
    rateLimitPerRoute({ keyBy: 'user', store: rateLimitStore }),
    controller.listChats,
  );

  router.post(
    '/chats',
    validateRequest({ body: CreateChatBodySchema }),
    rateLimitPerRoute({ keyBy: 'user', store: rateLimitStore }),
    controller.createChat,
  );

  router.get(
    '/chats/:chatId/history',
    validateRequest({ params: ChatIdParamSchema, query: HistoryQuerySchema }),
    rateLimitPerRoute({ keyBy: 'user', store: rateLimitStore }),
    controller.getHistory,
  );

  router.post(
    '/chats/:chatId/completion',
    validateRequest({ params: ChatIdParamSchema, body: CompletionBodySchema }),
    rateLimitPerRoute({ keyBy: 'user', store: rateLimitStore }),
    controller.completion,
  );

  return router;
};

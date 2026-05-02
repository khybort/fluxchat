import { ChatIdParamSchema, HistoryQuerySchema } from './chat.dto.js';
import { COMMON_RESPONSES, errorResponse, MessagePageSchema } from './chat.openapi.shared.js';
import { openApiRegistry } from '../../shared/openapi/registry.js';
import { AUTHED_SECURITY } from '../../shared/openapi/security.js';

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/chats/{chatId}/history',
  tags: ['Chat'],
  summary: 'Get the message history of a chat',
  description: [
    'When the runtime `CHAT_HISTORY_ENABLED` flag is `false`, the response is the **last 10 messages** (no pagination).',
    'When `true`, full cursor-based pagination applies, clamped to `PAGINATION_LIMIT`.',
    '',
    'Cross-user access intentionally returns **404 (not 403)** so the existence of a chat is not leaked.',
  ].join('\n'),
  security: AUTHED_SECURITY,
  request: {
    params: ChatIdParamSchema,
    query: HistoryQuerySchema,
  },
  responses: {
    200: {
      description: 'Page of messages for the chat (oldest first).',
      content: { 'application/json': { schema: MessagePageSchema } },
    },
    400: errorResponse('Validation error.'),
    404: errorResponse('Chat not found, or owned by a different user (no info leak).'),
    ...COMMON_RESPONSES,
  },
});

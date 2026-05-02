import { ChatIdParamSchema, ListChatsQuerySchema } from './chat.dto.js';
import { ChatPageSchema, COMMON_RESPONSES, errorResponse } from './chat.openapi.shared.js';
import { openApiRegistry } from '../../shared/openapi/registry.js';
import { AUTHED_SECURITY } from '../../shared/openapi/security.js';

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/chats/archived',
  tags: ['Chat'],
  summary: 'List archived chats for the authenticated user',
  description:
    'Cursor-paginated list of chats the user has archived. Same paging contract as /api/chats.',
  security: AUTHED_SECURITY,
  request: { query: ListChatsQuerySchema },
  responses: {
    200: {
      description: 'Paged list of archived chats, most-recently-archived first.',
      content: { 'application/json': { schema: ChatPageSchema } },
    },
    400: errorResponse('Validation error.'),
    ...COMMON_RESPONSES,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/chats/{chatId}/archive',
  tags: ['Chat'],
  summary: 'Archive a chat',
  description:
    'Hides the chat from the active list while preserving messages. Idempotent — already-archived chats return 404.',
  security: AUTHED_SECURITY,
  request: { params: ChatIdParamSchema },
  responses: {
    204: { description: 'Chat archived.' },
    404: errorResponse('Chat not found, owned by another user, or already archived.'),
    ...COMMON_RESPONSES,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/chats/{chatId}/unarchive',
  tags: ['Chat'],
  summary: 'Restore an archived chat',
  description: 'Returns the chat to the active list. 404 when not archived or not owned.',
  security: AUTHED_SECURITY,
  request: { params: ChatIdParamSchema },
  responses: {
    204: { description: 'Chat restored.' },
    404: errorResponse('Chat not found, owned by another user, or not archived.'),
    ...COMMON_RESPONSES,
  },
});

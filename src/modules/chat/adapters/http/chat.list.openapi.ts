import { ListChatsQuerySchema } from './chat.dto.js';
import {
  ChatPageSchema,
  ChatSchema,
  COMMON_RESPONSES,
  CreateChatRequestSchema,
  errorResponse,
} from './chat.openapi.shared.js';
import { openApiRegistry } from '../../../../shared/openapi/registry.js';
import { AUTHED_SECURITY } from '../../../../shared/openapi/security.js';

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/chats',
  tags: ['Chat'],
  summary: 'List the authenticated user’s chats',
  description:
    'Cursor-based pagination. The page size is clamped to the runtime `PAGINATION_LIMIT` flag (10–100, default 20).',
  security: AUTHED_SECURITY,
  request: { query: ListChatsQuerySchema },
  responses: {
    200: {
      description: 'Paged list of the user’s chats, newest first.',
      content: { 'application/json': { schema: ChatPageSchema } },
    },
    400: errorResponse('Validation error (limit out of range).'),
    ...COMMON_RESPONSES,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/chats',
  tags: ['Chat'],
  summary: 'Create a new chat',
  description: 'Title is optional; a default is used when omitted.',
  security: AUTHED_SECURITY,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: CreateChatRequestSchema } },
    },
  },
  responses: {
    201: {
      description: 'Newly created chat.',
      content: { 'application/json': { schema: ChatSchema } },
    },
    400: errorResponse('Validation error.'),
    ...COMMON_RESPONSES,
  },
});

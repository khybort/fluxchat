import { z } from 'zod';

import {
  ChatIdParamSchema,
  CompletionBodySchema,
  CreateChatBodySchema,
  HistoryQuerySchema,
  ListChatsQuerySchema,
} from './chat.dto.js';
import { openApiRegistry } from '../../shared/openapi/registry.js';
import {
  AUTHED_SECURITY,
  ErrorResponseSchema,
  paginatedSchema,
} from '../../shared/openapi/security.js';

// ────────── Domain schemas (mirror src/modules/chat/chat.types.ts) ──────────

const ChatSchema = z
  .object({
    id: z.string().uuid().openapi({ example: '21fbb2c1-1d3f-46f0-9a14-67d4ddc6b9d3' }),
    title: z.string().openapi({ example: 'Trip planning' }),
    userId: z.string().uuid(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi('Chat');

const MessageSchema = z
  .object({
    id: z.string().uuid(),
    chatId: z.string().uuid(),
    role: z.enum(['user', 'assistant', 'system']).openapi({ example: 'assistant' }),
    content: z.string().openapi({ example: 'It is currently partly cloudy.' }),
    createdAt: z.string().datetime(),
  })
  .openapi('Message');

const ToolCallSchema = z
  .object({
    name: z.string().openapi({ example: 'getCurrentWeather' }),
    args: z.record(z.unknown()).openapi({ example: { location: 'Istanbul' } }),
    result: z.unknown(),
  })
  .openapi('ToolCall');

const CompletionUsageSchema = z
  .object({
    promptTokens: z.number().int().optional(),
    completionTokens: z.number().int().optional(),
  })
  .openapi('CompletionUsage');

const CompletionJsonResponseSchema = z
  .object({
    message: z.object({
      role: z.literal('assistant'),
      content: z.string(),
    }),
    toolCalls: z.array(ToolCallSchema),
    usage: CompletionUsageSchema.optional(),
  })
  .openapi('CompletionJsonResponse');

// SSE event variants — documented here so consumers know what to parse.
const StreamEventSchema = z
  .union([
    z.object({ type: z.literal('thinking') }).openapi('StreamEventThinking', {
      description: 'Emitted once at the start. `event: thinking\\ndata: {}\\n\\n`',
    }),
    z
      .object({ type: z.literal('tool_execution'), tool: ToolCallSchema })
      .openapi('StreamEventToolExecution', {
        description:
          'Emitted as soon as a `tool_use` block completes (Anthropic real-time tool streaming).',
      }),
    z.object({ type: z.literal('delta'), text: z.string() }).openapi('StreamEventDelta', {
      description: 'Repeated. Each event carries one chunk of the assistant text.',
    }),
    z
      .object({
        type: z.literal('done'),
        fullText: z.string(),
        usage: CompletionUsageSchema.optional(),
      })
      .openapi('StreamEventDone', {
        description:
          'Final event — fullText is the concatenated assistant message; usage may include token counts.',
      }),
  ])
  .openapi('StreamEvent');

openApiRegistry.register('Chat', ChatSchema);
openApiRegistry.register('Message', MessageSchema);
openApiRegistry.register('ToolCall', ToolCallSchema);
openApiRegistry.register('CompletionUsage', CompletionUsageSchema);
openApiRegistry.register('CompletionJsonResponse', CompletionJsonResponseSchema);
openApiRegistry.register('StreamEvent', StreamEventSchema);

// Reusable paged envelopes.
const ChatPageSchema = paginatedSchema(ChatSchema, 'ChatPage');
const MessagePageSchema = paginatedSchema(MessageSchema, 'MessagePage');
openApiRegistry.register('ChatPage', ChatPageSchema);
openApiRegistry.register('MessagePage', MessagePageSchema);

// Request annotations.
const CreateChatRequestSchema = CreateChatBodySchema.openapi('CreateChatRequest', {
  example: { title: 'Trip planning' },
});
const CompletionRequestSchema = CompletionBodySchema.openapi('CompletionRequest', {
  example: { message: 'What is the weather in Istanbul?' },
});
openApiRegistry.register('CreateChatRequest', CreateChatRequestSchema);
openApiRegistry.register('CompletionRequest', CompletionRequestSchema);

// ────────── Path declarations ──────────

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorResponseSchema } },
});

const COMMON_RESPONSES = {
  401: errorResponse('Missing/invalid JWT or App Check token.'),
  429: errorResponse('Rate limited (per-user).'),
  500: errorResponse('Unexpected internal error.'),
};

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

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/chats/{chatId}/completion',
  tags: ['Chat'],
  summary: 'AI completion — streaming SSE or JSON, controlled by feature flag',
  description: [
    '**Streaming (default, `STREAMING_ENABLED=true`)** — returns `text/event-stream` with the following event sequence:',
    '',
    '```',
    'event: thinking',
    'data: {}',
    '',
    'event: tool_execution',
    'data: { "name": "getCurrentWeather", "args": {...}, "result": {...} }',
    '',
    'event: delta',
    'data: { "text": "It is " }',
    '',
    'event: delta',
    'data: { "text": "currently partly cloudy." }',
    '',
    'event: done',
    'data: { "fullText": "...", "usage": { ... } }',
    '```',
    '',
    '**JSON (`STREAMING_ENABLED=false`)** — returns a single JSON document with the full assistant message and any tool calls.',
    '',
    'Tool execution is itself gated by `AI_TOOLS_ENABLED`. The mocked tool `getCurrentWeather` is included; behavior matches `AnthropicProvider`’s real-time stream parsing.',
  ].join('\n'),
  security: AUTHED_SECURITY,
  request: {
    params: ChatIdParamSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: CompletionRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Either a streamed SSE sequence or a single JSON payload.',
      content: {
        'application/json': { schema: CompletionJsonResponseSchema },
        'text/event-stream': {
          schema: StreamEventSchema,
          example:
            'event: thinking\ndata: {}\n\nevent: delta\ndata: {"text":"Hello "}\n\nevent: done\ndata: {"fullText":"Hello world","usage":{"promptTokens":12,"completionTokens":8}}\n\n',
        },
      },
    },
    400: errorResponse('Validation error (empty/oversize message).'),
    404: errorResponse('Chat not found, or owned by a different user.'),
    ...COMMON_RESPONSES,
  },
});

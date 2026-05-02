import { ChatIdParamSchema } from './chat.dto.js';
import {
  COMMON_RESPONSES,
  CompletionJsonResponseSchema,
  CompletionRequestSchema,
  errorResponse,
  StreamEventSchema,
} from './chat.openapi.shared.js';
import { openApiRegistry } from '../../../../shared/openapi/registry.js';
import { AUTHED_SECURITY } from '../../../../shared/openapi/security.js';

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

import { z } from 'zod';

import { CompletionBodySchema, CreateChatBodySchema } from './chat.dto.js';
import { openApiRegistry } from '../../shared/openapi/registry.js';
import { ErrorResponseSchema, paginatedSchema } from '../../shared/openapi/security.js';

// ────────── Domain schemas (mirror src/modules/chat/chat.types.ts) ──────────

export const ChatSchema = z
  .object({
    id: z.string().uuid().openapi({ example: '21fbb2c1-1d3f-46f0-9a14-67d4ddc6b9d3' }),
    title: z.string().openapi({ example: 'Trip planning' }),
    userId: z.string().uuid(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi('Chat');

const MessageUsageSchema = z
  .object({
    promptTokens: z.number().int().nullable(),
    completionTokens: z.number().int().nullable(),
    provider: z.string().nullable().openapi({ example: 'anthropic' }),
    model: z.string().nullable().openapi({ example: 'claude-sonnet-4-6' }),
  })
  .openapi('MessageUsage');

export const MessageSchema = z
  .object({
    id: z.string().uuid(),
    chatId: z.string().uuid(),
    role: z.enum(['user', 'assistant', 'system']).openapi({ example: 'assistant' }),
    content: z.string().openapi({ example: 'It is currently partly cloudy.' }),
    createdAt: z.string().datetime(),
    usage: MessageUsageSchema.nullable().openapi({
      description: 'Per-assistant-message AI usage. null for user/system rows.',
    }),
  })
  .openapi('Message');

export const ToolCallSchema = z
  .object({
    name: z.string().openapi({ example: 'getCurrentWeather' }),
    args: z.record(z.unknown()).openapi({ example: { location: 'Istanbul' } }),
    result: z.unknown(),
  })
  .openapi('ToolCall');

export const CompletionUsageSchema = z
  .object({
    promptTokens: z.number().int().optional(),
    completionTokens: z.number().int().optional(),
  })
  .openapi('CompletionUsage');

export const CompletionJsonResponseSchema = z
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
export const StreamEventSchema = z
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
export const ChatPageSchema = paginatedSchema(ChatSchema, 'ChatPage');
export const MessagePageSchema = paginatedSchema(MessageSchema, 'MessagePage');
openApiRegistry.register('ChatPage', ChatPageSchema);
openApiRegistry.register('MessagePage', MessagePageSchema);

// Request annotations.
export const CreateChatRequestSchema = CreateChatBodySchema.openapi('CreateChatRequest', {
  example: { title: 'Trip planning' },
});
export const CompletionRequestSchema = CompletionBodySchema.openapi('CompletionRequest', {
  example: { message: 'What is the weather in Istanbul?' },
});
openApiRegistry.register('CreateChatRequest', CreateChatRequestSchema);
openApiRegistry.register('CompletionRequest', CompletionRequestSchema);

// ────────── Response helpers shared across path files ──────────

export const errorResponse = (
  description: string,
): {
  description: string;
  content: { 'application/json': { schema: typeof ErrorResponseSchema } };
} => ({
  description,
  content: { 'application/json': { schema: ErrorResponseSchema } },
});

export const COMMON_RESPONSES = {
  401: errorResponse('Missing/invalid JWT or App Check token.'),
  429: errorResponse('Rate limited (per-user).'),
  500: errorResponse('Unexpected internal error.'),
};

import { Anthropic } from '@anthropic-ai/sdk';

import type { IAiProvider } from './ai.provider.js';
import type {
  CompletionRequest,
  CompletionResultJson,
  CompletionStreamEvent,
  ToolCall,
} from './ai.types.js';
import {
  extractSystemPrompt,
  toAnthropicMessages,
  toToolResultBlocks,
} from './anthropic-message.mapper.js';
import { processTurnStream, type TurnState } from './anthropic-stream.handler.js';
import { executeTool, toAnthropicTools } from './tools/registry.js';
import { AI } from '../../shared/constants.js';
import type { Logger } from '../logger/logger.js';

interface AnthropicProviderOptions {
  client: Anthropic;
  model: string;
  logger: Logger;
  maxTokens?: number;
}

interface AnthropicProviderFactoryOptions {
  apiKey: string;
  model: string;
  logger: Logger;
  maxTokens?: number;
}

/**
 * Direct Anthropic SDK integration for the prime chat path (Claude Sonnet 4.6).
 *
 * Streaming with tools is implemented by watching the raw SDK event stream:
 * `tool_use` blocks are detected on `content_block_start`, their arguments are
 * accumulated from `input_json_delta` events, and the tool runs the moment its
 * `content_block_stop` fires — emitting `tool_execution` to the client *before*
 * the follow-up text. After the initial stream ends with `stop_reason='tool_use'`,
 * we open a second stream carrying the `tool_result` blocks and forward its text
 * deltas to the caller. The event-handling state machine itself lives in
 * {@link './anthropic-stream.handler.js'}; message ↔ SDK shape translation lives
 * in {@link './anthropic-message.mapper.js'}.
 */
export class AnthropicProvider implements IAiProvider {
  public readonly kind = 'anthropic';
  public readonly model: string;
  private readonly client: Anthropic;
  private readonly logger: Logger;
  private readonly maxTokens: number;

  constructor(opts: AnthropicProviderOptions) {
    this.client = opts.client;
    this.model = opts.model;
    this.logger = opts.logger;
    this.maxTokens = opts.maxTokens ?? AI.DEFAULT_MAX_TOKENS;
  }

  /** Convenience factory for production wiring — builds the SDK client from an API key. */
  public static create(opts: AnthropicProviderFactoryOptions): AnthropicProvider {
    return new AnthropicProvider({
      client: new Anthropic({ apiKey: opts.apiKey }),
      model: opts.model,
      logger: opts.logger,
      ...(opts.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : {}),
    });
  }

  public async complete(request: CompletionRequest): Promise<CompletionResultJson> {
    const baseMessages = toAnthropicMessages(request.history, request.prompt);
    const system = extractSystemPrompt(request.history);
    const tools = request.toolsEnabled ? toAnthropicTools(request.enabledTools) : undefined;

    // Conversation grows as the model chains tool calls. Each iteration we
    // send the full transcript (prompt + every prior assistant + tool_result
    // turn) along with the tool definitions, so the model can either chain
    // again or naturally end with text. Without `tools` in the follow-up the
    // model sometimes responds with only tool_use blocks the API silently
    // drops, leaving us with empty text.
    const conversation: Array<{ role: 'user' | 'assistant'; content: unknown }> = [...baseMessages];
    const toolCalls: ToolCall[] = [];
    let text = '';
    let promptTokens = 0;
    let completionTokens = 0;

    for (let iter = 0; iter < AI.MAX_TOOL_ITERATIONS; iter++) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: conversation as Anthropic.Messages.MessageParam[],
        ...(system ? { system } : {}),
        ...(tools ? { tools } : {}),
      });
      promptTokens += response.usage.input_tokens;
      completionTokens += response.usage.output_tokens;
      text = collectText(response.content);

      if (response.stop_reason !== 'tool_use') break;

      const toolUseBlocks = response.content.filter(
        (b): b is Extract<typeof b, { type: 'tool_use' }> => b.type === 'tool_use',
      );
      if (toolUseBlocks.length === 0) break;

      // The non-streaming path has no client signal — the SDK call itself is
      // the only async unit, and the caller awaits it as a single promise.
      // A fresh, never-aborted controller satisfies the ToolContext contract.
      const toolCtx = { logger: this.logger, signal: new AbortController().signal };
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          const args = block.input as Record<string, unknown>;
          const result = await executeTool(block.name, args, toolCtx);
          toolCalls.push({ name: block.name, args, result });
          return {
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content: JSON.stringify(result),
          };
        }),
      );

      conversation.push({ role: 'assistant', content: response.content });
      conversation.push({ role: 'user', content: toolResults });
    }

    return {
      text,
      toolCalls,
      usage: { promptTokens, completionTokens },
    };
  }

  public async *stream(
    request: CompletionRequest,
    signal: AbortSignal,
  ): AsyncIterable<CompletionStreamEvent> {
    yield { type: 'thinking' };

    const baseMessages = toAnthropicMessages(request.history, request.prompt);
    const system = extractSystemPrompt(request.history);
    const tools = request.toolsEnabled ? toAnthropicTools(request.enabledTools) : undefined;

    const conversation: Array<{ role: 'user' | 'assistant'; content: unknown }> = [...baseMessages];
    let totalText = '';
    let promptTokens = 0;
    let completionTokens = 0;

    for (let iter = 0; iter < AI.MAX_TOOL_ITERATIONS; iter++) {
      if (signal.aborted) break;

      const turnStream = this.client.messages.stream({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: conversation as Anthropic.Messages.MessageParam[],
        ...(system ? { system } : {}),
        ...(tools ? { tools } : {}),
      });

      const turnState: TurnState = { executedTools: [], deltaText: '' };
      yield* processTurnStream(turnStream, { logger: this.logger, signal, request }, turnState);
      totalText += turnState.deltaText;

      if (signal.aborted) break;

      const finalMessage = await turnStream.finalMessage();
      promptTokens += finalMessage.usage.input_tokens;
      completionTokens += finalMessage.usage.output_tokens;

      if (turnState.stopReason !== 'tool_use' || turnState.executedTools.length === 0) break;

      conversation.push({ role: 'assistant', content: finalMessage.content });
      conversation.push({ role: 'user', content: toToolResultBlocks(turnState.executedTools) });
    }

    yield {
      type: 'done',
      fullText: totalText,
      usage: { promptTokens, completionTokens },
    };
  }
}

const collectText = (content: Anthropic.Messages.ContentBlock[]): string =>
  content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('');

import { Anthropic } from '@anthropic-ai/sdk';

import type { IAiProvider } from './ai.provider.js';
import type {
  ChatTurn,
  CompletionRequest,
  CompletionResultJson,
  CompletionStreamEvent,
  ToolCall,
} from './ai.types.js';
import { executeTool, toAnthropicTools } from './tools/registry.js';
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

const DEFAULT_MAX_TOKENS = 4096;

// Tool list is sourced from the central registry (src/infrastructure/ai/tools).
// Adding a tool there exposes it to every provider automatically.

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

const toAnthropicMessages = (history: ChatTurn[], prompt: string): AnthropicMessage[] => {
  const filtered = history.filter((t) => t.role !== 'system');
  const merged = [...filtered, { role: 'user' as const, content: prompt }];
  return merged.map((turn) => ({
    role: turn.role === 'system' ? 'user' : turn.role,
    content: turn.content,
  }));
};

const extractSystemPrompt = (history: ChatTurn[]): string | undefined => {
  const systems = history.filter((t) => t.role === 'system').map((t) => t.content);
  return systems.length > 0 ? systems.join('\n\n') : undefined;
};

type StreamingBlock =
  | { kind: 'text'; text: string }
  | { kind: 'tool_use'; id: string; name: string; inputJson: string };

interface ExecutedTool {
  block: Extract<StreamingBlock, { kind: 'tool_use' }>;
  args: Record<string, unknown>;
  result: unknown;
}

const safeParseJson = (input: string): Record<string, unknown> => {
  if (!input.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(input);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

/**
 * Direct Anthropic SDK integration for the prime chat path (Claude Sonnet 4.6).
 *
 * Streaming with tools is implemented by watching the raw SDK event stream:
 * `tool_use` blocks are detected on `content_block_start`, their arguments are
 * accumulated from `input_json_delta` events, and the tool runs the moment its
 * `content_block_stop` fires — emitting `tool_execution` to the client *before*
 * the follow-up text. After the initial stream ends with `stop_reason='tool_use'`,
 * we open a second stream carrying the `tool_result` blocks and forward its text
 * deltas to the caller.
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
    this.maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
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
    const messages = toAnthropicMessages(request.history, request.prompt);
    const system = extractSystemPrompt(request.history);

    const initial = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages,
      ...(system ? { system } : {}),
      ...(request.toolsEnabled ? { tools: toAnthropicTools(request.enabledTools) } : {}),
    });

    const toolCalls: ToolCall[] = [];
    let text = this.collectText(initial.content);

    if (request.toolsEnabled && initial.stop_reason === 'tool_use') {
      const toolUseBlocks = initial.content.filter(
        (b): b is Extract<typeof b, { type: 'tool_use' }> => b.type === 'tool_use',
      );
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          const args = block.input as Record<string, unknown>;
          const result = await executeTool(block.name, args);
          toolCalls.push({ name: block.name, args, result });
          return {
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content: JSON.stringify(result),
          };
        }),
      );

      const followUp = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        ...(system ? { system } : {}),
        messages: [
          ...messages,
          { role: 'assistant', content: initial.content },
          { role: 'user', content: toolResults },
        ],
      });
      text = this.collectText(followUp.content);
    }

    return {
      text,
      toolCalls,
      usage: {
        promptTokens: initial.usage.input_tokens,
        completionTokens: initial.usage.output_tokens,
      },
    };
  }

  public async *stream(
    request: CompletionRequest,
    signal: AbortSignal,
  ): AsyncIterable<CompletionStreamEvent> {
    yield { type: 'thinking' };

    const messages = toAnthropicMessages(request.history, request.prompt);
    const system = extractSystemPrompt(request.history);

    const initialStream = this.client.messages.stream({
      model: this.model,
      max_tokens: this.maxTokens,
      messages,
      ...(system ? { system } : {}),
      ...(request.toolsEnabled ? { tools: toAnthropicTools(request.enabledTools) } : {}),
    });

    const blocks = new Map<number, StreamingBlock>();
    const executedTools: ExecutedTool[] = [];
    let initialText = '';
    let stopReason: string | undefined;

    try {
      for await (const event of initialStream) {
        if (signal.aborted) break;

        if (event.type === 'content_block_start') {
          const cb = event.content_block;
          if (cb.type === 'tool_use') {
            blocks.set(event.index, {
              kind: 'tool_use',
              id: cb.id,
              name: cb.name,
              inputJson: '',
            });
          } else if (cb.type === 'text') {
            blocks.set(event.index, { kind: 'text', text: '' });
          }
          continue;
        }

        if (event.type === 'content_block_delta') {
          const block = blocks.get(event.index);
          if (!block) continue;
          if (event.delta.type === 'text_delta' && block.kind === 'text') {
            block.text += event.delta.text;
            initialText += event.delta.text;
            yield { type: 'delta', text: event.delta.text };
          } else if (event.delta.type === 'input_json_delta' && block.kind === 'tool_use') {
            block.inputJson += event.delta.partial_json;
          }
          continue;
        }

        if (event.type === 'content_block_stop') {
          const block = blocks.get(event.index);
          if (block?.kind === 'tool_use' && request.toolsEnabled) {
            const args = safeParseJson(block.inputJson);
            const result = await executeTool(block.name, args);
            executedTools.push({ block, args, result });
            yield {
              type: 'tool_execution',
              tool: { name: block.name, args, result },
            };
          }
          continue;
        }

        if (event.type === 'message_delta') {
          if (event.delta.stop_reason) {
            stopReason = event.delta.stop_reason;
          }
        }
      }
    } catch (error) {
      this.logger.pino.error({ err: error }, 'anthropic_stream_error');
      throw error;
    }

    const finalMessage = await initialStream.finalMessage();
    let promptTokens = finalMessage.usage.input_tokens;
    let completionTokens = finalMessage.usage.output_tokens;

    if (stopReason === 'tool_use' && executedTools.length > 0) {
      let followUpText = '';
      const followUpStream = this.client.messages.stream({
        model: this.model,
        max_tokens: this.maxTokens,
        ...(system ? { system } : {}),
        messages: [
          ...messages,
          { role: 'assistant', content: finalMessage.content },
          {
            role: 'user',
            content: executedTools.map((t) => ({
              type: 'tool_result' as const,
              tool_use_id: t.block.id,
              content: JSON.stringify(t.result),
            })),
          },
        ],
      });

      try {
        for await (const event of followUpStream) {
          if (signal.aborted) break;
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            followUpText += event.delta.text;
            yield { type: 'delta', text: event.delta.text };
          }
        }
      } catch (error) {
        this.logger.pino.error({ err: error }, 'anthropic_stream_error');
        throw error;
      }

      const followUpFinal = await followUpStream.finalMessage();
      promptTokens += followUpFinal.usage.input_tokens;
      completionTokens += followUpFinal.usage.output_tokens;

      yield {
        type: 'done',
        fullText: followUpText || initialText,
        usage: { promptTokens, completionTokens },
      };
      return;
    }

    yield {
      type: 'done',
      fullText: initialText,
      usage: { promptTokens, completionTokens },
    };
  }

  private collectText(content: Anthropic.Messages.ContentBlock[]): string {
    return content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('');
  }
}

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
// Cap the agentic tool loop so a misbehaving model can't burn tokens
// indefinitely. Five rounds is enough for any realistic chain (search →
// refine → answer) and short enough to bound the worst case.
const MAX_TOOL_ITERATIONS = 5;

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

    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: conversation as Anthropic.Messages.MessageParam[],
        ...(system ? { system } : {}),
        ...(tools ? { tools } : {}),
      });
      promptTokens += response.usage.input_tokens;
      completionTokens += response.usage.output_tokens;
      text = this.collectText(response.content);

      if (response.stop_reason !== 'tool_use') break;

      const toolUseBlocks = response.content.filter(
        (b): b is Extract<typeof b, { type: 'tool_use' }> => b.type === 'tool_use',
      );
      if (toolUseBlocks.length === 0) break;

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

    // Agentic loop: each iteration is a separate stream. Tool-use blocks are
    // detected as they stream, executed at content_block_stop, then the loop
    // continues with the tool_results appended to the conversation. When the
    // model ends with anything other than `tool_use` (e.g. `end_turn`), we
    // exit. `tools` is passed every time so the model can chain or naturally
    // stop — without it, follow-up turns sometimes return only tool_use
    // blocks the API silently drops, leaving empty text.
    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
      if (signal.aborted) break;

      const turnStream = this.client.messages.stream({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: conversation as Anthropic.Messages.MessageParam[],
        ...(system ? { system } : {}),
        ...(tools ? { tools } : {}),
      });

      const blocks = new Map<number, StreamingBlock>();
      const executedTools: ExecutedTool[] = [];
      let stopReason: string | undefined;

      try {
        for await (const event of turnStream) {
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
              totalText += event.delta.text;
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

          if (event.type === 'message_delta' && event.delta.stop_reason) {
            stopReason = event.delta.stop_reason;
          }
        }
      } catch (error) {
        this.logger.pino.error({ err: error }, 'anthropic_stream_error');
        throw error;
      }

      const finalMessage = await turnStream.finalMessage();
      promptTokens += finalMessage.usage.input_tokens;
      completionTokens += finalMessage.usage.output_tokens;

      if (stopReason !== 'tool_use' || executedTools.length === 0) break;

      conversation.push({ role: 'assistant', content: finalMessage.content });
      conversation.push({
        role: 'user',
        content: executedTools.map((t) => ({
          type: 'tool_result' as const,
          tool_use_id: t.block.id,
          content: JSON.stringify(t.result),
        })),
      });
    }

    yield {
      type: 'done',
      fullText: totalText,
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

import { createOpenAI } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';

import type { IAiProvider } from './ai.provider.js';
import type {
  CompletionRequest,
  CompletionResultJson,
  CompletionStreamEvent,
  ToolCall,
} from './ai.types.js';
import { toAiSdkTools } from './tools/registry.js';
import type { Logger } from '../logger/logger.js';

interface GroqProviderOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  logger: Logger;
}

/**
 * Groq runs an OpenAI-compatible API. We reuse @ai-sdk/openai with a custom
 * baseURL — the wire protocol is identical, so the SDK works unchanged.
 *
 * Used as the fast path (e.g. tool-agent analysis/summarization). The user-facing
 * default model is openai/gpt-oss-120b.
 */
export class GroqProvider implements IAiProvider {
  public readonly kind = 'groq';
  public readonly model: string;
  private readonly modelRef: ReturnType<ReturnType<typeof createOpenAI>>;
  private readonly logger: Logger;

  constructor(opts: GroqProviderOptions) {
    const provider = createOpenAI({ apiKey: opts.apiKey, baseURL: opts.baseUrl });
    this.modelRef = provider(opts.model);
    this.model = opts.model;
    this.logger = opts.logger;
  }

  public async complete(request: CompletionRequest): Promise<CompletionResultJson> {
    const result = await generateText({
      model: this.modelRef,
      messages: this.buildMessages(request),
      ...(request.toolsEnabled ? { tools: this.buildTools(request.enabledTools) } : {}),
    });

    const toolCalls: ToolCall[] = (result.toolCalls ?? []).map((call, index) => {
      // Loose ToolSet narrows the result union to never; cast to read at runtime.
      const toolResults = (result.toolResults ?? []) as Array<{ result?: unknown }>;
      return {
        name: call.toolName,
        args: call.args as Record<string, unknown>,
        result: toolResults[index]?.result ?? null,
      };
    });

    return {
      text: result.text,
      toolCalls,
      ...(result.usage
        ? {
            usage: {
              promptTokens: result.usage.promptTokens,
              completionTokens: result.usage.completionTokens,
            },
          }
        : {}),
    };
  }

  public async *stream(
    request: CompletionRequest,
    signal: AbortSignal,
  ): AsyncIterable<CompletionStreamEvent> {
    yield { type: 'thinking' };

    const result = streamText({
      model: this.modelRef,
      messages: this.buildMessages(request),
      abortSignal: signal,
      ...(request.toolsEnabled ? { tools: this.buildTools(request.enabledTools) } : {}),
    });

    let fullText = '';
    try {
      for await (const part of result.fullStream) {
        if (signal.aborted) break;
        const evt = part as {
          type: string;
          textDelta?: string;
          toolName?: string;
          args?: unknown;
          result?: unknown;
          error?: unknown;
        };
        if (evt.type === 'text-delta' && typeof evt.textDelta === 'string') {
          fullText += evt.textDelta;
          yield { type: 'delta', text: evt.textDelta };
        } else if (evt.type === 'tool-result') {
          yield {
            type: 'tool_execution',
            tool: {
              name: String(evt.toolName ?? ''),
              args: (evt.args ?? {}) as Record<string, unknown>,
              result: evt.result,
            },
          };
        } else if (evt.type === 'error') {
          throw evt.error instanceof Error ? evt.error : new Error(String(evt.error));
        }
      }
    } catch (error) {
      this.logger.pino.error({ err: error }, 'groq_stream_error');
      throw error;
    }

    const usage = await result.usage.catch(() => undefined);
    yield {
      type: 'done',
      fullText,
      ...(usage
        ? {
            usage: {
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
            },
          }
        : {}),
    };
  }

  private buildMessages(request: CompletionRequest) {
    return [
      ...request.history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: 'user' as const, content: request.prompt },
    ];
  }

  private buildTools(enabledTools?: readonly string[]) {
    // Sourced from src/infrastructure/ai/tools/registry.ts. Per-tool flag
    // gating is applied here — strategies pass the precomputed list.
    return toAiSdkTools(enabledTools);
  }
}

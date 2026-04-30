import { createOpenAI } from '@ai-sdk/openai';
import { generateText, streamText, tool } from 'ai';
import { z } from 'zod';

import type { IAiProvider } from './ai.provider.js';
import type {
  CompletionRequest,
  CompletionResultJson,
  CompletionStreamEvent,
  ToolCall,
} from './ai.types.js';
import { getCurrentWeather as runWeatherTool } from './mock-tools.js';
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
      ...(request.toolsEnabled ? { tools: this.buildTools() } : {}),
    });

    const toolCalls: ToolCall[] = (result.toolCalls ?? []).map((call, index) => ({
      name: call.toolName,
      args: call.args as Record<string, unknown>,
      result: result.toolResults?.[index]?.result ?? null,
    }));

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
      ...(request.toolsEnabled ? { tools: this.buildTools() } : {}),
    });

    let fullText = '';
    try {
      for await (const part of result.fullStream) {
        if (signal.aborted) break;
        if (part.type === 'text-delta') {
          fullText += part.textDelta;
          yield { type: 'delta', text: part.textDelta };
        } else if (part.type === 'tool-result') {
          yield {
            type: 'tool_execution',
            tool: {
              name: part.toolName,
              args: part.args as Record<string, unknown>,
              result: part.result,
            },
          };
        } else if (part.type === 'error') {
          throw part.error instanceof Error ? part.error : new Error(String(part.error));
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

  private buildTools() {
    return {
      getCurrentWeather: tool({
        description: 'Get the current weather for a given city',
        parameters: z.object({ location: z.string().describe('City name') }),
        execute: ({ location }: { location: string }) =>
          Promise.resolve(runWeatherTool(location).result),
      }),
    };
  }
}

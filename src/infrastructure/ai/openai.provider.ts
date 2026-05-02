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
import type { ToolContext } from './tools/types.js';
import type { Logger } from '../logger/logger.js';

interface OpenAiProviderOptions {
  apiKey: string;
  model: string;
  logger: Logger;
}

/**
 * Real provider backed by Vercel AI SDK + OpenAI. The interface contract
 * matches MockAiProvider, so the rest of the system is provider-agnostic
 * (LSP — see CLAUDE.md §5).
 */
export class OpenAiProvider implements IAiProvider {
  public readonly kind = 'openai';
  public readonly model: string;
  private readonly modelRef: ReturnType<ReturnType<typeof createOpenAI>>;
  private readonly logger: Logger;

  constructor(opts: OpenAiProviderOptions) {
    const provider = createOpenAI({ apiKey: opts.apiKey });
    this.modelRef = provider(opts.model);
    this.model = opts.model;
    this.logger = opts.logger;
  }

  public async complete(request: CompletionRequest): Promise<CompletionResultJson> {
    // Non-streaming path has no client signal — fresh, never-aborted controller
    // satisfies the ToolContext contract for any tool the SDK invokes.
    const toolCtx = { logger: this.logger, signal: new AbortController().signal };
    const result = await generateText({
      model: this.modelRef,
      messages: this.buildMessages(request),
      ...(request.toolsEnabled ? { tools: this.buildTools(request.enabledTools, toolCtx) } : {}),
    });

    const toolCalls: ToolCall[] = (result.toolCalls ?? []).map((call, index) => {
      // ToolResultUnion narrows when the SDK has a typed ToolSet; with our
      // loose ToolSet (tools come from the registry, not inline) the SDK
      // hides `result` behind a generic param. Cast to read it pragmatically.
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
      usage: {
        promptTokens: result.usage?.promptTokens,
        completionTokens: result.usage?.completionTokens,
      },
    };
  }

  public async *stream(
    request: CompletionRequest,
    signal: AbortSignal,
  ): AsyncIterable<CompletionStreamEvent> {
    yield { type: 'thinking' };

    const toolCtx = { logger: this.logger, signal };
    const result = streamText({
      model: this.modelRef,
      messages: this.buildMessages(request),
      abortSignal: signal,
      ...(request.toolsEnabled ? { tools: this.buildTools(request.enabledTools, toolCtx) } : {}),
    });

    let fullText = '';
    try {
      for await (const part of result.fullStream) {
        if (signal.aborted) break;
        // The AI SDK's TextStreamPart union narrows differently per ToolSet;
        // tool-result events are present at runtime but lost from the static
        // union when the ToolSet is inferred loose. Cast and check by string.
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
        } else if (evt.type === 'tool-call') {
          this.logger.pino.debug({ tool: evt.toolName }, 'openai_tool_call');
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
    } catch (error: unknown) {
      this.logger.pino.error({ err: error }, 'openai_stream_error');
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

  private buildTools(enabledTools: readonly string[] | undefined, ctx: ToolContext) {
    // Sourced from src/infrastructure/ai/tools/registry.ts — adding a tool
    // there exposes it to every provider with no per-provider edit. Per-tool
    // flag gating is applied here. ctx threads the request-scoped logger +
    // signal through to the tool's `execute` function.
    return toAiSdkTools(enabledTools, ctx);
  }
}

import { setTimeout as sleep } from 'node:timers/promises';

import type { IAiProvider } from './ai.provider.js';
import type {
  CompletionRequest,
  CompletionResultJson,
  CompletionStreamEvent,
  ToolCall,
} from './ai.types.js';
import { detectToolIntent } from './tools/registry.js';
import type { ToolContext } from './tools/types.js';
import { Logger } from '../logger/logger.js';

/**
 * Deterministic AI provider used when no AI API keys are set, and as the
 * default provider in tests. Generates a canned reply word-by-word so the SSE
 * code path is exercised end-to-end.
 */
export class MockAiProvider implements IAiProvider {
  public readonly kind = 'mock';
  public readonly model = 'mock';
  private static readonly REPLY_TEMPLATE =
    'Mock response: I received your prompt and would normally call the model here.';
  private readonly logger: Logger;

  /**
   * Logger is injected so tools fired by `detectToolIntent` log into the
   * right correlation chain. Defaults to the singleton when omitted (tests
   * that construct `new MockAiProvider()` shouldn't have to wire one).
   */
  constructor(logger?: Logger) {
    this.logger = logger ?? Logger.getInstance();
  }

  public async complete(request: CompletionRequest): Promise<CompletionResultJson> {
    const toolCalls = await this.maybeRunTool(request, new AbortController().signal);
    const text = this.buildText(request, toolCalls);
    return {
      text,
      toolCalls,
      usage: {
        promptTokens: this.estimateTokens(request),
        completionTokens: text.split(' ').length,
      },
    };
  }

  public async *stream(
    request: CompletionRequest,
    signal: AbortSignal,
  ): AsyncIterable<CompletionStreamEvent> {
    yield { type: 'thinking' };

    const toolCalls = await this.maybeRunTool(request, signal);
    for (const tool of toolCalls) {
      if (signal.aborted) return;
      yield { type: 'tool_execution', tool };
    }

    const fullText = this.buildText(request, toolCalls);
    const words = fullText.split(' ');
    let emitted = '';
    for (const word of words) {
      if (signal.aborted) {
        yield {
          type: 'done',
          fullText: emitted.trim(),
          usage: {
            promptTokens: this.estimateTokens(request),
            completionTokens: emitted.split(' ').length,
          },
        };
        return;
      }
      const chunk = `${word} `;
      emitted += chunk;
      yield { type: 'delta', text: chunk };
      await sleep(20);
    }

    yield {
      type: 'done',
      fullText: emitted.trim(),
      usage: {
        promptTokens: this.estimateTokens(request),
        completionTokens: words.length,
      },
    };
  }

  /**
   * Walk every registered tool's `detectIntent` and fire the first match.
   * Returns at most one tool per turn — chains aren't simulated, the real
   * providers handle multi-step tool use.
   */
  private async maybeRunTool(request: CompletionRequest, signal: AbortSignal): Promise<ToolCall[]> {
    if (!request.toolsEnabled) return [];
    const ctx: ToolContext = { logger: this.logger, signal };
    const fired = await detectToolIntent(request.prompt, request.enabledTools, ctx);
    if (!fired) return [];
    return [
      {
        name: fired.name,
        args: (fired.args ?? {}) as Record<string, unknown>,
        result: fired.result,
      },
    ];
  }

  private buildText(request: CompletionRequest, toolCalls: ToolCall[]): string {
    if (toolCalls.length > 0) {
      const summaries = toolCalls.map(
        (t) => `tool ${t.name} returned: ${JSON.stringify(t.result)}`,
      );
      return `Based on my tools, ${summaries.join(' · ')}.`;
    }
    return `${MockAiProvider.REPLY_TEMPLATE} You said: "${request.prompt.slice(0, 80)}".`;
  }

  private estimateTokens(request: CompletionRequest): number {
    const total =
      request.history.reduce((acc, t) => acc + t.content.length, 0) + request.prompt.length;
    return Math.ceil(total / 4);
  }
}

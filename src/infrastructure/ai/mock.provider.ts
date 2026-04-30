import { setTimeout as sleep } from 'node:timers/promises';

import type { IAiProvider } from './ai.provider.js';
import type {
  CompletionRequest,
  CompletionResultJson,
  CompletionStreamEvent,
  ToolCall,
} from './ai.types.js';
import { detectWeatherIntent, getCurrentWeather } from './mock-tools.js';

/**
 * Deterministic AI provider used when OPENAI_API_KEY is not set, and as the
 * default provider in tests. Generates a canned reply word-by-word so the SSE
 * code path is exercised end-to-end.
 */
export class MockAiProvider implements IAiProvider {
  public readonly kind = 'mock';
  public readonly model = 'mock';
  private static readonly REPLY_TEMPLATE =
    'Mock response: I received your prompt and would normally call the model here.';

  public async complete(request: CompletionRequest): Promise<CompletionResultJson> {
    const toolCalls = this.maybeRunTool(request);
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

    const toolCalls = this.maybeRunTool(request);
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

  private maybeRunTool(request: CompletionRequest): ToolCall[] {
    if (!request.toolsEnabled) return [];
    const location = detectWeatherIntent(request.prompt);
    if (!location) return [];
    return [getCurrentWeather(location)];
  }

  private buildText(request: CompletionRequest, toolCalls: ToolCall[]): string {
    if (toolCalls.length > 0) {
      const parts = toolCalls.map((t) => {
        const result = t.result as { tempC: number; condition: string };
        return `the weather is ${result.condition} at ${result.tempC}°C`;
      });
      return `According to my tools, ${parts.join('; ')}.`;
    }
    return `${MockAiProvider.REPLY_TEMPLATE} You said: "${request.prompt.slice(0, 80)}".`;
  }

  private estimateTokens(request: CompletionRequest): number {
    const total =
      request.history.reduce((acc, t) => acc + t.content.length, 0) + request.prompt.length;
    return Math.ceil(total / 4);
  }
}

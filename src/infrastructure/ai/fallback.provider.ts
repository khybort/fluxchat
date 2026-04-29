import type { IAiProvider } from './ai.provider.js';
import type { CompletionRequest, CompletionResultJson, CompletionStreamEvent } from './ai.types.js';
import type { Logger } from '../logger/logger.js';

/**
 * Composite provider that tries `primary`; if `primary` fails, it transparently
 * falls back to `secondary`. Per the case architecture (CLAUDE.md §7.4 wiring),
 * tool-agent analysis is wired as `FallbackAiProvider(Groq, Anthropic)` —
 * fast Groq attempt with the prime Anthropic model as a safety net.
 *
 * Streaming fallback only fires *before* the first token is emitted. Once the
 * primary has started writing, errors propagate — we don't switch providers
 * mid-stream because clients have already received bytes.
 */
export class FallbackAiProvider implements IAiProvider {
  constructor(
    private readonly primary: IAiProvider,
    private readonly secondary: IAiProvider,
    private readonly logger: Logger,
    private readonly label = 'fallback_ai_provider',
  ) {}

  public async complete(request: CompletionRequest): Promise<CompletionResultJson> {
    try {
      return await this.primary.complete(request);
    } catch (error) {
      this.logger.pino.warn({ err: error, label: this.label }, 'ai_primary_complete_failed');
      return await this.secondary.complete(request);
    }
  }

  public async *stream(
    request: CompletionRequest,
    signal: AbortSignal,
  ): AsyncIterable<CompletionStreamEvent> {
    let primaryStarted = false;
    try {
      for await (const event of this.primary.stream(request, signal)) {
        if (event.type === 'delta' || event.type === 'tool_execution' || event.type === 'done') {
          primaryStarted = true;
        }
        yield event;
      }
      return;
    } catch (error) {
      if (primaryStarted) {
        this.logger.pino.error(
          { err: error, label: this.label },
          'ai_primary_stream_failed_after_emit',
        );
        throw error;
      }
      this.logger.pino.warn(
        { err: error, label: this.label },
        'ai_primary_stream_failed_falling_back',
      );
    }

    yield* this.secondary.stream(request, signal);
  }
}

import type { CompletionRequest, CompletionResultJson, CompletionStreamEvent } from './ai.types.js';

export interface IAiProvider {
  /** Stable provider identifier — e.g. 'anthropic', 'groq', 'openai', 'mock'. */
  readonly kind: string;
  /** Current model id, e.g. 'claude-sonnet-4-6'. Used for usage telemetry. */
  readonly model: string;

  /** One-shot completion. Returns the full text and any tool calls. */
  complete(request: CompletionRequest): Promise<CompletionResultJson>;

  /**
   * Streaming completion. Yields events in order: optional `thinking`,
   * zero or more `tool_execution` and `delta` events, finally one `done`.
   * Implementations must respect `signal` for cancellation.
   */
  stream(request: CompletionRequest, signal: AbortSignal): AsyncIterable<CompletionStreamEvent>;
}

import type { CompletionRequest, CompletionResultJson, CompletionStreamEvent } from './ai.types.js';

export interface IAiProvider {
  /** One-shot completion. Returns the full text and any tool calls. */
  complete(request: CompletionRequest): Promise<CompletionResultJson>;

  /**
   * Streaming completion. Yields events in order: optional `thinking`,
   * zero or more `tool_execution` and `delta` events, finally one `done`.
   * Implementations must respect `signal` for cancellation.
   */
  stream(request: CompletionRequest, signal: AbortSignal): AsyncIterable<CompletionStreamEvent>;
}

import type {
  CompletionStreamEvent,
  CompletionUsage,
  ToolCall,
  ChatTurn,
} from '../../../infrastructure/ai/ai.types.js';
import type { IStrategy } from '../../../shared/feature-flags/strategy.js';

export interface CompletionInput {
  history: ChatTurn[];
  prompt: string;
  /**
   * Called by streaming strategies after `done`, and by the JSON strategy
   * after the full response is generated. Lets the service persist the
   * assistant message regardless of which branch executed.
   */
  onComplete: (assistantText: string) => Promise<void>;
}

export interface JsonCompletionResult {
  kind: 'json';
  text: string;
  toolCalls: ToolCall[];
  usage?: CompletionUsage;
}

export interface StreamingCompletionResult {
  kind: 'stream';
  events: AsyncIterable<CompletionStreamEvent>;
}

export type CompletionResult = JsonCompletionResult | StreamingCompletionResult;

export type ICompletionStrategy = IStrategy<CompletionInput, CompletionResult>;

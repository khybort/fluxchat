import type {
  CompletionStreamEvent,
  CompletionUsage,
  ToolCall,
  ChatTurn,
} from '../../../infrastructure/ai/ai.types.js';
import type { IStrategy } from '../../../shared/feature-flags/strategy.js';

export interface CompletionMeta {
  usage?: CompletionUsage;
  provider?: string;
  model?: string;
}

export interface CompletionInput {
  history: ChatTurn[];
  prompt: string;
  /**
   * Called by streaming strategies after `done`, and by the JSON strategy
   * after the full response is generated. Lets the service persist the
   * assistant message regardless of which branch executed. Meta is optional
   * — strategies that can attribute usage forward it; others omit and the
   * service stores nulls.
   */
  onComplete: (assistantText: string, meta?: CompletionMeta) => Promise<void>;
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

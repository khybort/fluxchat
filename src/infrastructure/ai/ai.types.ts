export interface ChatTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface CompletionRequest {
  history: ChatTurn[];
  prompt: string;
  /** Master switch — when false, no tools are exposed regardless of `enabledTools`. */
  toolsEnabled: boolean;
  /** Allowlist of tool names. Computed by strategies from per-tool flags
   *  (TOOL_*_ENABLED). Undefined = all tools (back-compat for callers that
   *  don't yet plumb the per-tool gating). */
  enabledTools?: readonly string[];
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}

export interface CompletionUsage {
  promptTokens?: number;
  completionTokens?: number;
}

/**
 * Discrete events emitted by the streaming completion. Consumers (the SSE
 * serializer) translate these into `event: ...\ndata: ...\n\n` frames.
 */
export type CompletionStreamEvent =
  | { type: 'thinking' }
  | { type: 'tool_execution'; tool: ToolCall }
  | { type: 'delta'; text: string }
  | { type: 'done'; fullText: string; usage?: CompletionUsage };

export interface CompletionResultJson {
  text: string;
  toolCalls: ToolCall[];
  usage?: CompletionUsage;
}

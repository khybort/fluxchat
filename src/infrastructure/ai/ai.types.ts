export interface ChatTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface CompletionRequest {
  history: ChatTurn[];
  prompt: string;
  toolsEnabled: boolean;
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

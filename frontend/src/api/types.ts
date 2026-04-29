export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
  expiresInSeconds: number;
}

export interface MeResponse {
  user: AuthUser;
}

export interface Chat {
  id: string;
  title: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  chatId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

export interface PageResult<T> {
  data: T[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
}

export interface CompletionUsage {
  promptTokens?: number;
  completionTokens?: number;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}

export interface CompletionJsonResponse {
  message: { role: 'assistant'; content: string };
  toolCalls: ToolCall[];
  usage?: CompletionUsage;
}

export type StreamEvent =
  | { type: 'thinking' }
  | { type: 'tool_execution'; tool: ToolCall }
  | { type: 'delta'; text: string }
  | { type: 'done'; fullText: string; usage?: CompletionUsage }
  | { type: 'error'; code: string; message: string };

export interface FeatureFlagsSnapshot {
  STREAMING_ENABLED: boolean;
  PAGINATION_LIMIT: number;
  AI_TOOLS_ENABLED: boolean;
  CHAT_HISTORY_ENABLED: boolean;
  RATE_LIMIT_PER_MINUTE: number;
}

export interface HealthzResponse {
  status: 'ok';
  flags: FeatureFlagsSnapshot;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
  requestId?: string;
}

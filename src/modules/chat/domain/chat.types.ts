export type MessageRole = 'user' | 'assistant' | 'system';

export interface Chat {
  id: string;
  title: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  /** Soft-delete tombstone — null for active chats. */
  deletedAt: Date | null;
  /** Archive tombstone — null for unarchived chats. */
  archivedAt: Date | null;
}

export interface MessageUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  provider: string | null;
  model: string | null;
}

export interface Message {
  id: string;
  chatId: string;
  role: MessageRole;
  content: string;
  createdAt: Date;
  usage: MessageUsage | null;
}

export interface ListParams {
  cursor: string | undefined;
  limit: number;
}

export type { PageResult } from '../../../shared/types/pagination.js';

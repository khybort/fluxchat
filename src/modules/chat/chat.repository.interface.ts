import type { Chat, ListParams, Message, MessageRole } from './chat.types.js';

export interface IChatRepository {
  findByUser(userId: string, params: ListParams): Promise<Chat[]>;
  findByIdForUser(chatId: string, userId: string): Promise<Chat | null>;
  create(input: { userId: string; title: string }): Promise<Chat>;
  touchUpdatedAt(chatId: string): Promise<void>;
  /** Soft-delete: stamps deletedAt on the chat. Returns false if not found. */
  softDelete(chatId: string, userId: string): Promise<boolean>;
}

export interface CreateMessageInput {
  chatId: string;
  role: MessageRole;
  content: string;
  /** Per-assistant-message usage telemetry. Ignored for user/system rows. */
  usage?: {
    promptTokens?: number | null;
    completionTokens?: number | null;
    provider?: string | null;
    model?: string | null;
  };
}

export interface IMessageRepository {
  findByChat(chatId: string, params: ListParams): Promise<Message[]>;
  findLastN(chatId: string, count: number): Promise<Message[]>;
  create(input: CreateMessageInput): Promise<Message>;
}

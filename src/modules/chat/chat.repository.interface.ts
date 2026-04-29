import type { Chat, ListParams, Message, MessageRole } from './chat.types.js';

export interface IChatRepository {
  findByUser(userId: string, params: ListParams): Promise<Chat[]>;
  findByIdForUser(chatId: string, userId: string): Promise<Chat | null>;
  create(input: { userId: string; title: string }): Promise<Chat>;
  touchUpdatedAt(chatId: string): Promise<void>;
}

export interface IMessageRepository {
  findByChat(chatId: string, params: ListParams): Promise<Message[]>;
  findLastN(chatId: string, count: number): Promise<Message[]>;
  create(input: { chatId: string; role: MessageRole; content: string }): Promise<Message>;
}

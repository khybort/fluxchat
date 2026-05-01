import type {
  CreateMessageInput,
  IChatRepository,
  IMessageRepository,
} from '../../src/modules/chat/chat.repository.interface.js';
import type { Chat, ListParams, Message } from '../../src/modules/chat/chat.types.js';

let nextId = 1;
const id = (): string => `00000000-0000-0000-0000-${String(nextId++).padStart(12, '0')}`;

export class InMemoryChatRepository implements IChatRepository {
  public readonly chats: Chat[] = [];

  public async findByUser(userId: string, params: ListParams): Promise<Chat[]> {
    const sorted = this.chats
      .filter((c) => c.userId === userId && c.deletedAt === null && c.archivedAt === null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    let startIdx = 0;
    if (params.cursor) {
      const cursorIdx = sorted.findIndex((c) => c.id === params.cursor);
      startIdx = cursorIdx >= 0 ? cursorIdx + 1 : 0;
    }
    return sorted.slice(startIdx, startIdx + params.limit + 1);
  }

  public async findArchivedByUser(userId: string, params: ListParams): Promise<Chat[]> {
    const sorted = this.chats
      .filter((c) => c.userId === userId && c.deletedAt === null && c.archivedAt !== null)
      .sort((a, b) => b.archivedAt!.getTime() - a.archivedAt!.getTime());
    let startIdx = 0;
    if (params.cursor) {
      const cursorIdx = sorted.findIndex((c) => c.id === params.cursor);
      startIdx = cursorIdx >= 0 ? cursorIdx + 1 : 0;
    }
    return sorted.slice(startIdx, startIdx + params.limit + 1);
  }

  public async findByIdForUser(chatId: string, userId: string): Promise<Chat | null> {
    return (
      this.chats.find((c) => c.id === chatId && c.userId === userId && c.deletedAt === null) ?? null
    );
  }

  public async create(input: { userId: string; title: string }): Promise<Chat> {
    const now = new Date();
    const chat: Chat = {
      id: id(),
      userId: input.userId,
      title: input.title,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      archivedAt: null,
    };
    this.chats.push(chat);
    return chat;
  }

  public async touchUpdatedAt(chatId: string): Promise<void> {
    const chat = this.chats.find((c) => c.id === chatId);
    if (chat) chat.updatedAt = new Date();
  }

  public async softDelete(chatId: string, userId: string): Promise<boolean> {
    const chat = this.chats.find(
      (c) => c.id === chatId && c.userId === userId && c.deletedAt === null,
    );
    if (!chat) return false;
    chat.deletedAt = new Date();
    return true;
  }

  public async archive(chatId: string, userId: string): Promise<boolean> {
    const chat = this.chats.find(
      (c) =>
        c.id === chatId && c.userId === userId && c.deletedAt === null && c.archivedAt === null,
    );
    if (!chat) return false;
    chat.archivedAt = new Date();
    return true;
  }

  public async unarchive(chatId: string, userId: string): Promise<boolean> {
    const chat = this.chats.find(
      (c) =>
        c.id === chatId && c.userId === userId && c.deletedAt === null && c.archivedAt !== null,
    );
    if (!chat) return false;
    chat.archivedAt = null;
    return true;
  }
}

export class InMemoryMessageRepository implements IMessageRepository {
  public readonly messages: Message[] = [];

  public async findByChat(chatId: string, params: ListParams): Promise<Message[]> {
    const sorted = this.messages
      .filter((m) => m.chatId === chatId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    let startIdx = 0;
    if (params.cursor) {
      const cursorIdx = sorted.findIndex((m) => m.id === params.cursor);
      startIdx = cursorIdx >= 0 ? cursorIdx + 1 : 0;
    }
    return sorted.slice(startIdx, startIdx + params.limit + 1);
  }

  public async findLastN(chatId: string, count: number): Promise<Message[]> {
    return this.messages
      .filter((m) => m.chatId === chatId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(-count);
  }

  public async create(input: CreateMessageInput): Promise<Message> {
    const usage = input.usage;
    const hasUsage =
      usage !== undefined &&
      (usage.promptTokens != null ||
        usage.completionTokens != null ||
        usage.provider != null ||
        usage.model != null);
    const message: Message = {
      id: id(),
      chatId: input.chatId,
      role: input.role,
      content: input.content,
      createdAt: new Date(),
      usage: hasUsage
        ? {
            promptTokens: usage?.promptTokens ?? null,
            completionTokens: usage?.completionTokens ?? null,
            provider: usage?.provider ?? null,
            model: usage?.model ?? null,
          }
        : null,
    };
    this.messages.push(message);
    return message;
  }

  public async deleteById(messageId: string): Promise<void> {
    const idx = this.messages.findIndex((m) => m.id === messageId);
    if (idx >= 0) this.messages.splice(idx, 1);
  }
}

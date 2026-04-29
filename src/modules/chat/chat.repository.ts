import { toDomainChat } from './chat.mapper.js';
import type { IChatRepository } from './chat.repository.interface.js';
import type { Chat, ListParams } from './chat.types.js';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';

/**
 * Chat repository — talks to Prisma, returns domain types only (CLAUDE.md §6/§7.2).
 * Pagination is cursor-based: callers pass the id of the last seen row; we fetch
 * `limit + 1` to determine `hasMore` without a separate count query.
 */
export class ChatRepository implements IChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findByUser(userId: string, params: ListParams): Promise<Chat[]> {
    const rows = await this.prisma.client.chat.findMany({
      where: { userId },
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toDomainChat);
  }

  public async findByIdForUser(chatId: string, userId: string): Promise<Chat | null> {
    const row = await this.prisma.client.chat.findFirst({
      where: { id: chatId, userId },
    });
    return row ? toDomainChat(row) : null;
  }

  public async create(input: { userId: string; title: string }): Promise<Chat> {
    const row = await this.prisma.client.chat.create({
      data: { userId: input.userId, title: input.title },
    });
    return toDomainChat(row);
  }

  public async touchUpdatedAt(chatId: string): Promise<void> {
    await this.prisma.client.chat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });
  }
}

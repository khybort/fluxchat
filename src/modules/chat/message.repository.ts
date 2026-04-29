import { toDomainMessage } from './chat.mapper.js';
import type { IMessageRepository } from './chat.repository.interface.js';
import type { ListParams, Message, MessageRole } from './chat.types.js';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';

export class MessageRepository implements IMessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findByChat(chatId: string, params: ListParams): Promise<Message[]> {
    const rows = await this.prisma.client.message.findMany({
      where: { chatId },
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toDomainMessage);
  }

  public async findLastN(chatId: string, count: number): Promise<Message[]> {
    const rows = await this.prisma.client.message.findMany({
      where: { chatId },
      take: count,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toDomainMessage).reverse();
  }

  public async create(input: {
    chatId: string;
    role: MessageRole;
    content: string;
  }): Promise<Message> {
    const row = await this.prisma.client.message.create({
      data: { chatId: input.chatId, role: input.role, content: input.content },
    });
    return toDomainMessage(row);
  }
}

import type { Chat as PrismaChat, Message as PrismaMessage } from '@prisma/client';

import type { Chat, Message, MessageRole } from './chat.types.js';

export const toDomainChat = (row: PrismaChat): Chat => ({
  id: row.id,
  title: row.title,
  userId: row.userId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toDomainMessage = (row: PrismaMessage): Message => ({
  id: row.id,
  chatId: row.chatId,
  role: row.role as MessageRole,
  content: row.content,
  createdAt: row.createdAt,
});

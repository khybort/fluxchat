import type { Chat as PrismaChat, Message as PrismaMessage } from '@prisma/client';

import type { Chat, Message, MessageRole } from './chat.types.js';

export const toDomainChat = (row: PrismaChat): Chat => ({
  id: row.id,
  title: row.title,
  userId: row.userId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  deletedAt: row.deletedAt,
});

export const toDomainMessage = (row: PrismaMessage): Message => {
  const hasUsage =
    row.promptTokens !== null ||
    row.completionTokens !== null ||
    row.provider !== null ||
    row.model !== null;
  return {
    id: row.id,
    chatId: row.chatId,
    role: row.role as MessageRole,
    content: row.content,
    createdAt: row.createdAt,
    usage: hasUsage
      ? {
          promptTokens: row.promptTokens,
          completionTokens: row.completionTokens,
          provider: row.provider,
          model: row.model,
        }
      : null,
  };
};

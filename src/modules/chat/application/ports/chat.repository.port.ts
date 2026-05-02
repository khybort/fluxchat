import type { Chat, ListParams } from '../../domain/chat.types.js';

/**
 * Port that the application layer needs from persistence to read/write chats.
 * Implementation lives in {@link ../../adapters/persistence/chat.prisma.repository.ts}
 * — adapters depend on this interface, never the other way around (Clean Arch
 * dependency rule).
 */
export interface IChatRepository {
  findByUser(userId: string, params: ListParams): Promise<Chat[]>;
  findArchivedByUser(userId: string, params: ListParams): Promise<Chat[]>;
  findByIdForUser(chatId: string, userId: string): Promise<Chat | null>;
  create(input: { userId: string; title: string }): Promise<Chat>;
  touchUpdatedAt(chatId: string): Promise<void>;
  /** Soft-delete: stamps deletedAt on the chat. Returns false if not found. */
  softDelete(chatId: string, userId: string): Promise<boolean>;
  /** Archive: stamps archivedAt. Returns false if already archived or not found. */
  archive(chatId: string, userId: string): Promise<boolean>;
  /** Restore from archive. Returns false if not archived or not found. */
  unarchive(chatId: string, userId: string): Promise<boolean>;
}

import { NotFoundError } from '../../../shared/errors/app-error.js';
import type { IChatRepository } from '../chat.repository.interface.js';
import type { Chat } from '../chat.types.js';

/**
 * Domain policy for "who can touch which chat". Use cases that operate on a
 * specific chat (history, completion, regenerate) ask this policy to verify
 * ownership before doing work — keeps the cross-cutting authorization rule
 * in one place and prevents service-to-service coupling.
 *
 * Cross-user access intentionally returns 404 (not 403) so the existence of
 * a chat is not leaked to a user who does not own it (CLAUDE.md §13).
 */
export class ChatAccessPolicy {
  constructor(private readonly chats: IChatRepository) {}

  public async ensureOwnership(chatId: string, userId: string): Promise<Chat> {
    const chat = await this.chats.findByIdForUser(chatId, userId);
    if (!chat) {
      throw new NotFoundError('Chat not found');
    }
    return chat;
  }
}

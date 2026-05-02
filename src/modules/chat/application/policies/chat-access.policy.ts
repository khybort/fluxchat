import { NotFoundError } from '../../../../shared/errors/app-error.js';
import type { Chat } from '../../domain/chat.types.js';
import type { IChatRepository } from '../ports/chat.repository.port.js';

/**
 * Application policy for "who can touch which chat". Use cases that operate
 * on a specific chat (history, completion, regenerate) ask this policy to
 * verify ownership before doing work — keeps the cross-cutting authorization
 * rule in one place and prevents service-to-service coupling.
 *
 * Lives in the application layer (not domain) because it depends on the
 * IChatRepository port — Clean Arch's dependency rule forbids domain →
 * application imports, and a policy that does I/O is an application concern.
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

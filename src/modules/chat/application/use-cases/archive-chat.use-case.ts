import { NotFoundError } from '../../../../shared/errors/app-error.js';
import type { IUseCase } from '../../../../shared/use-case/use-case.interface.js';
import type { IChatRepository } from '../ports/chat.repository.port.js';

export interface ArchiveChatInput {
  chatId: string;
  userId: string;
}

/**
 * Stamp `archivedAt` on the chat. Idempotent on the *write* side (already-
 * archived chats fail the WHERE clause and return false) but the API surface
 * treats that as 404 because the user wouldn't see it in their active list
 * to call archive on it again — re-archiving an already-archived chat is a
 * client bug, surface as not-found.
 */
export class ArchiveChatUseCase implements IUseCase<ArchiveChatInput, void> {
  constructor(private readonly chats: IChatRepository) {}

  public async execute(input: ArchiveChatInput): Promise<void> {
    const ok = await this.chats.archive(input.chatId, input.userId);
    if (!ok) throw new NotFoundError('Chat not found');
  }
}

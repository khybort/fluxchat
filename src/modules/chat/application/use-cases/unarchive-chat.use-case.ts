import { NotFoundError } from '../../../../shared/errors/app-error.js';
import type { IUseCase } from '../../../../shared/use-case/use-case.interface.js';
import type { IChatRepository } from '../ports/chat.repository.port.js';

export interface UnarchiveChatInput {
  chatId: string;
  userId: string;
}

/**
 * Restore an archived chat. Symmetric to ArchiveChatUseCase — only chats
 * that are currently archived are unarchivable; everything else is 404.
 */
export class UnarchiveChatUseCase implements IUseCase<UnarchiveChatInput, void> {
  constructor(private readonly chats: IChatRepository) {}

  public async execute(input: UnarchiveChatInput): Promise<void> {
    const ok = await this.chats.unarchive(input.chatId, input.userId);
    if (!ok) throw new NotFoundError('Chat not found');
  }
}

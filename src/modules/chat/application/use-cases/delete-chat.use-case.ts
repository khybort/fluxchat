import { NotFoundError } from '../../../../shared/errors/app-error.js';
import type { IUseCase } from '../../../../shared/use-case/use-case.interface.js';
import type { IChatRepository } from '../ports/chat.repository.port.js';

export interface DeleteChatInput {
  chatId: string;
  userId: string;
}

/**
 * Soft-delete a chat. The repository's `softDelete` is owner-scoped — if the
 * row doesn't exist or belongs to another user, it returns `false` and we
 * surface a 404 (not 403) so the existence of cross-user chats isn't leaked
 * (CLAUDE.md §13).
 */
export class DeleteChatUseCase implements IUseCase<DeleteChatInput, void> {
  constructor(private readonly chats: IChatRepository) {}

  public async execute(input: DeleteChatInput): Promise<void> {
    const ok = await this.chats.softDelete(input.chatId, input.userId);
    if (!ok) {
      throw new NotFoundError('Chat not found');
    }
  }
}

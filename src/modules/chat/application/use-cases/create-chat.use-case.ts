import { DEFAULT_CHAT_TITLE } from '../../../../shared/constants.js';
import type { IUseCase } from '../../../../shared/use-case/use-case.interface.js';
import type { Chat } from '../../domain/chat.types.js';
import type { IChatRepository } from '../ports/chat.repository.port.js';

export interface CreateChatInput {
  userId: string;
  title?: string | undefined;
}

/**
 * Create a fresh chat for the user. Whitespace-only titles fall through to
 * the default — keeps the UX consistent for callers that send `{ title: '' }`.
 */
export class CreateChatUseCase implements IUseCase<CreateChatInput, Chat> {
  constructor(private readonly chats: IChatRepository) {}

  public async execute(input: CreateChatInput): Promise<Chat> {
    const title = input.title?.trim() || DEFAULT_CHAT_TITLE;
    return this.chats.create({ userId: input.userId, title });
  }
}

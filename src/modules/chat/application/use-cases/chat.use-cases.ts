import type { ArchiveChatInput } from './archive-chat.use-case.js';
import type { CreateChatInput } from './create-chat.use-case.js';
import type { DeleteChatInput } from './delete-chat.use-case.js';
import type { GetChatHistoryInput } from './get-chat-history.use-case.js';
import type { ListChatsInput } from './list-chats.use-case.js';
import type { RunRegenerateInput } from './regenerate-completion.use-case.js';
import type { RunCompletionInput } from './run-completion.use-case.js';
import type { UnarchiveChatInput } from './unarchive-chat.use-case.js';
import type { IUseCase } from '../../../../shared/use-case/use-case.interface.js';
import type { Chat, Message, PageResult } from '../../domain/chat.types.js';
import type { CompletionResult } from '../strategies/completion.strategy.js';

/**
 * Use case bag for the chat module — a typed grouping the controller depends on
 * instead of N constructor parameters. Each entry is a single-method `IUseCase`,
 * so the controller satisfies ISP perfectly: it declares dependence on one
 * operation per HTTP endpoint, not on a multi-method service class. The bag
 * itself is a passive type — the composition root constructs each use case
 * concretely and assembles them into this shape.
 */
export interface ChatUseCases {
  listChats: IUseCase<ListChatsInput, PageResult<Chat>>;
  listArchivedChats: IUseCase<ListChatsInput, PageResult<Chat>>;
  createChat: IUseCase<CreateChatInput, Chat>;
  deleteChat: IUseCase<DeleteChatInput, void>;
  archiveChat: IUseCase<ArchiveChatInput, void>;
  unarchiveChat: IUseCase<UnarchiveChatInput, void>;
  getHistory: IUseCase<GetChatHistoryInput, PageResult<Message>>;
  runCompletion: IUseCase<RunCompletionInput, CompletionResult>;
  regenerateCompletion: IUseCase<RunRegenerateInput, CompletionResult>;
}

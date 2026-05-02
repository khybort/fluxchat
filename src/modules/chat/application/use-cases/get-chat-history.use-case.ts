import { PAGINATION } from '../../../../shared/constants.js';
import type { FeatureFlagService } from '../../../../shared/feature-flags/feature-flag.service.js';
import type { FlagContext } from '../../../../shared/feature-flags/feature-flag.types.js';
import type { IUseCase } from '../../../../shared/use-case/use-case.interface.js';
import type { Message, PageResult } from '../../domain/chat.types.js';
import type { ChatAccessPolicy } from '../policies/chat-access.policy.js';
import type { HistoryStrategyFactory } from '../strategies/history-strategy.factory.js';

export interface GetChatHistoryInput {
  chatId: string;
  userId: string;
  cursor?: string | undefined;
  limit?: number | undefined;
  /** Optional per-request flag context — controllers pass this from `flagContextFrom(req)`. */
  flagCtx?: FlagContext;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Return a page of messages for the chat. The strategy factory picks between
 * full cursor-paginated history and a last-N truncated view based on the
 * `CHAT_HISTORY_ENABLED` flag — the use case stays branch-free.
 *
 * Ownership is verified first (404 on cross-user access). Pagination ceiling
 * comes from the `PAGINATION_LIMIT` flag, evaluated against the request
 * context so per-role rules apply.
 */
export class GetChatHistoryUseCase implements IUseCase<GetChatHistoryInput, PageResult<Message>> {
  constructor(
    private readonly access: ChatAccessPolicy,
    private readonly factory: HistoryStrategyFactory,
    private readonly flags: FeatureFlagService,
  ) {}

  public async execute(input: GetChatHistoryInput): Promise<PageResult<Message>> {
    await this.access.ensureOwnership(input.chatId, input.userId);

    const ctx: FlagContext = input.flagCtx ?? { userId: input.userId };
    const ceiling = this.flags.get('PAGINATION_LIMIT', ctx);
    const requested = input.limit ?? ceiling;
    const limit = clamp(requested, PAGINATION.MIN_LIMIT, ceiling);

    const strategy = this.factory.build(ctx);
    return strategy.execute({
      chatId: input.chatId,
      cursor: input.cursor,
      limit,
    });
  }
}

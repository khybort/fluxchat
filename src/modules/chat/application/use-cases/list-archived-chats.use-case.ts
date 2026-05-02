import type { ListChatsInput } from './list-chats.use-case.js';
import { PAGINATION } from '../../../../shared/constants.js';
import type { FeatureFlagService } from '../../../../shared/feature-flags/feature-flag.service.js';
import { buildPagedResult } from '../../../../shared/pagination/cursor.js';
import type { IUseCase } from '../../../../shared/use-case/use-case.interface.js';
import type { Chat, PageResult } from '../../domain/chat.types.js';
import type { IChatRepository } from '../ports/chat.repository.port.js';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Same input/output shape as ListChats but reads only archived rows
 * (archivedAt IS NOT NULL). Kept as a separate use case so the two queries
 * can diverge later (e.g. archived list might want different sort order or
 * include deleted-rows-too) without touching the active-list path.
 */
export class ListArchivedChatsUseCase implements IUseCase<ListChatsInput, PageResult<Chat>> {
  constructor(
    private readonly chats: IChatRepository,
    private readonly flags: FeatureFlagService,
  ) {}

  public async execute(input: ListChatsInput): Promise<PageResult<Chat>> {
    const ceiling = this.flags.get('PAGINATION_LIMIT', { userId: input.userId });
    const requested = input.limit ?? ceiling;
    const limit = clamp(requested, PAGINATION.MIN_LIMIT, ceiling);

    const rows = await this.chats.findArchivedByUser(input.userId, {
      cursor: input.cursor,
      limit,
    });
    return buildPagedResult(rows, limit, (c) => c.id);
  }
}

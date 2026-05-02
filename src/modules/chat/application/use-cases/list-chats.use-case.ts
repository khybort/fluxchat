import { PAGINATION } from '../../../../shared/constants.js';
import type { FeatureFlagService } from '../../../../shared/feature-flags/feature-flag.service.js';
import { buildPagedResult } from '../../../../shared/pagination/cursor.js';
import type { IUseCase } from '../../../../shared/use-case/use-case.interface.js';
import type { Chat, PageResult } from '../../domain/chat.types.js';
import type { IChatRepository } from '../ports/chat.repository.port.js';

export interface ListChatsInput {
  userId: string;
  cursor?: string | undefined;
  limit?: number | undefined;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * List the authenticated user's active (non-archived, non-deleted) chats,
 * cursor-paginated. The page size is clamped to the per-user PAGINATION_LIMIT
 * flag so admins can dial it differently per role/clientType via the rule
 * config in flag-defaults.ts.
 */
export class ListChatsUseCase implements IUseCase<ListChatsInput, PageResult<Chat>> {
  constructor(
    private readonly chats: IChatRepository,
    private readonly flags: FeatureFlagService,
  ) {}

  public async execute(input: ListChatsInput): Promise<PageResult<Chat>> {
    const ceiling = this.flags.get('PAGINATION_LIMIT', { userId: input.userId });
    const requested = input.limit ?? ceiling;
    const limit = clamp(requested, PAGINATION.MIN_LIMIT, ceiling);

    const rows = await this.chats.findByUser(input.userId, {
      cursor: input.cursor,
      limit,
    });
    return buildPagedResult(rows, limit, (c) => c.id);
  }
}

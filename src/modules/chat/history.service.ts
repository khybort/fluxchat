import type { ChatService } from './chat.service.js';
import type { Message, PageResult } from './chat.types.js';
import type { HistoryStrategyFactory } from './strategies/history-strategy.factory.js';
import { PAGINATION } from '../../shared/constants.js';
import type { FeatureFlagService } from '../../shared/feature-flags/feature-flag.service.js';

export interface GetHistoryInput {
  chatId: string;
  userId: string;
  cursor?: string | undefined;
  limit?: number | undefined;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export class HistoryService {
  constructor(
    private readonly chatService: ChatService,
    private readonly factory: HistoryStrategyFactory,
    private readonly flags: FeatureFlagService,
  ) {}

  public async getHistory(input: GetHistoryInput): Promise<PageResult<Message>> {
    await this.chatService.ensureOwnership(input.chatId, input.userId);

    const ceiling = this.flags.get('PAGINATION_LIMIT');
    const requested = input.limit ?? ceiling;
    const limit = clamp(requested, PAGINATION.MIN_LIMIT, ceiling);

    const strategy = this.factory.build();
    return strategy.execute({
      chatId: input.chatId,
      cursor: input.cursor,
      limit,
    });
  }
}

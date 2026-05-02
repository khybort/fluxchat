import { LIMITED_HISTORY_COUNT } from '../../../../shared/constants.js';
import type { IStrategy } from '../../../../shared/feature-flags/strategy.js';
import { buildPagedResult } from '../../../../shared/pagination/cursor.js';
import type { Message, PageResult } from '../../domain/chat.types.js';
import type { IMessageRepository } from '../ports/message.repository.port.js';

export interface HistoryInput {
  chatId: string;
  cursor: string | undefined;
  limit: number;
}

export type IHistoryStrategy = IStrategy<HistoryInput, PageResult<Message>>;

export class FullHistoryStrategy implements IHistoryStrategy {
  constructor(private readonly messages: IMessageRepository) {}

  public async execute(input: HistoryInput): Promise<PageResult<Message>> {
    const rows = await this.messages.findByChat(input.chatId, {
      cursor: input.cursor,
      limit: input.limit,
    });
    return buildPagedResult(rows, input.limit, (m) => m.id);
  }
}

export class LimitedHistoryStrategy implements IHistoryStrategy {
  constructor(private readonly messages: IMessageRepository) {}

  public async execute(input: HistoryInput): Promise<PageResult<Message>> {
    const rows = await this.messages.findLastN(input.chatId, LIMITED_HISTORY_COUNT);
    return {
      data: rows,
      pagination: { nextCursor: null, hasMore: false, limit: rows.length },
    };
  }
}

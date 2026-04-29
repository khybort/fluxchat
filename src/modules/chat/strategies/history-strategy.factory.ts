import type { FeatureFlagService } from '../../../shared/feature-flags/feature-flag.service.js';
import type { IMessageRepository } from '../chat.repository.interface.js';
import {
  FullHistoryStrategy,
  type IHistoryStrategy,
  LimitedHistoryStrategy,
} from './history.strategy.js';

export class HistoryStrategyFactory {
  constructor(
    private readonly messages: IMessageRepository,
    private readonly flags: FeatureFlagService,
  ) {}

  public build(): IHistoryStrategy {
    return this.flags.get('CHAT_HISTORY_ENABLED')
      ? new FullHistoryStrategy(this.messages)
      : new LimitedHistoryStrategy(this.messages);
  }
}

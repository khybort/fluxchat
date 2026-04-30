import type { FeatureFlagService } from '../../../shared/feature-flags/feature-flag.service.js';
import type { FlagContext } from '../../../shared/feature-flags/feature-flag.types.js';
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

  /**
   * Strategy selection is per-request because flag rules can target the
   * caller's role/client/userId. Pass undefined for context-free contexts
   * (tests, internal jobs) — falls through to the global default.
   */
  public build(ctx?: FlagContext): IHistoryStrategy {
    return this.flags.get('CHAT_HISTORY_ENABLED', ctx)
      ? new FullHistoryStrategy(this.messages)
      : new LimitedHistoryStrategy(this.messages);
  }
}

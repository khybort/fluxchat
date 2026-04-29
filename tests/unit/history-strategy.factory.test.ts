import { beforeEach, describe, expect, it } from 'vitest';

import { HistoryStrategyFactory } from '../../src/modules/chat/strategies/history-strategy.factory.js';
import {
  FullHistoryStrategy,
  LimitedHistoryStrategy,
} from '../../src/modules/chat/strategies/history.strategy.js';
import { LIMITED_HISTORY_COUNT } from '../../src/shared/constants.js';
import { FeatureFlagService } from '../../src/shared/feature-flags/feature-flag.service.js';
import { InMemoryMessageRepository } from '../helpers/in-memory-repositories.js';

describe('HistoryStrategyFactory', () => {
  let messages: InMemoryMessageRepository;
  let flags: FeatureFlagService;
  let factory: HistoryStrategyFactory;

  beforeEach(() => {
    messages = new InMemoryMessageRepository();
    flags = FeatureFlagService.getInstance();
    factory = new HistoryStrategyFactory(messages, flags);
  });

  it('returns FullHistoryStrategy when CHAT_HISTORY_ENABLED=true', () => {
    flags.set('CHAT_HISTORY_ENABLED', true);
    expect(factory.build()).toBeInstanceOf(FullHistoryStrategy);
  });

  it('returns LimitedHistoryStrategy when CHAT_HISTORY_ENABLED=false', () => {
    flags.set('CHAT_HISTORY_ENABLED', false);
    expect(factory.build()).toBeInstanceOf(LimitedHistoryStrategy);
  });

  it(`LimitedHistoryStrategy returns at most ${LIMITED_HISTORY_COUNT} messages`, async () => {
    const chatId = 'chat-1';
    for (let i = 0; i < 25; i++) {
      await messages.create({ chatId, role: 'user', content: `m${i}` });
    }

    flags.set('CHAT_HISTORY_ENABLED', false);
    const strategy = factory.build();
    const result = await strategy.execute({ chatId, cursor: undefined, limit: 100 });

    expect(result.data.length).toBe(LIMITED_HISTORY_COUNT);
    expect(result.pagination.hasMore).toBe(false);
    expect(result.pagination.nextCursor).toBeNull();
  });
});

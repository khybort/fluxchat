import { beforeEach, describe, expect, it } from 'vitest';

import { MockAiProvider } from '../../src/infrastructure/ai/mock.provider.js';
import { CompletionStrategyFactory } from '../../src/modules/chat/strategies/completion-strategy.factory.js';
import { JsonCompletionStrategy } from '../../src/modules/chat/strategies/json-completion.strategy.js';
import { StreamingCompletionStrategy } from '../../src/modules/chat/strategies/streaming-completion.strategy.js';
import { FeatureFlagService } from '../../src/shared/feature-flags/feature-flag.service.js';

describe('CompletionStrategyFactory', () => {
  let flags: FeatureFlagService;
  let factory: CompletionStrategyFactory;

  beforeEach(() => {
    flags = FeatureFlagService.getInstance();
    factory = new CompletionStrategyFactory(new MockAiProvider(), flags);
  });

  it('returns StreamingCompletionStrategy when STREAMING_ENABLED=true', () => {
    flags.set('STREAMING_ENABLED', true);
    const strategy = factory.build(new AbortController().signal);
    expect(strategy).toBeInstanceOf(StreamingCompletionStrategy);
  });

  it('returns JsonCompletionStrategy when STREAMING_ENABLED=false', () => {
    flags.set('STREAMING_ENABLED', false);
    const strategy = factory.build(new AbortController().signal);
    expect(strategy).toBeInstanceOf(JsonCompletionStrategy);
  });
});

describe('JsonCompletionStrategy', () => {
  it('calls onComplete with the assistant text and returns kind=json', async () => {
    const flags = FeatureFlagService.getInstance();
    flags.set('AI_TOOLS_ENABLED', false);
    const strategy = new JsonCompletionStrategy(new MockAiProvider(), flags);

    let captured = '';
    const result = await strategy.execute({
      history: [],
      prompt: 'hello',
      onComplete: async (t) => {
        captured = t;
      },
    });

    expect(result.kind).toBe('json');
    if (result.kind === 'json') {
      expect(result.text).toContain('Mock response');
      expect(captured).toBe(result.text);
    }
  });

  it('produces tool calls when AI_TOOLS_ENABLED=true and prompt mentions weather', async () => {
    const flags = FeatureFlagService.getInstance();
    flags.set('AI_TOOLS_ENABLED', true);
    const strategy = new JsonCompletionStrategy(new MockAiProvider(), flags);

    const result = await strategy.execute({
      history: [],
      prompt: 'what is the weather in Istanbul?',
      onComplete: async () => undefined,
    });

    if (result.kind !== 'json') throw new Error('expected json result');
    expect(result.toolCalls.length).toBeGreaterThan(0);
    expect(result.toolCalls[0]?.name).toBe('getCurrentWeather');
  });
});

describe('StreamingCompletionStrategy', () => {
  it('emits thinking, deltas, and a final done event, persisting via onComplete', async () => {
    const flags = FeatureFlagService.getInstance();
    flags.set('AI_TOOLS_ENABLED', false);
    const ctrl = new AbortController();
    const strategy = new StreamingCompletionStrategy(new MockAiProvider(), flags, ctrl.signal);

    let persisted = '';
    const result = strategy.execute({
      history: [],
      prompt: 'stream please',
      onComplete: async (t) => {
        persisted = t;
      },
    });

    if (result.kind !== 'stream') throw new Error('expected stream result');

    const types: string[] = [];
    for await (const event of result.events) {
      types.push(event.type);
    }

    expect(types[0]).toBe('thinking');
    expect(types).toContain('delta');
    expect(types[types.length - 1]).toBe('done');
    expect(persisted.length).toBeGreaterThan(0);
  });
});

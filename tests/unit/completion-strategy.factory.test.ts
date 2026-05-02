import { beforeEach, describe, expect, it } from 'vitest';

import type { IAiProvider } from '../../src/infrastructure/ai/ai.provider.js';
import type {
  CompletionRequest,
  CompletionResultJson,
  CompletionStreamEvent,
} from '../../src/infrastructure/ai/ai.types.js';
import { MockAiProvider } from '../../src/infrastructure/ai/mock.provider.js';
import { CompletionStrategyFactory } from '../../src/modules/chat/application/strategies/completion-strategy.factory.js';
import { JsonCompletionStrategy } from '../../src/modules/chat/application/strategies/json-completion.strategy.js';
import { StreamingCompletionStrategy } from '../../src/modules/chat/application/strategies/streaming-completion.strategy.js';
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

  it('persists the partial text when the upstream stream throws mid-flight', async () => {
    const flags = FeatureFlagService.getInstance();
    flags.set('AI_TOOLS_ENABLED', false);

    // Provider that yields three deltas, then throws — emulates a provider
    // SDK error after some tokens already streamed to the client.
    const flakyProvider: IAiProvider = {
      kind: 'mock',
      model: 'mock-flaky',
      // eslint-disable-next-line @typescript-eslint/require-await
      async complete(_req: CompletionRequest): Promise<CompletionResultJson> {
        return { text: '', toolCalls: [] };
      },
      // eslint-disable-next-line require-yield
      async *stream(): AsyncIterable<CompletionStreamEvent> {
        yield { type: 'thinking' };
        yield { type: 'delta', text: 'Hel' };
        yield { type: 'delta', text: 'lo' };
        yield { type: 'delta', text: ', wo' };
        throw new Error('provider exploded');
      },
    };

    const strategy = new StreamingCompletionStrategy(
      flakyProvider,
      flags,
      new AbortController().signal,
    );

    let persisted = '';
    let persistMeta: { provider?: string | undefined; model?: string | undefined } = {};
    const result = strategy.execute({
      history: [],
      prompt: 'partial please',
      onComplete: async (t, meta) => {
        persisted = t;
        if (meta) persistMeta = { provider: meta.provider, model: meta.model };
      },
    });

    if (result.kind !== 'stream') throw new Error('expected stream result');

    const collected: CompletionStreamEvent[] = [];
    let thrown: unknown = null;
    try {
      for await (const event of result.events) {
        collected.push(event);
      }
    } catch (err: unknown) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe('provider exploded');
    expect(persisted).toBe('Hello, wo');
    expect(persistMeta.provider).toBe('mock');
    expect(persistMeta.model).toBe('mock-flaky');
    // Re-throw must not double-persist: the success path's `done` event was
    // never reached, so onComplete should fire exactly once (in the catch).
    expect(collected.filter((e) => e.type === 'done')).toHaveLength(0);
  });

  it('does not persist when the stream throws before any delta', async () => {
    const flags = FeatureFlagService.getInstance();
    flags.set('AI_TOOLS_ENABLED', false);

    const earlyFailProvider: IAiProvider = {
      kind: 'mock',
      model: 'mock-early',
      // eslint-disable-next-line @typescript-eslint/require-await
      async complete(_req: CompletionRequest): Promise<CompletionResultJson> {
        return { text: '', toolCalls: [] };
      },
      // eslint-disable-next-line require-yield
      async *stream(): AsyncIterable<CompletionStreamEvent> {
        throw new Error('upstream 503');
      },
    };

    const strategy = new StreamingCompletionStrategy(
      earlyFailProvider,
      flags,
      new AbortController().signal,
    );

    let persistCalled = false;
    const result = strategy.execute({
      history: [],
      prompt: 'fail fast',
      onComplete: async () => {
        persistCalled = true;
      },
    });

    if (result.kind !== 'stream') throw new Error('expected stream result');

    let thrown: unknown = null;
    try {
      for await (const _event of result.events) {
        // drain
      }
    } catch (err: unknown) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(persistCalled).toBe(false);
  });
});

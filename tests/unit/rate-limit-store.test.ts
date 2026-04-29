import { describe, expect, it, vi } from 'vitest';

import { InMemoryRateLimitStore } from '../../src/shared/rate-limit/in-memory.store.js';
import {
  type MinimalRedisClient,
  RedisRateLimitStore,
} from '../../src/shared/rate-limit/redis.store.js';

describe('InMemoryRateLimitStore', () => {
  it('allows up to `limit` requests inside the window', async () => {
    const store = new InMemoryRateLimitStore();
    const decisions = [];
    for (let i = 0; i < 5; i++) {
      decisions.push(await store.consume('user:1', 5, 60_000));
    }
    expect(decisions.every((d) => d.allowed)).toBe(true);
    expect(decisions.at(-1)?.remaining).toBe(0);
  });

  it('rejects the (limit+1)-th request inside the window', async () => {
    const store = new InMemoryRateLimitStore();
    for (let i = 0; i < 3; i++) await store.consume('user:1', 3, 60_000);
    const denied = await store.consume('user:1', 3, 60_000);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
  });

  it('refills the bucket after the window elapses', async () => {
    vi.useFakeTimers();
    try {
      const store = new InMemoryRateLimitStore();
      for (let i = 0; i < 2; i++) await store.consume('user:1', 2, 1_000);
      const denied = await store.consume('user:1', 2, 1_000);
      expect(denied.allowed).toBe(false);

      vi.advanceTimersByTime(1_001);

      const refilled = await store.consume('user:1', 2, 1_000);
      expect(refilled.allowed).toBe(true);
      expect(refilled.remaining).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps separate buckets per key', async () => {
    const store = new InMemoryRateLimitStore();
    await store.consume('user:A', 1, 60_000);
    const a = await store.consume('user:A', 1, 60_000);
    const b = await store.consume('user:B', 1, 60_000);
    expect(a.allowed).toBe(false);
    expect(b.allowed).toBe(true);
  });
});

describe('RedisRateLimitStore', () => {
  const buildFakeRedis = (): {
    client: MinimalRedisClient;
    state: Map<string, { count: number; ttl: number }>;
  } => {
    const state = new Map<string, { count: number; ttl: number }>();
    const client: MinimalRedisClient = {
      incr: (key) => {
        const cur = state.get(key) ?? { count: 0, ttl: -1 };
        cur.count += 1;
        state.set(key, cur);
        return Promise.resolve(cur.count);
      },
      pexpire: (key, ttlMs) => {
        const cur = state.get(key);
        if (cur) cur.ttl = ttlMs;
        return Promise.resolve(1);
      },
      pttl: (key) => Promise.resolve(state.get(key)?.ttl ?? -1),
    };
    return { client, state };
  };

  it('sets PEXPIRE on first hit only', async () => {
    const { client } = buildFakeRedis();
    const pexpire = vi.spyOn(client, 'pexpire');
    const store = new RedisRateLimitStore(client);

    await store.consume('user:1', 10, 60_000);
    await store.consume('user:1', 10, 60_000);
    await store.consume('user:1', 10, 60_000);

    expect(pexpire).toHaveBeenCalledTimes(1);
    expect(pexpire).toHaveBeenCalledWith(expect.stringMatching(/^ratelimit:user:1:/), 60_000);
  });

  it('rejects with retryAfterMs derived from PTTL once limit exceeded', async () => {
    const { client } = buildFakeRedis();
    const store = new RedisRateLimitStore(client);

    await store.consume('user:1', 2, 60_000);
    await store.consume('user:1', 2, 60_000);
    const denied = await store.consume('user:1', 2, 60_000);

    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.retryAfterMs).toBe(60_000);
  });

  it('returns falling remaining count while still allowed', async () => {
    const { client } = buildFakeRedis();
    const store = new RedisRateLimitStore(client);

    const r1 = await store.consume('user:1', 3, 60_000);
    const r2 = await store.consume('user:1', 3, 60_000);
    const r3 = await store.consume('user:1', 3, 60_000);

    expect([r1.remaining, r2.remaining, r3.remaining]).toEqual([2, 1, 0]);
    expect([r1.allowed, r2.allowed, r3.allowed]).toEqual([true, true, true]);
  });
});

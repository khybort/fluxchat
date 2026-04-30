import { describe, expect, it } from 'vitest';

import { bucketFor } from '../../src/shared/feature-flags/bucket.js';

describe('bucketFor', () => {
  it('is deterministic — same inputs always produce the same output', () => {
    const a = bucketFor('AI_TOOLS_ENABLED', 'user-42');
    const b = bucketFor('AI_TOOLS_ENABLED', 'user-42');
    const c = bucketFor('AI_TOOLS_ENABLED', 'user-42');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('different flag names land the same subject in different buckets', () => {
    // We can't guarantee ALL flag pairs disagree, but a sample from a real
    // userId set should produce different buckets in the majority of cases.
    let differ = 0;
    const trials = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u10'];
    for (const id of trials) {
      const a = bucketFor('AI_TOOLS_ENABLED', id);
      const b = bucketFor('STREAMING_ENABLED', id);
      if (a !== b) differ++;
    }
    expect(differ).toBeGreaterThanOrEqual(7); // 7/10 sanity threshold
  });

  it('produces a roughly uniform distribution over many subjects', () => {
    const buckets = new Array<number>(10).fill(0);
    const total = 10_000;
    for (let i = 0; i < total; i++) {
      const value = bucketFor('AI_TOOLS_ENABLED', `user-${i}`);
      buckets[Math.floor(value / 10)]! += 1;
    }
    // Each decile should hold ~1000 (10%). Expect every decile within 8–12%.
    const expected = total / 10;
    for (const count of buckets) {
      expect(count).toBeGreaterThan(expected * 0.8);
      expect(count).toBeLessThan(expected * 1.2);
    }
  });

  it('always returns a value in [0, 99]', () => {
    for (let i = 0; i < 1000; i++) {
      const value = bucketFor('FLAG', `subject-${i}`);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(99);
    }
  });
});

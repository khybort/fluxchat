import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { FeatureFlagService } from '../../src/shared/feature-flags/feature-flag.service.js';

describe('FeatureFlagService', () => {
  afterEach(() => {
    delete process.env.FEATURE_FLAGS_FILE;
    FeatureFlagService.resetForTesting();
  });

  it('returns defaults from env when no override file is set', () => {
    process.env.STREAMING_ENABLED = 'false';
    process.env.PAGINATION_LIMIT = '15';
    const service = FeatureFlagService.getInstance();
    expect(service.get('STREAMING_ENABLED')).toBe(false);
    expect(service.get('PAGINATION_LIMIT')).toBe(15);
  });

  it('overrides env defaults with values from FEATURE_FLAGS_FILE', () => {
    process.env.STREAMING_ENABLED = 'true';
    const filePath = join(tmpdir(), `flags-${Date.now()}.json`);
    writeFileSync(filePath, JSON.stringify({ STREAMING_ENABLED: false, PAGINATION_LIMIT: 50 }));
    process.env.FEATURE_FLAGS_FILE = filePath;

    try {
      const service = FeatureFlagService.getInstance();
      expect(service.get('STREAMING_ENABLED')).toBe(false);
      expect(service.get('PAGINATION_LIMIT')).toBe(50);
    } finally {
      unlinkSync(filePath);
    }
  });

  it('reload picks up file changes without restart', async () => {
    const filePath = join(tmpdir(), `flags-${Date.now()}-reload.json`);
    writeFileSync(filePath, JSON.stringify({ STREAMING_ENABLED: true }));
    process.env.FEATURE_FLAGS_FILE = filePath;

    try {
      const service = FeatureFlagService.getInstance();
      expect(service.get('STREAMING_ENABLED')).toBe(true);

      writeFileSync(filePath, JSON.stringify({ STREAMING_ENABLED: false }));
      await service.reload();
      expect(service.get('STREAMING_ENABLED')).toBe(false);
    } finally {
      unlinkSync(filePath);
    }
  });

  it('clamps PAGINATION_LIMIT to [10, 100] when loaded from file', () => {
    const filePath = join(tmpdir(), `flags-${Date.now()}-clamp.json`);
    writeFileSync(filePath, JSON.stringify({ PAGINATION_LIMIT: 999 }));
    process.env.FEATURE_FLAGS_FILE = filePath;

    try {
      const service = FeatureFlagService.getInstance();
      expect(service.get('PAGINATION_LIMIT')).toBe(100);
    } finally {
      unlinkSync(filePath);
    }
  });

  it('set() lets tests override flags at runtime', () => {
    const service = FeatureFlagService.getInstance();
    service.set('AI_TOOLS_ENABLED', true);
    expect(service.get('AI_TOOLS_ENABLED')).toBe(true);
  });
});

describe('FeatureFlagService — context-aware evaluation', () => {
  afterEach(() => {
    delete process.env.FEATURE_FLAGS_FILE;
    FeatureFlagService.resetForTesting();
  });

  const writeFlags = (definitions: unknown): string => {
    const filePath = join(tmpdir(), `flags-ctx-${Date.now()}-${Math.random()}.json`);
    writeFileSync(filePath, JSON.stringify(definitions));
    process.env.FEATURE_FLAGS_FILE = filePath;
    return filePath;
  };

  it('rules: first matching rule wins, missing keys are wildcards', () => {
    const filePath = writeFlags({
      CHAT_HISTORY_ENABLED: {
        default: true,
        rules: [
          { if: { userRole: 'admin' }, value: true },
          { if: { clientType: 'mobile' }, value: false },
        ],
      },
    });
    try {
      const service = FeatureFlagService.getInstance();
      // No context: falls through to default (true)
      expect(service.get('CHAT_HISTORY_ENABLED')).toBe(true);
      // Mobile non-admin: 2nd rule fires
      expect(service.get('CHAT_HISTORY_ENABLED', { clientType: 'mobile' })).toBe(false);
      // Admin on mobile: 1st rule wins (declaration order)
      expect(service.get('CHAT_HISTORY_ENABLED', { userRole: 'admin', clientType: 'mobile' })).toBe(
        true,
      );
      // Web user (no rule matches): default
      expect(service.get('CHAT_HISTORY_ENABLED', { clientType: 'web' })).toBe(true);
    } finally {
      unlinkSync(filePath);
    }
  });

  it('percentage 0 → false for all users', () => {
    const filePath = writeFlags({
      AI_TOOLS_ENABLED: { default: false, percentage: 0 },
    });
    try {
      const service = FeatureFlagService.getInstance();
      for (const userId of ['a', 'b', 'c', 'd']) {
        expect(service.get('AI_TOOLS_ENABLED', { userId })).toBe(false);
      }
    } finally {
      unlinkSync(filePath);
    }
  });

  it('percentage 100 → true for all users', () => {
    const filePath = writeFlags({
      AI_TOOLS_ENABLED: { default: false, percentage: 100 },
    });
    try {
      const service = FeatureFlagService.getInstance();
      for (const userId of ['a', 'b', 'c', 'd']) {
        expect(service.get('AI_TOOLS_ENABLED', { userId })).toBe(true);
      }
    } finally {
      unlinkSync(filePath);
    }
  });

  it('percentage is deterministic: same userId always lands in the same bucket', () => {
    const filePath = writeFlags({
      AI_TOOLS_ENABLED: { default: false, percentage: 50 },
    });
    try {
      const service = FeatureFlagService.getInstance();
      const userIds = ['user-1', 'user-2', 'user-3', 'user-4', 'user-5'];
      const first = userIds.map((id) => service.get('AI_TOOLS_ENABLED', { userId: id }));
      // Repeat 100 times, verify every call returns the same value as the first.
      for (let i = 0; i < 100; i++) {
        const round = userIds.map((id) => service.get('AI_TOOLS_ENABLED', { userId: id }));
        expect(round).toEqual(first);
      }
    } finally {
      unlinkSync(filePath);
    }
  });

  it('percentage 25 over many users yields ~25% true (statistical bound)', () => {
    const filePath = writeFlags({
      AI_TOOLS_ENABLED: { default: false, percentage: 25 },
    });
    try {
      const service = FeatureFlagService.getInstance();
      let trueCount = 0;
      const total = 5000;
      for (let i = 0; i < total; i++) {
        if (service.get('AI_TOOLS_ENABLED', { userId: `user-${i}` })) trueCount++;
      }
      const pct = (trueCount / total) * 100;
      // Loose bound — sha1 with these inputs should land in [22, 28] but
      // give it a wider window to keep the test deterministic-stable.
      expect(pct).toBeGreaterThan(20);
      expect(pct).toBeLessThan(30);
    } finally {
      unlinkSync(filePath);
    }
  });

  it('rules win over percentage when both are configured', () => {
    const filePath = writeFlags({
      AI_TOOLS_ENABLED: {
        default: false,
        rules: [{ if: { userRole: 'admin' }, value: true }],
        percentage: 0,
      },
    });
    try {
      const service = FeatureFlagService.getInstance();
      // Admin: rule fires regardless of percentage=0
      expect(service.get('AI_TOOLS_ENABLED', { userId: 'a', userRole: 'admin' })).toBe(true);
      // Non-admin: percentage 0 keeps everyone out
      expect(service.get('AI_TOOLS_ENABLED', { userId: 'a', userRole: 'user' })).toBe(false);
    } finally {
      unlinkSync(filePath);
    }
  });

  it('invalid rich-form definition logs and falls back to env default', () => {
    process.env.STREAMING_ENABLED = 'true';
    // Boolean flag with a string default → invalid
    const filePath = writeFlags({
      STREAMING_ENABLED: { default: 'nope' },
    });
    try {
      const service = FeatureFlagService.getInstance();
      expect(service.get('STREAMING_ENABLED')).toBe(true); // env default holds
    } finally {
      unlinkSync(filePath);
    }
  });

  it('snapshot returns evaluated defaults only, not rule structure', () => {
    const filePath = writeFlags({
      CHAT_HISTORY_ENABLED: {
        default: false,
        rules: [{ if: { userRole: 'admin' }, value: true }],
      },
    });
    try {
      const service = FeatureFlagService.getInstance();
      const snap = service.snapshot();
      expect(snap.CHAT_HISTORY_ENABLED).toBe(false);
      // No rules / percentage on the snapshot type — it's the FeatureFlagSchema shape.
      expect((snap as unknown as Record<string, unknown>).rules).toBeUndefined();
    } finally {
      unlinkSync(filePath);
    }
  });

  it('definitions() exposes the rich form for admin surfaces', () => {
    const filePath = writeFlags({
      AI_TOOLS_ENABLED: { default: false, percentage: 25 },
    });
    try {
      const service = FeatureFlagService.getInstance();
      const defs = service.definitions();
      expect(defs.AI_TOOLS_ENABLED.percentage).toBe(25);
      expect(defs.AI_TOOLS_ENABLED.default).toBe(false);
    } finally {
      unlinkSync(filePath);
    }
  });
});

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

  it('reload picks up file changes without restart', () => {
    const filePath = join(tmpdir(), `flags-${Date.now()}-reload.json`);
    writeFileSync(filePath, JSON.stringify({ STREAMING_ENABLED: true }));
    process.env.FEATURE_FLAGS_FILE = filePath;

    try {
      const service = FeatureFlagService.getInstance();
      expect(service.get('STREAMING_ENABLED')).toBe(true);

      writeFileSync(filePath, JSON.stringify({ STREAMING_ENABLED: false }));
      service.reload();
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

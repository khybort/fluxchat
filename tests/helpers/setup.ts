import { afterEach, beforeAll } from 'vitest';

import { Config } from '../../src/config/config.js';
import { Logger } from '../../src/infrastructure/logger/logger.js';
import { FeatureFlagService } from '../../src/shared/feature-flags/feature-flag.service.js';

const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/test?schema=public',
  JWT_SECRET: 'test-secret-with-at-least-thirty-two-chars',
  APP_CHECK_TOKEN: 'test-app-check-token',
  LOG_LEVEL: 'fatal',
  CORS_ORIGINS: '',
  STREAMING_ENABLED: 'true',
  PAGINATION_LIMIT: '20',
  AI_TOOLS_ENABLED: 'false',
  CHAT_HISTORY_ENABLED: 'true',
  RATE_LIMIT_PER_MINUTE: '1000',
  DOCS_ENABLED: 'true',
};

// Force test env, even if a prior process exported a different value.
for (const [k, v] of Object.entries(TEST_ENV)) {
  process.env[k] = v;
}

beforeAll(() => {
  for (const [k, v] of Object.entries(TEST_ENV)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
});

afterEach(() => {
  Config.resetForTesting();
  Logger.resetForTesting();
  FeatureFlagService.resetForTesting();
});

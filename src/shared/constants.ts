/**
 * Business constants. These are intentionally NOT environment-driven —
 * they describe rules that do not change between environments.
 * Env-driven values belong in Config (see CLAUDE.md §8).
 */

export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MIN_LIMIT: 10,
  MAX_LIMIT: 100,
} as const;

/** Used when CHAT_HISTORY_ENABLED=false. */
export const LIMITED_HISTORY_COUNT = 10;

/** Default chat title when the user has not provided one. */
export const DEFAULT_CHAT_TITLE = 'New chat';

/** Body size limit for incoming JSON. */
export const REQUEST_BODY_LIMIT = '1mb';

/** Headers we read from incoming requests. */
export const HEADERS = {
  APP_CHECK: 'x-firebase-app-check',
  CLIENT_TYPE: 'x-client-type',
  REQUEST_ID: 'x-request-id',
} as const;

/** Supported client types for the clientType middleware. */
export const CLIENT_TYPES = ['web', 'mobile', 'desktop'] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];

/** Authentication-related business constants. */
export const AUTH = {
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 100,
  NAME_MAX_LENGTH: 100,
  EMAIL_MAX_LENGTH: 254,
  TOKEN_TTL_SECONDS: 60 * 60 * 24 * 30,
  BCRYPT_ROUNDS: 12,
  RATE_LIMIT_PER_MINUTE: 10,
} as const;

/** AI completion knobs. Model names live in Config (env-driven). */
export const AI = {
  MAX_TOOL_ITERATIONS: 5,
  DEFAULT_MAX_TOKENS: 4096,
} as const;

/** AI tool execution limits. */
export const TOOLS = {
  MAX_WEB_SEARCH_RESULTS: 10,
  MAX_SEARCH_QUERY_LENGTH: 200,
  WEB_SEARCH_TIMEOUT_MS: 5000,
} as const;

/** In-memory rate limiter eviction parameters. */
export const RATE_LIMIT = {
  STALE_FACTOR: 4,
  MAX_BUCKETS: 10_000,
} as const;

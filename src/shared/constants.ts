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

/**
 * Type-safe feature flag registry. Adding a new flag is a single edit here
 * plus a default in Config.featureFlagDefaults — see CLAUDE.md §12.
 */
export interface FeatureFlagSchema {
  STREAMING_ENABLED: boolean;
  PAGINATION_LIMIT: number;
  AI_TOOLS_ENABLED: boolean;
  CHAT_HISTORY_ENABLED: boolean;
  RATE_LIMIT_PER_MINUTE: number;
}

export type FlagName = keyof FeatureFlagSchema;
export type FlagValue = FeatureFlagSchema[FlagName];

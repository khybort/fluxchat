import type { FlagDefinition, FlagName, FlagValue } from './feature-flag.types.js';

/**
 * Code-level defaults — the bottom of the source-priority chain
 * (CLAUDE.md §12). DB overrides (admin UI) sit on top, then JSON file at
 * FEATURE_FLAGS_FILE, then this registry.
 *
 * Each entry uses the rich {@link FlagDefinition} form so role-based
 * defaults can ship as code: customers get the conservative default,
 * admins land a more permissive value via a built-in rule. Admins can
 * still override per-user via the admin UI (which appends/edits entries
 * in `rules`).
 *
 * Adding a new flag is two edits: the FeatureFlagSchema interface and
 * one entry here. No env-var wiring needed.
 */
export const FLAG_DEFAULTS: Record<FlagName, FlagDefinition<FlagValue>> = {
  STREAMING_ENABLED: { default: true },

  PAGINATION_LIMIT: {
    default: 20,
    rules: [{ if: { userRole: 'admin' }, value: 100 }],
  },

  AI_TOOLS_ENABLED: {
    default: false,
    rules: [{ if: { userRole: 'admin' }, value: true }],
  },

  CHAT_HISTORY_ENABLED: { default: true },

  RATE_LIMIT_PER_MINUTE: {
    default: 60,
    rules: [{ if: { userRole: 'admin' }, value: 600 }],
  },

  COMPLETION_ENABLED: { default: true },

  TOOL_CALCULATOR_ENABLED: { default: true },
  TOOL_CURRENT_TIME_ENABLED: { default: true },
  TOOL_CURRENT_WEATHER_ENABLED: { default: true },
  TOOL_CONVERT_CURRENCY_ENABLED: { default: true },
  TOOL_SEARCH_WEB_ENABLED: { default: true },
};

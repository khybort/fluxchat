import type { CoreFlagSchema, FlagDefinition, FlagName, FlagValue } from './feature-flag.types.js';
import { TOOL_FLAG_DEFAULTS } from '../../infrastructure/ai/tools/registry.js';

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
 * Adding a new core (non-tool) flag is two edits: the {@link CoreFlagSchema}
 * interface and one entry below. Tool flags are derived from each tool's
 * own `flag` spec (see `infrastructure/ai/tools/registry.ts`) — they do not
 * appear here.
 */
const CORE_FLAG_DEFAULTS: { [K in keyof CoreFlagSchema]: FlagDefinition<CoreFlagSchema[K]> } = {
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
};

export const FLAG_DEFAULTS: Record<FlagName, FlagDefinition<FlagValue>> = {
  ...CORE_FLAG_DEFAULTS,
  ...TOOL_FLAG_DEFAULTS,
} as Record<FlagName, FlagDefinition<FlagValue>>;

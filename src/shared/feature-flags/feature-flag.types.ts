import type { ClientType } from '../constants.js';
import type { UserRole } from '../types/express.js';

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
  /** Kill-switch for the AI completion route. Default true. */
  COMPLETION_ENABLED: boolean;
}

export type FlagName = keyof FeatureFlagSchema;
export type FlagValue = FeatureFlagSchema[FlagName];

/**
 * Per-evaluation context. Every field is optional so call sites can fill
 * what they have; missing fields are wildcards in rule matching. The richer
 * the context, the more selective the rules can be.
 *
 * Each field is `T | undefined` (rather than just `?:`) so zod-inferred DTOs
 * with `.optional()` are assignable under `exactOptionalPropertyTypes: true`.
 */
export interface FlagContext {
  userId?: string | undefined;
  clientType?: ClientType | undefined;
  userRole?: UserRole | undefined;
  /** Reserved for a future subscription-tier hook. Defaults to 'free' when omitted. */
  plan?: 'free' | 'pro' | 'enterprise' | undefined;
}

/**
 * Predicate over FlagContext. All keys present in `if` must equal the matching
 * field in the evaluation context (AND semantics). Keys absent from `if` are
 * wildcards. Rules are walked in declaration order; the first match wins.
 */
export interface FlagRule<V extends FlagValue> {
  if: Partial<FlagContext>;
  value: V;
}

/**
 * Rich form for a flag definition — used by the JSON-file source. The bare
 * primitive form (current behavior) is also accepted by the parser and
 * wrapped as `{ default: v }` internally.
 *
 * Evaluation order: rules (first match) → percentage bucket (boolean only,
 * needs ctx.userId) → default.
 */
export interface FlagDefinition<V extends FlagValue> {
  default: V;
  rules?: FlagRule<V>[];
  /** 0–100. Boolean flags only — ignored on numeric flags. */
  percentage?: number;
}

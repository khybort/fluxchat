import type { ClientType } from '../constants.js';
import type { UserRole } from '../types/express.js';

/**
 * Type-safe registry for the FIXED, hand-curated flags. Per-tool flags follow
 * the `TOOL_<UPPER>_ENABLED` template and are added implicitly via each
 * tool's `flag` spec — they don't need entries here. See CLAUDE.md §12.
 *
 * Adding a new core (non-tool) flag is two edits: this interface plus an
 * entry in `flag-defaults.ts`.
 */
export interface CoreFlagSchema {
  STREAMING_ENABLED: boolean;
  PAGINATION_LIMIT: number;
  /** Master switch for the entire AI tool catalog. When off, no tools are
   *  exposed to the model regardless of the per-tool flags. */
  AI_TOOLS_ENABLED: boolean;
  CHAT_HISTORY_ENABLED: boolean;
  RATE_LIMIT_PER_MINUTE: number;
  /** Kill-switch for the AI completion route. Default true. */
  COMPLETION_ENABLED: boolean;
}

/**
 * Per-tool flag name template. Each tool's `flag.name` must match this
 * pattern; runtime parsing (`TOOL_FLAG_PATTERN` in feature-flag.parser.ts)
 * also enforces the all-caps body. We use `string` here (not `Uppercase<string>`)
 * because TypeScript treats the two template types as non-substitutable across
 * library boundaries, which broke generic widening at call sites.
 */
export type ToolFlagName = `TOOL_${string}_ENABLED`;

export type FlagName = keyof CoreFlagSchema | ToolFlagName;
export type FlagValue = CoreFlagSchema[keyof CoreFlagSchema] | boolean;

/**
 * Type-level lookup of the value type for a given flag name. Core flags map
 * to their declared types in {@link CoreFlagSchema}; tool flags resolve to
 * `boolean` by construction (every {@link import('../../infrastructure/ai/tools/types.js').ToolFlagSpec}
 * carries a boolean default). Lets `flags.get<K>(name)` return the precise
 * type without enumerating every tool flag in this module.
 */
export type FlagValueFor<K extends FlagName> = K extends keyof CoreFlagSchema
  ? CoreFlagSchema[K]
  : boolean;

/**
 * Snapshot shape returned by {@link FeatureFlagService.snapshot}: every core
 * flag with its declared type, plus all tool flags as booleans (extra string
 * keys allowed because the tool catalog is plugin-style — registry decides
 * which tool flags are present at runtime).
 */
export type FeatureFlagSnapshot = CoreFlagSchema & Record<string, FlagValue>;

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

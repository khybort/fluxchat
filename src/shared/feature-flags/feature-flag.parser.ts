import type {
  CoreFlagSchema,
  FlagContext,
  FlagDefinition,
  FlagName,
  FlagRule,
  FlagValue,
} from './feature-flag.types.js';
import { FLAG_DEFAULTS } from './flag-defaults.js';
import type { Logger } from '../../infrastructure/logger/logger.js';

/**
 * Loose-keyed map from flag name → definition. Indexed access is `T | undefined`
 * under noUncheckedIndexedAccess; callers either know the key (core flags from
 * `FLAG_DEFAULTS`) or guard against missing tool flags. Using `Record<string, …>`
 * (not `Record<FlagName, …>`) so the map can hold the open set of tool flags
 * the registry contributes at runtime.
 */
export type FlagDefinitions = Record<string, FlagDefinition<FlagValue>>;

const FLAG_NAMES = Object.keys(FLAG_DEFAULTS) as readonly FlagName[];

const PERCENTAGE_MIN = 0;
const PERCENTAGE_MAX = 100;
const PAGINATION_MIN = 10;
const PAGINATION_MAX = 100;

const TOOL_FLAG_PATTERN = /^TOOL_[A-Z0-9_]+_ENABLED$/;

/**
 * Apply the per-flag bounds the original `coerce()` enforced. Returns null
 * when the value is the wrong shape for the flag (caller treats null as
 * "skip this entry, keep env default").
 *
 * Tool flags follow a name pattern (`TOOL_<UPPER>_ENABLED`) and are always
 * boolean — they're handled as a class so adding a new tool doesn't require
 * editing this switch.
 */
export const clampBareValue = (name: FlagName, raw: unknown): FlagValue | null => {
  if (TOOL_FLAG_PATTERN.test(name)) {
    return typeof raw === 'boolean' ? raw : null;
  }
  switch (name as keyof CoreFlagSchema) {
    case 'STREAMING_ENABLED':
    case 'AI_TOOLS_ENABLED':
    case 'CHAT_HISTORY_ENABLED':
    case 'COMPLETION_ENABLED':
      return typeof raw === 'boolean' ? raw : null;
    case 'PAGINATION_LIMIT':
      if (typeof raw === 'number' && Number.isInteger(raw)) {
        return Math.min(PAGINATION_MAX, Math.max(PAGINATION_MIN, raw));
      }
      return null;
    case 'RATE_LIMIT_PER_MINUTE':
      if (typeof raw === 'number' && raw > 0) {
        return Math.floor(raw);
      }
      return null;
  }
};

export const parseRules = (
  name: FlagName,
  raw: unknown[],
  logger: Logger,
): FlagRule<FlagValue>[] => {
  const out: FlagRule<FlagValue>[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const rule = entry as { if?: unknown; value?: unknown };
    if (typeof rule.if !== 'object' || rule.if === null) continue;
    const value = clampBareValue(name, rule.value);
    if (value === null) {
      logger.pino.warn({ flag: name }, 'feature_flags_file_invalid_rule_value');
      continue;
    }
    out.push({ if: rule.if as Partial<FlagContext>, value });
  }
  return out;
};

export const parseDefinition = (
  name: FlagName,
  raw: unknown,
  logger: Logger,
): FlagDefinition<FlagValue> | null => {
  if (typeof raw === 'boolean' || typeof raw === 'number') {
    const clamped = clampBareValue(name, raw);
    if (clamped === null) return null;
    return { default: clamped };
  }
  if (typeof raw !== 'object' || raw === null) {
    logger.pino.warn({ flag: name }, 'feature_flags_file_invalid_definition');
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const defaultValue = clampBareValue(name, obj.default);
  if (defaultValue === null) {
    logger.pino.warn({ flag: name }, 'feature_flags_file_invalid_definition');
    return null;
  }
  const definition: FlagDefinition<FlagValue> = { default: defaultValue };

  if (Array.isArray(obj.rules)) {
    const rules = parseRules(name, obj.rules, logger);
    if (rules.length > 0) definition.rules = rules;
  }
  if (typeof defaultValue === 'boolean' && typeof obj.percentage === 'number') {
    const pct = obj.percentage;
    if (Number.isFinite(pct) && pct >= PERCENTAGE_MIN && pct <= PERCENTAGE_MAX) {
      definition.percentage = Math.floor(pct);
    } else {
      logger.pino.warn({ flag: name, percentage: pct }, 'feature_flags_file_invalid_percentage');
    }
  }
  return definition;
};

export const parseDefinitions = (
  input: Record<string, unknown>,
  logger: Logger,
): Partial<FlagDefinitions> => {
  const out: Partial<FlagDefinitions> = {};
  for (const key of FLAG_NAMES) {
    const raw = input[key];
    if (raw === undefined) continue;
    const definition = parseDefinition(key, raw, logger);
    if (definition) {
      (out as Record<FlagName, FlagDefinition<FlagValue>>)[key] = definition;
    }
  }
  return out;
};

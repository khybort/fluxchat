import { existsSync, readFileSync } from 'node:fs';

import { bucketFor } from './bucket.js';
import type {
  FeatureFlagSchema,
  FlagContext,
  FlagDefinition,
  FlagName,
  FlagRule,
  FlagValue,
} from './feature-flag.types.js';
import { FLAG_DEFAULTS } from './flag-defaults.js';
import { type IFlagOverrideStore, InMemoryFlagOverrideStore } from './override-store.js';
import { Config } from '../../config/config.js';
import { Logger } from '../../infrastructure/logger/logger.js';

type FlagDefinitions = Record<FlagName, FlagDefinition<FlagValue>>;

/**
 * FeatureFlagService — singleton, hot-reloadable, context-aware.
 *
 * Sources, in priority order (CLAUDE.md §12):
 *   1. DB overrides (admin UI) — merged in by {@link reload} after Prisma connects.
 *   2. JSON file at FEATURE_FLAGS_FILE — accepts both bare primitives
 *      (`{ "X": true }`) and the rich `{ default, rules?, percentage? }` form.
 *   3. Code defaults from {@link FLAG_DEFAULTS} — already in rich form, with
 *      role-aware rules baked in.
 *
 * Evaluation order for `get(name, ctx?)`:
 *   1. Walk `rules` in declaration order; first matching rule wins.
 *   2. If `percentage` is set AND value-type is boolean AND `ctx.userId` is
 *      present, bucket the user via stable hash and compare to `percentage`.
 *   3. Otherwise return `default`.
 *
 * Any throw inside evaluation is caught and the default is returned — flag
 * service must never crash a request path.
 */
export class FeatureFlagService {
  private static instance: FeatureFlagService | null = null;

  private flags: FlagDefinitions;
  private readonly defaults: FlagDefinitions;
  private readonly filePath: string | undefined;
  private readonly logger: Logger;
  private overrideStore: IFlagOverrideStore = new InMemoryFlagOverrideStore();

  private constructor(filePath: string | undefined, logger: Logger) {
    this.logger = logger;
    this.defaults = FLAG_DEFAULTS;
    this.filePath = filePath;
    this.flags = this.loadStaticSources();
  }

  public static getInstance(): FeatureFlagService {
    if (!FeatureFlagService.instance) {
      FeatureFlagService.instance = new FeatureFlagService(
        Config.getInstance().values.featureFlagsFile,
        Logger.getInstance(),
      );
    }
    return FeatureFlagService.instance;
  }

  /** Test-only. */
  public static resetForTesting(): void {
    FeatureFlagService.instance = null;
  }

  /**
   * DI hook — the composition root injects the production Prisma-backed store
   * after Prisma connects. Tests can swap in their own store. Call this BEFORE
   * the first {@link reload} so DB overrides land in the initial state.
   */
  public configureOverrideStore(store: IFlagOverrideStore): void {
    this.overrideStore = store;
  }

  /**
   * Evaluate a flag. With no `ctx`, behavior matches the original signature —
   * rules and percentage that depend on user/client fields fall through to
   * the default, which is what `/healthz` and other context-free callers want.
   */
  public get<K extends FlagName>(name: K, ctx?: FlagContext): FeatureFlagSchema[K] {
    const definition = this.flags[name] as FlagDefinition<FeatureFlagSchema[K]>;
    try {
      return evaluate(name, definition, ctx);
    } catch (err) {
      this.logger.pino.error({ err, flag: name }, 'feature_flag_eval_failed');
      return definition.default;
    }
  }

  /**
   * Test/admin override. Replaces the entire definition for `name` with a
   * bare-default form so subsequent `get()` calls see exactly `value` no
   * matter the context.
   */
  public set<K extends FlagName>(name: K, value: FeatureFlagSchema[K]): void {
    this.flags = { ...this.flags, [name]: { default: value } };
  }

  /**
   * Re-read all sources (env + JSON file + DB overrides). Call on SIGHUP, on
   * boot once Prisma has connected, and after admin UI edits land. Async
   * because DB lookups are async; the SIGHUP handler / admin endpoint should
   * `await` it (or `.catch` and log).
   */
  public async reload(): Promise<void> {
    const previous = this.flags;
    const fromFile = this.readFile();
    let fromDb: Partial<FlagDefinitions> = {};
    try {
      const dbRows = await this.overrideStore.loadAll();
      fromDb = this.parseDefinitions(dbRows);
    } catch (err) {
      this.logger.pino.error({ err }, 'feature_flag_db_overrides_failed');
    }
    this.flags = { ...this.defaults, ...fromFile, ...fromDb };

    const changed: Partial<FeatureFlagSchema> = {};
    for (const key of Object.keys(this.flags) as FlagName[]) {
      const before = previous[key]?.default;
      const after = this.flags[key].default;
      if (before !== after) {
        (changed as Record<string, unknown>)[key] = after;
      }
    }
    if (Object.keys(changed).length > 0) {
      this.logger.pino.info({ changed }, 'feature_flags_reloaded');
    }
  }

  /**
   * Public, context-free snapshot of the evaluated default values. This is
   * what `/healthz` returns — a frontend reading it learns the *baseline*,
   * not the rule structure (rules live behind the admin endpoint).
   */
  public snapshot(): FeatureFlagSchema {
    const out = {} as FeatureFlagSchema;
    for (const key of Object.keys(this.flags) as FlagName[]) {
      (out as Record<FlagName, FlagValue>)[key] = this.flags[key].default;
    }
    return out;
  }

  /** Admin-only. Returns the full rich form for ops/dashboard surfaces. */
  public definitions(): FlagDefinitions {
    // Defensive copy so callers can't mutate internal state.
    return JSON.parse(JSON.stringify(this.flags)) as FlagDefinitions;
  }

  /**
   * Admin-only. Persists a new definition for `name` in the override store
   * and triggers a reload so all subsequent `get()` calls see the new value.
   * Throws if the definition fails parsing — controller maps that to 400.
   */
  public async setOverride(name: FlagName, raw: unknown, updatedBy: string): Promise<void> {
    // Validate up front so we never persist garbage.
    const parsed = this.parseDefinition(name, raw);
    if (!parsed) {
      throw new Error('Invalid flag definition');
    }
    await this.overrideStore.upsert(name, raw, updatedBy);
    await this.reload();
  }

  /** Admin-only. Removes the override for `name` (falls back to file/env). */
  public async clearOverride(name: FlagName): Promise<void> {
    await this.overrideStore.remove(name);
    await this.reload();
  }

  /**
   * Synchronous bootstrap path — env defaults + JSON file. DB overrides are
   * merged in by {@link reload} once the override store is configured.
   * Constructor uses this so `getInstance()` stays sync (no top-level await).
   */
  private loadStaticSources(): FlagDefinitions {
    const fromFile = this.readFile();
    return { ...this.defaults, ...fromFile };
  }

  private readFile(): Partial<FlagDefinitions> {
    if (!this.filePath) return {};
    if (!existsSync(this.filePath)) {
      this.logger.pino.warn({ path: this.filePath }, 'feature_flags_file_missing');
      return {};
    }
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== 'object' || parsed === null) return {};
      return this.parseDefinitions(parsed as Record<string, unknown>);
    } catch (error) {
      this.logger.pino.error({ err: error, path: this.filePath }, 'feature_flags_file_read_failed');
      return {};
    }
  }

  private parseDefinitions(input: Record<string, unknown>): Partial<FlagDefinitions> {
    const out: Partial<FlagDefinitions> = {};
    for (const key of FLAG_NAMES) {
      const raw = input[key];
      if (raw === undefined) continue;
      const definition = this.parseDefinition(key, raw);
      if (definition) {
        (out as Record<FlagName, FlagDefinition<FlagValue>>)[key] = definition;
      }
    }
    return out;
  }

  private parseDefinition(name: FlagName, raw: unknown): FlagDefinition<FlagValue> | null {
    // Bare primitive — wrap as { default: v } after running the same
    // clamping rules the env-default path uses.
    if (typeof raw === 'boolean' || typeof raw === 'number') {
      const clamped = clampBareValue(name, raw);
      if (clamped === null) return null;
      return { default: clamped };
    }
    if (typeof raw !== 'object' || raw === null) {
      this.logger.pino.warn({ flag: name }, 'feature_flags_file_invalid_definition');
      return null;
    }
    const obj = raw as Record<string, unknown>;
    const defaultValue = clampBareValue(name, obj.default);
    if (defaultValue === null) {
      this.logger.pino.warn({ flag: name }, 'feature_flags_file_invalid_definition');
      return null;
    }
    const definition: FlagDefinition<FlagValue> = { default: defaultValue };

    if (Array.isArray(obj.rules)) {
      const rules = parseRules(name, obj.rules, this.logger);
      if (rules.length > 0) definition.rules = rules;
    }
    if (typeof defaultValue === 'boolean' && typeof obj.percentage === 'number') {
      const pct = obj.percentage;
      if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
        definition.percentage = Math.floor(pct);
      } else {
        this.logger.pino.warn(
          { flag: name, percentage: pct },
          'feature_flags_file_invalid_percentage',
        );
      }
    }
    return definition;
  }
}

const FLAG_NAMES = Object.keys(FLAG_DEFAULTS) as readonly FlagName[];

/**
 * Apply the per-flag bounds the original `coerce()` enforced. Returns null
 * when the value is the wrong shape for the flag (caller treats null as
 * "skip this entry, keep env default").
 */
const clampBareValue = (name: FlagName, raw: unknown): FlagValue | null => {
  switch (name) {
    case 'STREAMING_ENABLED':
    case 'AI_TOOLS_ENABLED':
    case 'CHAT_HISTORY_ENABLED':
    case 'COMPLETION_ENABLED':
    case 'TOOL_CALCULATOR_ENABLED':
    case 'TOOL_CURRENT_TIME_ENABLED':
    case 'TOOL_CURRENT_WEATHER_ENABLED':
    case 'TOOL_CONVERT_CURRENCY_ENABLED':
    case 'TOOL_SEARCH_WEB_ENABLED':
      return typeof raw === 'boolean' ? raw : null;
    case 'PAGINATION_LIMIT':
      if (typeof raw === 'number' && Number.isInteger(raw)) {
        return Math.min(100, Math.max(10, raw));
      }
      return null;
    case 'RATE_LIMIT_PER_MINUTE':
      if (typeof raw === 'number' && raw > 0) {
        return Math.floor(raw);
      }
      return null;
  }
};

const parseRules = (name: FlagName, raw: unknown[], logger: Logger): FlagRule<FlagValue>[] => {
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

/**
 * Pure evaluator. Lives outside the class so it's easy to test in isolation
 * and so the class doesn't need to thread `this` through every branch.
 */
const evaluate = <V extends FlagValue>(
  name: FlagName,
  definition: FlagDefinition<V>,
  ctx: FlagContext | undefined,
): V => {
  if (ctx && definition.rules) {
    for (const rule of definition.rules) {
      if (matchesRule(rule.if, ctx)) {
        return rule.value;
      }
    }
  }
  if (
    typeof definition.percentage === 'number' &&
    typeof definition.default === 'boolean' &&
    ctx?.userId
  ) {
    const inBucket = bucketFor(name, ctx.userId) < definition.percentage;
    return inBucket as V;
  }
  return definition.default;
};

const matchesRule = (predicate: Partial<FlagContext>, ctx: FlagContext): boolean => {
  for (const key of Object.keys(predicate) as (keyof FlagContext)[]) {
    if (predicate[key] !== ctx[key]) return false;
  }
  return true;
};

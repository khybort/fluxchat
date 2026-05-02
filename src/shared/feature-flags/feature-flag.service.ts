import { existsSync, readFileSync } from 'node:fs';

import { evaluateFlag } from './feature-flag.evaluator.js';
import { type FlagDefinitions, parseDefinition, parseDefinitions } from './feature-flag.parser.js';
import type {
  FeatureFlagSnapshot,
  FlagContext,
  FlagDefinition,
  FlagName,
  FlagValue,
  FlagValueFor,
} from './feature-flag.types.js';
import { FLAG_DEFAULTS } from './flag-defaults.js';
import { type IFlagOverrideStore, InMemoryFlagOverrideStore } from './override-store.js';
import { Config } from '../../config/config.js';
import { Logger } from '../../infrastructure/logger/logger.js';
import { ValidationError } from '../errors/app-error.js';

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
 * Parsing + evaluation live in feature-flag.parser.ts and feature-flag.evaluator.ts —
 * the service orchestrates loading + caching + reload, and any throw inside
 * evaluation is caught and the default returned (flag service must never crash
 * a request path).
 */
export class FeatureFlagService {
  private static instance: FeatureFlagService | null = null;

  private flags: FlagDefinitions;
  private readonly defaults: FlagDefinitions;
  private readonly filePath: string | undefined;
  private readonly logger: Logger;
  private overrideStore: IFlagOverrideStore = new InMemoryFlagOverrideStore();
  /**
   * Names of flags that have a row in the DB override store. Distinct from
   * "has rules" — code defaults can also carry rules (e.g. role-aware
   * admin overrides in FLAG_DEFAULTS), so the UI needs this to tell apart
   * baked-in behaviour from admin-edited customisation.
   */
  private overriddenNamesSet: Set<FlagName> = new Set();

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
   *
   * Throws if the flag is unknown — `FLAG_DEFAULTS` (core) plus the tool
   * registry (per-tool) form the closed catalog of valid names. An unknown
   * name means the caller refers to a flag that was never registered, which
   * is a programmer error worth surfacing.
   */
  public get<K extends FlagName>(name: K, ctx?: FlagContext): FlagValueFor<K> {
    const definition = this.flags[name] as unknown as FlagDefinition<FlagValueFor<K>> | undefined;
    if (!definition) {
      throw new Error(`Unknown feature flag: ${name}`);
    }
    try {
      return evaluateFlag(name, definition, ctx);
    } catch (err: unknown) {
      this.logger.pino.error({ err, flag: name }, 'feature_flag_eval_failed');
      return definition.default;
    }
  }

  /**
   * Test/admin override. Replaces the entire definition for `name` with a
   * bare-default form so subsequent `get()` calls see exactly `value` no
   * matter the context.
   */
  public set<K extends FlagName>(name: K, value: FlagValueFor<K>): void {
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
    let dbKeys: string[] = [];
    try {
      const dbRows = await this.overrideStore.loadAll();
      dbKeys = Object.keys(dbRows);
      fromDb = parseDefinitions(dbRows, this.logger);
    } catch (err: unknown) {
      this.logger.pino.error({ err }, 'feature_flag_db_overrides_failed');
    }
    this.flags = { ...this.defaults, ...fromFile, ...fromDb } as FlagDefinitions;
    this.overriddenNamesSet = new Set(dbKeys.filter((k) => k in this.flags) as FlagName[]);

    const changed: Record<string, FlagValue> = {};
    for (const key of Object.keys(this.flags) as FlagName[]) {
      const before = previous[key]?.default;
      const after = this.flags[key]?.default;
      if (after !== undefined && before !== after) {
        changed[key] = after;
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
  public snapshot(): FeatureFlagSnapshot {
    const out: Record<string, FlagValue> = {};
    for (const key of Object.keys(this.flags) as FlagName[]) {
      const def = this.flags[key];
      if (def !== undefined) out[key] = def.default;
    }
    return out as FeatureFlagSnapshot;
  }

  /** Admin-only. Returns the full rich form for ops/dashboard surfaces. */
  public definitions(): FlagDefinitions {
    // Defensive copy so callers can't mutate internal state. structuredClone
    // is faster than JSON round-trip and handles non-JSON-safe values cleanly.
    return structuredClone(this.flags);
  }

  /**
   * Admin-only. Names of flags that currently have a DB override row. The
   * admin UI uses this to render the "customised" badge — distinct from
   * "definition has rules" because code defaults can ship rules too.
   */
  public overriddenNames(): FlagName[] {
    return Array.from(this.overriddenNamesSet);
  }

  /**
   * Admin-only. Persists a new definition for `name` in the override store
   * and triggers a reload so all subsequent `get()` calls see the new value.
   * Throws if the definition fails parsing — controller maps that to 400.
   */
  public async setOverride(name: FlagName, raw: unknown, updatedBy: string): Promise<void> {
    const parsed = parseDefinition(name, raw, this.logger);
    if (!parsed) {
      throw new ValidationError({ flag: name, raw }, 'Invalid flag definition');
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
   * Admin-only. Wipes every override row so all flags fall back to their
   * file/env/code defaults. Useful as an emergency "kill all customisations"
   * lever — single endpoint instead of N per-flag deletes.
   */
  public async clearAllOverrides(): Promise<void> {
    await this.overrideStore.removeAll();
    await this.reload();
  }

  /**
   * Synchronous bootstrap path — env defaults + JSON file. DB overrides are
   * merged in by {@link reload} once the override store is configured.
   * Constructor uses this so `getInstance()` stays sync (no top-level await).
   */
  private loadStaticSources(): FlagDefinitions {
    const fromFile = this.readFile();
    return { ...this.defaults, ...fromFile } as FlagDefinitions;
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
      return parseDefinitions(parsed as Record<string, unknown>, this.logger);
    } catch (error: unknown) {
      this.logger.pino.error({ err: error, path: this.filePath }, 'feature_flags_file_read_failed');
      return {};
    }
  }
}

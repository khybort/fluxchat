import { existsSync, readFileSync } from 'node:fs';

import type { FeatureFlagSchema, FlagName } from './feature-flag.types.js';
import { Config } from '../../config/config.js';
import { Logger } from '../../infrastructure/logger/logger.js';

/**
 * FeatureFlagService — singleton, hot-reloadable.
 *
 * Sources, in priority order (CLAUDE.md §12):
 *   1. JSON file at FEATURE_FLAGS_FILE (live-reloadable on SIGHUP)
 *   2. Environment variables parsed into Config.featureFlagDefaults
 *   3. Code defaults (the registry below)
 */
export class FeatureFlagService {
  private static instance: FeatureFlagService | null = null;

  private flags: FeatureFlagSchema;
  private readonly defaults: FeatureFlagSchema;
  private readonly filePath: string | undefined;
  private readonly logger: Logger;

  private constructor(config: Config, logger: Logger) {
    this.logger = logger;
    this.defaults = { ...config.values.featureFlagDefaults };
    this.filePath = config.values.featureFlagsFile;
    this.flags = this.load();
  }

  public static getInstance(): FeatureFlagService {
    if (!FeatureFlagService.instance) {
      FeatureFlagService.instance = new FeatureFlagService(
        Config.getInstance(),
        Logger.getInstance(),
      );
    }
    return FeatureFlagService.instance;
  }

  /** Test-only. */
  public static resetForTesting(): void {
    FeatureFlagService.instance = null;
  }

  public get<K extends FlagName>(name: K): FeatureFlagSchema[K] {
    return this.flags[name];
  }

  /** Test/admin only. */
  public set<K extends FlagName>(name: K, value: FeatureFlagSchema[K]): void {
    this.flags = { ...this.flags, [name]: value };
  }

  /** Re-read sources. Call on SIGHUP for zero-redeploy flag updates. */
  public reload(): void {
    const previous = this.flags;
    this.flags = this.load();
    const changed: Partial<FeatureFlagSchema> = {};
    for (const key of Object.keys(this.flags) as FlagName[]) {
      if (previous[key] !== this.flags[key]) {
        (changed as Record<string, unknown>)[key] = this.flags[key];
      }
    }
    if (Object.keys(changed).length > 0) {
      this.logger.pino.info({ changed }, 'feature_flags_reloaded');
    }
  }

  public snapshot(): FeatureFlagSchema {
    return { ...this.flags };
  }

  private load(): FeatureFlagSchema {
    const fromFile = this.readFile();
    return { ...this.defaults, ...fromFile };
  }

  private readFile(): Partial<FeatureFlagSchema> {
    if (!this.filePath) return {};
    if (!existsSync(this.filePath)) {
      this.logger.pino.warn({ path: this.filePath }, 'feature_flags_file_missing');
      return {};
    }
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== 'object' || parsed === null) return {};
      return this.coerce(parsed as Record<string, unknown>);
    } catch (error) {
      this.logger.pino.error({ err: error, path: this.filePath }, 'feature_flags_file_read_failed');
      return {};
    }
  }

  private coerce(input: Record<string, unknown>): Partial<FeatureFlagSchema> {
    const out: Partial<FeatureFlagSchema> = {};
    if (typeof input.STREAMING_ENABLED === 'boolean')
      out.STREAMING_ENABLED = input.STREAMING_ENABLED;
    if (typeof input.AI_TOOLS_ENABLED === 'boolean') out.AI_TOOLS_ENABLED = input.AI_TOOLS_ENABLED;
    if (typeof input.CHAT_HISTORY_ENABLED === 'boolean')
      out.CHAT_HISTORY_ENABLED = input.CHAT_HISTORY_ENABLED;
    if (typeof input.PAGINATION_LIMIT === 'number' && Number.isInteger(input.PAGINATION_LIMIT)) {
      out.PAGINATION_LIMIT = Math.min(100, Math.max(10, input.PAGINATION_LIMIT));
    }
    if (typeof input.RATE_LIMIT_PER_MINUTE === 'number' && input.RATE_LIMIT_PER_MINUTE > 0) {
      out.RATE_LIMIT_PER_MINUTE = Math.floor(input.RATE_LIMIT_PER_MINUTE);
    }
    return out;
  }
}

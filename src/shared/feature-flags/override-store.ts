/**
 * Pluggable persistence layer for admin-edited flag overrides.
 *
 * Two implementations ship today:
 *   - InMemoryFlagOverrideStore — used in tests + as a no-op default.
 *   - PrismaFlagOverrideStore (in src/infrastructure/feature-flags/) —
 *     production adapter, persists rows in the `feature_flag_overrides` table.
 *
 * The store is consulted by FeatureFlagService.reload(): rows here win over
 * the JSON file (which itself wins over env defaults), so a UI edit beats a
 * static deploy artifact.
 */
export interface IFlagOverrideStore {
  /**
   * Returns every override row keyed by flag name. Values are the raw
   * `definition` JSON — FeatureFlagService.parseDefinition normalizes them.
   */
  loadAll(): Promise<Record<string, unknown>>;

  /**
   * Upsert one override. `updatedBy` is recorded for audit; pass the
   * authenticated admin user's id.
   */
  upsert(name: string, definition: unknown, updatedBy: string): Promise<void>;

  /** Delete an override (the flag falls back to file/env defaults). */
  remove(name: string): Promise<void>;

  /** Delete every override row. Used by the admin "Clear all" action. */
  removeAll(): Promise<void>;
}

/**
 * No-op default. Used in tests and at boot before the DI container has wired
 * a real store. Keeps FeatureFlagService working when the DB is unreachable
 * or not yet connected.
 */
export class InMemoryFlagOverrideStore implements IFlagOverrideStore {
  private readonly rows = new Map<string, unknown>();

  public async loadAll(): Promise<Record<string, unknown>> {
    return Object.fromEntries(this.rows.entries());
  }

  public async upsert(name: string, definition: unknown, _updatedBy: string): Promise<void> {
    this.rows.set(name, definition);
  }

  public async remove(name: string): Promise<void> {
    this.rows.delete(name);
  }

  public async removeAll(): Promise<void> {
    this.rows.clear();
  }
}

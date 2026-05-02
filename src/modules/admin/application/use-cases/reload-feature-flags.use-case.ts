import type { FeatureFlagService } from '../../../../shared/feature-flags/feature-flag.service.js';
import type { FeatureFlagSnapshot } from '../../../../shared/feature-flags/feature-flag.types.js';
import type { IUseCase } from '../../../../shared/use-case/use-case.interface.js';

export interface ReloadFeatureFlagsOutput {
  status: 'reloaded';
  snapshot: FeatureFlagSnapshot;
}

/**
 * Re-read every flag source (env + file + DB overrides). Triggered by the
 * admin UI's "reload" button — useful when a JSON file edit happened
 * out-of-band and the operator wants the diff to apply now.
 */
export class ReloadFeatureFlagsUseCase implements IUseCase<void, ReloadFeatureFlagsOutput> {
  constructor(private readonly flags: FeatureFlagService) {}

  public async execute(): Promise<ReloadFeatureFlagsOutput> {
    await this.flags.reload();
    return {
      status: 'reloaded',
      snapshot: this.flags.snapshot(),
    };
  }
}

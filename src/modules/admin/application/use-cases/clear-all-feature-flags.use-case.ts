import type { ListFeatureFlagsOutput } from './list-feature-flags.use-case.js';
import type { FeatureFlagService } from '../../../../shared/feature-flags/feature-flag.service.js';
import type { IUseCase } from '../../../../shared/use-case/use-case.interface.js';

/**
 * Drop every flag override at once. Returns the updated catalog so the admin
 * UI can re-render without a follow-up GET. Mirrors {@link
 * import('./clear-feature-flag.use-case.js').ClearFeatureFlagUseCase} but
 * targets all rows in one call.
 */
export class ClearAllFeatureFlagsUseCase implements IUseCase<void, ListFeatureFlagsOutput> {
  constructor(private readonly flags: FeatureFlagService) {}

  public async execute(): Promise<ListFeatureFlagsOutput> {
    await this.flags.clearAllOverrides();
    return {
      definitions: this.flags.definitions(),
      snapshot: this.flags.snapshot(),
      overriddenNames: this.flags.overriddenNames(),
    };
  }
}

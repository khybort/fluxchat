import type { ListFeatureFlagsOutput } from './list-feature-flags.use-case.js';
import type { FeatureFlagService } from '../../../../shared/feature-flags/feature-flag.service.js';
import type { FlagName } from '../../../../shared/feature-flags/feature-flag.types.js';
import type { IUseCase } from '../../../../shared/use-case/use-case.interface.js';

export interface ClearFeatureFlagInput {
  name: FlagName;
}

/**
 * Drop the override for a flag, falling back to file/env/code defaults.
 * Returns the updated catalog for the admin UI to re-render.
 */
export class ClearFeatureFlagUseCase implements IUseCase<
  ClearFeatureFlagInput,
  ListFeatureFlagsOutput
> {
  constructor(private readonly flags: FeatureFlagService) {}

  public async execute(input: ClearFeatureFlagInput): Promise<ListFeatureFlagsOutput> {
    await this.flags.clearOverride(input.name);
    return {
      definitions: this.flags.definitions(),
      snapshot: this.flags.snapshot(),
      overriddenNames: this.flags.overriddenNames(),
    };
  }
}

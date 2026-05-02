import type { ListFeatureFlagsOutput } from './list-feature-flags.use-case.js';
import { ValidationError } from '../../../../shared/errors/app-error.js';
import type { FeatureFlagService } from '../../../../shared/feature-flags/feature-flag.service.js';
import type { FlagName } from '../../../../shared/feature-flags/feature-flag.types.js';
import type { IUseCase } from '../../../../shared/use-case/use-case.interface.js';

export interface UpdateFeatureFlagInput {
  name: FlagName;
  /** Rich-form definition body — feature-flag.parser validates it. */
  definition: unknown;
  /** User id of the admin making the change (audit trail). */
  updatedBy: string;
}

/**
 * Persist a new override for a flag, then re-read all sources so subsequent
 * `flags.get()` calls see the change. Wraps the service throw so the controller
 * gets a typed `ValidationError` (→ 400) instead of a raw Error (→ 500).
 */
export class UpdateFeatureFlagUseCase implements IUseCase<
  UpdateFeatureFlagInput,
  ListFeatureFlagsOutput
> {
  constructor(private readonly flags: FeatureFlagService) {}

  public async execute(input: UpdateFeatureFlagInput): Promise<ListFeatureFlagsOutput> {
    try {
      await this.flags.setOverride(input.name, input.definition, input.updatedBy);
    } catch (error: unknown) {
      if (error instanceof ValidationError) throw error;
      throw new ValidationError(error instanceof Error ? error.message : 'Invalid flag definition');
    }
    return {
      definitions: this.flags.definitions(),
      snapshot: this.flags.snapshot(),
    };
  }
}

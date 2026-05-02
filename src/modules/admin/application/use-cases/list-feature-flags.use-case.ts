import type { FeatureFlagService } from '../../../../shared/feature-flags/feature-flag.service.js';
import type {
  FeatureFlagSnapshot,
  FlagDefinition,
  FlagValue,
} from '../../../../shared/feature-flags/feature-flag.types.js';
import type { IUseCase } from '../../../../shared/use-case/use-case.interface.js';

export interface ListFeatureFlagsOutput {
  definitions: Record<string, FlagDefinition<FlagValue>>;
  snapshot: FeatureFlagSnapshot;
}

/**
 * Admin-only catalog read: definitions (rich form with rules + percentage)
 * + snapshot (evaluated default per flag). Powers the admin dashboard's
 * flag-table view.
 */
export class ListFeatureFlagsUseCase implements IUseCase<void, ListFeatureFlagsOutput> {
  constructor(private readonly flags: FeatureFlagService) {}

  public async execute(): Promise<ListFeatureFlagsOutput> {
    return {
      definitions: this.flags.definitions(),
      snapshot: this.flags.snapshot(),
    };
  }
}

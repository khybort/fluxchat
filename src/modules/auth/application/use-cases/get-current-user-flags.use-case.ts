import type { FeatureFlagService } from '../../../../shared/feature-flags/feature-flag.service.js';
import type {
  FeatureFlagSnapshot,
  FlagContext,
  FlagName,
  FlagValue,
} from '../../../../shared/feature-flags/feature-flag.types.js';
import type { IUseCase } from '../../../../shared/use-case/use-case.interface.js';

export interface GetCurrentUserFlagsOutput {
  flags: FeatureFlagSnapshot;
}

/**
 * Evaluate every registered flag against the caller's context and return
 * the result as a snapshot. Differs from `FeatureFlagService.snapshot()` —
 * which returns code/file defaults — by applying rules + percentage
 * bucketing for the requesting user. The frontend uses this so per-user
 * overrides drive UI gating, not just server-side gates.
 */
export class GetCurrentUserFlagsUseCase implements IUseCase<
  FlagContext,
  GetCurrentUserFlagsOutput
> {
  constructor(private readonly flags: FeatureFlagService) {}

  public async execute(input: FlagContext): Promise<GetCurrentUserFlagsOutput> {
    const definitions = this.flags.definitions();
    const out: Record<string, FlagValue> = {};
    for (const key of Object.keys(definitions) as FlagName[]) {
      out[key] = this.flags.get(key, input);
    }
    return { flags: out as FeatureFlagSnapshot };
  }
}

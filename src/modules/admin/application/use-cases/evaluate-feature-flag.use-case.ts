import type { FeatureFlagService } from '../../../../shared/feature-flags/feature-flag.service.js';
import type {
  FlagContext,
  FlagName,
  FlagValue,
} from '../../../../shared/feature-flags/feature-flag.types.js';
import type { IUseCase } from '../../../../shared/use-case/use-case.interface.js';

export interface EvaluateFeatureFlagInput {
  name: FlagName;
  context: FlagContext;
}

export interface EvaluateFeatureFlagOutput {
  value: FlagValue;
}

/**
 * "What value would this flag return for this fake user?" — admin UI uses
 * this to preview rule + percentage outcomes without polluting real traffic.
 * Server-side eval keeps a single source of truth (no JS re-implementation
 * of the bucket hash on the client).
 */
export class EvaluateFeatureFlagUseCase implements IUseCase<
  EvaluateFeatureFlagInput,
  EvaluateFeatureFlagOutput
> {
  constructor(private readonly flags: FeatureFlagService) {}

  public async execute(input: EvaluateFeatureFlagInput): Promise<EvaluateFeatureFlagOutput> {
    const value = this.flags.get(input.name, input.context);
    return { value };
  }
}

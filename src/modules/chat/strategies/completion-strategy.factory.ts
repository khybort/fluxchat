import type { ICompletionStrategy } from './completion.strategy.js';
import { JsonCompletionStrategy } from './json-completion.strategy.js';
import { StreamingCompletionStrategy } from './streaming-completion.strategy.js';
import type { IAiProvider } from '../../../infrastructure/ai/ai.provider.js';
import type { FeatureFlagService } from '../../../shared/feature-flags/feature-flag.service.js';

/**
 * Picks a strategy based on the STREAMING_ENABLED flag (CLAUDE.md §7.5).
 * The `signal` is required by the streaming branch to support client cancellation.
 */
export class CompletionStrategyFactory {
  constructor(
    private readonly ai: IAiProvider,
    private readonly flags: FeatureFlagService,
  ) {}

  public build(signal: AbortSignal): ICompletionStrategy {
    return this.flags.get('STREAMING_ENABLED')
      ? new StreamingCompletionStrategy(this.ai, this.flags, signal)
      : new JsonCompletionStrategy(this.ai, this.flags);
  }
}

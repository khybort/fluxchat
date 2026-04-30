import type { ICompletionStrategy } from './completion.strategy.js';
import { JsonCompletionStrategy } from './json-completion.strategy.js';
import { StreamingCompletionStrategy } from './streaming-completion.strategy.js';
import type { IAiProvider } from '../../../infrastructure/ai/ai.provider.js';
import type { FeatureFlagService } from '../../../shared/feature-flags/feature-flag.service.js';
import type { FlagContext } from '../../../shared/feature-flags/feature-flag.types.js';

/**
 * Picks a strategy based on the STREAMING_ENABLED flag (CLAUDE.md §7.5).
 * The `signal` is required by the streaming branch to support client cancellation.
 *
 * `ctx` carries the per-request flag-evaluation context (userId/role/client)
 * so rule-targeted rollouts and percentage buckets work end-to-end. The
 * resulting strategy is passed the same context so AI_TOOLS_ENABLED is also
 * evaluated in-context at execute time.
 */
export class CompletionStrategyFactory {
  constructor(
    private readonly ai: IAiProvider,
    private readonly flags: FeatureFlagService,
  ) {}

  public build(signal: AbortSignal, ctx?: FlagContext): ICompletionStrategy {
    return this.flags.get('STREAMING_ENABLED', ctx)
      ? new StreamingCompletionStrategy(this.ai, this.flags, signal, ctx)
      : new JsonCompletionStrategy(this.ai, this.flags, ctx);
  }
}

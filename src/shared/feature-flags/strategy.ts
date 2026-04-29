/**
 * Generic Strategy contract used by feature-flag-driven behavior switching.
 * Concrete strategies live next to their domain (e.g. modules/chat/strategies/).
 *
 * CLAUDE.md §7.5: a flag is never read in a controller or service to switch behavior.
 * Instead, a Factory consults the FeatureFlagService and returns the right Strategy.
 */
export interface IStrategy<TIn, TOut> {
  execute(input: TIn): Promise<TOut> | TOut;
}

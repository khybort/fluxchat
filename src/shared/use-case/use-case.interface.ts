/**
 * Application-layer business operation. One use case = one class = one
 * `execute(input): output` — the granular, named application operations
 * that controllers delegate to.
 *
 * Distinct from {@link import('../feature-flags/strategy.js').IStrategy}:
 *   - Strategies are interchangeable algorithms selected at runtime by a
 *     factory (e.g. streaming vs JSON completion driven by a flag).
 *   - Use cases are the application's surface area — one per business
 *     operation, swapped only via DI for testing or alternate adapters.
 *
 * Both have the same shape so a use case CAN be wrapped with a decorator
 * (logging, tracing, retry) the same way a strategy can. We keep them as
 * separate types because mixing the names confuses architectural intent.
 */
export interface IUseCase<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
}

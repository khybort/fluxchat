export interface RateLimitDecision {
  allowed: boolean;
  /** Tokens left in the current window after this consumption. */
  remaining: number;
  /** When `allowed=false`, milliseconds until the bucket refills. */
  retryAfterMs: number;
}

/**
 * Pluggable backend for rate limiting. Production deployments swap
 * the in-memory implementation for Redis to share state across instances.
 */
export interface IRateLimitStore {
  consume(key: string, limit: number, windowMs: number): Promise<RateLimitDecision>;
}

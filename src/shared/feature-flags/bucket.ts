import { createHash } from 'node:crypto';

/**
 * Deterministic 0–99 bucket for `(flagName, subject)`.
 *
 * Same input → same output, always. Different flag names with the same
 * subject land in different buckets, so a user "lucky" enough to be in the
 * 10% rollout for one flag isn't automatically in the 10% rollout for
 * every flag — keeps rollouts statistically independent.
 *
 * Uses sha1 (cheap, well-distributed) + the first 4 bytes as an unsigned
 * 32-bit int, modulo 100. We don't need cryptographic strength here, only
 * a uniform distribution.
 */
export const bucketFor = (flagName: string, subject: string): number => {
  const digest = createHash('sha1').update(`${flagName}:${subject}`).digest();
  return digest.readUInt32BE(0) % 100;
};

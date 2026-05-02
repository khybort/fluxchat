import { bucketFor } from './bucket.js';
import type { FlagContext, FlagDefinition, FlagName, FlagValue } from './feature-flag.types.js';

const matchesRule = (predicate: Partial<FlagContext>, ctx: FlagContext): boolean => {
  for (const key of Object.keys(predicate) as (keyof FlagContext)[]) {
    if (predicate[key] !== ctx[key]) return false;
  }
  return true;
};

/**
 * Pure evaluator. Walks rules in declaration order, then applies the
 * percentage bucket if the flag is boolean and the context carries a userId.
 * Falls through to the default otherwise.
 */
export const evaluateFlag = <V extends FlagValue>(
  name: FlagName,
  definition: FlagDefinition<V>,
  ctx: FlagContext | undefined,
): V => {
  if (ctx && definition.rules) {
    for (const rule of definition.rules) {
      if (matchesRule(rule.if, ctx)) {
        return rule.value;
      }
    }
  }
  if (
    typeof definition.percentage === 'number' &&
    typeof definition.default === 'boolean' &&
    ctx?.userId
  ) {
    const inBucket = bucketFor(name, ctx.userId) < definition.percentage;
    return inBucket as V;
  }
  return definition.default;
};

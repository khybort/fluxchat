import { TOOL_GATE_FLAGS } from './registry.js';
import type { FeatureFlagService } from '../../../shared/feature-flags/feature-flag.service.js';
import type { FlagContext } from '../../../shared/feature-flags/feature-flag.types.js';

/**
 * Read each tool's gate flag against the supplied context and return the
 * names of the tools that should be exposed to the model. Lives outside
 * `registry.ts` to avoid pulling FeatureFlagService into the registry's
 * dependency cone (the registry stays infra-only; flag-aware filtering
 * is a strategy-layer concern).
 */
export const resolveEnabledTools = (flags: FeatureFlagService, ctx?: FlagContext): string[] => {
  const out: string[] = [];
  for (const [toolName, flagName] of Object.entries(TOOL_GATE_FLAGS)) {
    if (flags.get(flagName, ctx)) out.push(toolName);
  }
  return out;
};

import type { RequestHandler } from 'express';

import { FeatureDisabledError } from '../errors/app-error.js';
import { FeatureFlagService } from '../feature-flags/feature-flag.service.js';
import type { FlagName } from '../feature-flags/feature-flag.types.js';

/**
 * Route-specific guard. Returns 404 (not 403) so disabled features
 * are indistinguishable from missing routes — see CLAUDE.md §11/§13.
 */
export const featureFlagGuard = (flag: FlagName): RequestHandler => {
  return (_req, _res, next) => {
    const value = FeatureFlagService.getInstance().get(flag);
    if (value === false) {
      return next(new FeatureDisabledError(flag));
    }
    next();
  };
};

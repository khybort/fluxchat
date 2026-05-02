import type { RequestHandler } from 'express';

import type { Config } from '../../config/config.js';
import { HEADERS } from '../constants.js';
import { AppCheckError } from '../errors/app-error.js';

/**
 * Builds the App Check middleware (CLAUDE.md §11/§15). Real implementation
 * would verify a JWT issued by Firebase; for the case study we compare against
 * a static APP_CHECK_TOKEN. The middleware order is what matters.
 *
 * Closes over the expected token so the hot path stays free of singleton
 * lookups — DI provides the Config to the factory at wire time.
 */
export const buildAppCheckMiddleware = (config: Config): RequestHandler => {
  const expectedToken = config.values.app.appCheckToken;
  return (req, _res, next) => {
    const token = req.header(HEADERS.APP_CHECK);
    if (!token) {
      return next(new AppCheckError('Missing App Check token'));
    }
    if (token !== expectedToken) {
      return next(new AppCheckError('Invalid App Check token'));
    }
    next();
  };
};

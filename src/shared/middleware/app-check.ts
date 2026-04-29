import type { RequestHandler } from 'express';

import { Config } from '../../config/config.js';
import { HEADERS } from '../constants.js';
import { AppCheckError } from '../errors/app-error.js';

/**
 * Mock Firebase App Check (CLAUDE.md §11/§15).
 * Real implementation would verify a JWT issued by Firebase. For the case study
 * we compare against a static APP_CHECK_TOKEN. The middleware order is what matters.
 */
export const appCheckMiddleware: RequestHandler = (req, _res, next) => {
  const token = req.header(HEADERS.APP_CHECK);
  if (!token) {
    return next(new AppCheckError('Missing App Check token'));
  }
  if (token !== Config.getInstance().values.app.appCheckToken) {
    return next(new AppCheckError('Invalid App Check token'));
  }
  next();
};

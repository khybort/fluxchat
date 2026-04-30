import type { RequestHandler } from 'express';

import { CLIENT_TYPES, type ClientType, HEADERS } from '../constants.js';

const isClientType = (value: string): value is ClientType =>
  (CLIENT_TYPES as readonly string[]).includes(value);

export const clientTypeMiddleware: RequestHandler = (req, _res, next) => {
  const raw = req.header(HEADERS.CLIENT_TYPE)?.toLowerCase().trim();
  req.clientType = raw && isClientType(raw) ? raw : 'web';
  // Re-bind the request logger so every downstream log line carries clientType
  // alongside requestId + userId. Cheap (pino child) and turns parse-and-forget
  // into observable multi-client telemetry.
  if (req.log) {
    req.log = req.log.child({ clientType: req.clientType });
  }
  next();
};

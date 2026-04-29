import type { RequestHandler } from 'express';

import { CLIENT_TYPES, type ClientType, HEADERS } from '../constants.js';

const isClientType = (value: string): value is ClientType =>
  (CLIENT_TYPES as readonly string[]).includes(value);

export const clientTypeMiddleware: RequestHandler = (req, _res, next) => {
  const raw = req.header(HEADERS.CLIENT_TYPE)?.toLowerCase().trim();
  req.clientType = raw && isClientType(raw) ? raw : 'web';
  next();
};

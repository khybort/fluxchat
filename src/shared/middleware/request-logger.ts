import type { RequestHandler } from 'express';
import { v4 as uuid } from 'uuid';

import { Logger } from '../../infrastructure/logger/logger.js';
import { HEADERS } from '../constants.js';

export const requestLoggerMiddleware: RequestHandler = (req, res, next) => {
  const headerId = req.header(HEADERS.REQUEST_ID);
  const requestId = headerId && headerId.length > 0 ? headerId : uuid();

  req.requestId = requestId;
  req.log = Logger.getInstance().child({
    requestId,
    method: req.method,
    path: req.path,
  });

  res.setHeader(HEADERS.REQUEST_ID, requestId);

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    req.log.info(
      { statusCode: res.statusCode, durationMs: Math.round(durationMs) },
      'request_completed',
    );
  });

  next();
};

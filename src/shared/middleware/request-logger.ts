import type { RequestHandler } from 'express';
import { v4 as uuid } from 'uuid';

import { Logger } from '../../infrastructure/logger/logger.js';
import { HEADERS } from '../constants.js';

/**
 * Vercel kills serverless functions at 60 s. Long completions (especially
 * SSE) can run right up to that ceiling, and the cut-off is silent on the
 * client side — we want a log line ahead of the cliff so spike-trends are
 * visible before users start seeing torn streams.
 */
const NEAR_TIMEOUT_MS = 50_000;

export const requestLoggerMiddleware: RequestHandler = (req, res, next) => {
  const headerId = req.header(HEADERS.REQUEST_ID);
  const requestId = headerId && headerId.length > 0 ? headerId : uuid();

  req.requestId = requestId;
  req.log = Logger.getInstance().child({
    requestId,
    method: req.method,
    path: req.path,
    remoteAddress: req.ip,
  });

  res.setHeader(HEADERS.REQUEST_ID, requestId);

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Math.round(Number(process.hrtime.bigint() - start) / 1_000_000);
    if (durationMs >= NEAR_TIMEOUT_MS) {
      req.log.warn({ statusCode: res.statusCode, durationMs }, 'request_near_timeout');
    } else {
      req.log.info({ statusCode: res.statusCode, durationMs }, 'request_completed');
    }
  });

  next();
};

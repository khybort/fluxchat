import { Prisma } from '@prisma/client';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

import { AppError, ConflictError, NotFoundError, ValidationError } from './app-error.js';
import { Config } from '../../config/config.js';

const isProd = (): boolean => Config.getInstance().values.app.nodeEnv === 'production';

const toAppError = (error: unknown): AppError => {
  if (error instanceof AppError) return error;

  if (error instanceof ZodError) {
    return new ValidationError(error.flatten());
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025') return new NotFoundError();
    if (error.code === 'P2002') return new ConflictError('Resource already exists');
  }

  return new AppError(
    'INTERNAL_ERROR',
    500,
    error instanceof Error ? error.message : 'Internal server error',
  );
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const appError = toAppError(error);
  const requestId = req.requestId;
  const log = req.log ?? undefined;

  // 5xx — log full stack. 4xx — info-level.
  if (appError.statusCode >= 500) {
    log?.error({ err: error, code: appError.code, requestId }, 'request_failed');
  } else {
    log?.info(
      { code: appError.code, statusCode: appError.statusCode, requestId },
      'request_rejected',
    );
  }

  // If headers are already sent (e.g. SSE mid-stream), let Express terminate.
  if (res.headersSent) {
    return;
  }

  const body: Record<string, unknown> = {
    error: {
      code: appError.code,
      message: appError.statusCode >= 500 && isProd() ? 'Internal server error' : appError.message,
    },
    requestId,
  };
  if (appError.details !== undefined && appError.statusCode < 500) {
    (body.error as Record<string, unknown>).details = appError.details;
  }
  if (!isProd() && appError.statusCode >= 500 && error instanceof Error) {
    (body.error as Record<string, unknown>).stack = error.stack;
  }

  res.status(appError.statusCode).json(body);
};

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Route not found: ${req.method} ${req.path}` },
    requestId: req.requestId,
  });
};

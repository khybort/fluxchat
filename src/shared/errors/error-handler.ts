import { Anthropic } from '@anthropic-ai/sdk';
import { Prisma } from '@prisma/client';
import { APICallError } from 'ai';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

import {
  AiProviderError,
  AppError,
  ConflictError,
  InternalServerError,
  NotFoundError,
  ValidationError,
} from './app-error.js';
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
    if (error.code === 'P2003') return new ConflictError('Related record does not exist');
  }

  if (error instanceof Anthropic.APIError) {
    return new AiProviderError();
  }

  // Vercel AI SDK (used by Groq + OpenAI providers) wraps every upstream
  // failure in APICallError. Without this branch, those errors fall through
  // to InternalServerError → 500, which is wrong: the failure is upstream,
  // not in our process. The client should see 503 + AI_PROVIDER_ERROR so
  // the FE retry / fallback UX is consistent across all three providers.
  if (APICallError.isInstance(error)) {
    return new AiProviderError(error.message);
  }

  return new InternalServerError(error instanceof Error ? error.message : 'Internal server error');
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
  // Surface 404s in structured logs — masking them hides typo'd routes,
  // broken FE links, and abusive scanners. Info level: not an error per se,
  // but worth correlating against access patterns.
  req.log?.info({ method: req.method, path: req.path }, 'route_not_found');
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Route not found: ${req.method} ${req.path}` },
    requestId: req.requestId,
  });
};

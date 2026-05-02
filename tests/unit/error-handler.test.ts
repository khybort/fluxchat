import { Anthropic } from '@anthropic-ai/sdk';
import { Prisma } from '@prisma/client';
import { APICallError } from 'ai';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { ZodError } from 'zod';
import { z } from 'zod';

import { NotFoundError, ValidationError } from '../../src/shared/errors/app-error.js';
import { errorHandler } from '../../src/shared/errors/error-handler.js';

const buildRes = (): Response => {
  const res: Partial<Response> = {
    headersSent: false,
    status: vi.fn().mockReturnThis() as Response['status'],
    json: vi.fn().mockReturnThis() as Response['json'],
  };
  return res as Response;
};

const buildReq = (): Request => {
  const req: Partial<Request> = {
    requestId: 'req-1',
    log: {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as unknown as Request['log'],
  };
  return req as Request;
};

describe('errorHandler', () => {
  it('maps NotFoundError to 404 with NOT_FOUND code', () => {
    const res = buildRes();
    errorHandler(new NotFoundError('Chat not found'), buildReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'NOT_FOUND', message: 'Chat not found' }),
        requestId: 'req-1',
      }),
    );
  });

  it('maps ValidationError to 400 with details', () => {
    const res = buildRes();
    errorHandler(new ValidationError({ field: 'bad' }), buildReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('maps ZodError to 400 VALIDATION_ERROR', () => {
    const res = buildRes();
    let zodError: ZodError | null = null;
    try {
      z.object({ x: z.number() }).parse({ x: 'no' });
    } catch (e) {
      zodError = e as ZodError;
    }
    errorHandler(zodError, buildReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      }),
    );
  });

  it('maps unknown errors to 500 with INTERNAL_ERROR', () => {
    const res = buildRes();
    errorHandler(new Error('boom'), buildReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('maps Prisma P2025 to 404 NOT_FOUND', () => {
    const res = buildRes();
    const prismaError = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: 'test',
    });
    errorHandler(prismaError, buildReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      }),
    );
  });

  it('maps Prisma P2002 to 409 CONFLICT', () => {
    const res = buildRes();
    const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: 'test',
    });
    errorHandler(prismaError, buildReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'CONFLICT' }),
      }),
    );
  });

  it('maps Prisma P2003 (FK violation) to 409 CONFLICT', () => {
    const res = buildRes();
    const prismaError = new Prisma.PrismaClientKnownRequestError('FK violation', {
      code: 'P2003',
      clientVersion: 'test',
    });
    errorHandler(prismaError, buildReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'CONFLICT' }),
      }),
    );
  });

  it('maps Anthropic.APIError to 503 AI_PROVIDER_ERROR', () => {
    const res = buildRes();
    const apiError = new Anthropic.APIError(
      503,
      { error: { message: 'overloaded' } },
      'overloaded',
      undefined,
    );
    errorHandler(apiError, buildReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'AI_PROVIDER_ERROR' }),
      }),
    );
  });

  it('maps Vercel AI SDK APICallError (Groq/OpenAI path) to 503 AI_PROVIDER_ERROR', () => {
    const res = buildRes();
    const apiCallError = new APICallError({
      message: 'rate limited',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      requestBodyValues: {},
      statusCode: 429,
      responseHeaders: {},
      responseBody: '{"error":"rate_limited"}',
      isRetryable: true,
    });
    errorHandler(apiCallError, buildReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'AI_PROVIDER_ERROR' }),
      }),
    );
  });

  it('skips response when headers already sent (SSE mid-stream)', () => {
    const res = buildRes();
    (res as { headersSent: boolean }).headersSent = true;
    errorHandler(new Error('mid-stream'), buildReq(), res, vi.fn());
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

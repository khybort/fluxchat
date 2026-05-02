/**
 * Base for every typed application error. `abstract` to force subclassing —
 * a fresh error category should always carry a typed name + fixed `code` +
 * `statusCode` instead of being constructed inline with magic strings. The
 * compiler enforces this: `new AppError(...)` fails with "Cannot create an
 * instance of an abstract class".
 */
export abstract class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details: unknown;

  constructor(code: string, statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends AppError {
  constructor(details?: unknown, message = 'Invalid input') {
    super('VALIDATION_ERROR', 400, message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super('UNAUTHORIZED', 401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super('FORBIDDEN', 403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super('NOT_FOUND', 404, message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super('CONFLICT', 409, message);
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfterSeconds?: number) {
    super('RATE_LIMITED', 429, 'Too many requests', { retryAfterSeconds });
  }
}

export class FeatureDisabledError extends AppError {
  constructor(flag: string) {
    super('FEATURE_DISABLED', 404, `Feature '${flag}' is disabled`);
  }
}

export class AppCheckError extends AppError {
  constructor(message = 'App Check verification failed') {
    super('APP_CHECK_FAILED', 401, message);
  }
}

export class ToolExecutionError extends AppError {
  constructor(toolName: string, message: string, details?: unknown) {
    super('TOOL_EXECUTION_FAILED', 422, `[${toolName}] ${message}`, details);
  }
}

/** Upstream AI provider failed (Anthropic/OpenAI/Groq SDK error). */
export class AiProviderError extends AppError {
  constructor(message = 'AI provider unavailable') {
    super('AI_PROVIDER_ERROR', 503, message);
  }
}

/**
 * Catch-all for an unrecognised error inside a request — only thrown by the
 * error handler's fallback branch. Public response is sanitised in production
 * (CLAUDE.md §14); the original message is kept for dev visibility.
 */
export class InternalServerError extends AppError {
  constructor(message = 'Internal server error', details?: unknown) {
    super('INTERNAL_ERROR', 500, message, details);
  }
}

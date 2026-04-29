export class AppError extends Error {
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

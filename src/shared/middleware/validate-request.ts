import type { RequestHandler } from 'express';
import { ZodError, type ZodSchema } from 'zod';

import { ValidationError } from '../errors/app-error.js';

export interface RequestSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export const validateRequest = (schemas: RequestSchemas): RequestHandler => {
  return (req, _res, next) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body) as unknown;
      }
      if (schemas.query) {
        Object.assign(req.query, schemas.query.parse(req.query));
      }
      if (schemas.params) {
        Object.assign(req.params, schemas.params.parse(req.params));
      }
      next();
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        return next(new ValidationError(error.flatten(), 'Request validation failed'));
      }
      next(error);
    }
  };
};

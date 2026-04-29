import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

import { Config } from '../../config/config.js';
import { UnauthorizedError } from '../errors/app-error.js';

interface JwtPayload {
  sub: string;
  email: string;
}

const isJwtPayload = (value: unknown): value is JwtPayload =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as JwtPayload).sub === 'string' &&
  typeof (value as JwtPayload).email === 'string';

export const authMiddleware: RequestHandler = (req, _res, next) => {
  const header = req.header('authorization');
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    return next(new UnauthorizedError('Missing or malformed Authorization header'));
  }
  const token = header.slice('bearer '.length).trim();

  try {
    const decoded = jwt.verify(token, Config.getInstance().values.auth.jwtSecret);
    if (!isJwtPayload(decoded)) {
      return next(new UnauthorizedError('Invalid token payload'));
    }
    req.user = { id: decoded.sub, email: decoded.email };
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
};

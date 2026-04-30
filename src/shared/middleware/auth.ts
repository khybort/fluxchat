import type { RequestHandler } from 'express';
// jsonwebtoken is CJS — the ESM static analyzer can't see named exports here,
// so we keep the default import. The lint warning is acknowledged.
// eslint-disable-next-line import/no-named-as-default
import jwt from 'jsonwebtoken';

import { Config } from '../../config/config.js';
import { UnauthorizedError } from '../errors/app-error.js';

interface JwtPayload {
  sub: string;
  email: string;
  role?: 'user' | 'admin';
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
    // eslint-disable-next-line import/no-named-as-default-member
    const decoded = jwt.verify(token, Config.getInstance().values.auth.jwtSecret);
    if (!isJwtPayload(decoded)) {
      return next(new UnauthorizedError('Invalid token payload'));
    }
    // JWTs minted before the RBAC scaffold landed don't carry `role`; default
    // to `user`. The new auth.service includes role on every freshly minted
    // token so this fallback degrades gracefully during the rollout window.
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role ?? 'user',
    };
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
};

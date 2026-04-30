import type { RequestHandler } from 'express';

import { ForbiddenError, UnauthorizedError } from '../errors/app-error.js';
import type { UserRole } from '../types/express.js';

/**
 * RBAC scaffold — gate a route on the authenticated user's role. Mount AFTER
 * `authMiddleware` so `req.user` is populated; missing user → 401, wrong role
 * → 403. Accepts a single role or a list (any-of).
 *
 * Example usage (future admin route):
 *   router.delete('/admin/users/:id', requireRole('admin'), controller.deleteUser);
 */
export const requireRole = (allowed: UserRole | UserRole[]): RequestHandler => {
  const list = Array.isArray(allowed) ? allowed : [allowed];
  return (req, _res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }
    if (!list.includes(req.user.role)) {
      return next(new ForbiddenError('Insufficient role'));
    }
    next();
  };
};

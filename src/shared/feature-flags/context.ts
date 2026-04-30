import type { Request } from 'express';

import type { FlagContext } from './feature-flag.types.js';

/**
 * Build a FlagContext from the request-scoped fields the rest of the app
 * already maintains:
 *   - `req.user` — populated by authMiddleware (id + email + role)
 *   - `req.clientType` — populated by clientTypeMiddleware
 *
 * The plan field is reserved for a future subscription-tier hook and is
 * intentionally not pulled from the request today.
 *
 * Callers that don't have a Request handy (e.g. internal jobs) can build
 * the FlagContext literal directly.
 */
export const flagContextFrom = (req: Request): FlagContext => {
  const ctx: FlagContext = {};
  if (req.user?.id) ctx.userId = req.user.id;
  if (req.user?.role) ctx.userRole = req.user.role;
  if (req.clientType) ctx.clientType = req.clientType;
  return ctx;
};

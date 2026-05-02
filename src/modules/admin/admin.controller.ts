import type { Request, Response } from 'express';

import type {
  EvaluateFlagBody,
  FlagDefinitionDto,
  FlagNameParam,
  ListUsersQuery,
} from './admin.dto.js';
import { PAGINATION } from '../../shared/constants.js';
import {
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from '../../shared/errors/app-error.js';
import type { FeatureFlagService } from '../../shared/feature-flags/feature-flag.service.js';
import type { FlagName } from '../../shared/feature-flags/feature-flag.types.js';
import { buildPagedResult } from '../../shared/pagination/cursor.js';
import type { IUserRepository } from '../user/user.repository.interface.js';

/**
 * Role-gated controller for the admin flag UI. Lives next to the
 * authenticated chat surface (under /api/admin/*), separate from the
 * token-gated ops endpoints at /admin/* which serve a different
 * (script/CI) caller.
 */
export class AdminController {
  constructor(
    private readonly flags: FeatureFlagService,
    private readonly users: IUserRepository,
  ) {}

  public listFlags = (req: Request, res: Response): void => {
    ensureAdmin(req);
    res.status(200).json({
      definitions: this.flags.definitions(),
      snapshot: this.flags.snapshot(),
    });
  };

  public updateFlag = async (req: Request, res: Response): Promise<void> => {
    const user = ensureAdmin(req);
    const params = req.params as unknown as FlagNameParam;
    const body = req.body as FlagDefinitionDto;
    try {
      await this.flags.setOverride(params.name as FlagName, body, user.id);
    } catch (error: unknown) {
      // setOverride throws on parse failure; surface as 400 so the UI
      // shows a useful validation error instead of a 500.
      if (error instanceof ValidationError) throw error;
      throw new ValidationError(error instanceof Error ? error.message : 'Invalid flag definition');
    }
    res.status(200).json({
      definitions: this.flags.definitions(),
      snapshot: this.flags.snapshot(),
    });
  };

  public clearFlag = async (req: Request, res: Response): Promise<void> => {
    ensureAdmin(req);
    const params = req.params as unknown as FlagNameParam;
    await this.flags.clearOverride(params.name as FlagName);
    res.status(200).json({
      definitions: this.flags.definitions(),
      snapshot: this.flags.snapshot(),
    });
  };

  public reloadFlags = async (req: Request, res: Response): Promise<void> => {
    ensureAdmin(req);
    await this.flags.reload();
    res.status(200).json({
      status: 'reloaded',
      snapshot: this.flags.snapshot(),
    });
  };

  /**
   * "What value would this flag return for this fake user?" — admin UI uses
   * this to preview rule + percentage outcomes without polluting real
   * traffic. Server-side eval keeps a single source of truth (no JS
   * re-implementation of the bucket hash on the client).
   */
  public evaluateFlag = (req: Request, res: Response): void => {
    ensureAdmin(req);
    const params = req.params as unknown as FlagNameParam;
    const body = req.body as EvaluateFlagBody;
    const value = this.flags.get(params.name as FlagName, body.context);
    res.status(200).json({ value });
  };

  /**
   * Cursor-paginated user list — feeds the admin UI's per-user flag override
   * picker. Admin-only; non-admins never reach the router (requireRole gate).
   */
  public listUsers = async (req: Request, res: Response): Promise<void> => {
    ensureAdmin(req);
    const query = req.query as unknown as ListUsersQuery;
    const limit = query.limit ?? PAGINATION.DEFAULT_LIMIT;
    const rows = await this.users.findAll({ cursor: query.cursor, limit });
    res.status(200).json(buildPagedResult(rows, limit, (r) => r.id));
  };
}

/**
 * Defence-in-depth: the `requireRole('admin')` middleware already gates each
 * admin route, but this re-check guards against a future routing mistake that
 * mounts a controller method without the gate. Throws `UnauthorizedError`
 * (401) when the JWT is missing and `ForbiddenError` (403) when the user is
 * authenticated but not an admin — same shape the middleware produces.
 */
const ensureAdmin = (req: Request): { id: string; email: string; role: 'user' | 'admin' } => {
  if (!req.user) throw new UnauthorizedError();
  if (req.user.role !== 'admin') throw new ForbiddenError('Insufficient role');
  return req.user;
};

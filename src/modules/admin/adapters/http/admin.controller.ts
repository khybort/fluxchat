import type { Request, Response } from 'express';

import type {
  EvaluateFlagBody,
  FlagDefinitionDto,
  FlagNameParam,
  ListUsersQuery,
} from './admin.dto.js';
import { ForbiddenError, UnauthorizedError } from '../../../../shared/errors/app-error.js';
import type { FlagName } from '../../../../shared/feature-flags/feature-flag.types.js';
import type { AdminUseCases } from '../../application/use-cases/admin.use-cases.js';

/**
 * Role-gated controller for the admin flag UI. Lives next to the
 * authenticated chat surface (under /api/admin/*), separate from the
 * token-gated ops endpoints at /admin/* which serve a different
 * (script/CI) caller.
 *
 * No business logic here — every endpoint translates the request into a use
 * case input, executes it, and shapes the response.
 */
export class AdminController {
  constructor(private readonly useCases: AdminUseCases) {}

  public listFlags = async (req: Request, res: Response): Promise<void> => {
    ensureAdmin(req);
    const result = await this.useCases.listFlags.execute();
    res.status(200).json(result);
  };

  public updateFlag = async (req: Request, res: Response): Promise<void> => {
    const user = ensureAdmin(req);
    const params = req.params as unknown as FlagNameParam;
    const body = req.body as FlagDefinitionDto;
    const result = await this.useCases.updateFlag.execute({
      name: params.name as FlagName,
      definition: body,
      updatedBy: user.id,
    });
    res.status(200).json(result);
  };

  public clearFlag = async (req: Request, res: Response): Promise<void> => {
    ensureAdmin(req);
    const params = req.params as unknown as FlagNameParam;
    const result = await this.useCases.clearFlag.execute({ name: params.name as FlagName });
    res.status(200).json(result);
  };

  public clearAllFlags = async (req: Request, res: Response): Promise<void> => {
    ensureAdmin(req);
    const result = await this.useCases.clearAllFlags.execute();
    res.status(200).json(result);
  };

  public reloadFlags = async (req: Request, res: Response): Promise<void> => {
    ensureAdmin(req);
    const result = await this.useCases.reloadFlags.execute();
    res.status(200).json(result);
  };

  public evaluateFlag = async (req: Request, res: Response): Promise<void> => {
    ensureAdmin(req);
    const params = req.params as unknown as FlagNameParam;
    const body = req.body as EvaluateFlagBody;
    const result = await this.useCases.evaluateFlag.execute({
      name: params.name as FlagName,
      context: body.context,
    });
    res.status(200).json(result);
  };

  public listUsers = async (req: Request, res: Response): Promise<void> => {
    ensureAdmin(req);
    const query = req.query as unknown as ListUsersQuery;
    const result = await this.useCases.listUsers.execute({
      cursor: query.cursor,
      limit: query.limit,
      q: query.q,
    });
    res.status(200).json(result);
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

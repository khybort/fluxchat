import type { NextFunction, Request, Response } from 'express';

import type { EvaluateFlagBody, FlagDefinitionDto, FlagNameParam } from './admin.dto.js';
import { UnauthorizedError, ValidationError } from '../../shared/errors/app-error.js';
import type { FeatureFlagService } from '../../shared/feature-flags/feature-flag.service.js';
import type { FlagName } from '../../shared/feature-flags/feature-flag.types.js';

/**
 * Role-gated controller for the admin flag UI. Lives next to the
 * authenticated chat surface (under /api/admin/*), separate from the
 * token-gated ops endpoints at /admin/* which serve a different
 * (script/CI) caller.
 */
export class AdminController {
  constructor(private readonly flags: FeatureFlagService) {}

  public listFlags = (req: Request, res: Response, next: NextFunction): void => {
    try {
      ensureAdmin(req);
      res.status(200).json({
        definitions: this.flags.definitions(),
        snapshot: this.flags.snapshot(),
      });
    } catch (error) {
      next(error);
    }
  };

  public updateFlag = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = ensureAdmin(req);
      const params = req.params as unknown as FlagNameParam;
      const body = req.body as FlagDefinitionDto;
      try {
        await this.flags.setOverride(params.name as FlagName, body, user.id);
      } catch (err) {
        // setOverride throws on parse failure; surface as 400 so the UI
        // shows a useful validation error instead of a 500.
        throw new ValidationError(err instanceof Error ? err.message : 'Invalid flag definition');
      }
      res.status(200).json({
        definitions: this.flags.definitions(),
        snapshot: this.flags.snapshot(),
      });
    } catch (error) {
      next(error);
    }
  };

  public clearFlag = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      ensureAdmin(req);
      const params = req.params as unknown as FlagNameParam;
      await this.flags.clearOverride(params.name as FlagName);
      res.status(200).json({
        definitions: this.flags.definitions(),
        snapshot: this.flags.snapshot(),
      });
    } catch (error) {
      next(error);
    }
  };

  public reloadFlags = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      ensureAdmin(req);
      await this.flags.reload();
      res.status(200).json({
        status: 'reloaded',
        snapshot: this.flags.snapshot(),
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * "What value would this flag return for this fake user?" — admin UI uses
   * this to preview rule + percentage outcomes without polluting real
   * traffic. Server-side eval keeps a single source of truth (no JS
   * re-implementation of the bucket hash on the client).
   */
  public evaluateFlag = (req: Request, res: Response, next: NextFunction): void => {
    try {
      ensureAdmin(req);
      const params = req.params as unknown as FlagNameParam;
      const body = req.body as EvaluateFlagBody;
      const value = this.flags.get(params.name as FlagName, body.context);
      res.status(200).json({ value });
    } catch (error) {
      next(error);
    }
  };
}

const ensureAdmin = (req: Request): { id: string; email: string; role: 'user' | 'admin' } => {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
};

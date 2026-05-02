import type { Request, Response } from 'express';

import type { LoginBody, RegisterBody } from './auth.dto.js';
import { UnauthorizedError } from '../../../../shared/errors/app-error.js';
import { flagContextFrom } from '../../../../shared/feature-flags/context.js';
import type { AuthUseCases } from '../../application/use-cases/auth.use-cases.js';

export class AuthController {
  constructor(private readonly useCases: AuthUseCases) {}

  public register = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as RegisterBody;
    const result = await this.useCases.register.execute({
      email: body.email,
      password: body.password,
      name: body.name ?? null,
    });
    res.status(201).json(result);
  };

  public login = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as LoginBody;
    const result = await this.useCases.login.execute({
      email: body.email,
      password: body.password,
    });
    res.status(200).json(result);
  };

  public me = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new UnauthorizedError();
    const user = await this.useCases.getCurrentUser.execute({ userId: req.user.id });
    res.status(200).json({ user });
  };

  public meFlags = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new UnauthorizedError();
    const result = await this.useCases.getCurrentUserFlags.execute(flagContextFrom(req));
    res.status(200).json(result);
  };
}

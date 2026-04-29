import type { NextFunction, Request, Response } from 'express';

import type { LoginBody, RegisterBody } from './auth.dto.js';
import type { AuthService } from './auth.service.js';
import { UnauthorizedError } from '../../shared/errors/app-error.js';

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  public register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.body as RegisterBody;
      const result = await this.authService.register({
        email: body.email,
        password: body.password,
        name: body.name ?? null,
      });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  public login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.body as LoginBody;
      const result = await this.authService.login({
        email: body.email,
        password: body.password,
      });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  public me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const user = await this.authService.getCurrentUser(req.user.id);
      res.status(200).json({ user });
    } catch (error) {
      next(error);
    }
  };
}

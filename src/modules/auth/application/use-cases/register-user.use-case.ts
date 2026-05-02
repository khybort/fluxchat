import bcrypt from 'bcryptjs';

import type { AuthResult } from './auth.types.js';
import { AUTH } from '../../../../shared/constants.js';
import { ConflictError } from '../../../../shared/errors/app-error.js';
import type { IUseCase } from '../../../../shared/use-case/use-case.interface.js';
import type { IUserRepository } from '../../../user/application/ports/user.repository.port.js';
import type { AuthTokenIssuer } from '../services/auth-token.issuer.js';

export interface RegisterUserInput {
  email: string;
  password: string;
  name?: string | null;
}

/**
 * Register a fresh account: lowercase + trim email, bcrypt-hash the password
 * (12 rounds), persist, then mint a JWT. Email collisions are 409 — the
 * repository treats `findByEmail` as the de facto uniqueness check.
 */
export class RegisterUserUseCase implements IUseCase<RegisterUserInput, AuthResult> {
  constructor(
    private readonly users: IUserRepository,
    private readonly tokens: AuthTokenIssuer,
  ) {}

  public async execute(input: RegisterUserInput): Promise<AuthResult> {
    const email = input.email.toLowerCase().trim();
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new ConflictError('Email already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, AUTH.BCRYPT_ROUNDS);
    const user = await this.users.create({
      email,
      passwordHash,
      name: input.name ?? null,
    });

    return this.tokens.issue(user);
  }
}

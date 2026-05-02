import bcrypt from 'bcryptjs';

import type { AuthResult } from './auth.types.js';
import { UnauthorizedError } from '../../../../shared/errors/app-error.js';
import type { IUseCase } from '../../../../shared/use-case/use-case.interface.js';
import type { IUserRepository } from '../../../user/application/ports/user.repository.port.js';
import type { AuthTokenIssuer } from '../services/auth-token.issuer.js';

export interface LoginUserInput {
  email: string;
  password: string;
}

const DUMMY_BCRYPT_HASH = '$2b$12$0000000000000000000000000000000000000000000000000000.';

/**
 * Authenticate by email + password. Always runs `bcrypt.compare` (even when
 * the user is missing) so the timing of "wrong email" and "wrong password"
 * is indistinguishable — keeps this endpoint from being a free email-
 * enumeration oracle.
 */
export class LoginUserUseCase implements IUseCase<LoginUserInput, AuthResult> {
  constructor(
    private readonly users: IUserRepository,
    private readonly tokens: AuthTokenIssuer,
  ) {}

  public async execute(input: LoginUserInput): Promise<AuthResult> {
    const email = input.email.toLowerCase().trim();
    const credentials = await this.users.findCredentialsByEmail(email);

    const ok = await bcrypt.compare(input.password, credentials?.passwordHash ?? DUMMY_BCRYPT_HASH);

    if (!credentials || !ok) {
      throw new UnauthorizedError('Invalid email or password');
    }

    return this.tokens.issue(credentials);
  }
}

import type { AuthUserView } from './auth.types.js';
import { UnauthorizedError } from '../../../../shared/errors/app-error.js';
import type { IUseCase } from '../../../../shared/use-case/use-case.interface.js';
import type { IUserRepository } from '../../../user/application/ports/user.repository.port.js';
import type { AuthTokenIssuer } from '../services/auth-token.issuer.js';

export interface GetCurrentUserInput {
  userId: string;
}

/**
 * Resolve `req.user.id` (set by the JWT middleware) to a fresh user row.
 * If the user has been deleted between issuing the JWT and this request,
 * we throw 401 — the token is not honoured for ghost accounts.
 */
export class GetCurrentUserUseCase implements IUseCase<GetCurrentUserInput, AuthUserView> {
  constructor(
    private readonly users: IUserRepository,
    private readonly tokens: AuthTokenIssuer,
  ) {}

  public async execute(input: GetCurrentUserInput): Promise<AuthUserView> {
    const user = await this.users.findById(input.userId);
    if (!user) {
      throw new UnauthorizedError();
    }
    return this.tokens.toView(user);
  }
}

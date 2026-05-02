// jsonwebtoken is CJS — keep the default import for runtime interop.
// eslint-disable-next-line import/no-named-as-default
import jwt from 'jsonwebtoken';

import type { Config } from '../../../../config/config.js';
import { AUTH } from '../../../../shared/constants.js';
import type { User } from '../../../user/domain/user.types.js';
import type { AuthResult, AuthUserView } from '../use-cases/auth.types.js';

/**
 * Application service that signs a JWT and packages an {@link AuthResult}.
 * Both register + login use cases delegate here so the token-issuance logic
 * (TTL, claim shape, signing key) is in one place. role is included in the
 * JWT so the auth middleware can read it without a DB round-trip.
 *
 * Lives in application/services/ rather than domain/ because it pulls a
 * concrete signing secret from Config (infrastructure-edge), but it has no
 * I/O — purely deterministic given (user, secret).
 */
export class AuthTokenIssuer {
  constructor(private readonly config: Config) {}

  public issue(user: User): AuthResult {
    // eslint-disable-next-line import/no-named-as-default-member
    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      this.config.values.auth.jwtSecret,
      { expiresIn: AUTH.TOKEN_TTL_SECONDS },
    );
    return {
      token,
      user: this.toView(user),
      expiresInSeconds: AUTH.TOKEN_TTL_SECONDS,
    };
  }

  public toView(user: User): AuthUserView {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }
}

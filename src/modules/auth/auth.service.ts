import bcrypt from 'bcryptjs';
// jsonwebtoken is CJS — keep the default import for runtime interop.
// eslint-disable-next-line import/no-named-as-default
import jwt from 'jsonwebtoken';

import type { Config } from '../../config/config.js';
import { AUTH } from '../../shared/constants.js';
import { ConflictError, UnauthorizedError } from '../../shared/errors/app-error.js';
import type { IUserRepository } from '../user/user.repository.interface.js';
import type { User } from '../user/user.types.js';

export interface AuthResult {
  token: string;
  user: AuthUserView;
  expiresInSeconds: number;
}

export interface AuthUserView {
  id: string;
  email: string;
  name: string | null;
  role: 'user' | 'admin';
}

export interface RegisterInput {
  email: string;
  password: string;
  name?: string | null;
}

export interface LoginInput {
  email: string;
  password: string;
}

const toView = (user: User): AuthUserView => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
});

/**
 * Real email/password authentication. Hashes with bcrypt at REGISTER, verifies
 * at LOGIN, signs a JWT both times. Errors are domain-typed (`ConflictError`,
 * `UnauthorizedError`) so the global error handler maps them to consistent HTTP
 * responses without the controller knowing status codes.
 */
export class AuthService {
  constructor(
    private readonly users: IUserRepository,
    private readonly config: Config,
  ) {}

  public async register(input: RegisterInput): Promise<AuthResult> {
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

    return this.buildResult(user);
  }

  public async login(input: LoginInput): Promise<AuthResult> {
    const email = input.email.toLowerCase().trim();
    const credentials = await this.users.findCredentialsByEmail(email);

    // Always run bcrypt.compare even when the user is missing — keeps the
    // timing of "wrong email" and "wrong password" indistinguishable so the
    // endpoint isn't a free email-enumeration oracle.
    const dummyHash = '$2b$12$0000000000000000000000000000000000000000000000000000.';
    const ok = await bcrypt.compare(input.password, credentials?.passwordHash ?? dummyHash);

    if (!credentials || !ok) {
      throw new UnauthorizedError('Invalid email or password');
    }

    return this.buildResult(credentials);
  }

  public async getCurrentUser(userId: string): Promise<AuthUserView> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedError();
    }
    return toView(user);
  }

  private buildResult(user: User): AuthResult {
    // role is included so the auth middleware can read it without a DB
    // round-trip on every request. JWT TTL is 30d, so an account upgraded
    // from `user` to `admin` won't see the new role until they re-login —
    // acceptable for the case scope; ship a token-rotation mechanism if
    // this matters in production.
    // eslint-disable-next-line import/no-named-as-default-member
    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      this.config.values.auth.jwtSecret,
      { expiresIn: AUTH.TOKEN_TTL_SECONDS },
    );
    return {
      token,
      user: toView(user),
      expiresInSeconds: AUTH.TOKEN_TTL_SECONDS,
    };
  }
}

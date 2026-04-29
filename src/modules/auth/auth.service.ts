import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import type { Config } from '../../config/config.js';
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

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const BCRYPT_ROUNDS = 12;

const toView = (user: User): AuthUserView => ({
  id: user.id,
  email: user.email,
  name: user.name,
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

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
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
    const token = jwt.sign({ sub: user.id, email: user.email }, this.config.values.auth.jwtSecret, {
      expiresIn: TOKEN_TTL_SECONDS,
    });
    return {
      token,
      user: toView(user),
      expiresInSeconds: TOKEN_TTL_SECONDS,
    };
  }
}

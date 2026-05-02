import { beforeEach, describe, expect, it } from 'vitest';

import { Config } from '../../src/config/config.js';
import { AuthTokenIssuer } from '../../src/modules/auth/application/services/auth-token.issuer.js';
import { GetCurrentUserFlagsUseCase } from '../../src/modules/auth/application/use-cases/get-current-user-flags.use-case.js';
import { GetCurrentUserUseCase } from '../../src/modules/auth/application/use-cases/get-current-user.use-case.js';
import { LoginUserUseCase } from '../../src/modules/auth/application/use-cases/login-user.use-case.js';
import { RegisterUserUseCase } from '../../src/modules/auth/application/use-cases/register-user.use-case.js';
import { ConflictError, UnauthorizedError } from '../../src/shared/errors/app-error.js';
import { FeatureFlagService } from '../../src/shared/feature-flags/feature-flag.service.js';
import { InMemoryUserRepository } from '../helpers/in-memory-user-repository.js';

/**
 * Auth use case tests — exercise each use case in isolation against the
 * in-memory user repo. Validates the same coverage the old AuthService had,
 * now split per operation per ISP.
 */

describe('RegisterUserUseCase', () => {
  let users: InMemoryUserRepository;
  let useCase: RegisterUserUseCase;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    const tokens = new AuthTokenIssuer(Config.getInstance());
    useCase = new RegisterUserUseCase(users, tokens);
  });

  it('creates a user, hashes the password, and returns a JWT', async () => {
    const result = await useCase.execute({
      email: 'Alice@Example.com',
      password: 'correct-horse-battery-staple',
      name: 'Alice',
    });

    expect(result.token).toBeTruthy();
    expect(result.user.email).toBe('alice@example.com');
    expect(result.user.name).toBe('Alice');
    expect(users.rows).toHaveLength(1);
    expect(users.rows[0]?.passwordHash).not.toBe('correct-horse-battery-staple');
    expect(users.rows[0]?.passwordHash.startsWith('$2b$')).toBe(true);
  });

  it('rejects a duplicate email with ConflictError', async () => {
    await useCase.execute({ email: 'a@a.com', password: 'pwpwpwpw', name: null });
    await expect(
      useCase.execute({ email: 'a@a.com', password: 'pwpwpwpw', name: null }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('LoginUserUseCase', () => {
  let users: InMemoryUserRepository;
  let registerUseCase: RegisterUserUseCase;
  let loginUseCase: LoginUserUseCase;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    const tokens = new AuthTokenIssuer(Config.getInstance());
    registerUseCase = new RegisterUserUseCase(users, tokens);
    loginUseCase = new LoginUserUseCase(users, tokens);
  });

  it('issues a JWT for the right password', async () => {
    await registerUseCase.execute({ email: 'b@b.com', password: 'right-password', name: null });
    const result = await loginUseCase.execute({ email: 'b@b.com', password: 'right-password' });
    expect(result.token).toBeTruthy();
    expect(result.user.email).toBe('b@b.com');
  });

  it('rejects with UnauthorizedError for the wrong password', async () => {
    await registerUseCase.execute({ email: 'c@c.com', password: 'right-password', name: null });
    await expect(
      loginUseCase.execute({ email: 'c@c.com', password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects with UnauthorizedError for an unknown email (does not leak existence)', async () => {
    await expect(
      loginUseCase.execute({ email: 'nobody@nowhere.com', password: 'whatever' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('GetCurrentUserUseCase', () => {
  it('returns the user view by id', async () => {
    const users = new InMemoryUserRepository();
    const tokens = new AuthTokenIssuer(Config.getInstance());
    const register = new RegisterUserUseCase(users, tokens);
    const getCurrent = new GetCurrentUserUseCase(users, tokens);
    const created = await register.execute({
      email: 'd@d.com',
      password: 'password123',
      name: 'D',
    });
    const fetched = await getCurrent.execute({ userId: created.user.id });
    expect(fetched.email).toBe('d@d.com');
  });

  it('throws UnauthorizedError for an unknown id', async () => {
    const users = new InMemoryUserRepository();
    const tokens = new AuthTokenIssuer(Config.getInstance());
    const getCurrent = new GetCurrentUserUseCase(users, tokens);
    await expect(getCurrent.execute({ userId: 'missing-id' })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });
});

describe('GetCurrentUserFlagsUseCase', () => {
  it('honors a userId-targeted rule for the matching user but not others', async () => {
    const flags = FeatureFlagService.getInstance();
    flags.set('AI_TOOLS_ENABLED', false);
    await flags.setOverride(
      'AI_TOOLS_ENABLED',
      { default: false, rules: [{ if: { userId: 'alice' }, value: true }] },
      'admin-test',
    );

    const useCase = new GetCurrentUserFlagsUseCase(flags);
    const aliceResult = await useCase.execute({ userId: 'alice' });
    const bobResult = await useCase.execute({ userId: 'bob' });

    expect(aliceResult.flags.AI_TOOLS_ENABLED).toBe(true);
    expect(bobResult.flags.AI_TOOLS_ENABLED).toBe(false);
  });

  it('honors a userRole rule', async () => {
    const flags = FeatureFlagService.getInstance();
    await flags.setOverride(
      'STREAMING_ENABLED',
      { default: false, rules: [{ if: { userRole: 'admin' }, value: true }] },
      'admin-test',
    );

    const useCase = new GetCurrentUserFlagsUseCase(flags);
    const adminResult = await useCase.execute({ userRole: 'admin' });
    const userResult = await useCase.execute({ userRole: 'user' });

    expect(adminResult.flags.STREAMING_ENABLED).toBe(true);
    expect(userResult.flags.STREAMING_ENABLED).toBe(false);
  });

  it('returns an evaluated value for every registered flag', async () => {
    const flags = FeatureFlagService.getInstance();
    const useCase = new GetCurrentUserFlagsUseCase(flags);
    const result = await useCase.execute({});

    const definitionKeys = Object.keys(flags.definitions());
    const snapshotKeys = Object.keys(result.flags);
    expect(snapshotKeys.sort()).toEqual(definitionKeys.sort());
  });
});

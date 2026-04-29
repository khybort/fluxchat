import { beforeEach, describe, expect, it } from 'vitest';

import { Config } from '../../src/config/config.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { ConflictError, UnauthorizedError } from '../../src/shared/errors/app-error.js';
import { InMemoryUserRepository } from '../helpers/in-memory-user-repository.js';

describe('AuthService.register', () => {
  let users: InMemoryUserRepository;
  let service: AuthService;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    service = new AuthService(users, Config.getInstance());
  });

  it('creates a user, hashes the password, and returns a JWT', async () => {
    const result = await service.register({
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
    await service.register({ email: 'a@a.com', password: 'pwpwpwpw', name: null });
    await expect(
      service.register({ email: 'a@a.com', password: 'pwpwpwpw', name: null }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('AuthService.login', () => {
  let users: InMemoryUserRepository;
  let service: AuthService;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    service = new AuthService(users, Config.getInstance());
  });

  it('issues a JWT for the right password', async () => {
    await service.register({ email: 'b@b.com', password: 'right-password', name: null });
    const result = await service.login({ email: 'b@b.com', password: 'right-password' });
    expect(result.token).toBeTruthy();
    expect(result.user.email).toBe('b@b.com');
  });

  it('rejects with UnauthorizedError for the wrong password', async () => {
    await service.register({ email: 'c@c.com', password: 'right-password', name: null });
    await expect(
      service.login({ email: 'c@c.com', password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects with UnauthorizedError for an unknown email (does not leak existence)', async () => {
    await expect(
      service.login({ email: 'nobody@nowhere.com', password: 'whatever' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('AuthService.getCurrentUser', () => {
  it('returns the user view by id', async () => {
    const users = new InMemoryUserRepository();
    const service = new AuthService(users, Config.getInstance());
    const created = await service.register({
      email: 'd@d.com',
      password: 'password123',
      name: 'D',
    });
    const fetched = await service.getCurrentUser(created.user.id);
    expect(fetched.email).toBe('d@d.com');
  });

  it('throws UnauthorizedError for an unknown id', async () => {
    const users = new InMemoryUserRepository();
    const service = new AuthService(users, Config.getInstance());
    await expect(service.getCurrentUser('missing-id')).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

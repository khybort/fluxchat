import { v4 as uuid } from 'uuid';

import type {
  CreateUserInput,
  IUserRepository,
} from '../../src/modules/user/user.repository.interface.js';
import type { User, UserWithCredentials } from '../../src/modules/user/user.types.js';

type Row = UserWithCredentials;

export class InMemoryUserRepository implements IUserRepository {
  public readonly rows: Row[] = [];

  public async findById(id: string): Promise<User | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }

  public async findByEmail(email: string): Promise<User | null> {
    return this.rows.find((r) => r.email === email) ?? null;
  }

  public async findCredentialsByEmail(email: string): Promise<UserWithCredentials | null> {
    return this.rows.find((r) => r.email === email) ?? null;
  }

  public async create(input: CreateUserInput): Promise<User> {
    const now = new Date();
    const row: Row = {
      id: uuid(),
      email: input.email,
      name: input.name ?? null,
      passwordHash: input.passwordHash,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(row);
    return row;
  }
}

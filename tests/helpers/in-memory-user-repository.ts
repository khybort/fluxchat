import { v4 as uuid } from 'uuid';

import type {
  CreateUserInput,
  IUserRepository,
  ListUsersParams,
} from '../../src/modules/user/application/ports/user.repository.port.js';
import type {
  User,
  UserRole,
  UserWithCredentials,
} from '../../src/modules/user/domain/user.types.js';

type Row = UserWithCredentials;

const toDomainUser = (row: Row): User => ({
  id: row.id,
  email: row.email,
  name: row.name,
  role: row.role,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

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

  public async findAll({ cursor, limit, q }: ListUsersParams): Promise<User[]> {
    const filtered = q
      ? this.rows.filter((r) => {
          const needle = q.toLowerCase();
          return (
            r.email.toLowerCase().includes(needle) ||
            (r.name?.toLowerCase().includes(needle) ?? false)
          );
        })
      : this.rows;
    const sorted = [...filtered].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const startIdx = cursor ? sorted.findIndex((r) => r.id === cursor) + 1 : 0;
    return sorted.slice(startIdx, startIdx + limit + 1).map(toDomainUser);
  }

  public async create(input: CreateUserInput): Promise<User> {
    const now = new Date();
    const row: Row = {
      id: uuid(),
      email: input.email,
      name: input.name ?? null,
      passwordHash: input.passwordHash,
      role: 'user',
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(row);
    return row;
  }

  public async delete(id: string): Promise<boolean> {
    const idx = this.rows.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    this.rows.splice(idx, 1);
    return true;
  }

  public async countByRole(role: UserRole): Promise<number> {
    return this.rows.filter((r) => r.role === role).length;
  }
}

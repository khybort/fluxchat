import type { CreateUserInput, IUserRepository } from './user.repository.interface.js';
import type { User, UserWithCredentials } from './user.types.js';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';

interface PrismaUserRow {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

const toDomainUser = (row: PrismaUserRow): User => ({
  id: row.id,
  email: row.email,
  name: row.name,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toCredentials = (row: PrismaUserRow): UserWithCredentials => ({
  ...toDomainUser(row),
  passwordHash: row.passwordHash,
});

export class UserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findById(id: string): Promise<User | null> {
    const row = await this.prisma.client.user.findUnique({ where: { id } });
    return row ? toDomainUser(row) : null;
  }

  public async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.client.user.findUnique({ where: { email } });
    return row ? toDomainUser(row) : null;
  }

  public async findCredentialsByEmail(email: string): Promise<UserWithCredentials | null> {
    const row = await this.prisma.client.user.findUnique({ where: { email } });
    return row ? toCredentials(row) : null;
  }

  public async create(input: CreateUserInput): Promise<User> {
    const row = await this.prisma.client.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        name: input.name ?? null,
      },
    });
    return toDomainUser(row);
  }
}

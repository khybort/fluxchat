import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  CreateUserInput,
  IUserRepository,
  ListUsersParams,
} from '../../application/ports/user.repository.port.js';
import type { User, UserRole, UserWithCredentials } from '../../domain/user.types.js';

interface PrismaUserRow {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

const toDomainUser = (row: PrismaUserRow): User => ({
  id: row.id,
  email: row.email,
  name: row.name,
  role: row.role as UserRole,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toCredentials = (row: PrismaUserRow): UserWithCredentials => ({
  ...toDomainUser(row),
  passwordHash: row.passwordHash,
});

export class UserPrismaRepository implements IUserRepository {
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

  public async findAll({ cursor, limit }: ListUsersParams): Promise<User[]> {
    const rows = await this.prisma.client.user.findMany({
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDomainUser);
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

import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

interface SeedUser {
  email: string;
  name: string;
  password: string;
  role: UserRole;
}

const SEED_USERS: SeedUser[] = [
  {
    email: 'admin@appnation.com',
    name: 'Admin',
    password: 'TestingAdmin123!',
    role: UserRole.admin,
  },
  {
    email: 'user@appnation.com',
    name: 'User',
    password: 'TestingUser123!',
    role: UserRole.user,
  },
];

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    for (const seed of SEED_USERS) {
      const passwordHash = await bcrypt.hash(seed.password, BCRYPT_ROUNDS);
      await prisma.user.upsert({
        where: { email: seed.email },
        update: { name: seed.name, passwordHash, role: seed.role },
        create: {
          email: seed.email,
          name: seed.name,
          passwordHash,
          role: seed.role,
        },
      });
      console.log(`seeded ${seed.role}: ${seed.email}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

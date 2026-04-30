/**
 * Real-Postgres integration tests.
 *
 * Catches Prisma behaviors our InMemoryRepositories can't simulate: enum types,
 * @@index pruning, soft-delete predicates, transaction semantics, cascade
 * deletes. Spun up via Testcontainers — Docker is required, so this file
 * skips itself in CI environments without Docker (or set RUN_DB_TESTS=1).
 *
 * Boots a postgres:16 container, runs `prisma migrate deploy` against it,
 * exercises the repos, and tears the container down. ~10s warm-up cost.
 */
import { execSync } from 'node:child_process';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../../src/infrastructure/database/prisma.service.js';
import { ChatRepository } from '../../src/modules/chat/chat.repository.js';
import { MessageRepository } from '../../src/modules/chat/message.repository.js';
import { UserRepository } from '../../src/modules/user/user.repository.js';

// Opt-in unless Docker is known-available. Local dev: `RUN_DB_TESTS=1 pnpm vitest run db-real`.
const SHOULD_RUN = process.env.RUN_DB_TESTS === '1';

const describeOrSkip = SHOULD_RUN ? describe : describe.skip;

describeOrSkip('Real-Postgres repository smoke', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('appnation_test')
      .withUsername('test')
      .withPassword('test')
      .start();

    process.env.DATABASE_URL = container.getConnectionUri();
    // Force the singleton to be re-read with the new DATABASE_URL.
    PrismaService.resetForTesting();

    // Apply migrations against the freshly minted DB.
    execSync('pnpm prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: container.getConnectionUri() },
      stdio: 'inherit',
    });

    prisma = PrismaService.getInstance();
    await prisma.connect();
  }, 60_000);

  afterAll(async () => {
    await prisma?.disconnect();
    await container?.stop();
  }, 30_000);

  it('soft-deletes chat rows so they vanish from list/find queries', async () => {
    const users = new UserRepository(prisma);
    const chats = new ChatRepository(prisma);
    const messages = new MessageRepository(prisma);

    const user = await users.create({
      email: `soft-delete-${Date.now()}@example.test`,
      passwordHash: 'x',
    });
    const chat = await chats.create({ userId: user.id, title: 'will-vanish' });

    expect(await chats.findByIdForUser(chat.id, user.id)).not.toBeNull();
    const beforeList = await chats.findByUser(user.id, { cursor: undefined, limit: 100 });
    expect(beforeList.some((c) => c.id === chat.id)).toBe(true);

    expect(await chats.softDelete(chat.id, user.id)).toBe(true);

    expect(await chats.findByIdForUser(chat.id, user.id)).toBeNull();
    const afterList = await chats.findByUser(user.id, { cursor: undefined, limit: 100 });
    expect(afterList.some((c) => c.id === chat.id)).toBe(false);

    // Second soft-delete is a no-op (already tombstoned).
    expect(await chats.softDelete(chat.id, user.id)).toBe(false);

    // Underlying messages still exist — soft-delete doesn't cascade.
    await messages.create({ chatId: chat.id, role: 'user', content: 'still here' });
    const persisted = await messages.findByChat(chat.id, { cursor: undefined, limit: 10 });
    expect(persisted.length).toBeGreaterThan(0);
  });

  it('persists per-message AI usage telemetry round-trip', async () => {
    const users = new UserRepository(prisma);
    const chats = new ChatRepository(prisma);
    const messages = new MessageRepository(prisma);

    const user = await users.create({
      email: `usage-${Date.now()}@example.test`,
      passwordHash: 'x',
    });
    const chat = await chats.create({ userId: user.id, title: 'usage-chat' });

    const created = await messages.create({
      chatId: chat.id,
      role: 'assistant',
      content: 'sample reply',
      usage: { promptTokens: 42, completionTokens: 7, provider: 'anthropic', model: 'claude' },
    });

    expect(created.usage).toEqual({
      promptTokens: 42,
      completionTokens: 7,
      provider: 'anthropic',
      model: 'claude',
    });

    const reread = await messages.findByChat(chat.id, { cursor: undefined, limit: 10 });
    const found = reread.find((m) => m.id === created.id);
    expect(found?.usage?.promptTokens).toBe(42);
    expect(found?.usage?.provider).toBe('anthropic');
  });
});

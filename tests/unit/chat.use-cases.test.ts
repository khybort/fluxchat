import { beforeEach, describe, expect, it } from 'vitest';

import { ChatAccessPolicy } from '../../src/modules/chat/application/policies/chat-access.policy.js';
import { ArchiveChatUseCase } from '../../src/modules/chat/application/use-cases/archive-chat.use-case.js';
import { CreateChatUseCase } from '../../src/modules/chat/application/use-cases/create-chat.use-case.js';
import { DeleteChatUseCase } from '../../src/modules/chat/application/use-cases/delete-chat.use-case.js';
import { ListArchivedChatsUseCase } from '../../src/modules/chat/application/use-cases/list-archived-chats.use-case.js';
import { ListChatsUseCase } from '../../src/modules/chat/application/use-cases/list-chats.use-case.js';
import { UnarchiveChatUseCase } from '../../src/modules/chat/application/use-cases/unarchive-chat.use-case.js';
import { NotFoundError } from '../../src/shared/errors/app-error.js';
import { FeatureFlagService } from '../../src/shared/feature-flags/feature-flag.service.js';
import { InMemoryChatRepository } from '../helpers/in-memory-repositories.js';

/**
 * Chat use case tests — same coverage as the old ChatService tests, now split
 * one describe block per use case. Each `new XxxUseCase(...)` is the unit
 * under test; the in-memory repository + real flag service play the supporting
 * roles.
 */

describe('ListChatsUseCase', () => {
  let chats: InMemoryChatRepository;
  let flags: FeatureFlagService;
  let useCase: ListChatsUseCase;

  beforeEach(() => {
    chats = new InMemoryChatRepository();
    flags = FeatureFlagService.getInstance();
    flags.set('PAGINATION_LIMIT', 20);
    useCase = new ListChatsUseCase(chats, flags);
  });

  it('clamps user-supplied limit to PAGINATION_LIMIT', async () => {
    flags.set('PAGINATION_LIMIT', 12);
    const userId = 'user-1';
    for (let i = 0; i < 30; i++) {
      await chats.create({ userId, title: `Chat ${i}` });
    }

    const result = await useCase.execute({ userId, limit: 100 });
    expect(result.data).toHaveLength(12);
    expect(result.pagination.limit).toBe(12);
    expect(result.pagination.hasMore).toBe(true);
  });

  it('clamps user-supplied limit up to MIN_LIMIT (10)', async () => {
    flags.set('PAGINATION_LIMIT', 50);
    const userId = 'user-1';
    for (let i = 0; i < 15; i++) {
      await chats.create({ userId, title: `Chat ${i}` });
    }

    const result = await useCase.execute({ userId, limit: 5 });
    expect(result.pagination.limit).toBe(10);
    expect(result.data).toHaveLength(10);
  });

  it('returns hasMore=false when results fit', async () => {
    const userId = 'user-1';
    await chats.create({ userId, title: 'Only one' });
    const result = await useCase.execute({ userId });
    expect(result.pagination.hasMore).toBe(false);
    expect(result.pagination.nextCursor).toBeNull();
  });
});

describe('ChatAccessPolicy', () => {
  it('throws NotFoundError when chat does not exist for user', async () => {
    const chats = new InMemoryChatRepository();
    const policy = new ChatAccessPolicy(chats);
    await expect(policy.ensureOwnership('missing', 'user-1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError when chat belongs to a different user', async () => {
    const chats = new InMemoryChatRepository();
    const policy = new ChatAccessPolicy(chats);
    const chat = await chats.create({ userId: 'user-A', title: 'A' });
    await expect(policy.ensureOwnership(chat.id, 'user-B')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns the chat when owned by the user', async () => {
    const chats = new InMemoryChatRepository();
    const policy = new ChatAccessPolicy(chats);
    const created = await chats.create({ userId: 'user-A', title: 'A' });
    const found = await policy.ensureOwnership(created.id, 'user-A');
    expect(found.id).toBe(created.id);
  });
});

describe('CreateChatUseCase', () => {
  it('falls back to DEFAULT_CHAT_TITLE when title is empty', async () => {
    const chats = new InMemoryChatRepository();
    const useCase = new CreateChatUseCase(chats);
    const created = await useCase.execute({ userId: 'user-X', title: '   ' });
    expect(created.title.length).toBeGreaterThan(0);
    expect(created.title).not.toBe('   ');
  });
});

describe('DeleteChatUseCase', () => {
  it('soft-deletes a chat owned by the user', async () => {
    const chats = new InMemoryChatRepository();
    const useCase = new DeleteChatUseCase(chats);
    const created = await chats.create({ userId: 'user-1', title: 'A' });

    await useCase.execute({ chatId: created.id, userId: 'user-1' });

    expect(await chats.findByIdForUser(created.id, 'user-1')).toBeNull();
  });

  it('throws NotFoundError when the chat is missing or owned by someone else', async () => {
    const chats = new InMemoryChatRepository();
    const useCase = new DeleteChatUseCase(chats);
    const created = await chats.create({ userId: 'owner', title: 'A' });

    await expect(
      useCase.execute({ chatId: created.id, userId: 'intruder' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      useCase.execute({ chatId: '00000000-0000-0000-0000-000000000999', userId: 'owner' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('Archive use cases', () => {
  let chats: InMemoryChatRepository;
  let flags: FeatureFlagService;
  let listActive: ListChatsUseCase;
  let listArchived: ListArchivedChatsUseCase;
  let archive: ArchiveChatUseCase;
  let unarchive: UnarchiveChatUseCase;

  beforeEach(() => {
    chats = new InMemoryChatRepository();
    flags = FeatureFlagService.getInstance();
    flags.set('PAGINATION_LIMIT', 20);
    listActive = new ListChatsUseCase(chats, flags);
    listArchived = new ListArchivedChatsUseCase(chats, flags);
    archive = new ArchiveChatUseCase(chats);
    unarchive = new UnarchiveChatUseCase(chats);
  });

  it('archives a chat and hides it from the active list', async () => {
    const created = await chats.create({ userId: 'u', title: 'A' });
    await archive.execute({ chatId: created.id, userId: 'u' });
    const list = await listActive.execute({ userId: 'u' });
    expect(list.data.some((c) => c.id === created.id)).toBe(false);
  });

  it('lists archived chats only', async () => {
    const a = await chats.create({ userId: 'u', title: 'A' });
    await chats.create({ userId: 'u', title: 'B' });
    await archive.execute({ chatId: a.id, userId: 'u' });
    const result = await listArchived.execute({ userId: 'u' });
    expect(result.data.map((c) => c.title)).toEqual(['A']);
  });

  it('unarchive restores a chat to the active list', async () => {
    const created = await chats.create({ userId: 'u', title: 'A' });
    await archive.execute({ chatId: created.id, userId: 'u' });
    await unarchive.execute({ chatId: created.id, userId: 'u' });
    const list = await listActive.execute({ userId: 'u' });
    expect(list.data.some((c) => c.id === created.id)).toBe(true);
  });

  it('throws NotFoundError when archiving a chat owned by someone else', async () => {
    const created = await chats.create({ userId: 'owner', title: 'A' });
    await expect(
      archive.execute({ chatId: created.id, userId: 'intruder' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError when unarchiving a non-archived chat', async () => {
    const created = await chats.create({ userId: 'u', title: 'A' });
    await expect(unarchive.execute({ chatId: created.id, userId: 'u' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

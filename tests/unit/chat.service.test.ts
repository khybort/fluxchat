import { beforeEach, describe, expect, it } from 'vitest';

import { ChatService } from '../../src/modules/chat/chat.service.js';
import { NotFoundError } from '../../src/shared/errors/app-error.js';
import { FeatureFlagService } from '../../src/shared/feature-flags/feature-flag.service.js';
import { InMemoryChatRepository } from '../helpers/in-memory-repositories.js';

describe('ChatService.listChats', () => {
  let chats: InMemoryChatRepository;
  let flags: FeatureFlagService;
  let service: ChatService;

  beforeEach(() => {
    chats = new InMemoryChatRepository();
    flags = FeatureFlagService.getInstance();
    flags.set('PAGINATION_LIMIT', 20);
    service = new ChatService(chats, flags);
  });

  it('clamps user-supplied limit to PAGINATION_LIMIT', async () => {
    flags.set('PAGINATION_LIMIT', 12);
    const userId = 'user-1';
    for (let i = 0; i < 30; i++) {
      await chats.create({ userId, title: `Chat ${i}` });
    }

    const result = await service.listChats({ userId, limit: 100 });
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

    const result = await service.listChats({ userId, limit: 5 });
    expect(result.pagination.limit).toBe(10);
    expect(result.data).toHaveLength(10);
  });

  it('returns hasMore=false when results fit', async () => {
    const userId = 'user-1';
    await chats.create({ userId, title: 'Only one' });
    const result = await service.listChats({ userId });
    expect(result.pagination.hasMore).toBe(false);
    expect(result.pagination.nextCursor).toBeNull();
  });
});

describe('ChatService.ensureOwnership', () => {
  it('throws NotFoundError when chat does not exist for user', async () => {
    const chats = new InMemoryChatRepository();
    const flags = FeatureFlagService.getInstance();
    const service = new ChatService(chats, flags);
    await expect(service.ensureOwnership('missing', 'user-1')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('throws NotFoundError when chat belongs to a different user', async () => {
    const chats = new InMemoryChatRepository();
    const flags = FeatureFlagService.getInstance();
    const service = new ChatService(chats, flags);
    const chat = await chats.create({ userId: 'user-A', title: 'A' });
    await expect(service.ensureOwnership(chat.id, 'user-B')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns the chat when owned by the user', async () => {
    const chats = new InMemoryChatRepository();
    const flags = FeatureFlagService.getInstance();
    const service = new ChatService(chats, flags);
    const created = await chats.create({ userId: 'user-A', title: 'A' });
    const found = await service.ensureOwnership(created.id, 'user-A');
    expect(found.id).toBe(created.id);
  });
});

describe('ChatService.createChat', () => {
  it('falls back to DEFAULT_CHAT_TITLE when title is empty', async () => {
    const chats = new InMemoryChatRepository();
    const flags = FeatureFlagService.getInstance();
    const service = new ChatService(chats, flags);
    const created = await service.createChat({ userId: 'user-X', title: '   ' });
    expect(created.title.length).toBeGreaterThan(0);
    expect(created.title).not.toBe('   ');
  });
});

describe('ChatService.deleteChat', () => {
  it('soft-deletes a chat owned by the user', async () => {
    const chats = new InMemoryChatRepository();
    const flags = FeatureFlagService.getInstance();
    const service = new ChatService(chats, flags);
    const created = await chats.create({ userId: 'user-1', title: 'A' });

    await service.deleteChat(created.id, 'user-1');

    expect(await chats.findByIdForUser(created.id, 'user-1')).toBeNull();
  });

  it('throws NotFoundError when the chat is missing or owned by someone else', async () => {
    const chats = new InMemoryChatRepository();
    const flags = FeatureFlagService.getInstance();
    const service = new ChatService(chats, flags);
    const created = await chats.create({ userId: 'owner', title: 'A' });

    await expect(service.deleteChat(created.id, 'intruder')).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      service.deleteChat('00000000-0000-0000-0000-000000000999', 'owner'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

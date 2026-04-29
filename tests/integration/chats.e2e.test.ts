import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, type TestAppHandles } from '../helpers/build-test-app.js';

describe('GET /api/chats', () => {
  let h: TestAppHandles;

  beforeEach(() => {
    h = buildTestApp();
  });

  it('rejects requests without App Check token', async () => {
    const res = await request(h.app).get('/api/chats');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('APP_CHECK_FAILED');
  });

  it('rejects requests without JWT', async () => {
    const res = await request(h.app)
      .get('/api/chats')
      .set('x-firebase-app-check', process.env.APP_CHECK_TOKEN!);
    expect(res.status).toBe(401);
  });

  it('returns paginated chats for the authenticated user', async () => {
    const userId = 'user-1';
    for (let i = 0; i < 5; i++) {
      await h.chats.create({ userId, title: `Chat ${i}` });
    }
    await h.chats.create({ userId: 'user-2', title: 'someone else' });

    const res = await request(h.app).get('/api/chats').set(h.authHeaders(userId));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.pagination.hasMore).toBe(false);
    expect(res.body.data.every((c: { userId: string }) => c.userId === userId)).toBe(true);
  });

  it('respects PAGINATION_LIMIT feature flag', async () => {
    h.flags.set('PAGINATION_LIMIT', 12);
    const userId = 'user-1';
    for (let i = 0; i < 30; i++) {
      await h.chats.create({ userId, title: `Chat ${i}` });
    }

    const res = await request(h.app).get('/api/chats?limit=100').set(h.authHeaders(userId));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(12);
    expect(res.body.pagination.hasMore).toBe(true);
    expect(res.body.pagination.nextCursor).toBeTruthy();
  });
});

describe('POST /api/chats', () => {
  let h: TestAppHandles;

  beforeEach(() => {
    h = buildTestApp();
  });

  it('creates a chat scoped to the authenticated user', async () => {
    const userId = 'user-1';
    const res = await request(h.app)
      .post('/api/chats')
      .set(h.authHeaders(userId))
      .send({ title: 'Trip planning' });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Trip planning');
    expect(res.body.userId).toBe(userId);
    expect(h.chats.chats).toHaveLength(1);
  });

  it('falls back to a default title when none is provided', async () => {
    const userId = 'user-1';
    const res = await request(h.app).post('/api/chats').set(h.authHeaders(userId)).send({});
    expect(res.status).toBe(201);
    expect(res.body.title).toBeTruthy();
  });
});

describe('GET /api/chats/:chatId/history', () => {
  let h: TestAppHandles;

  beforeEach(() => {
    h = buildTestApp();
  });

  it('returns 404 when the chat does not belong to the user (no info leak)', async () => {
    const chat = await h.chats.create({ userId: 'owner', title: 'private' });
    const res = await request(h.app)
      .get(`/api/chats/${chat.id}/history`)
      .set(h.authHeaders('intruder'));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns full history when CHAT_HISTORY_ENABLED=true', async () => {
    h.flags.set('CHAT_HISTORY_ENABLED', true);
    const userId = 'user-1';
    const chat = await h.chats.create({ userId, title: 'with history' });
    for (let i = 0; i < 25; i++) {
      await h.messages.create({ chatId: chat.id, role: 'user', content: `m${i}` });
    }

    const res = await request(h.app)
      .get(`/api/chats/${chat.id}/history?limit=100`)
      .set(h.authHeaders(userId));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(10);
  });

  it('returns only the last 10 messages when CHAT_HISTORY_ENABLED=false', async () => {
    h.flags.set('CHAT_HISTORY_ENABLED', false);
    const userId = 'user-1';
    const chat = await h.chats.create({ userId, title: 'limited' });
    for (let i = 0; i < 25; i++) {
      await h.messages.create({ chatId: chat.id, role: 'user', content: `m${i}` });
    }

    const res = await request(h.app)
      .get(`/api/chats/${chat.id}/history`)
      .set(h.authHeaders(userId));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(10);
    expect(res.body.pagination.hasMore).toBe(false);
  });

  it('returns 400 for invalid chatId param', async () => {
    const res = await request(h.app)
      .get('/api/chats/not-a-uuid/history')
      .set(h.authHeaders('user-1'));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

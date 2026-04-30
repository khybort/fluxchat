import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, type TestAppHandles } from '../helpers/build-test-app.js';

describe('POST /api/chats/:chatId/completion', () => {
  let h: TestAppHandles;

  beforeEach(() => {
    h = buildTestApp();
  });

  it('returns JSON when STREAMING_ENABLED=false', async () => {
    h.flags.set('STREAMING_ENABLED', false);
    const userId = 'user-1';
    const chat = await h.chats.create({ userId, title: 't' });

    const res = await request(h.app)
      .post(`/api/chats/${chat.id}/completion`)
      .set(h.authHeaders(userId))
      .send({ message: 'hello' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.message.role).toBe('assistant');
    expect(typeof res.body.message.content).toBe('string');
    expect(res.body.message.content.length).toBeGreaterThan(0);

    const persisted = await h.messages.findByChat(chat.id, { cursor: undefined, limit: 100 });
    expect(persisted.some((m) => m.role === 'user' && m.content === 'hello')).toBe(true);
    expect(persisted.some((m) => m.role === 'assistant')).toBe(true);
  });

  it('returns SSE stream when STREAMING_ENABLED=true', async () => {
    h.flags.set('STREAMING_ENABLED', true);
    const userId = 'user-1';
    const chat = await h.chats.create({ userId, title: 't' });

    const res = await request(h.app)
      .post(`/api/chats/${chat.id}/completion`)
      .set(h.authHeaders(userId))
      .send({ message: 'stream this' })
      .buffer(true)
      .parse((response, callback) => {
        let data = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          data += chunk;
        });
        response.on('end', () => callback(null, data));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const body = res.body as string;
    expect(body).toContain('event: thinking');
    expect(body).toContain('event: delta');
    expect(body).toContain('event: done');
  });

  it('emits tool_execution event when AI_TOOLS_ENABLED=true and prompt asks for weather', async () => {
    h.flags.set('STREAMING_ENABLED', true);
    h.flags.set('AI_TOOLS_ENABLED', true);
    const userId = 'user-1';
    const chat = await h.chats.create({ userId, title: 't' });

    const res = await request(h.app)
      .post(`/api/chats/${chat.id}/completion`)
      .set(h.authHeaders(userId))
      .send({ message: 'what is the weather in Istanbul?' })
      .buffer(true)
      .parse((response, callback) => {
        let data = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          data += chunk;
        });
        response.on('end', () => callback(null, data));
      });

    expect(res.status).toBe(200);
    expect(res.body as string).toContain('event: tool_execution');
  });

  it('rejects empty message with 400', async () => {
    const userId = 'user-1';
    const chat = await h.chats.create({ userId, title: 't' });

    const res = await request(h.app)
      .post(`/api/chats/${chat.id}/completion`)
      .set(h.authHeaders(userId))
      .send({ message: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when chat belongs to another user', async () => {
    const chat = await h.chats.create({ userId: 'owner', title: 't' });
    const res = await request(h.app)
      .post(`/api/chats/${chat.id}/completion`)
      .set(h.authHeaders('intruder'))
      .send({ message: 'hi' });
    expect(res.status).toBe(404);
  });

  it('returns 404 FEATURE_DISABLED when COMPLETION_ENABLED=false (route-specific guard)', async () => {
    h.flags.set('COMPLETION_ENABLED', false);
    const userId = 'user-1';
    const chat = await h.chats.create({ userId, title: 't' });

    const res = await request(h.app)
      .post(`/api/chats/${chat.id}/completion`)
      .set(h.authHeaders(userId))
      .send({ message: 'hello' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('FEATURE_DISABLED');
  });

  it('keeps separate rate-limit buckets per (user, clientType) on the completion route', async () => {
    h.flags.set('STREAMING_ENABLED', false);
    h.flags.set('RATE_LIMIT_PER_MINUTE', 2);
    const userId = 'user-1';
    const chat = await h.chats.create({ userId, title: 't' });

    const send = (clientType: 'web' | 'mobile'): request.Test =>
      request(h.app)
        .post(`/api/chats/${chat.id}/completion`)
        .set({ ...h.authHeaders(userId), 'x-client-type': clientType })
        .send({ message: 'hello' });

    // Burn the web bucket (2 requests = limit).
    expect((await send('web')).status).toBe(200);
    expect((await send('web')).status).toBe(200);
    expect((await send('web')).status).toBe(429);

    // Mobile bucket is untouched.
    const mobileFirst = await send('mobile');
    expect(mobileFirst.status).toBe(200);
    expect(Number(mobileFirst.headers['x-ratelimit-remaining'])).toBe(1);
  });
});

describe('GET /healthz', () => {
  it('returns flags snapshot without authentication', async () => {
    const h = buildTestApp();
    const res = await request(h.app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.flags.STREAMING_ENABLED).toBeDefined();
  });
});

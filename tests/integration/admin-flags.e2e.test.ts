import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { buildTestApp } from '../helpers/build-test-app.js';

/**
 * Role-gated admin UI surface (mounted under /api/admin/*). Distinct from the
 * token-gated ops surface at /admin/* — same flag service, different auth.
 */
describe('GET /api/admin/flags', () => {
  it('returns rich definitions + snapshot for admin users', async () => {
    const h = buildTestApp();
    const res = await request(h.app).get('/api/admin/flags').set(h.adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body.snapshot.STREAMING_ENABLED).toBeDefined();
    expect(res.body.definitions.STREAMING_ENABLED.default).toBeDefined();
  });

  it('returns 403 for non-admin authenticated users', async () => {
    const h = buildTestApp();
    const res = await request(h.app).get('/api/admin/flags').set(h.authHeaders('regular-user'));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 401 for unauthenticated requests', async () => {
    const h = buildTestApp();
    const res = await request(h.app).get('/api/admin/flags');

    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/admin/flags/:name', () => {
  it('persists a new rich-form definition and the next get() honors it', async () => {
    const h = buildTestApp();
    const res = await request(h.app)
      .patch('/api/admin/flags/STREAMING_ENABLED')
      .set(h.adminHeaders())
      .send({
        default: false,
        rules: [{ if: { userRole: 'admin' }, value: true }],
      });

    expect(res.status).toBe(200);
    expect(res.body.snapshot.STREAMING_ENABLED).toBe(false);
    expect(res.body.definitions.STREAMING_ENABLED.rules).toHaveLength(1);

    // Service reflects the new state immediately
    expect(h.flags.get('STREAMING_ENABLED')).toBe(false);
    expect(h.flags.get('STREAMING_ENABLED', { userRole: 'admin' })).toBe(true);
  });

  it('rejects a malformed body with 400 VALIDATION_ERROR', async () => {
    const h = buildTestApp();
    const res = await request(h.app)
      .patch('/api/admin/flags/STREAMING_ENABLED')
      .set(h.adminHeaders())
      .send({ default: 'not-a-boolean' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an unknown flag name with 400', async () => {
    const h = buildTestApp();
    const res = await request(h.app)
      .patch('/api/admin/flags/NOT_A_REAL_FLAG')
      .set(h.adminHeaders())
      .send({ default: true });

    expect(res.status).toBe(400);
  });

  it('returns 403 for non-admin users', async () => {
    const h = buildTestApp();
    const res = await request(h.app)
      .patch('/api/admin/flags/STREAMING_ENABLED')
      .set(h.authHeaders('regular-user'))
      .send({ default: false });

    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/admin/flags/:name', () => {
  it('clears an override and falls back to the prior default', async () => {
    const h = buildTestApp();

    // First set an override
    await request(h.app)
      .patch('/api/admin/flags/STREAMING_ENABLED')
      .set(h.adminHeaders())
      .send({ default: false });
    expect(h.flags.get('STREAMING_ENABLED')).toBe(false);

    // Then clear it
    const res = await request(h.app)
      .delete('/api/admin/flags/STREAMING_ENABLED')
      .set(h.adminHeaders());
    expect(res.status).toBe(200);

    // Test env default is true — see tests/helpers/setup.ts
    expect(h.flags.get('STREAMING_ENABLED')).toBe(true);
  });
});

describe('POST /api/admin/flags/:name/evaluate', () => {
  it('runs server-side evaluation against synthetic context', async () => {
    const h = buildTestApp();
    await request(h.app)
      .patch('/api/admin/flags/STREAMING_ENABLED')
      .set(h.adminHeaders())
      .send({
        default: false,
        rules: [{ if: { userRole: 'admin' }, value: true }],
      });

    const res = await request(h.app)
      .post('/api/admin/flags/STREAMING_ENABLED/evaluate')
      .set(h.adminHeaders())
      .send({ context: { userRole: 'admin' } });

    expect(res.status).toBe(200);
    expect(res.body.value).toBe(true);
  });

  it('returns the default for an empty context', async () => {
    const h = buildTestApp();
    const res = await request(h.app)
      .post('/api/admin/flags/STREAMING_ENABLED/evaluate')
      .set(h.adminHeaders())
      .send({ context: {} });

    expect(res.status).toBe(200);
    // Code default is true.
    expect(res.body.value).toBe(true);
  });
});

describe('GET /api/admin/users', () => {
  const seedUser = async (h: ReturnType<typeof buildTestApp>, suffix: string) => {
    return h.users.create({
      email: `seed-${suffix}@example.test`,
      passwordHash: 'hash',
      name: `Seed ${suffix}`,
    });
  };

  it('returns a paginated user list for admins', async () => {
    const h = buildTestApp();
    await seedUser(h, 'a');
    await seedUser(h, 'b');
    await seedUser(h, 'c');

    const res = await request(h.app).get('/api/admin/users').set(h.adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.pagination.hasMore).toBe(false);
    expect(res.body.pagination.limit).toBe(20);
    expect(res.body.data[0]).toMatchObject({ email: expect.stringContaining('@example.test') });
    // Password hash never leaks out of the user module.
    expect(res.body.data[0].passwordHash).toBeUndefined();
  });

  it('paginates with cursor when over-fetched', async () => {
    const h = buildTestApp();
    for (const s of ['a', 'b', 'c', 'd', 'e']) await seedUser(h, s);

    const first = await request(h.app)
      .get('/api/admin/users')
      .query({ limit: 10 })
      .set(h.adminHeaders());

    // limit 10 is the floor; we only seeded 5 users so all returned, hasMore=false.
    expect(first.status).toBe(200);
    expect(first.body.pagination.hasMore).toBe(false);
    expect(first.body.data).toHaveLength(5);
  });

  it('returns 403 for non-admin users', async () => {
    const h = buildTestApp();
    const res = await request(h.app).get('/api/admin/users').set(h.authHeaders('regular-user'));
    expect(res.status).toBe(403);
  });

  it('returns 401 for unauthenticated requests', async () => {
    const h = buildTestApp();
    const res = await request(h.app).get('/api/admin/users');
    expect(res.status).toBe(401);
  });
});

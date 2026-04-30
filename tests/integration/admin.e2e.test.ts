import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { buildTestApp } from '../helpers/build-test-app.js';

describe('POST /admin/flags/reload', () => {
  it('reloads the flag snapshot when the admin token matches', async () => {
    const h = buildTestApp();
    h.flags.set('STREAMING_ENABLED', false);

    const res = await request(h.app)
      .post('/admin/flags/reload')
      .set('x-admin-token', 'test-admin-token-with-enough-length')
      .send();

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('reloaded');
    // After reload, the flag snapshot reflects the env-default (true), not the
    // in-memory override we just `set()` — proves the source-of-truth refresh.
    expect(res.body.flags.STREAMING_ENABLED).toBe(true);
  });

  it('returns 404 when the admin token is wrong', async () => {
    const h = buildTestApp();
    const res = await request(h.app)
      .post('/admin/flags/reload')
      .set('x-admin-token', 'nope')
      .send();

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 when the admin token header is missing', async () => {
    const h = buildTestApp();
    const res = await request(h.app).post('/admin/flags/reload').send();

    expect(res.status).toBe(404);
  });
});

describe('GET /admin/flags', () => {
  it('returns rich definitions plus snapshot when the token matches', async () => {
    const h = buildTestApp();
    const res = await request(h.app)
      .get('/admin/flags')
      .set('x-admin-token', 'test-admin-token-with-enough-length');

    expect(res.status).toBe(200);
    expect(res.body.snapshot.STREAMING_ENABLED).toBeDefined();
    expect(res.body.definitions.STREAMING_ENABLED.default).toBeDefined();
  });

  it('returns 404 without the admin token', async () => {
    const h = buildTestApp();
    const res = await request(h.app).get('/admin/flags');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

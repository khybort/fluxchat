import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { Config } from '../../src/config/config.js';
import { buildTestApp } from '../helpers/build-test-app.js';

describe('OpenAPI documentation endpoints', () => {
  afterEach(() => {
    delete process.env.DOCS_ENABLED;
    Config.resetForTesting();
  });

  it('serves the OpenAPI 3.1 spec at GET /docs.json with all expected paths', async () => {
    const h = buildTestApp();

    const res = await request(h.app).get('/docs.json');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.openapi).toBe('3.1.0');
    expect(res.body.info?.title).toBe('AppNation Chat API');

    const paths = Object.keys(res.body.paths ?? {}).sort();
    expect(paths).toEqual([
      '/api/auth/login',
      '/api/auth/me',
      '/api/auth/register',
      '/api/chats',
      '/api/chats/archived',
      '/api/chats/{chatId}/archive',
      '/api/chats/{chatId}/completion',
      '/api/chats/{chatId}/history',
      '/api/chats/{chatId}/unarchive',
      '/healthz',
    ]);

    // Three security schemes registered.
    const schemes = Object.keys(res.body.components?.securitySchemes ?? {}).sort();
    expect(schemes).toEqual(['appCheckHeader', 'bearerAuth', 'clientTypeHeader']);

    // Completion endpoint exposes both response variants.
    const completion = res.body.paths['/api/chats/{chatId}/completion'].post;
    expect(completion.responses['200'].content).toHaveProperty('application/json');
    expect(completion.responses['200'].content).toHaveProperty('text/event-stream');
  });

  it('serves Swagger UI HTML at GET /docs', async () => {
    const h = buildTestApp();

    const res = await request(h.app).get('/docs/').redirects(1);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('swagger-ui');
  });

  it('returns 404 from /docs.json when DOCS_ENABLED=false', async () => {
    process.env.DOCS_ENABLED = 'false';
    Config.resetForTesting();
    const h = buildTestApp();

    const res = await request(h.app).get('/docs.json');

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
  });
});

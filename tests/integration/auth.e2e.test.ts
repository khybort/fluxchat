import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, type TestAppHandles } from '../helpers/build-test-app.js';

describe('POST /api/auth/register', () => {
  let h: TestAppHandles;

  beforeEach(() => {
    h = buildTestApp();
  });

  it('still requires App Check (anti-abuse) even on a public endpoint', async () => {
    const res = await request(h.app)
      .post('/api/auth/register')
      .send({ email: 'a@a.com', password: 'password123' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('APP_CHECK_FAILED');
  });

  it('does NOT require a JWT (public route)', async () => {
    const res = await request(h.app)
      .post('/api/auth/register')
      .set(h.appCheckHeaders())
      .send({ email: 'a@a.com', password: 'password123', name: 'Alice' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('a@a.com');
  });

  it('returns 400 for an invalid email or short password', async () => {
    const res = await request(h.app)
      .post('/api/auth/register')
      .set(h.appCheckHeaders())
      .send({ email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 409 when the email is already registered', async () => {
    await request(h.app)
      .post('/api/auth/register')
      .set(h.appCheckHeaders())
      .send({ email: 'dupe@x.com', password: 'password123' });
    const second = await request(h.app)
      .post('/api/auth/register')
      .set(h.appCheckHeaders())
      .send({ email: 'dupe@x.com', password: 'password123' });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CONFLICT');
  });
});

describe('POST /api/auth/login', () => {
  let h: TestAppHandles;

  beforeEach(() => {
    h = buildTestApp();
  });

  const register = async (email: string, password: string): Promise<void> => {
    await request(h.app)
      .post('/api/auth/register')
      .set(h.appCheckHeaders())
      .send({ email, password });
  };

  it('issues a JWT for the right credentials', async () => {
    await register('login@x.com', 'password123');
    const res = await request(h.app)
      .post('/api/auth/login')
      .set(h.appCheckHeaders())
      .send({ email: 'login@x.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('returns 401 for the wrong password', async () => {
    await register('badpw@x.com', 'password123');
    const res = await request(h.app)
      .post('/api/auth/login')
      .set(h.appCheckHeaders())
      .send({ email: 'badpw@x.com', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 for an unknown email (no email-enumeration leak)', async () => {
    const res = await request(h.app)
      .post('/api/auth/login')
      .set(h.appCheckHeaders())
      .send({ email: 'nobody@x.com', password: 'whatever' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('GET /api/auth/me', () => {
  let h: TestAppHandles;

  beforeEach(() => {
    h = buildTestApp();
  });

  it('returns 401 without a JWT', async () => {
    const res = await request(h.app).get('/api/auth/me').set(h.appCheckHeaders());
    expect(res.status).toBe(401);
  });

  it('returns the current user when the JWT is valid', async () => {
    const register = await request(h.app)
      .post('/api/auth/register')
      .set(h.appCheckHeaders())
      .send({ email: 'me@x.com', password: 'password123', name: 'Me' });
    const token = register.body.token as string;

    const res = await request(h.app)
      .get('/api/auth/me')
      .set(h.appCheckHeaders())
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('me@x.com');
    expect(res.body.user.name).toBe('Me');
  });
});

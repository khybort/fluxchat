import { z } from 'zod';

import { LoginBodySchema, RegisterBodySchema } from './auth.dto.js';
import { openApiRegistry } from '../../../../shared/openapi/registry.js';
import {
  AUTHED_SECURITY,
  ErrorResponseSchema,
  PUBLIC_SECURITY,
} from '../../../../shared/openapi/security.js';

const AuthUserSchema = z
  .object({
    id: z.string().uuid().openapi({ example: 'b8a1d6f0-8c43-4b65-9b38-5d7e4cf5a1aa' }),
    email: z.string().email().openapi({ example: 'ada@example.com' }),
    name: z.string().nullable().openapi({ example: 'Ada Lovelace' }),
  })
  .openapi('AuthUser');

const AuthResponseSchema = z
  .object({
    token: z.string().openapi({
      description:
        'JWT signed with the backend `JWT_SECRET`. Use as `Authorization: Bearer <token>`.',
      example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    }),
    user: AuthUserSchema,
    expiresInSeconds: z
      .number()
      .int()
      .openapi({ example: 60 * 60 * 24 * 30 }),
  })
  .openapi('AuthResponse');

const MeResponseSchema = z.object({ user: AuthUserSchema }).openapi('MeResponse');

const RegisterRequestSchema = RegisterBodySchema.openapi('RegisterRequest', {
  example: { email: 'ada@example.com', password: 'correct-horse-battery-staple', name: 'Ada' },
});

const LoginRequestSchema = LoginBodySchema.openapi('LoginRequest', {
  example: { email: 'ada@example.com', password: 'correct-horse-battery-staple' },
});

openApiRegistry.register('RegisterRequest', RegisterRequestSchema);
openApiRegistry.register('LoginRequest', LoginRequestSchema);
openApiRegistry.register('AuthResponse', AuthResponseSchema);
openApiRegistry.register('MeResponse', MeResponseSchema);

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorResponseSchema } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/auth/register',
  tags: ['Auth'],
  summary: 'Create a new account',
  description:
    'Hashes the password (bcrypt, 12 rounds) and returns a fresh JWT. Email is unique per user; second registration with the same address is a 409.',
  security: PUBLIC_SECURITY,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: RegisterRequestSchema } },
    },
  },
  responses: {
    201: {
      description: 'Created — returns the JWT and the new user record.',
      content: { 'application/json': { schema: AuthResponseSchema } },
    },
    400: errorResponse('Validation error (invalid email, password too short).'),
    401: errorResponse('App Check token missing or invalid.'),
    409: errorResponse('Email already registered.'),
    429: errorResponse('Rate limited (per-IP).'),
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/auth/login',
  tags: ['Auth'],
  summary: 'Exchange credentials for a JWT',
  description:
    'Always runs `bcrypt.compare` (even when the user is missing) so timing differences cannot enumerate emails.',
  security: PUBLIC_SECURITY,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: LoginRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Authenticated — returns the JWT and the user record.',
      content: { 'application/json': { schema: AuthResponseSchema } },
    },
    400: errorResponse('Validation error.'),
    401: errorResponse('Invalid credentials, or App Check token missing/invalid.'),
    429: errorResponse('Rate limited (per-IP).'),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/auth/me',
  tags: ['Auth'],
  summary: 'Get the currently authenticated user',
  security: AUTHED_SECURITY,
  responses: {
    200: {
      description: 'The user record for the JWT subject.',
      content: { 'application/json': { schema: MeResponseSchema } },
    },
    401: errorResponse('Missing/invalid JWT or App Check token.'),
    429: errorResponse('Rate limited (per-user).'),
  },
});

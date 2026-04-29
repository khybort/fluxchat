import { z } from 'zod';

import { HEADERS } from '../constants.js';
import { openApiRegistry } from './registry.js';

/**
 * Three security schemes mirror the middleware chain:
 *   - bearerAuth      → Authorization: Bearer <jwt>
 *   - appCheckHeader  → x-firebase-app-check (mocked in this case study)
 *   - clientTypeHeader → x-client-type (web | mobile | desktop)
 *
 * Endpoints declare which combination they require via `security: [...]` on
 * the path; OpenAPI ANDs the entries inside one object and ORs across the array.
 * Public auth routes (register/login) drop bearerAuth; everything else needs all three.
 */
export const SECURITY_SCHEMES = {
  bearerAuth: 'bearerAuth',
  appCheckHeader: 'appCheckHeader',
  clientTypeHeader: 'clientTypeHeader',
} as const;

openApiRegistry.registerComponent('securitySchemes', SECURITY_SCHEMES.bearerAuth, {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'JWT issued by `POST /api/auth/login` or `POST /api/auth/register`.',
});

openApiRegistry.registerComponent('securitySchemes', SECURITY_SCHEMES.appCheckHeader, {
  type: 'apiKey',
  in: 'header',
  name: HEADERS.APP_CHECK,
  description:
    'Firebase App Check token (mocked for this case study; must equal the backend `APP_CHECK_TOKEN`).',
});

openApiRegistry.registerComponent('securitySchemes', SECURITY_SCHEMES.clientTypeHeader, {
  type: 'apiKey',
  in: 'header',
  name: HEADERS.CLIENT_TYPE,
  description:
    'Client variant. Defaults to `web` server-side if omitted; required for explicit mobile/desktop classification.',
});

/**
 * Combination required by every authenticated endpoint.
 * Public auth routes use `PUBLIC_SECURITY` (drops bearerAuth).
 */
export const AUTHED_SECURITY = [
  {
    [SECURITY_SCHEMES.bearerAuth]: [],
    [SECURITY_SCHEMES.appCheckHeader]: [],
    [SECURITY_SCHEMES.clientTypeHeader]: [],
  },
];

export const PUBLIC_SECURITY = [
  {
    [SECURITY_SCHEMES.appCheckHeader]: [],
    [SECURITY_SCHEMES.clientTypeHeader]: [],
  },
];

// ────────── Shared component schemas ──────────

export const ErrorResponseSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({
        example: 'NOT_FOUND',
        description:
          'Stable machine-readable code (`NOT_FOUND`, `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `RATE_LIMITED`, `CONFLICT`, `APP_CHECK_FAILED`, `FEATURE_DISABLED`, `INTERNAL_ERROR`).',
      }),
      message: z.string().openapi({ example: 'Chat not found' }),
      details: z.unknown().optional().openapi({
        description:
          'Optional structured details — typically zod issue tree for validation errors.',
      }),
    }),
    requestId: z.string().optional().openapi({ example: 'b6e7f3c2-…' }),
  })
  .openapi('ErrorResponse');

openApiRegistry.register('ErrorResponse', ErrorResponseSchema);

/**
 * Generic page-result helper: wraps any item schema in the standard envelope
 * `{ data: T[]; pagination: { nextCursor, hasMore, limit } }`.
 *
 * The OpenAPI registry expects each item to register itself with a name; we
 * inline the pagination meta because it's tiny and cursor-based pagination is
 * uniform across the API.
 */
export const paginatedSchema = <T extends z.ZodTypeAny>(item: T, name: string) =>
  z
    .object({
      data: z.array(item),
      pagination: z.object({
        nextCursor: z.string().nullable().openapi({ example: null }),
        hasMore: z.boolean().openapi({ example: false }),
        limit: z.number().int().openapi({ example: 20 }),
      }),
    })
    .openapi(name);

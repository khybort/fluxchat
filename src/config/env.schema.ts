import { z } from 'zod';

const booleanFromString = z.union([z.boolean(), z.string()]).transform((value) => {
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
});

/**
 * Environment schema. Feature-flag *values* live in code
 * (`src/shared/feature-flags/flag-defaults.ts`) and the DB (admin UI overrides),
 * not here — env carries only secrets, connections, and infra toggles.
 */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().url(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  APP_CHECK_TOKEN: z.string().min(8, 'APP_CHECK_TOKEN must be at least 8 characters'),

  // Token gating the POST /admin/flags/reload kill-switch endpoint. When unset
  // the endpoint deliberately 404s — fail-closed so a misconfigured prod box
  // can't be poked from the outside.
  ADMIN_TOKEN: z.string().min(16, 'ADMIN_TOKEN must be at least 16 characters').optional(),

  // Prime AI provider — Anthropic Claude Sonnet 4.6 (direct Anthropic API)
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),

  // Fast AI provider — Groq (OpenAI-compatible API)
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('openai/gpt-oss-120b'),
  GROQ_BASE_URL: z.string().url().default('https://api.groq.com/openai/v1'),

  // Additional supported provider — OpenAI (Vercel AI SDK)
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  CORS_ORIGINS: z.string().default(''),

  // OpenAPI / Swagger documentation toggle. Default ON; flip to false in prod
  // (or front it with a reverse-proxy auth) if /docs should not be public.
  DOCS_ENABLED: booleanFromString.default(true),

  // Optional Redis (used for rate limiting when set). When omitted, an in-memory
  // store is used — fine for single-instance deployments but inadequate for
  // horizontally-scaled production.
  REDIS_URL: z
    .string()
    .transform((v) => (v === '' ? undefined : v))
    .pipe(z.string().url().optional())
    .optional(),

  FEATURE_FLAGS_FILE: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

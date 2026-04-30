import { z } from 'zod';

import { openApiRegistry } from '../shared/openapi/registry.js';

const FeatureFlagSnapshotSchema = z
  .object({
    STREAMING_ENABLED: z.boolean(),
    PAGINATION_LIMIT: z.number().int(),
    AI_TOOLS_ENABLED: z.boolean(),
    CHAT_HISTORY_ENABLED: z.boolean(),
    RATE_LIMIT_PER_MINUTE: z.number().int(),
    COMPLETION_ENABLED: z.boolean(),
  })
  .openapi('FeatureFlagSnapshot');

const HealthzResponseSchema = z
  .object({
    status: z.literal('ok'),
    flags: FeatureFlagSnapshotSchema,
  })
  .openapi('HealthzResponse');

openApiRegistry.register('FeatureFlagSnapshot', FeatureFlagSnapshotSchema);
openApiRegistry.register('HealthzResponse', HealthzResponseSchema);

openApiRegistry.registerPath({
  method: 'get',
  path: '/healthz',
  tags: ['System'],
  summary: 'Liveness probe + runtime feature flag snapshot',
  description:
    'Public — no auth required. Returns the live values of all five feature flags so frontends can adjust UX without a separate config endpoint.',
  responses: {
    200: {
      description: 'OK with the current flag snapshot.',
      content: { 'application/json': { schema: HealthzResponseSchema } },
    },
  },
});

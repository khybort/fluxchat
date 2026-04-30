import { z } from 'zod';

/**
 * zod schemas for the admin flag UI.
 *
 * The PATCH body accepts the same rich-form definitions FeatureFlagService
 * already understands. Keeping the schema loose here (passthrough) lets the
 * service-level `parseDefinition` apply the per-flag clamping (10–100,
 * `Math.floor`, etc.). The service rejects invalid bodies with a thrown
 * Error → controller maps to a 400.
 */

const ClientTypeSchema = z.enum(['web', 'mobile', 'desktop']);
const UserRoleSchema = z.enum(['user', 'admin']);
const PlanSchema = z.enum(['free', 'pro', 'enterprise']);

export const FlagContextSchema = z
  .object({
    userId: z.string().optional(),
    clientType: ClientTypeSchema.optional(),
    userRole: UserRoleSchema.optional(),
    plan: PlanSchema.optional(),
  })
  .openapi({ description: 'Per-evaluation context. Every field optional.' });

const FlagRuleSchema = z
  .object({
    if: FlagContextSchema,
    value: z.union([z.boolean(), z.number()]),
  })
  .openapi('FlagRule');

export const FlagDefinitionSchema = z
  .object({
    default: z.union([z.boolean(), z.number()]),
    rules: z.array(FlagRuleSchema).optional(),
    percentage: z.number().min(0).max(100).optional(),
  })
  .openapi('FlagDefinition');

export const FlagNameParamSchema = z.object({
  name: z.enum([
    'STREAMING_ENABLED',
    'PAGINATION_LIMIT',
    'AI_TOOLS_ENABLED',
    'CHAT_HISTORY_ENABLED',
    'RATE_LIMIT_PER_MINUTE',
    'COMPLETION_ENABLED',
  ]),
});

export const EvaluateFlagBodySchema = z.object({
  context: FlagContextSchema,
});

export type FlagDefinitionDto = z.infer<typeof FlagDefinitionSchema>;
export type FlagNameParam = z.infer<typeof FlagNameParamSchema>;
export type EvaluateFlagBody = z.infer<typeof EvaluateFlagBodySchema>;

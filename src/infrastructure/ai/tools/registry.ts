import { tool, type ToolSet } from 'ai';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { calculatorTool } from './calculator.tool.js';
import { currencyTool } from './currency.tool.js';
import { searchWebTool } from './search-web.tool.js';
import { timeTool } from './time.tool.js';
import type { AnyToolDefinition } from './types.js';
import { weatherTool } from './weather.tool.js';

/**
 * Single source of truth for the tools the AI is allowed to call.
 *
 * Adding a new tool is a two-line edit: write `<name>.tool.ts` exporting a
 * `ToolDefinition`, then append it to the array below. Every provider
 * (Anthropic, OpenAI, Groq, Mock) reads from this list — no per-provider
 * hand-coding.
 */
// Cast each entry to `AnyToolDefinition` because TypeScript treats the
// `execute(args)` parameter as contravariant — a tool typed for its specific
// args isn't directly assignable to one typed for `unknown` args. The
// runtime guard in `executeTool()` re-validates with the tool's own zod
// schema before invoking, so the cast is safe.
export const ALL_TOOLS: AnyToolDefinition[] = [
  calculatorTool as AnyToolDefinition,
  timeTool as AnyToolDefinition,
  weatherTool as AnyToolDefinition,
  currencyTool as AnyToolDefinition,
  searchWebTool as AnyToolDefinition,
];

/**
 * Returns the subset of tools whose name appears in `enabled`. When `enabled`
 * is undefined (callers that don't care about per-tool gating, e.g. the mock
 * provider's intent dispatcher), every tool is returned. Empty array =
 * everything disabled — model gets no tools at all.
 */
const filterByEnabled = (enabled: readonly string[] | undefined): AnyToolDefinition[] => {
  if (enabled === undefined) return ALL_TOOLS;
  return ALL_TOOLS.filter((t) => enabled.includes(t.name));
};

/**
 * Maps each tool name to the FeatureFlagSchema key that gates it. Strategies
 * use this to compute the enabled-tools list at request time without hard-
 * coding flag names per provider — adding a new tool means adding ONE entry
 * here plus the flag in feature-flag.types.ts.
 */
export const TOOL_GATE_FLAGS = {
  calculator: 'TOOL_CALCULATOR_ENABLED',
  getCurrentTime: 'TOOL_CURRENT_TIME_ENABLED',
  getCurrentWeather: 'TOOL_CURRENT_WEATHER_ENABLED',
  convertCurrency: 'TOOL_CONVERT_CURRENCY_ENABLED',
  searchWeb: 'TOOL_SEARCH_WEB_ENABLED',
} as const;

export type ToolGateFlagName = (typeof TOOL_GATE_FLAGS)[keyof typeof TOOL_GATE_FLAGS];

/** Lookup by name. Returns undefined for unknown tools. */
export const findTool = (name: string): AnyToolDefinition | undefined =>
  ALL_TOOLS.find((t) => t.name === name);

/**
 * Run a tool by name. Validates args through the tool's zod schema first so
 * malformed inputs are rejected before the implementation runs. Errors are
 * caught and returned as a structured `{ error }` payload — the LLM can read
 * that and apologise to the user instead of the whole stream blowing up.
 */
export const executeTool = async (name: string, rawArgs: unknown): Promise<unknown> => {
  const def = findTool(name);
  if (!def) {
    return { error: `unknown_tool: ${name}` };
  }
  const parsed = def.parameters.safeParse(rawArgs);
  if (!parsed.success) {
    return { error: 'invalid_arguments', details: parsed.error.issues };
  }
  try {
    return await def.execute(parsed.data);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'tool_execution_failed' };
  }
};

/**
 * Anthropic input-schema shape — Anthropic SDK requires `type: 'object'`
 * at the root with `properties` + optional `required`. zodToJsonSchema
 * generates this exact shape from a `z.object({...})` parameter schema.
 */
interface AnthropicInputSchema {
  type: 'object';
  properties?: unknown;
  [k: string]: unknown;
}

/**
 * Anthropic schema: each tool needs name + description + JSON Schema in
 * `input_schema`. Generated from the zod schema so the source of truth
 * stays in `<tool>.tool.ts`.
 *
 * `enabled` (optional): list of tool names to include — defaults to all.
 * Strategies pass the per-flag-filtered list so disabled tools don't reach
 * the model in the first place.
 */
export const toAnthropicTools = (
  enabled?: readonly string[],
): Array<{
  name: string;
  description: string;
  input_schema: AnthropicInputSchema;
}> =>
  filterByEnabled(enabled).map((t) => {
    // `jsonSchema7` produces draft-07, which Anthropic accepts under their
    // "must match JSON Schema draft 2020-12" rule (the keywords we use —
    // type, properties, required, enum, minimum/maximum — are unchanged
    // between drafts). The earlier `openApi3` target was invalid: Anthropic
    // returned 400 on the currency tool because OpenAPI's enum encoding
    // diverges from the JSON Schema spec they validate against.
    const raw = zodToJsonSchema(t.parameters, {
      target: 'jsonSchema7',
      $refStrategy: 'none',
    }) as { $schema?: string } & Record<string, unknown>;
    // Strip the $schema marker — Anthropic rejects extra top-level fields.
    delete raw.$schema;
    return {
      name: t.name,
      description: t.description,
      input_schema: raw as unknown as AnthropicInputSchema,
    };
  });

/**
 * Vercel AI SDK shape: a `Record<name, ai.tool(...)>`. Used by Groq +
 * OpenAI providers (which both speak the OpenAI-compatible Vercel AI SDK
 * tool protocol).
 */
export const toAiSdkTools = (enabled?: readonly string[]): ToolSet => {
  const out: ToolSet = {};
  for (const t of filterByEnabled(enabled)) {
    out[t.name] = tool({
      description: t.description,
      parameters: t.parameters,
      execute: async (args: unknown) => executeTool(t.name, args),
    });
  }
  return out;
};

/**
 * Mock-provider helper: walk every tool's `detectIntent`, fire the first
 * match. Lets the deterministic mock provider exercise tools end-to-end
 * without a real model. Honours the same `enabled` allowlist so the mock
 * stays consistent with the real providers.
 */
export const detectToolIntent = async (
  prompt: string,
  enabled?: readonly string[],
): Promise<{ name: string; args: unknown; result: unknown } | null> => {
  for (const t of filterByEnabled(enabled)) {
    const args = t.detectIntent?.(prompt);
    if (args == null) continue;
    const result = await executeTool(t.name, args);
    return { name: t.name, args: args as unknown, result };
  }
  return null;
};

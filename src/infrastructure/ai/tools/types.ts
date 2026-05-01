import { z, type ZodType } from 'zod';

/**
 * Provider-agnostic tool definition. Each tool owns its zod schema (used for
 * Anthropic JSON-schema generation + Vercel AI SDK validation), an `execute`
 * implementation, and an optional `detectIntent` heuristic so the
 * MockAiProvider can fire it deterministically without a real model.
 */
export interface ToolDefinition<TArgs = unknown, TResult = unknown> {
  name: string;
  description: string;
  parameters: ZodType<TArgs>;
  execute: (args: TArgs) => Promise<TResult> | TResult;
  /**
   * Mock-provider intent detector. Returns the parsed args when the prompt
   * matches, or `null` to skip. Real models don't need this — they pick a
   * tool from the schema directly.
   */
  detectIntent?: (prompt: string) => TArgs | null;
}

export type AnyToolDefinition = ToolDefinition<unknown, unknown>;

/** Helper for narrowing `z.infer<typeof tool.parameters>` at call sites. */
export type ArgsOf<T extends AnyToolDefinition> =
  T['parameters'] extends ZodType<infer A> ? A : never;

// `z` is re-exported here so each tool file can `import { z } from './types'`
// and we keep zod's transitive dependency declared in one place.
export { z };

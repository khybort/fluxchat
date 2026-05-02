import { z, type ZodType } from 'zod';

import type { Logger } from '../../logger/logger.js';

/**
 * Per-tool feature-flag spec. Each tool declares its own flag name + default
 * — registry derives `TOOL_GATE_FLAGS` and `TOOL_FLAG_DEFAULTS` from these,
 * so adding a new tool is a single-file change (the tool itself).
 *
 * `name` MUST match the `TOOL_<UPPER>_ENABLED` template — the template type
 * catches a missing `TOOL_` prefix or `_ENABLED` suffix at compile time, and
 * `TOOL_FLAG_PATTERN` in feature-flag.parser.ts enforces the all-caps body
 * at parse time.
 */
export interface ToolFlagSpec {
  name: `TOOL_${string}_ENABLED`;
  default: boolean;
}

/**
 * Per-execution context passed to every tool's `execute`. Threads the
 * request-scoped logger and the abort signal so tools don't reach into
 * `Logger.getInstance()` or run unbounded after the client disconnects.
 *
 * Providers fill this in when they invoke `executeTool` / `toAiSdkTools` /
 * `detectToolIntent`. For the non-streaming `complete` path the signal is a
 * fresh, never-aborted controller (the SDK call already manages its own
 * lifecycle); the streaming path forwards the request's signal so tool work
 * stops the moment the client disconnects.
 */
export interface ToolContext {
  logger: Logger;
  signal: AbortSignal;
}

/**
 * Provider-agnostic tool definition. Each tool owns its zod schema (used for
 * Anthropic JSON-schema generation + Vercel AI SDK validation), an `execute`
 * implementation, an optional `detectIntent` heuristic so the
 * MockAiProvider can fire it deterministically without a real model, and the
 * flag spec that gates it at runtime.
 */
export interface ToolDefinition<TArgs = unknown, TResult = unknown> {
  name: string;
  description: string;
  parameters: ZodType<TArgs>;
  execute: (args: TArgs, ctx: ToolContext) => Promise<TResult> | TResult;
  /**
   * Mock-provider intent detector. Returns the parsed args when the prompt
   * matches, or `null` to skip. Real models don't need this — they pick a
   * tool from the schema directly.
   */
  detectIntent?: (prompt: string) => TArgs | null;
  /** Single source of truth for the per-tool feature flag. */
  flag: ToolFlagSpec;
}

export type AnyToolDefinition = ToolDefinition<unknown, unknown>;

/** Helper for narrowing `z.infer<typeof tool.parameters>` at call sites. */
export type ArgsOf<T extends AnyToolDefinition> =
  T['parameters'] extends ZodType<infer A> ? A : never;

// `z` is re-exported here so each tool file can `import { z } from './types'`
// and we keep zod's transitive dependency declared in one place.
export { z };

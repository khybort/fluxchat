import type { ChatTurn } from './ai.types.js';
import type { Logger } from '../logger/logger.js';

/**
 * Anthropic-shaped message objects. Their wire format collapses our `system`
 * role into a top-level `system` parameter (handled separately) and only
 * accepts `user` + `assistant` here.
 */
export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Streaming-time block accumulator. Tool-use blocks arrive split across many
 * `input_json_delta` events — we accumulate the JSON fragment string here
 * until `content_block_stop` lets us parse + execute the tool.
 */
export type StreamingBlock =
  | { kind: 'text'; text: string }
  | { kind: 'tool_use'; id: string; name: string; inputJson: string };

/** Bookkeeping for one tool that fired during a streaming turn. */
export interface ExecutedTool {
  block: Extract<StreamingBlock, { kind: 'tool_use' }>;
  args: Record<string, unknown>;
  result: unknown;
}

/**
 * Convert our domain history + new user prompt into the user/assistant pairs
 * Anthropic's API accepts. System turns are handled separately by
 * {@link extractSystemPrompt} so they reach the SDK's top-level `system` field
 * rather than being smuggled into the message list.
 */
export const toAnthropicMessages = (history: ChatTurn[], prompt: string): AnthropicMessage[] => {
  const filtered = history.filter((t) => t.role !== 'system');
  const merged = [...filtered, { role: 'user' as const, content: prompt }];
  return merged.map((turn) => ({
    role: turn.role === 'system' ? 'user' : turn.role,
    content: turn.content,
  }));
};

/**
 * Pull every `system` turn out of history and join with blank-line separators.
 * Returns undefined when no system turns exist so the SDK call omits the
 * `system` parameter entirely (Anthropic returns 400 on an empty string).
 */
export const extractSystemPrompt = (history: ChatTurn[]): string | undefined => {
  const systems = history.filter((t) => t.role === 'system').map((t) => t.content);
  return systems.length > 0 ? systems.join('\n\n') : undefined;
};

/**
 * Parse a tool's argument JSON safely. Empty / malformed input degrades to
 * `{}` so the tool's zod schema produces the canonical "missing required
 * arg" diagnostic instead of crashing the stream loop.
 */
export const safeParseJson = (input: string, logger: Logger): Record<string, unknown> => {
  if (!input.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(input);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch (error: unknown) {
    logger.pino.debug(
      { err: error, inputPreview: input.slice(0, 80) },
      'tool_args_json_parse_failed',
    );
    return {};
  }
};

/**
 * Render the tool results back into the `tool_result` blocks Anthropic
 * expects on the follow-up `user` turn that resumes after a tool_use stop.
 */
export const toToolResultBlocks = (
  executed: readonly ExecutedTool[],
): Array<{ type: 'tool_result'; tool_use_id: string; content: string }> =>
  executed.map((t) => ({
    type: 'tool_result' as const,
    tool_use_id: t.block.id,
    content: JSON.stringify(t.result),
  }));

import type { Anthropic } from '@anthropic-ai/sdk';

import type { CompletionRequest, CompletionStreamEvent } from './ai.types.js';
import {
  type ExecutedTool,
  type StreamingBlock,
  safeParseJson,
} from './anthropic-message.mapper.js';
import { executeTool } from './tools/registry.js';
import type { Logger } from '../logger/logger.js';

/** Per-turn mutable state shared between the event handler + the outer loop. */
export interface TurnState {
  executedTools: ExecutedTool[];
  stopReason?: string;
  deltaText: string;
}

interface StreamHandlerCtx {
  logger: Logger;
  signal: AbortSignal;
  request: CompletionRequest;
}

/**
 * Consume one turn's SDK event stream. Yields delta + tool_execution events
 * to the caller and accumulates side-effects (tool calls, stop reason,
 * delta text) into `state` for the outer agentic loop. Always aborts the
 * underlying HTTP stream when the iterator exits early so the SDK doesn't
 * keep the connection pinned.
 */
export async function* processTurnStream(
  turnStream: ReturnType<Anthropic['messages']['stream']>,
  ctx: StreamHandlerCtx,
  state: TurnState,
): AsyncIterable<CompletionStreamEvent> {
  const blocks = new Map<number, StreamingBlock>();
  let iteratorCompleted = false;
  try {
    for await (const event of turnStream) {
      if (ctx.signal.aborted) break;
      yield* handleStreamEvent(event, blocks, ctx, state);
    }
    iteratorCompleted = true;
  } catch (error: unknown) {
    ctx.logger.pino.error({ err: error }, 'anthropic_stream_error');
    throw error;
  } finally {
    if (!iteratorCompleted) {
      turnStream.controller?.abort();
    }
  }
}

async function* handleStreamEvent(
  event: Anthropic.Messages.RawMessageStreamEvent,
  blocks: Map<number, StreamingBlock>,
  ctx: StreamHandlerCtx,
  state: TurnState,
): AsyncIterable<CompletionStreamEvent> {
  if (event.type === 'content_block_start') {
    registerBlockStart(blocks, event);
    return;
  }
  if (event.type === 'content_block_delta') {
    const delta = applyBlockDelta(blocks, event);
    if (delta) {
      state.deltaText += delta;
      yield { type: 'delta', text: delta };
    }
    return;
  }
  if (event.type === 'content_block_stop') {
    const toolEvent = await executeToolBlockIfPresent(blocks, event, ctx, state);
    if (toolEvent) yield toolEvent;
    return;
  }
  if (event.type === 'message_delta' && event.delta.stop_reason) {
    state.stopReason = event.delta.stop_reason;
  }
}

const executeToolBlockIfPresent = async (
  blocks: Map<number, StreamingBlock>,
  event: Extract<Anthropic.Messages.RawMessageStreamEvent, { type: 'content_block_stop' }>,
  ctx: StreamHandlerCtx,
  state: TurnState,
): Promise<CompletionStreamEvent | null> => {
  const block = blocks.get(event.index);
  if (block?.kind !== 'tool_use' || !ctx.request.toolsEnabled) return null;
  const args = safeParseJson(block.inputJson, ctx.logger);
  const result = await executeTool(block.name, args, { logger: ctx.logger, signal: ctx.signal });
  state.executedTools.push({ block, args, result });
  return { type: 'tool_execution', tool: { name: block.name, args, result } };
};

const registerBlockStart = (
  blocks: Map<number, StreamingBlock>,
  event: Extract<Anthropic.Messages.RawMessageStreamEvent, { type: 'content_block_start' }>,
): void => {
  const cb = event.content_block;
  if (cb.type === 'tool_use') {
    blocks.set(event.index, { kind: 'tool_use', id: cb.id, name: cb.name, inputJson: '' });
  } else if (cb.type === 'text') {
    blocks.set(event.index, { kind: 'text', text: '' });
  }
};

const applyBlockDelta = (
  blocks: Map<number, StreamingBlock>,
  event: Extract<Anthropic.Messages.RawMessageStreamEvent, { type: 'content_block_delta' }>,
): string | null => {
  const block = blocks.get(event.index);
  if (!block) return null;
  if (event.delta.type === 'text_delta' && block.kind === 'text') {
    block.text += event.delta.text;
    return event.delta.text;
  }
  if (event.delta.type === 'input_json_delta' && block.kind === 'tool_use') {
    block.inputJson += event.delta.partial_json;
  }
  return null;
};

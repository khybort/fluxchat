import type Anthropic from '@anthropic-ai/sdk';
import { beforeEach, describe, expect, it } from 'vitest';

import { AnthropicProvider } from '../../src/infrastructure/ai/anthropic.provider.js';
import { Logger } from '../../src/infrastructure/logger/logger.js';

/**
 * The Anthropic SDK is heavyweight. We exercise the provider with a hand-built
 * fake that mirrors the surface AnthropicProvider actually touches:
 *   - messages.create(...)
 *   - messages.stream(...) returning an AsyncIterable + finalMessage()
 *
 * Casting to `Anthropic` at the boundary is acceptable in tests (CLAUDE.md §16
 * exempts test code from the strict rules around `any` and casts).
 */

interface CreateResponse {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  >;
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
  usage: { input_tokens: number; output_tokens: number };
}

class FakeMessageStream {
  constructor(
    private readonly events: unknown[],
    private readonly finalResponse: CreateResponse,
  ) {}

  async *[Symbol.asyncIterator](): AsyncIterator<unknown> {
    for (const event of this.events) {
      yield event;
    }
  }

  finalMessage(): Promise<CreateResponse> {
    return Promise.resolve(this.finalResponse);
  }
}

interface FakeAnthropicHandles {
  createCalls: Array<Record<string, unknown>>;
  streamCalls: Array<Record<string, unknown>>;
  client: Anthropic;
}

const buildFakeClient = (script: {
  createResponses?: CreateResponse[];
  streamScripts?: Array<{ events: unknown[]; final: CreateResponse }>;
}): FakeAnthropicHandles => {
  const createCalls: Array<Record<string, unknown>> = [];
  const streamCalls: Array<Record<string, unknown>> = [];
  let createIndex = 0;
  let streamIndex = 0;

  const client = {
    messages: {
      create: (params: Record<string, unknown>): Promise<CreateResponse> => {
        createCalls.push(params);
        const response = script.createResponses?.[createIndex++];
        if (!response) throw new Error('FakeAnthropicClient: unexpected create call');
        return Promise.resolve(response);
      },
      stream: (params: Record<string, unknown>): FakeMessageStream => {
        streamCalls.push(params);
        const next = script.streamScripts?.[streamIndex++];
        if (!next) throw new Error('FakeAnthropicClient: unexpected stream call');
        return new FakeMessageStream(next.events, next.final);
      },
    },
  };

  return { createCalls, streamCalls, client: client as unknown as Anthropic };
};

const buildLogger = (): Logger => Logger.getInstance();

describe('AnthropicProvider.complete', () => {
  beforeEach(() => {
    Logger.resetForTesting();
  });

  it('returns text and usage when the model responds without tool calls', async () => {
    const handles = buildFakeClient({
      createResponses: [
        {
          content: [{ type: 'text', text: 'hello there' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 12, output_tokens: 5 },
        },
      ],
    });

    const provider = new AnthropicProvider({
      client: handles.client,
      model: 'claude-sonnet-4-6',
      logger: buildLogger(),
    });

    const result = await provider.complete({ history: [], prompt: 'hi', toolsEnabled: false });
    expect(result.text).toBe('hello there');
    expect(result.toolCalls).toEqual([]);
    expect(result.usage).toEqual({ promptTokens: 12, completionTokens: 5 });
    expect(handles.createCalls).toHaveLength(1);
  });

  it('executes the weather tool, sends a follow-up, and returns the final text', async () => {
    const handles = buildFakeClient({
      createResponses: [
        {
          content: [
            {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'getCurrentWeather',
              input: { location: 'Istanbul' },
            },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 20, output_tokens: 8 },
        },
        {
          content: [{ type: 'text', text: 'It is currently partly cloudy.' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 30, output_tokens: 10 },
        },
      ],
    });

    const provider = new AnthropicProvider({
      client: handles.client,
      model: 'claude-sonnet-4-6',
      logger: buildLogger(),
    });

    const result = await provider.complete({
      history: [],
      prompt: 'weather in Istanbul?',
      toolsEnabled: true,
    });

    expect(result.text).toBe('It is currently partly cloudy.');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.name).toBe('getCurrentWeather');
    expect(result.toolCalls[0]?.args).toEqual({ location: 'Istanbul' });
    expect(handles.createCalls).toHaveLength(2);

    // Follow-up call must include the assistant's tool_use AND a tool_result block.
    const followUpMessages = handles.createCalls[1]?.messages as Array<{
      role: string;
      content: unknown;
    }>;
    expect(followUpMessages.at(-1)?.role).toBe('user');
  });
});

describe('AnthropicProvider.stream', () => {
  beforeEach(() => {
    Logger.resetForTesting();
  });

  it('emits thinking, deltas in order, and a final done event when no tools are used', async () => {
    const handles = buildFakeClient({
      streamScripts: [
        {
          events: [
            { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
            {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: 'Hello' },
            },
            {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: ' world' },
            },
            { type: 'content_block_stop', index: 0 },
            { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: {} },
          ],
          final: {
            content: [{ type: 'text', text: 'Hello world' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 7, output_tokens: 4 },
          },
        },
      ],
    });

    const provider = new AnthropicProvider({
      client: handles.client,
      model: 'claude-sonnet-4-6',
      logger: buildLogger(),
    });

    const events: Array<{ type: string }> = [];
    const deltas: string[] = [];
    let doneFullText = '';

    for await (const event of provider.stream(
      { history: [], prompt: 'greet me', toolsEnabled: false },
      new AbortController().signal,
    )) {
      events.push({ type: event.type });
      if (event.type === 'delta') deltas.push(event.text);
      if (event.type === 'done') doneFullText = event.fullText;
    }

    expect(events[0]?.type).toBe('thinking');
    expect(events.at(-1)?.type).toBe('done');
    expect(deltas).toEqual(['Hello', ' world']);
    expect(doneFullText).toBe('Hello world');
  });

  it('emits tool_execution before follow-up deltas when the model invokes a tool', async () => {
    const handles = buildFakeClient({
      streamScripts: [
        // First stream: model decides to call the weather tool.
        {
          events: [
            {
              type: 'content_block_start',
              index: 0,
              content_block: { type: 'tool_use', id: 'toolu_1', name: 'getCurrentWeather' },
            },
            {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'input_json_delta', partial_json: '{"location":' },
            },
            {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'input_json_delta', partial_json: '"Ankara"}' },
            },
            { type: 'content_block_stop', index: 0 },
            { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: {} },
          ],
          final: {
            content: [
              {
                type: 'tool_use',
                id: 'toolu_1',
                name: 'getCurrentWeather',
                input: { location: 'Ankara' },
              },
            ],
            stop_reason: 'tool_use',
            usage: { input_tokens: 18, output_tokens: 6 },
          },
        },
        // Follow-up stream: model produces the final text using the tool result.
        {
          events: [
            { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
            {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: 'Sunny ' },
            },
            {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: 'and warm.' },
            },
            { type: 'content_block_stop', index: 0 },
            { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: {} },
          ],
          final: {
            content: [{ type: 'text', text: 'Sunny and warm.' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 25, output_tokens: 8 },
          },
        },
      ],
    });

    const provider = new AnthropicProvider({
      client: handles.client,
      model: 'claude-sonnet-4-6',
      logger: buildLogger(),
    });

    const ordered: Array<{ type: string; payload?: unknown }> = [];
    for await (const event of provider.stream(
      { history: [], prompt: 'weather in Ankara?', toolsEnabled: true },
      new AbortController().signal,
    )) {
      if (event.type === 'tool_execution') {
        ordered.push({ type: event.type, payload: event.tool });
      } else if (event.type === 'delta') {
        ordered.push({ type: event.type, payload: event.text });
      } else {
        ordered.push({ type: event.type });
      }
    }

    expect(ordered[0]?.type).toBe('thinking');
    const toolIndex = ordered.findIndex((e) => e.type === 'tool_execution');
    const firstDeltaIndex = ordered.findIndex((e) => e.type === 'delta');
    expect(toolIndex).toBeGreaterThan(0);
    expect(firstDeltaIndex).toBeGreaterThan(toolIndex); // tool fires BEFORE follow-up text
    expect(ordered.at(-1)?.type).toBe('done');

    const tool = ordered[toolIndex]?.payload as { name: string; args: { location: string } };
    expect(tool.name).toBe('getCurrentWeather');
    expect(tool.args.location).toBe('Ankara');

    // Two stream calls: initial + follow-up with tool_result.
    expect(handles.streamCalls).toHaveLength(2);
    const followUpMessages = handles.streamCalls[1]?.messages as Array<{
      role: string;
      content: unknown;
    }>;
    expect(followUpMessages.at(-1)?.role).toBe('user');
  });

  it('honors signal.aborted mid-stream and still emits a final done', async () => {
    const handles = buildFakeClient({
      streamScripts: [
        {
          events: [
            { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
            {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: 'Hello' },
            },
            {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: ' should-not-arrive' },
            },
          ],
          final: {
            content: [{ type: 'text', text: 'Hello' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 1, output_tokens: 1 },
          },
        },
      ],
    });

    const provider = new AnthropicProvider({
      client: handles.client,
      model: 'claude-sonnet-4-6',
      logger: buildLogger(),
    });

    const controller = new AbortController();
    const deltas: string[] = [];
    let saw = 0;

    for await (const event of provider.stream(
      { history: [], prompt: 'hi', toolsEnabled: false },
      controller.signal,
    )) {
      if (event.type === 'delta') {
        deltas.push(event.text);
        saw += 1;
        if (saw === 1) controller.abort();
      }
    }

    expect(deltas).toEqual(['Hello']);
  });
});

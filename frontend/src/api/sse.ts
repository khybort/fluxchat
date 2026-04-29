import { ApiError, apiUrl, buildHeaders } from './client';
import type { StreamEvent } from './types';

interface ParsedFrame {
  event: string;
  data: string;
}

/**
 * Parse one SSE buffer chunk into discrete frames separated by blank lines.
 * Yields the parsed frames and returns the unconsumed tail (incomplete frame).
 */
const parseFrames = (buffer: string): { frames: ParsedFrame[]; rest: string } => {
  const frames: ParsedFrame[] = [];
  let rest = buffer;
  for (;;) {
    const sep = rest.indexOf('\n\n');
    if (sep === -1) break;
    const block = rest.slice(0, sep);
    rest = rest.slice(sep + 2);

    let event = 'message';
    const dataLines: string[] = [];
    for (const rawLine of block.split('\n')) {
      const line = rawLine.replace(/\r$/, '');
      if (!line || line.startsWith(':')) continue;
      const colonIdx = line.indexOf(':');
      const field = colonIdx === -1 ? line : line.slice(0, colonIdx);
      const value =
        colonIdx === -1
          ? ''
          : line.slice(colonIdx + 1).startsWith(' ')
            ? line.slice(colonIdx + 2)
            : line.slice(colonIdx + 1);
      if (field === 'event') event = value;
      else if (field === 'data') dataLines.push(value);
    }
    frames.push({ event, data: dataLines.join('\n') });
  }
  return { frames, rest };
};

const toStreamEvent = (frame: ParsedFrame): StreamEvent | null => {
  let data: unknown = {};
  if (frame.data) {
    try {
      data = JSON.parse(frame.data);
    } catch {
      data = {};
    }
  }
  const obj = (data ?? {}) as Record<string, unknown>;

  switch (frame.event) {
    case 'thinking':
      return { type: 'thinking' };
    case 'tool_execution':
      return {
        type: 'tool_execution',
        tool: {
          name: String(obj.name ?? 'unknown'),
          args: (obj.args as Record<string, unknown> | undefined) ?? {},
          result: obj.result,
        },
      };
    case 'delta':
      return { type: 'delta', text: String(obj.text ?? '') };
    case 'done':
      return {
        type: 'done',
        fullText: String(obj.fullText ?? ''),
        usage: obj.usage as StreamEvent extends { type: 'done'; usage?: infer U } ? U : never,
      };
    case 'error':
      return {
        type: 'error',
        code: String(obj.code ?? 'STREAM_ERROR'),
        message: String(obj.message ?? 'Stream error'),
      };
    default:
      return null;
  }
};

export interface StreamRequest {
  path: string;
  body: unknown;
  token: string;
  signal?: AbortSignal;
}

/**
 * Open a POST SSE stream and yield typed events. The backend completion endpoint
 * uses POST + text/event-stream (`fetch` + ReadableStream) — `EventSource` only
 * supports GET, so we parse the stream manually.
 *
 * Throws `ApiError` on non-2xx responses (parsing the JSON error body).
 */
export async function* openSseStream(req: StreamRequest): AsyncGenerator<StreamEvent> {
  const headers = buildHeaders(req.token, {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  });
  const res = await fetch(apiUrl(req.path), {
    method: 'POST',
    headers,
    body: JSON.stringify(req.body),
    signal: req.signal,
  });

  if (!res.ok) {
    let parsed: { error?: { code?: string; message?: string } } = {};
    try {
      parsed = (await res.json()) as typeof parsed;
    } catch {
      /* ignore */
    }
    throw new ApiError(
      res.status,
      parsed.error?.code ?? `HTTP_${res.status}`,
      parsed.error?.message ?? res.statusText ?? 'Stream request failed',
    );
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('Streaming not supported in this environment');

  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { frames, rest } = parseFrames(buffer);
      buffer = rest;
      for (const frame of frames) {
        const event = toStreamEvent(frame);
        if (event) yield event;
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Drain any final frame without trailing blank line
  buffer += decoder.decode();
  if (buffer.trim()) {
    const { frames } = parseFrames(`${buffer}\n\n`);
    for (const frame of frames) {
      const event = toStreamEvent(frame);
      if (event) yield event;
    }
  }
}

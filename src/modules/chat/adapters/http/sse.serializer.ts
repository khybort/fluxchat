import type { Response } from 'express';

import type { CompletionStreamEvent } from '../../../../infrastructure/ai/ai.types.js';

/**
 * EventSource auto-reconnect interval in ms. The browser respects this when
 * the underlying connection drops. 5s is a safe default — long enough to
 * absorb a transient network blip, short enough to feel responsive.
 */
const SSE_RETRY_MS = 5000;

/**
 * Heartbeat cadence — comment frames keep idle connections alive past
 * proxies that idle-time-out (Vercel's edge, nginx, Cloudflare). 15s is
 * comfortably under all common defaults.
 */
const SSE_HEARTBEAT_MS = 15_000;

let frameCounter = 0;
const nextFrameId = (): string => {
  frameCounter += 1;
  return `${Date.now().toString(36)}-${frameCounter.toString(36)}`;
};

/**
 * Serializes the AI provider's discrete events into Server-Sent Events frames.
 * Lives next to the controller because the format is part of the HTTP contract,
 * not part of the domain.
 *
 * Reconnect semantics:
 *   - `retry: 5000` is sent once on stream open; EventSource caches it.
 *   - Each frame carries a unique `id:` so the browser has a Last-Event-ID
 *     it can replay on reconnect (we read but don't currently rewind — the
 *     completion stream isn't deterministically resumable; the client should
 *     re-fetch history if it sees a mid-stream drop).
 *   - A 15s heartbeat (comment frame) keeps idle connections alive across
 *     intermediary proxies. The interval handle is returned so the controller
 *     can clear it when the AI run finishes or the client disconnects.
 */
export class SseSerializer {
  public openStream(res: Response): NodeJS.Timeout {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write(`retry: ${SSE_RETRY_MS}\n\n`);

    return setInterval(() => {
      // Comment frames are ignored by the EventSource API but flow through
      // proxies as keep-alive bytes. No-op once the response is closed.
      if (!res.writableEnded) {
        res.write(': ping\n\n');
      }
    }, SSE_HEARTBEAT_MS);
  }

  public write(res: Response, event: CompletionStreamEvent): void {
    if (event.type === 'thinking') {
      this.frame(res, 'thinking', {});
      return;
    }
    if (event.type === 'tool_execution') {
      this.frame(res, 'tool_execution', event.tool);
      return;
    }
    if (event.type === 'delta') {
      this.frame(res, 'delta', { text: event.text });
      return;
    }
    if (event.type === 'done') {
      this.frame(res, 'done', { fullText: event.fullText, usage: event.usage });
    }
  }

  public end(res: Response, heartbeat?: NodeJS.Timeout): void {
    if (heartbeat) clearInterval(heartbeat);
    res.end();
  }

  public writeError(res: Response, code: string, message: string): void {
    this.frame(res, 'error', { code, message });
  }

  private frame(res: Response, eventName: string, data: unknown): void {
    res.write(`id: ${nextFrameId()}\n`);
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

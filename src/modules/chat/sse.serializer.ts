import type { Response } from 'express';

import type { CompletionStreamEvent } from '../../infrastructure/ai/ai.types.js';

/**
 * Serializes the AI provider's discrete events into Server-Sent Events frames.
 * Lives next to the controller because the format is part of the HTTP contract,
 * not part of the domain.
 */
export class SseSerializer {
  public openStream(res: Response): void {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
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

  public end(res: Response): void {
    res.end();
  }

  public writeError(res: Response, code: string, message: string): void {
    this.frame(res, 'error', { code, message });
  }

  private frame(res: Response, eventName: string, data: unknown): void {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

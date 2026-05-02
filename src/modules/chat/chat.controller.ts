import type { Request, Response } from 'express';

import type {
  ChatIdParams,
  CompletionBody,
  CreateChatBody,
  HistoryQuery,
  ListChatsQuery,
} from './chat.dto.js';
import type { ChatService } from './chat.service.js';
import type { CompletionService } from './completion.service.js';
import type { HistoryService } from './history.service.js';
import { SseSerializer } from './sse.serializer.js';
import type { CompletionResult } from './strategies/completion.strategy.js';
import { UnauthorizedError } from '../../shared/errors/app-error.js';
import { flagContextFrom } from '../../shared/feature-flags/context.js';

const requireUser = (req: Request): { id: string; email: string } => {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
};

type CompletionRunner = (signal: AbortSignal) => Promise<CompletionResult>;

/**
 * Controllers speak HTTP only. Validation is done by `validateRequest` middleware
 * before this runs, so the cast to the DTO type at the top of each method is safe
 * (CLAUDE.md §11). Errors thrown here are surfaced via `asyncHandler` to the
 * global error handler — no per-method try/catch required.
 */
export class ChatController {
  private readonly sse: SseSerializer;

  constructor(
    private readonly chatService: ChatService,
    private readonly completionService: CompletionService,
    private readonly historyService: HistoryService,
  ) {
    this.sse = new SseSerializer();
  }

  public createChat = async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const body = req.body as CreateChatBody;
    const chat = await this.chatService.createChat({
      userId: user.id,
      ...(body.title !== undefined ? { title: body.title } : {}),
    });
    res.status(201).json(chat);
  };

  public listChats = async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const query = req.query as ListChatsQuery;
    const result = await this.chatService.listChats({
      userId: user.id,
      cursor: query.cursor,
      limit: query.limit,
    });
    res.status(200).json(result);
  };

  public deleteChat = async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const { chatId } = req.params as { chatId: string };
    await this.chatService.deleteChat(chatId, user.id);
    res.status(204).send();
  };

  public archiveChat = async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const { chatId } = req.params as { chatId: string };
    await this.chatService.archiveChat(chatId, user.id);
    res.status(204).send();
  };

  public unarchiveChat = async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const { chatId } = req.params as { chatId: string };
    await this.chatService.unarchiveChat(chatId, user.id);
    res.status(204).send();
  };

  public listArchivedChats = async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const query = req.query as ListChatsQuery;
    const result = await this.chatService.listArchivedChats({
      userId: user.id,
      cursor: query.cursor,
      limit: query.limit,
    });
    res.status(200).json(result);
  };

  public getHistory = async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const params = req.params as unknown as ChatIdParams;
    const query = req.query as HistoryQuery;
    const result = await this.historyService.getHistory({
      chatId: params.chatId,
      userId: user.id,
      cursor: query.cursor,
      limit: query.limit,
      flagCtx: flagContextFrom(req),
    });
    res.status(200).json(result);
  };

  public regenerate = async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const params = req.params as unknown as ChatIdParams;
    await this.streamCompletion(req, res, 'regenerate', (signal) =>
      this.completionService.regenerate({
        chatId: params.chatId,
        userId: user.id,
        signal,
        flagCtx: flagContextFrom(req),
      }),
    );
  };

  public completion = async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const params = req.params as unknown as ChatIdParams;
    const body = req.body as CompletionBody;
    await this.streamCompletion(req, res, 'completion', (signal) =>
      this.completionService.run({
        chatId: params.chatId,
        userId: user.id,
        prompt: body.message,
        signal,
        flagCtx: flagContextFrom(req),
      }),
    );
  };

  /**
   * Owns the streaming lifecycle for both completion and regenerate:
   *   - Wires `req.aborted` to an AbortController so client disconnects cancel
   *     the upstream AI call.
   *   - Returns JSON when the strategy says so; otherwise opens an SSE stream,
   *     forwards events, and emits a typed error event if the iterator throws.
   *   - Always tears down the heartbeat in `finally`, even on JSON path or
   *     pre-stream errors, so no `setInterval` survives the request.
   */
  private async streamCompletion(
    req: Request,
    res: Response,
    label: 'completion' | 'regenerate',
    run: CompletionRunner,
  ): Promise<void> {
    const { signal, dispose } = bindAbortToRequest(req);
    try {
      const result = await run(signal);
      if (result.kind === 'json') {
        this.writeJsonCompletion(res, result);
        return;
      }
      await this.pumpStream(req, res, signal, label, result.events);
    } finally {
      dispose();
    }
  }

  private writeJsonCompletion(
    res: Response,
    result: Extract<CompletionResult, { kind: 'json' }>,
  ): void {
    res.status(200).json({
      message: { role: 'assistant', content: result.text },
      toolCalls: result.toolCalls,
      ...(result.usage ? { usage: result.usage } : {}),
    });
  }

  /**
   * Pump the strategy's async iterable into the open SSE stream until either
   * the iterator finishes, the client disconnects, or it throws. The local
   * try/catch is intentional: once headers are sent the global error handler
   * can't write a JSON envelope — we must emit an SSE `error` event ourselves.
   */
  private async pumpStream(
    req: Request,
    res: Response,
    signal: AbortSignal,
    label: 'completion' | 'regenerate',
    events: AsyncIterable<unknown>,
  ): Promise<void> {
    const heartbeat = this.sse.openStream(res);
    try {
      for await (const event of events) {
        if (signal.aborted) break;
        this.sse.write(res, event as Parameters<SseSerializer['write']>[1]);
      }
    } catch (streamError: unknown) {
      req.log.error({ err: streamError, label }, 'completion_stream_error');
      this.sse.writeError(res, 'STREAM_ERROR', 'Stream interrupted');
    } finally {
      this.sse.end(res, heartbeat);
    }
  }
}

/**
 * Bridge `req.aborted` to an AbortController so client disconnects cancel the
 * upstream AI call. Caller MUST invoke the returned `dispose` in a `finally`
 * block to detach the listener — leaking listeners is the most common cause
 * of memory growth on long-running SSE servers.
 */
const bindAbortToRequest = (req: Request): { signal: AbortSignal; dispose: () => void } => {
  const controller = new AbortController();
  const onAbort = (): void => controller.abort();
  req.on('aborted', onAbort);
  return {
    signal: controller.signal,
    dispose: () => req.off('aborted', onAbort),
  };
};

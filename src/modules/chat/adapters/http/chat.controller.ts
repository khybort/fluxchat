import type { Request, Response } from 'express';

import type {
  ChatIdParams,
  CompletionBody,
  CreateChatBody,
  HistoryQuery,
  ListChatsQuery,
} from './chat.dto.js';
import { SseSerializer } from './sse.serializer.js';
import { UnauthorizedError } from '../../../../shared/errors/app-error.js';
import { flagContextFrom } from '../../../../shared/feature-flags/context.js';
import type { CompletionResult } from '../../application/strategies/completion.strategy.js';
import type { ChatUseCases } from '../../application/use-cases/chat.use-cases.js';

const requireUser = (req: Request): { id: string; email: string } => {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
};

type CompletionRunner = (signal: AbortSignal) => Promise<CompletionResult>;

/**
 * Controllers speak HTTP only — they translate request → use case input,
 * delegate to a single use case via the bag, and shape the response. No
 * business logic, no flag reads, no `*Service` imports.
 *
 * The bag pattern (one `IUseCase` per endpoint) gives the controller
 * fine-grained ISP: each public method depends on exactly one operation,
 * so a test can swap out one use case without rebuilding the others.
 */
export class ChatController {
  private readonly sse: SseSerializer;

  constructor(private readonly useCases: ChatUseCases) {
    this.sse = new SseSerializer();
  }

  public createChat = async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const body = req.body as CreateChatBody;
    const chat = await this.useCases.createChat.execute({
      userId: user.id,
      ...(body.title !== undefined ? { title: body.title } : {}),
    });
    res.status(201).json(chat);
  };

  public listChats = async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const query = req.query as ListChatsQuery;
    const result = await this.useCases.listChats.execute({
      userId: user.id,
      cursor: query.cursor,
      limit: query.limit,
    });
    res.status(200).json(result);
  };

  public deleteChat = async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const { chatId } = req.params as { chatId: string };
    await this.useCases.deleteChat.execute({ chatId, userId: user.id });
    res.status(204).send();
  };

  public archiveChat = async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const { chatId } = req.params as { chatId: string };
    await this.useCases.archiveChat.execute({ chatId, userId: user.id });
    res.status(204).send();
  };

  public unarchiveChat = async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const { chatId } = req.params as { chatId: string };
    await this.useCases.unarchiveChat.execute({ chatId, userId: user.id });
    res.status(204).send();
  };

  public listArchivedChats = async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const query = req.query as ListChatsQuery;
    const result = await this.useCases.listArchivedChats.execute({
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
    const result = await this.useCases.getHistory.execute({
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
      this.useCases.regenerateCompletion.execute({
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
      this.useCases.runCompletion.execute({
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

const bindAbortToRequest = (req: Request): { signal: AbortSignal; dispose: () => void } => {
  const controller = new AbortController();
  const onAbort = (): void => controller.abort();
  req.on('aborted', onAbort);
  return {
    signal: controller.signal,
    dispose: () => req.off('aborted', onAbort),
  };
};

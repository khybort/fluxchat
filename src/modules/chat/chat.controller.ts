import type { NextFunction, Request, Response } from 'express';

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
import { UnauthorizedError } from '../../shared/errors/app-error.js';

const requireUser = (req: Request): { id: string; email: string } => {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
};

/**
 * Controllers speak HTTP only. Validation is done by `validateRequest` middleware
 * before this runs, so the cast to the DTO type at the top of each method is safe
 * (CLAUDE.md §11).
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

  public createChat = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const body = req.body as CreateChatBody;
      const chat = await this.chatService.createChat({
        userId: user.id,
        ...(body.title !== undefined ? { title: body.title } : {}),
      });
      res.status(201).json(chat);
    } catch (error) {
      next(error);
    }
  };

  public listChats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const query = req.query as ListChatsQuery;
      const result = await this.chatService.listChats({
        userId: user.id,
        cursor: query.cursor,
        limit: query.limit,
      });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  public deleteChat = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { chatId } = req.params as { chatId: string };
      await this.chatService.deleteChat(chatId, user.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  public getHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const params = req.params as unknown as ChatIdParams;
      const query = req.query as HistoryQuery;
      const result = await this.historyService.getHistory({
        chatId: params.chatId,
        userId: user.id,
        cursor: query.cursor,
        limit: query.limit,
      });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  public completion = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const controller = new AbortController();
    // Abort only when the *client* aborts the request, not when express emits
    // 'close' at the natural end of the response — which happens in supertest
    // immediately after the request body is consumed.
    const onAbort = (): void => controller.abort();
    req.on('aborted', onAbort);

    try {
      const user = requireUser(req);
      const params = req.params as unknown as ChatIdParams;
      const body = req.body as CompletionBody;
      const result = await this.completionService.run({
        chatId: params.chatId,
        userId: user.id,
        prompt: body.message,
        signal: controller.signal,
      });

      if (result.kind === 'json') {
        res.status(200).json({
          message: { role: 'assistant', content: result.text },
          toolCalls: result.toolCalls,
          ...(result.usage ? { usage: result.usage } : {}),
        });
        return;
      }

      const heartbeat = this.sse.openStream(res);
      try {
        for await (const event of result.events) {
          if (controller.signal.aborted) break;
          this.sse.write(res, event);
        }
      } catch (streamError) {
        req.log.error({ err: streamError }, 'completion_stream_error');
        this.sse.writeError(res, 'STREAM_ERROR', 'Stream interrupted');
      } finally {
        this.sse.end(res, heartbeat);
      }
    } catch (error) {
      next(error);
    } finally {
      req.off('aborted', onAbort);
    }
  };
}

import type { IMessageRepository } from './chat.repository.interface.js';
import type { ChatService } from './chat.service.js';
import type { CompletionStrategyFactory } from './strategies/completion-strategy.factory.js';
import type { CompletionResult } from './strategies/completion.strategy.js';
import type { ChatTurn } from '../../infrastructure/ai/ai.types.js';
import type { Logger } from '../../infrastructure/logger/logger.js';
import { withSpan } from '../../infrastructure/tracing/span.js';
import { LIMITED_HISTORY_COUNT } from '../../shared/constants.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { FlagContext } from '../../shared/feature-flags/feature-flag.types.js';

export interface RunCompletionInput {
  chatId: string;
  userId: string;
  prompt: string;
  signal: AbortSignal;
  /** Optional per-request flag context. Threaded into the strategy factory. */
  flagCtx?: FlagContext;
}

export interface RunRegenerateInput {
  chatId: string;
  userId: string;
  signal: AbortSignal;
  flagCtx?: FlagContext;
}

export class NoUserMessageError extends AppError {
  constructor() {
    super('NO_USER_MESSAGE', 422, 'No user message to regenerate from');
  }
}

export class CompletionService {
  constructor(
    private readonly chatService: ChatService,
    private readonly messages: IMessageRepository,
    private readonly factory: CompletionStrategyFactory,
    private readonly logger: Logger,
  ) {}

  public async run(input: RunCompletionInput): Promise<CompletionResult> {
    return withSpan('completion.run', async () => {
      await this.chatService.ensureOwnership(input.chatId, input.userId);

      // Persist the user message first so it appears in history even if the
      // AI call fails partway through.
      await this.messages.create({
        chatId: input.chatId,
        role: 'user',
        content: input.prompt,
      });

      const history = await this.buildHistory(input.chatId);

      const strategy = this.factory.build(input.signal, input.flagCtx);
      return strategy.execute({
        history,
        prompt: input.prompt,
        onComplete: async (assistantText, meta) => {
          if (!assistantText.trim()) {
            this.logger.pino.warn(
              { chatId: input.chatId },
              'completion_empty_assistant_text_skipped',
            );
            return;
          }
          await this.messages.create({
            chatId: input.chatId,
            role: 'assistant',
            content: assistantText,
            usage: {
              promptTokens: meta?.usage?.promptTokens ?? null,
              completionTokens: meta?.usage?.completionTokens ?? null,
              provider: meta?.provider ?? null,
              model: meta?.model ?? null,
            },
          });
        },
      });
    });
  }

  /**
   * Regenerate the last assistant turn. Finds the most recent user message,
   * deletes any assistant messages that came after it, and re-runs the model
   * with the same conversation context. Does NOT create a new user message.
   */
  public async regenerate(input: RunRegenerateInput): Promise<CompletionResult> {
    return withSpan('completion.regenerate', async () => {
      await this.chatService.ensureOwnership(input.chatId, input.userId);

      const recent = await this.messages.findLastN(input.chatId, LIMITED_HISTORY_COUNT * 2);
      let lastUser: (typeof recent)[number] | undefined;
      let lastUserIdx = -1;
      for (let i = recent.length - 1; i >= 0; i--) {
        const candidate = recent[i];
        if (candidate?.role === 'user') {
          lastUser = candidate;
          lastUserIdx = i;
          break;
        }
      }
      if (!lastUser) throw new NoUserMessageError();

      // Drop trailing assistant messages so the regenerated turn replaces the
      // stale one rather than stacking next to it.
      for (let i = lastUserIdx + 1; i < recent.length; i++) {
        const stale = recent[i];
        if (stale?.role === 'assistant') {
          await this.messages.deleteById(stale.id);
        }
      }

      const history = recent
        .slice(0, lastUserIdx)
        .map((m) => ({ role: m.role, content: m.content }));

      const strategy = this.factory.build(input.signal, input.flagCtx);
      return strategy.execute({
        history,
        prompt: lastUser.content,
        onComplete: async (assistantText, meta) => {
          if (!assistantText.trim()) {
            this.logger.pino.warn(
              { chatId: input.chatId },
              'regenerate_empty_assistant_text_skipped',
            );
            return;
          }
          await this.messages.create({
            chatId: input.chatId,
            role: 'assistant',
            content: assistantText,
            usage: {
              promptTokens: meta?.usage?.promptTokens ?? null,
              completionTokens: meta?.usage?.completionTokens ?? null,
              provider: meta?.provider ?? null,
              model: meta?.model ?? null,
            },
          });
        },
      });
    });
  }

  private async buildHistory(chatId: string): Promise<ChatTurn[]> {
    // Use the last N messages as model context regardless of CHAT_HISTORY_ENABLED:
    // that flag controls what we *return* to the client, not what we *send* to the model.
    const recent = await this.messages.findLastN(chatId, LIMITED_HISTORY_COUNT * 2);
    // Drop the just-inserted user message — it becomes the prompt.
    const withoutPrompt = recent.slice(0, -1);
    return withoutPrompt.map((m) => ({ role: m.role, content: m.content }));
  }
}

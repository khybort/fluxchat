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

interface CompletionMeta {
  usage?: { promptTokens?: number | null; completionTokens?: number | null };
  provider?: string | null;
  model?: string | null;
}

interface MessageRow {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const findLastUserMessageIndex = (messages: readonly MessageRow[]): number => {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') return i;
  }
  return -1;
};

export class CompletionService {
  constructor(
    private readonly chatService: ChatService,
    private readonly messages: IMessageRepository,
    private readonly factory: CompletionStrategyFactory,
    private readonly logger: Logger,
  ) {}

  public async run(input: RunCompletionInput): Promise<CompletionResult> {
    return withSpan(
      'completion.run',
      async () => {
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
          onComplete: (assistantText, meta) =>
            this.persistAssistantMessage(input.chatId, assistantText, meta, 'completion'),
        });
      },
      this.logger,
    );
  }

  /**
   * Regenerate the last assistant turn. Finds the most recent user message,
   * deletes any assistant messages that came after it, and re-runs the model
   * with the same conversation context. Does NOT create a new user message.
   */
  public async regenerate(input: RunRegenerateInput): Promise<CompletionResult> {
    return withSpan(
      'completion.regenerate',
      async () => {
        await this.chatService.ensureOwnership(input.chatId, input.userId);

        const recent = await this.messages.findLastN(input.chatId, LIMITED_HISTORY_COUNT * 2);
        const lastUserIdx = findLastUserMessageIndex(recent);
        if (lastUserIdx < 0) throw new NoUserMessageError();

        const lastUser = recent[lastUserIdx];
        if (!lastUser) throw new NoUserMessageError();

        await this.dropTrailingAssistantMessages(recent, lastUserIdx);

        const history = recent
          .slice(0, lastUserIdx)
          .map((m) => ({ role: m.role, content: m.content }));

        const strategy = this.factory.build(input.signal, input.flagCtx);
        return strategy.execute({
          history,
          prompt: lastUser.content,
          onComplete: (assistantText, meta) =>
            this.persistAssistantMessage(input.chatId, assistantText, meta, 'regenerate'),
        });
      },
      this.logger,
    );
  }

  private async persistAssistantMessage(
    chatId: string,
    text: string,
    meta: CompletionMeta | undefined,
    label: 'completion' | 'regenerate',
  ): Promise<void> {
    if (!text.trim()) {
      this.logger.pino.warn({ chatId, label }, 'completion_empty_assistant_text_skipped');
      return;
    }
    await this.messages.create({
      chatId,
      role: 'assistant',
      content: text,
      usage: {
        promptTokens: meta?.usage?.promptTokens ?? null,
        completionTokens: meta?.usage?.completionTokens ?? null,
        provider: meta?.provider ?? null,
        model: meta?.model ?? null,
      },
    });
  }

  private async dropTrailingAssistantMessages(
    messages: readonly MessageRow[],
    afterIndex: number,
  ): Promise<void> {
    for (let i = afterIndex + 1; i < messages.length; i++) {
      const stale = messages[i];
      if (stale?.role === 'assistant') {
        await this.messages.deleteById(stale.id);
      }
    }
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

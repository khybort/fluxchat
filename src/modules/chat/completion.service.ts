import type { IMessageRepository } from './chat.repository.interface.js';
import type { ChatService } from './chat.service.js';
import type { CompletionStrategyFactory } from './strategies/completion-strategy.factory.js';
import type { CompletionResult } from './strategies/completion.strategy.js';
import type { ChatTurn } from '../../infrastructure/ai/ai.types.js';
import type { Logger } from '../../infrastructure/logger/logger.js';
import { withSpan } from '../../infrastructure/tracing/span.js';
import { LIMITED_HISTORY_COUNT } from '../../shared/constants.js';

export interface RunCompletionInput {
  chatId: string;
  userId: string;
  prompt: string;
  signal: AbortSignal;
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

      const strategy = this.factory.build(input.signal);
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

  private async buildHistory(chatId: string): Promise<ChatTurn[]> {
    // Use the last N messages as model context regardless of CHAT_HISTORY_ENABLED:
    // that flag controls what we *return* to the client, not what we *send* to the model.
    const recent = await this.messages.findLastN(chatId, LIMITED_HISTORY_COUNT * 2);
    // Drop the just-inserted user message — it becomes the prompt.
    const withoutPrompt = recent.slice(0, -1);
    return withoutPrompt.map((m) => ({ role: m.role, content: m.content }));
  }
}

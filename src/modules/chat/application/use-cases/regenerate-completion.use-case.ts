import type { Logger } from '../../../../infrastructure/logger/logger.js';
import { withSpan } from '../../../../infrastructure/tracing/span.js';
import { LIMITED_HISTORY_COUNT } from '../../../../shared/constants.js';
import { AppError } from '../../../../shared/errors/app-error.js';
import type { FlagContext } from '../../../../shared/feature-flags/feature-flag.types.js';
import type { IUseCase } from '../../../../shared/use-case/use-case.interface.js';
import type { ChatAccessPolicy } from '../policies/chat-access.policy.js';
import type { MessagePersistencePolicy } from '../policies/message-persistence.policy.js';
import type { IMessageRepository } from '../ports/message.repository.port.js';
import type { CompletionStrategyFactory } from '../strategies/completion-strategy.factory.js';
import type { CompletionResult } from '../strategies/completion.strategy.js';

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

/**
 * Regenerate the last assistant turn. Steps:
 *   1. Verify ownership (404 on cross-user).
 *   2. Find the most recent user message.
 *   3. Drop every assistant message that came after it (stale answers).
 *   4. Re-run the model with the same conversation context.
 *
 * Does NOT create a new user message — the existing last user message becomes
 * the prompt. Throws `NoUserMessageError` (422) when there's nothing to
 * regenerate from (e.g. a brand-new empty chat).
 */
export class RegenerateCompletionUseCase implements IUseCase<RunRegenerateInput, CompletionResult> {
  constructor(
    private readonly access: ChatAccessPolicy,
    private readonly messages: IMessageRepository,
    private readonly persistence: MessagePersistencePolicy,
    private readonly factory: CompletionStrategyFactory,
    private readonly logger: Logger,
  ) {}

  public async execute(input: RunRegenerateInput): Promise<CompletionResult> {
    return withSpan(
      'completion.regenerate',
      async () => {
        await this.access.ensureOwnership(input.chatId, input.userId);

        const recent = await this.messages.findLastN(input.chatId, LIMITED_HISTORY_COUNT * 2);
        const lastUserIdx = findLastUserMessageIndex(recent);
        if (lastUserIdx < 0) throw new NoUserMessageError();

        const lastUser = recent[lastUserIdx];
        if (!lastUser) throw new NoUserMessageError();

        await this.persistence.dropTrailingAssistantMessages(recent, lastUserIdx);

        const history = recent
          .slice(0, lastUserIdx)
          .map((m) => ({ role: m.role, content: m.content }));

        const strategy = this.factory.build(input.signal, input.flagCtx);
        return strategy.execute({
          history,
          prompt: lastUser.content,
          onComplete: (assistantText, meta) =>
            this.persistence.persistAssistant(input.chatId, assistantText, meta, 'regenerate'),
        });
      },
      this.logger,
    );
  }
}

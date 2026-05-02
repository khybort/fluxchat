import type { Logger } from '../../../../infrastructure/logger/logger.js';
import { withSpan } from '../../../../infrastructure/tracing/span.js';
import type { FlagContext } from '../../../../shared/feature-flags/feature-flag.types.js';
import type { IUseCase } from '../../../../shared/use-case/use-case.interface.js';
import type { ChatAccessPolicy } from '../policies/chat-access.policy.js';
import type { MessagePersistencePolicy } from '../policies/message-persistence.policy.js';
import type { IMessageRepository } from '../ports/message.repository.port.js';
import type { CompletionStrategyFactory } from '../strategies/completion-strategy.factory.js';
import type { CompletionResult } from '../strategies/completion.strategy.js';

export interface RunCompletionInput {
  chatId: string;
  userId: string;
  prompt: string;
  signal: AbortSignal;
  /** Optional per-request flag context. Threaded into the strategy factory. */
  flagCtx?: FlagContext;
}

/**
 * Run the AI completion loop for a chat:
 *   1. Verify the user owns the chat (404 otherwise — no info leak).
 *   2. Persist the user message first so it survives even if the AI call
 *      fails partway through.
 *   3. Build the model context window (last-N messages, prompt excluded).
 *   4. Pick a strategy (streaming vs JSON) based on STREAMING_ENABLED, run
 *      it, and forward the result to the controller. The strategy persists
 *      the assistant message via the policy's `persistAssistant` callback.
 *
 * The whole flow is wrapped in a span so latency + outcome land in logs.
 */
export class RunCompletionUseCase implements IUseCase<RunCompletionInput, CompletionResult> {
  constructor(
    private readonly access: ChatAccessPolicy,
    private readonly messages: IMessageRepository,
    private readonly persistence: MessagePersistencePolicy,
    private readonly factory: CompletionStrategyFactory,
    private readonly logger: Logger,
  ) {}

  public async execute(input: RunCompletionInput): Promise<CompletionResult> {
    return withSpan(
      'completion.run',
      async () => {
        await this.access.ensureOwnership(input.chatId, input.userId);

        await this.messages.create({
          chatId: input.chatId,
          role: 'user',
          content: input.prompt,
        });

        const history = await this.persistence.buildModelHistory(input.chatId);

        const strategy = this.factory.build(input.signal, input.flagCtx);
        return strategy.execute({
          history,
          prompt: input.prompt,
          onComplete: (assistantText, meta) =>
            this.persistence.persistAssistant(input.chatId, assistantText, meta, 'completion'),
        });
      },
      this.logger,
    );
  }
}

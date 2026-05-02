import type { ChatTurn } from '../../../../infrastructure/ai/ai.types.js';
import type { Logger } from '../../../../infrastructure/logger/logger.js';
import { LIMITED_HISTORY_COUNT } from '../../../../shared/constants.js';
import type { IMessageRepository } from '../ports/message.repository.port.js';

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

/**
 * Application policy for completion-derived message bookkeeping. Both the
 * run-completion and regenerate-completion use cases need: (a) persist an
 * assistant message after the model answers, (b) drop stale assistant turns
 * before regenerating, (c) build the model's context window from recent
 * history. This policy hosts those pieces so neither use case duplicates
 * them and neither use case has to import the other.
 *
 * Application layer (not domain) — it depends on the IMessageRepository port
 * and a Logger primitive. Pure-function helpers stay here so they're isolated
 * from Express + Prisma.
 */
export class MessagePersistencePolicy {
  constructor(
    private readonly messages: IMessageRepository,
    private readonly logger: Logger,
  ) {}

  /**
   * Write the assistant turn after a successful completion. No-op when the
   * model produced empty text — those would otherwise show up as blank
   * messages in the user's history.
   */
  public async persistAssistant(
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

  /**
   * After a regenerate, walk forward from the last user message and delete
   * each trailing assistant message. The user message itself is preserved —
   * it becomes the prompt for the new model call.
   */
  public async dropTrailingAssistantMessages(
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

  /**
   * Last-N messages as model context. Used by the run-completion use case
   * after it has already inserted the user prompt — the slice drops the
   * just-inserted user row because it becomes the prompt parameter.
   *
   * Independent of `CHAT_HISTORY_ENABLED`: that flag controls what we
   * RETURN to the client, not what we SEND to the model.
   */
  public async buildModelHistory(chatId: string): Promise<ChatTurn[]> {
    const recent = await this.messages.findLastN(chatId, LIMITED_HISTORY_COUNT * 2);
    const withoutPrompt = recent.slice(0, -1);
    return withoutPrompt.map((m) => ({ role: m.role, content: m.content }));
  }
}

import type { ListParams, Message, MessageRole } from '../../domain/chat.types.js';

export interface CreateMessageInput {
  chatId: string;
  role: MessageRole;
  content: string;
  /** Per-assistant-message usage telemetry. Ignored for user/system rows. */
  usage?: {
    promptTokens?: number | null;
    completionTokens?: number | null;
    provider?: string | null;
    model?: string | null;
  };
}

/**
 * Port for message persistence. Implementation in
 * {@link ../../adapters/persistence/message.prisma.repository.ts}. Use cases
 * + policies depend on this interface; the concrete Prisma adapter implements it.
 */
export interface IMessageRepository {
  findByChat(chatId: string, params: ListParams): Promise<Message[]>;
  findLastN(chatId: string, count: number): Promise<Message[]>;
  create(input: CreateMessageInput): Promise<Message>;
  /** Delete a single message. Used by the regenerate flow to drop the
   * stale assistant turn before re-running the model. */
  deleteById(messageId: string): Promise<void>;
}

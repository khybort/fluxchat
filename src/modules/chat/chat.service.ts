import type { IChatRepository } from './chat.repository.interface.js';
import type { Chat, PageResult } from './chat.types.js';
import { DEFAULT_CHAT_TITLE, PAGINATION } from '../../shared/constants.js';
import { NotFoundError } from '../../shared/errors/app-error.js';
import type { FeatureFlagService } from '../../shared/feature-flags/feature-flag.service.js';
import { buildPagedResult } from '../../shared/pagination/cursor.js';

export interface ListChatsInput {
  userId: string;
  cursor?: string | undefined;
  limit?: number | undefined;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export class ChatService {
  constructor(
    private readonly chats: IChatRepository,
    private readonly flags: FeatureFlagService,
  ) {}

  public async listChats(input: ListChatsInput): Promise<PageResult<Chat>> {
    // Per-user flag evaluation — lets ops dial PAGINATION_LIMIT differently
    // per role/clientType in the JSON file. With no rules configured, this
    // returns the same global ceiling the original implementation used.
    const ceiling = this.flags.get('PAGINATION_LIMIT', { userId: input.userId });
    const requested = input.limit ?? ceiling;
    const limit = clamp(requested, PAGINATION.MIN_LIMIT, ceiling);

    const rows = await this.chats.findByUser(input.userId, {
      cursor: input.cursor,
      limit,
    });
    return buildPagedResult(rows, limit, (c) => c.id);
  }

  public async ensureOwnership(chatId: string, userId: string): Promise<Chat> {
    const chat = await this.chats.findByIdForUser(chatId, userId);
    if (!chat) {
      // 404 not 403 — we do not leak whether the chat exists for someone else.
      // CLAUDE.md §13.
      throw new NotFoundError('Chat not found');
    }
    return chat;
  }

  public async createChat(input: { userId: string; title?: string }): Promise<Chat> {
    const title = input.title?.trim() || DEFAULT_CHAT_TITLE;
    return this.chats.create({ userId: input.userId, title });
  }

  /**
   * Soft-delete a chat. Returns silently on success; throws NotFound when the
   * chat doesn't exist or belongs to another user (404, no existence leak).
   */
  public async deleteChat(chatId: string, userId: string): Promise<void> {
    const ok = await this.chats.softDelete(chatId, userId);
    if (!ok) {
      throw new NotFoundError('Chat not found');
    }
  }

  public async listArchivedChats(input: ListChatsInput): Promise<PageResult<Chat>> {
    const ceiling = this.flags.get('PAGINATION_LIMIT', { userId: input.userId });
    const requested = input.limit ?? ceiling;
    const limit = clamp(requested, PAGINATION.MIN_LIMIT, ceiling);

    const rows = await this.chats.findArchivedByUser(input.userId, {
      cursor: input.cursor,
      limit,
    });
    return buildPagedResult(rows, limit, (c) => c.id);
  }

  public async archiveChat(chatId: string, userId: string): Promise<void> {
    const ok = await this.chats.archive(chatId, userId);
    if (!ok) throw new NotFoundError('Chat not found');
  }

  public async unarchiveChat(chatId: string, userId: string): Promise<void> {
    const ok = await this.chats.unarchive(chatId, userId);
    if (!ok) throw new NotFoundError('Chat not found');
  }
}

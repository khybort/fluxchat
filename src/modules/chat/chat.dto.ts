import { z } from 'zod';

import { PAGINATION } from '../../shared/constants.js';

export const ChatIdParamSchema = z.object({
  chatId: z.string().uuid(),
});
export type ChatIdParams = z.infer<typeof ChatIdParamSchema>;

export const ListChatsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(PAGINATION.MIN_LIMIT).max(PAGINATION.MAX_LIMIT).optional(),
});
export type ListChatsQuery = z.infer<typeof ListChatsQuerySchema>;

export const HistoryQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(PAGINATION.MIN_LIMIT).max(PAGINATION.MAX_LIMIT).optional(),
});
export type HistoryQuery = z.infer<typeof HistoryQuerySchema>;

export const CompletionBodySchema = z.object({
  message: z.string().min(1).max(8000),
});
export type CompletionBody = z.infer<typeof CompletionBodySchema>;

export const CreateChatBodySchema = z.object({
  title: z.string().min(1).max(120).optional(),
});
export type CreateChatBody = z.infer<typeof CreateChatBodySchema>;

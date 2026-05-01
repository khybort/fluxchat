import { apiFetch } from './client';
import type { Chat, CompletionJsonResponse, HealthzResponse, Message, PageResult } from './types';

export const createChat = (token: string, input: { title?: string } = {}): Promise<Chat> =>
  apiFetch<Chat>('/api/chats', { method: 'POST', body: input, token });

export const listChats = (
  token: string,
  params: { cursor?: string; limit?: number } = {},
): Promise<PageResult<Chat>> => {
  const search = new URLSearchParams();
  if (params.cursor) search.set('cursor', params.cursor);
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  const qs = search.toString();
  return apiFetch<PageResult<Chat>>(`/api/chats${qs ? `?${qs}` : ''}`, {
    method: 'GET',
    token,
  });
};

export const getHistory = (
  token: string,
  chatId: string,
  params: { cursor?: string; limit?: number } = {},
): Promise<PageResult<Message>> => {
  const search = new URLSearchParams();
  if (params.cursor) search.set('cursor', params.cursor);
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  const qs = search.toString();
  return apiFetch<PageResult<Message>>(
    `/api/chats/${encodeURIComponent(chatId)}/history${qs ? `?${qs}` : ''}`,
    { method: 'GET', token },
  );
};

export const completion = (
  token: string,
  chatId: string,
  message: string,
): Promise<CompletionJsonResponse> =>
  apiFetch<CompletionJsonResponse>(`/api/chats/${encodeURIComponent(chatId)}/completion`, {
    method: 'POST',
    body: { message },
    token,
  });

export const getHealthz = (): Promise<HealthzResponse> =>
  apiFetch<HealthzResponse>('/healthz', { method: 'GET' });

export const deleteChat = (token: string, chatId: string): Promise<void> =>
  apiFetch<void>(`/api/chats/${encodeURIComponent(chatId)}`, {
    method: 'DELETE',
    token,
  });

export const archiveChat = (token: string, chatId: string): Promise<void> =>
  apiFetch<void>(`/api/chats/${encodeURIComponent(chatId)}/archive`, {
    method: 'POST',
    token,
  });

export const unarchiveChat = (token: string, chatId: string): Promise<void> =>
  apiFetch<void>(`/api/chats/${encodeURIComponent(chatId)}/unarchive`, {
    method: 'POST',
    token,
  });

export const listArchivedChats = (
  token: string,
  opts: { cursor?: string | null; limit?: number } = {},
): Promise<PageResult<Chat>> => {
  const params = new URLSearchParams();
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.limit) params.set('limit', String(opts.limit));
  const query = params.toString();
  return apiFetch<PageResult<Chat>>(`/api/chats/archived${query ? `?${query}` : ''}`, {
    method: 'GET',
    token,
  });
};

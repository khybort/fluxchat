import { apiFetch } from './client';
import type { Chat, CompletionJsonResponse, HealthzResponse, Message, PageResult } from './types';

const buildQueryString = (params: Record<string, string | number | null | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
};

export const createChat = (token: string, input: { title?: string } = {}): Promise<Chat> =>
  apiFetch<Chat>('/api/chats', { method: 'POST', body: input, token });

export const listChats = (
  token: string,
  params: { cursor?: string; limit?: number } = {},
): Promise<PageResult<Chat>> =>
  apiFetch<PageResult<Chat>>(`/api/chats${buildQueryString(params)}`, {
    method: 'GET',
    token,
  });

export const getHistory = (
  token: string,
  chatId: string,
  params: { cursor?: string; limit?: number } = {},
): Promise<PageResult<Message>> =>
  apiFetch<PageResult<Message>>(
    `/api/chats/${encodeURIComponent(chatId)}/history${buildQueryString(params)}`,
    { method: 'GET', token },
  );

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
): Promise<PageResult<Chat>> =>
  apiFetch<PageResult<Chat>>(`/api/chats/archived${buildQueryString(opts)}`, {
    method: 'GET',
    token,
  });

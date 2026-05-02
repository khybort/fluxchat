import { apiFetch } from './client';
import type {
  AdminFlagsResponse,
  AdminUser,
  FeatureFlagsSnapshot,
  FlagContext,
  FlagDefinition,
  FlagName,
  PageResult,
} from './types';

/**
 * Admin API client. Every call requires an `admin`-role JWT — the server
 * returns 403 for non-admins and the global handler displays a toast.
 */

export const listAdminFlags = (token: string): Promise<AdminFlagsResponse> =>
  apiFetch<AdminFlagsResponse>('/api/admin/flags', { token });

export const updateAdminFlag = (
  token: string,
  name: FlagName,
  definition: FlagDefinition,
): Promise<AdminFlagsResponse> =>
  apiFetch<AdminFlagsResponse>(`/api/admin/flags/${encodeURIComponent(name)}`, {
    method: 'PATCH',
    body: definition,
    token,
  });

export const clearAdminFlag = (token: string, name: FlagName): Promise<AdminFlagsResponse> =>
  apiFetch<AdminFlagsResponse>(`/api/admin/flags/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    token,
  });

export const clearAllAdminFlags = (token: string): Promise<AdminFlagsResponse> =>
  apiFetch<AdminFlagsResponse>('/api/admin/flags', {
    method: 'DELETE',
    token,
  });

export const reloadAdminFlags = (
  token: string,
): Promise<{ status: string; snapshot: FeatureFlagsSnapshot }> =>
  apiFetch('/api/admin/flags/reload', { method: 'POST', token });

export const evaluateAdminFlag = (
  token: string,
  name: FlagName,
  context: FlagContext,
): Promise<{ value: boolean | number }> =>
  apiFetch(`/api/admin/flags/${encodeURIComponent(name)}/evaluate`, {
    method: 'POST',
    body: { context },
    token,
  });

export const listAdminUsers = (
  token: string,
  params: { cursor?: string; limit?: number; q?: string } = {},
): Promise<PageResult<AdminUser>> => {
  const qs = new URLSearchParams();
  if (params.cursor) qs.set('cursor', params.cursor);
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.q) qs.set('q', params.q);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch<PageResult<AdminUser>>(`/api/admin/users${suffix}`, { token });
};

export const deleteAdminUser = (token: string, userId: string): Promise<{ deletedId: string }> =>
  apiFetch<{ deletedId: string }>(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    token,
  });

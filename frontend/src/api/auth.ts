import { apiFetch } from './client';
import type { AuthResponse, FeatureFlagsSnapshot, MeResponse } from './types';

export const register = (input: {
  email: string;
  password: string;
  name?: string;
}): Promise<AuthResponse> =>
  apiFetch<AuthResponse>('/api/auth/register', { method: 'POST', body: input });

export const login = (input: { email: string; password: string }): Promise<AuthResponse> =>
  apiFetch<AuthResponse>('/api/auth/login', { method: 'POST', body: input });

export const getMe = (token: string): Promise<MeResponse> =>
  apiFetch<MeResponse>('/api/auth/me', { method: 'GET', token });

export const getMyFlags = (token: string): Promise<{ flags: FeatureFlagsSnapshot }> =>
  apiFetch<{ flags: FeatureFlagsSnapshot }>('/api/auth/me/flags', { method: 'GET', token });

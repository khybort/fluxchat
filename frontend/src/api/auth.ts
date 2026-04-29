import { apiFetch } from './client';
import type { AuthResponse, MeResponse } from './types';

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

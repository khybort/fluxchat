import { useAuthStore } from '@/store/auth-store';

import type { ApiErrorBody } from './types';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const APP_CHECK_TOKEN = (import.meta.env.VITE_APP_CHECK_TOKEN as string | undefined) ?? '';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  token?: string | null;
  /** Set to false to skip default JSON Accept/Content-Type. */
  json?: boolean;
}

const detectClientType = (): 'web' | 'mobile' | 'desktop' => {
  if (typeof window === 'undefined') return 'web';
  const ua = window.navigator.userAgent.toLowerCase();
  if (/electron/i.test(ua)) return 'desktop';
  if (/mobi|android|iphone|ipad/i.test(ua)) return 'mobile';
  return 'web';
};

export const buildHeaders = (token?: string | null, extra?: HeadersInit): Headers => {
  const headers = new Headers(extra);
  headers.set('x-firebase-app-check', APP_CHECK_TOKEN);
  headers.set('x-client-type', detectClientType());
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return headers;
};

export const apiUrl = (path: string): string => `${API_URL}${path}`;

const FALLBACK_BY_STATUS: Record<number, string> = {
  400: 'That request looked off — please double-check the form and try again.',
  401: 'You need to sign in again to continue.',
  403: 'You don’t have access to that.',
  404: 'We couldn’t find what you were looking for.',
  409: 'That conflicts with something that already exists.',
  422: 'Some fields didn’t pass validation — please review and try again.',
  429: 'You’re going a bit fast — please wait a moment and try again.',
  500: 'Something went wrong on our end. Please try again in a moment.',
  502: 'The service is unreachable right now. Please try again shortly.',
  503: 'The service is temporarily unavailable. Please try again shortly.',
};

const parseError = async (res: Response): Promise<ApiError> => {
  let body: ApiErrorBody | null = null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    /* ignore */
  }
  const code = body?.error?.code ?? `HTTP_${res.status}`;
  const rawMessage = body?.error?.message?.trim();
  const message =
    rawMessage && rawMessage.length > 0
      ? rawMessage
      : (FALLBACK_BY_STATUS[res.status] ??
        res.statusText ??
        'Something went wrong, please try again.');
  return new ApiError(res.status, code, message, body?.error?.details);
};

/**
 * Treat a 401 from any authenticated call as session-ended: clear the auth
 * store and bounce to /login. Without this, individual call sites had to
 * remember to handle it (and most didn't), so a stale JWT would leave the
 * user on a half-broken page instead of taking them somewhere they can
 * recover. Skip the redirect on the auth pages so login/register can show
 * their own validation errors, and skip when no token was attached (public
 * routes like /api/auth/login fail App-Check with 401 too).
 */
const handleSessionExpired = (): void => {
  useAuthStore.getState().clear();
  if (typeof window === 'undefined') return;
  const path = window.location.pathname;
  if (path === '/login' || path === '/register') return;
  window.location.assign('/login');
};

export const apiFetch = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const { body, token, json = true, headers, ...rest } = options;

  const finalHeaders = buildHeaders(token, headers);
  if (json && body !== undefined) {
    finalHeaders.set('Content-Type', 'application/json');
  }
  if (json) {
    finalHeaders.set('Accept', 'application/json');
  }

  const res = await fetch(apiUrl(path), {
    ...rest,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    if (res.status === 401 && token) {
      handleSessionExpired();
    }
    throw await parseError(res);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
};

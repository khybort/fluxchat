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

const parseError = async (res: Response): Promise<ApiError> => {
  let body: ApiErrorBody | null = null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    /* ignore */
  }
  const code = body?.error?.code ?? `HTTP_${res.status}`;
  const message = body?.error?.message ?? res.statusText ?? 'Request failed';
  return new ApiError(res.status, code, message, body?.error?.details);
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
    throw await parseError(res);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
};

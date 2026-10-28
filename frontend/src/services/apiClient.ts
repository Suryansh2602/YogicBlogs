const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1';

/** The backend's error body: `{ error: { message, code?, details? } }`. */
interface ApiErrorBody {
  error?: { message?: string; code?: string; details?: unknown };
}

export class ApiRequestError extends Error {
  readonly status: number;
  /** Machine-readable reason from the backend, e.g. `TOKEN_INVALID` or `REFRESH_RACE`. */
  readonly code: string | undefined;
  readonly details: unknown;
  /** Seconds to wait before trying again, from the Retry-After header (lockouts, rate limits). */
  readonly retryAfter: number | undefined;

  constructor(status: number, message: string, code?: string, details?: unknown, retryAfter?: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfter = retryAfter;
  }
}

export interface RequestOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Thin fetch wrapper: JSON in/out, cookies sent for auth, server errors turned into ApiRequestError.
 * Usage: apiClient.get<Article[]>('/articles'), apiClient.post<Session>('/auth/login', { email, password })
 * The type parameter describes what the server promises; it is not checked at runtime.
 */
async function request<T>(method: Method, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  if (options.signal) init.signal = options.signal;

  const res = await fetch(`${BASE_URL}${path}`, init);
  const data: unknown = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    const error = (data as ApiErrorBody | null)?.error;
    const retryAfter = Number(res.headers.get('Retry-After'));
    throw new ApiRequestError(res.status, error?.message ?? res.statusText, error?.code, error?.details, retryAfter > 0 ? retryAfter : undefined);
  }
  return data as T;
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PUT', path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PATCH', path, body, options),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, undefined, options),
};

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

/** Absolute URL for a path the API returned, e.g. an image's "/media/i/<id>/960". */
export const apiUrl = (path: string) => `${BASE_URL}${path}`;

export interface UploadOptions extends RequestOptions {
  /** Called with 0–1 as the file goes up (not including the server's processing time afterwards). */
  onProgress?: (fraction: number) => void;
}

/**
 * POST a multipart form with upload progress. fetch can't report upload progress, so this uses XHR;
 * errors become the same ApiRequestError as every other call.
 */
function upload<T>(path: string, form: FormData, options: UploadOptions = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const { signal } = options;
    if (signal?.aborted) {
      reject(new DOMException('The upload was cancelled.', 'AbortError'));
      return;
    }
    const xhr = new XMLHttpRequest();
    const onAbortSignal = () => {
      xhr.abort();
    };
    const settle = (finish: () => void) => {
      signal?.removeEventListener('abort', onAbortSignal);
      finish();
    };
    let sentSomething = false;
    xhr.open('POST', `${BASE_URL}${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    for (const [name, value] of Object.entries(options.headers ?? {})) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.loaded > 0) sentSomething = true;
      if (event.lengthComputable) options.onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      settle(() => {
        let data: unknown;
        try {
          data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch {
          data = null;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data as T);
          return;
        }
        if (xhr.status === 408) {
          reject(new ApiRequestError(408, 'The upload took too long, so the server stopped waiting. Try a smaller image or a faster connection.', 'UPLOAD_TIMEOUT'));
          return;
        }
        const error = (data as ApiErrorBody | null)?.error;
        const retryAfter = Number(xhr.getResponseHeader('Retry-After'));
        reject(new ApiRequestError(xhr.status, error?.message ?? xhr.statusText, error?.code, error?.details, retryAfter > 0 ? retryAfter : undefined));
      });
    };
    xhr.onerror = () => {
      settle(() => {
        // Part of the file went up, then the connection dropped: the server (or a proxy) most likely
        // refused the file or gave up waiting. That's not "you're offline".
        if (sentSomething) {
          reject(
            new ApiRequestError(0, 'The upload stopped before it finished. The file may be too large for the server, or the connection too slow. Try a smaller image.', 'UPLOAD_INTERRUPTED'),
          );
          return;
        }
        reject(new TypeError('Failed to fetch')); // nothing got through: shown as "can't reach Healthmarg"
      });
    };
    xhr.onabort = () => {
      settle(() => {
        reject(new DOMException('The upload was cancelled.', 'AbortError'));
      });
    };
    signal?.addEventListener('abort', onAbortSignal, { once: true });
    xhr.send(form);
  });
}

export const apiClient = {
  upload,
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PUT', path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PATCH', path, body, options),
  // DELETE may carry a JSON body (e.g. the version an article delete was decided on).
  delete: <T>(path: string, options?: RequestOptions & { body?: unknown }) => request<T>('DELETE', path, options?.body, options),
};

// The website's global error handler: errors nothing else caught (a crash, a failed background
// request, page code missing after an update) are reported to the API (POST /client-errors) so we
// hear about them, instead of being lost in a visitor's console.
// At most a few reports per page load, duplicates skipped. Only the address path is sent (no query
// strings, which can carry tokens); the API also blanks out emails and token-like text.
import { apiUrl, ApiRequestError } from './apiClient';

export type ReportKind = 'crash' | 'unhandled' | 'updated' | 'offline' | 'api';

const MAX_REPORTS = 5;
const sent = new Set<string>();

const messageOf = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : typeof error === 'string' ? error : 'Unknown error').slice(0, 300);

/** Report one error. Never throws, never retries: reporting must not cause more trouble. */
export function reportError(kind: ReportKind, error: unknown) {
  // The API reports its own server errors in its logs; and expected answers (signed out, not found,
  // rate limited) aren't faults at all. Only a server error's reference is worth linking.
  if (error instanceof ApiRequestError && error.status < 500) return;
  const message = messageOf(error);
  const key = `${kind}|${message}`;
  if (sent.has(key) || sent.size >= MAX_REPORTS) return;
  sent.add(key);
  const body: Record<string, string> = { kind, message, path: window.location.pathname.slice(0, 500) };
  if (error instanceof ApiRequestError && error.reference && /^[0-9a-f-]{36}$/i.test(error.reference)) body['reference'] = error.reference;
  try {
    void fetch(apiUrl('/client-errors'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true, // still sent if the page is closing
      credentials: 'omit',
    }).catch(() => undefined);
  } catch {
    // fetch unavailable: nothing to do.
  }
}

/** Listen for errors nothing else caught. Returns a function that stops listening (for tests). */
export function installGlobalErrorHandlers() {
  const onError = (event: ErrorEvent) => {
    reportError('crash', event.error ?? event.message);
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason: unknown = event.reason;
    reportError(reason instanceof ApiRequestError ? 'api' : 'unhandled', reason);
  };
  // Vite's signal that a page's code (or CSS) couldn't be preloaded, usually after a new deploy.
  const onPreloadError = (event: Event) => {
    reportError('updated', (event as Event & { payload?: unknown }).payload ?? 'Page code could not be loaded');
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  window.addEventListener('vite:preloadError', onPreloadError);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    window.removeEventListener('vite:preloadError', onPreloadError);
  };
}

/** Test helper: forget which errors were already reported. */
export function resetErrorReportsForTests() {
  sent.clear();
}

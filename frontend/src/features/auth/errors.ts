import { ApiRequestError } from '../../services/apiClient';

// Friendlier wording for the codes the auth API returns. Anything not listed shows the server's own
// message, which is always written to be safe to display.
const MESSAGES: Record<string, string> = {
  RATE_LIMITED: 'Too many attempts from this network. Please wait a few minutes and try again.',
  LOGIN_LOCKED: 'Too many unsuccessful attempts. For your safety, sign-in is paused for a little while.',
  CAPTCHA_FAILED: 'We couldn’t confirm you’re human. Please try again.',
  MFA_TICKET_INVALID: 'This sign-in attempt has expired. Please enter your email and password again.',
  CSRF_FAILED: 'Your session needs a refresh. Please reload the page and try again.',
};

export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof ApiRequestError) {
    if (error.code && MESSAGES[error.code]) return MESSAGES[error.code] ?? fallback;
    if (error.status === 0) return 'Can’t reach Healthmarg right now. Check your connection and try again.';
    if (error.status >= 500) return 'Our server had a problem. Please try again in a moment.';
    return error.message || fallback;
  }
  if (error instanceof TypeError) return 'Can’t reach Healthmarg right now. Check your connection and try again.';
  return fallback;
}

/** Field-level messages from a 400 response's `details`, keyed by field path. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiRequestError) || !Array.isArray(error.details)) return {};
  const out: Record<string, string> = {};
  for (const item of error.details as { path?: unknown; message?: unknown }[]) {
    if (typeof item.path === 'string' && typeof item.message === 'string' && !(item.path in out)) out[item.path] = item.message;
  }
  return out;
}

export const hasCode = (error: unknown, code: string) => error instanceof ApiRequestError && error.code === code;

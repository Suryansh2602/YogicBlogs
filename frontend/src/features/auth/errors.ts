import { ApiRequestError } from '../../services/apiClient';
import { emailEnabled } from '../../config/features';

/** "about 14 minutes" / "about a minute" / "a few seconds", from a Retry-After value in seconds. */
export function waitText(seconds: number | undefined): string {
  if (!seconds) return 'a few minutes';
  if (seconds < 60) return 'a few seconds';
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? 'about a minute' : `about ${minutes} minutes`;
}

// Wording for codes where the page knows more than the server's message (like how long to wait).
// Anything not listed shows the server's own message, which says what was wrong and is safe to display.
const MESSAGES: Record<string, (error: ApiRequestError) => string> = {
  RATE_LIMITED: (e) => `Too many attempts from your network in a short time. Please try again in ${waitText(e.retryAfter)}.`,
  LOGIN_LOCKED: (e) =>
    `Too many wrong passwords for this account, so sign-in is paused for your safety. Try again in ${waitText(e.retryAfter)}${
      emailEnabled() ? ', or reset your password' : ''
    }.`,
  CAPTCHA_FAILED: () => 'Our automatic check thought this might be a bot. Please try again.',
  CSRF_FAILED: () => 'This page was open too long and its security check expired. Reload the page and try again.',
};

export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof ApiRequestError) {
    const custom = error.code ? MESSAGES[error.code] : undefined;
    if (custom) return custom(error);
    if (error.status >= 500) return 'Our server had a problem (not something you did). Please try again in a moment.';
    return error.message || fallback;
  }
  if (error instanceof TypeError) return 'Can’t reach Healthmarg right now. Check your internet connection and try again.';
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

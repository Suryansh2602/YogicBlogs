import { describe, expect, it, vi } from 'vitest';
import { passwordProblems, passwordStrength } from '../../src/features/auth/passwordPolicy';
import { errorMessage, fieldErrors, hasCode, waitText } from '../../src/features/auth/errors';
import { emailProblem, nameProblem } from '../../src/features/auth/validation';
import { ApiRequestError } from '../../src/services/apiClient';
import { greeting, verseOfTheDay, VERSES } from '../../src/pages/dashboard/wisdom';
import { authed, getAccessToken, mightHaveSession, onSessionChange, refreshSession, setSession, signOutSession } from '../../src/features/auth/session';
import { apiError, makeUser, mockApi, session } from '../helpers/api';

describe('password policy (mirrors the server)', () => {
  it('accepts a passphrase and says exactly what is wrong otherwise (same words as the server)', () => {
    expect(passwordProblems('Banyan-roots-run-deep', { email: 'meera@example.com', displayName: 'Meera' })).toEqual([]);
    expect(passwordProblems('')).toEqual(['Enter a password.']);
    expect(passwordProblems('short')).toEqual(['Your password has 5 characters. Use at least 12.']);
    expect(passwordProblems('x')).toEqual(['Your password has 1 character. Use at least 12.']);
    expect(passwordProblems('x'.repeat(129))).toContain('Your password has 129 characters. The limit is 128.');
    expect(passwordProblems('meera-loves-yoga', { email: 'meera@example.com' })).toContain('Your password contains “meera” from your email address. Remove it.');
    expect(passwordProblems('i-am-suryansh-1', { displayName: 'Suryansh' })).toContain('Your password contains your name. Remove it.');
    expect(passwordProblems('aaaaaaaaaaaaaa')).toContain('Your password is one character repeated. Mix in other characters.');
  });

  it('says what is wrong with an email address or a name', () => {
    expect(emailProblem('  ')).toBe('Enter your email address.');
    expect(emailProblem('meera gmail.com')).toBe('Your email address contains a space. Remove it.');
    expect(emailProblem('meeragmail.com')).toBe('Your email address is missing the “@”, like name@gmail.com.');
    expect(emailProblem('a@b@c.com')).toBe('Your email address has more than one “@”. Use only one.');
    expect(emailProblem('@gmail.com')).toBe('Add your name before the “@”, like name@gmail.com.');
    expect(emailProblem('meera@')).toBe('Add the domain after the “@”, like name@gmail.com.');
    expect(emailProblem('meera@gmail')).toBe('“gmail” isn’t a complete domain. It needs an ending like .com or .in.');
    expect(emailProblem('meera@gmail.com')).toBeUndefined();
    expect(nameProblem(' ')).toBe('Enter your name, so we know what to call you.');
    expect(nameProblem('Meera')).toBeUndefined();
  });

  it('rates strength from 0 to 4, favouring length', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('short')).toBe(1);
    expect(passwordStrength('aaaaaaaaaaaaaaaa')).toBe(1);
    expect(passwordStrength('abcdefghijkl')).toBe(2);
    expect(passwordStrength('Abcdefghijk1')).toBe(3);
    expect(passwordStrength('Turmeric-and-tulsi-every-dawn')).toBe(4);
    expect(passwordStrength('abababababababab')).toBe(2);
  });
});

describe('error messages', () => {
  it('uses friendly wording for known codes and the server message otherwise', () => {
    expect(errorMessage(new ApiRequestError(429, 'x', 'RATE_LIMITED', undefined, 600))).toBe(
      'Too many attempts from your network in a short time. Please try again in about 10 minutes.',
    );
    expect(errorMessage(new ApiRequestError(429, 'x', 'LOGIN_LOCKED', undefined, 840))).toMatch(/Try again in about 14 minutes, or reset your password/);
    expect(errorMessage(new ApiRequestError(401, 'The email or password is incorrect.', 'INVALID_CREDENTIALS'))).toBe('The email or password is incorrect.');
    expect(errorMessage(new ApiRequestError(500, 'boom'))).toContain('server had a problem (not something you did)');
    expect(errorMessage(new TypeError('Failed to fetch'))).toMatch(/Can’t reach Healthmarg/);
    expect(errorMessage('weird', 'Fallback')).toBe('Fallback');
  });

  it('turns Retry-After seconds into words', () => {
    expect(waitText(undefined)).toBe('a few minutes');
    expect(waitText(20)).toBe('a few seconds');
    expect(waitText(60)).toBe('about a minute');
    expect(waitText(61)).toBe('about 2 minutes');
  });

  it('maps validation details to fields (first message per field)', () => {
    const err = new ApiRequestError(400, 'Validation failed', 'VALIDATION_FAILED', [
      { path: 'email', message: 'Enter a valid email address' },
      { path: 'email', message: 'second' },
      { path: 'password', message: 'Use at least 12 characters' },
    ]);
    expect(fieldErrors(err)).toEqual({ email: 'Enter a valid email address', password: 'Use at least 12 characters' });
    expect(fieldErrors(new Error('x'))).toEqual({});
    expect(hasCode(err, 'VALIDATION_FAILED')).toBe(true);
  });
});

describe('dashboard wisdom', () => {
  it('greets by time of day', () => {
    expect(greeting(new Date(2026, 0, 1, 7)).english).toBe('Good morning');
    expect(greeting(new Date(2026, 0, 1, 14)).english).toBe('Good afternoon');
    expect(greeting(new Date(2026, 0, 1, 19)).english).toBe('Good evening');
    expect(greeting(new Date(2026, 0, 1, 23)).english).toBe('Peaceful night');
  });

  it('shows one verse per day, cycling through all of them', () => {
    const days = Array.from({ length: VERSES.length }, (_, i) => verseOfTheDay(new Date(2026, 0, 1 + i)).sanskrit);
    expect(new Set(days).size).toBe(VERSES.length);
    expect(verseOfTheDay(new Date(2026, 0, 1, 1))).toEqual(verseOfTheDay(new Date(2026, 0, 1, 23)));
  });
});

describe('session handling', () => {
  const csrf = { body: { csrfToken: 'csrf-1' } };

  it('refreshes once even when many requests ask at the same time (single flight)', async () => {
    const api = mockApi({ 'GET /auth/csrf': csrf, 'POST /auth/refresh': session() });
    const results = await Promise.all([refreshSession(), refreshSession(), refreshSession()]);
    expect(api.callsTo('POST /auth/refresh')).toHaveLength(1);
    expect(api.callsTo('POST /auth/refresh')[0]?.headers['X-CSRF-Token']).toBe('csrf-1');
    expect(results.every((r) => r?.user.email === 'meera@example.com')).toBe(true);
    expect(mightHaveSession()).toBe(true);
  });

  it('retries once when another tab refreshed at the same moment (REFRESH_RACE)', async () => {
    const api = mockApi({ 'GET /auth/csrf': csrf, 'POST /auth/refresh': [apiError(409, 'REFRESH_RACE'), session()] });
    expect((await refreshSession())?.accessToken).toMatch(/^token-for-/);
    expect(api.callsTo('POST /auth/refresh')).toHaveLength(2);
  });

  it('fetches a new CSRF token once if the old one is rejected', async () => {
    const api = mockApi({
      'GET /auth/csrf': [csrf, { body: { csrfToken: 'csrf-2' } }],
      'POST /auth/refresh': [apiError(403, 'CSRF_FAILED'), session()],
    });
    await refreshSession();
    expect(api.callsTo('POST /auth/refresh')[1]?.headers['X-CSRF-Token']).toBe('csrf-2');
  });

  it('signs out locally when the refresh cookie is no longer valid', async () => {
    mockApi({ 'GET /auth/csrf': csrf, 'POST /auth/refresh': apiError(401, 'NO_SESSION') });
    const listener = vi.fn();
    onSessionChange(listener);
    expect(await refreshSession()).toBeNull();
    expect(listener).toHaveBeenLastCalledWith(null);
    expect(mightHaveSession()).toBe(false);
  });

  it('attaches the access token, and after an expiry refreshes and retries exactly once', async () => {
    setSession({ accessToken: 'old', user: makeUser() });
    const api = mockApi({
      'GET /users/me': [apiError(401, 'TOKEN_INVALID'), { body: { user: makeUser() } }],
      'GET /auth/csrf': csrf,
      'POST /auth/refresh': { body: { accessToken: 'new', user: makeUser() } },
    });
    const { apiClient } = await import('../../src/services/apiClient');
    await authed((o) => apiClient.get('/users/me', o));
    const me = api.callsTo('GET /users/me');
    expect(me.map((c) => c.headers['Authorization'])).toEqual(['Bearer old', 'Bearer new']);
    expect(getAccessToken()).toBe('new');
  });

  it('refuses authenticated calls when there is no session at all', async () => {
    mockApi({ 'GET /auth/csrf': csrf, 'POST /auth/refresh': apiError(401, 'NO_SESSION') });
    const { apiClient } = await import('../../src/services/apiClient');
    await expect(authed((o) => apiClient.get('/users/me', o))).rejects.toMatchObject({ status: 401 });
  });

  it('signs out on the server and forgets the token even if the server is unreachable', async () => {
    setSession({ accessToken: 't', user: makeUser() });
    mockApi({ 'GET /auth/csrf': csrf, 'POST /auth/logout': { status: 503, body: { error: { message: 'down' } } } });
    await expect(signOutSession()).rejects.toBeInstanceOf(ApiRequestError);
    expect(getAccessToken()).toBeNull();
  });

  it('forgets unsaved article drafts kept in this browser on sign-out (shared computers)', async () => {
    setSession({ accessToken: 't', user: makeUser() });
    localStorage.setItem('hm-draft-a1', '{"draft":{}}');
    localStorage.setItem('hm-theme', 'dark');
    mockApi({ 'GET /auth/csrf': csrf, 'POST /auth/logout': { status: 204 } });
    await signOutSession();
    expect(localStorage.getItem('hm-draft-a1')).toBeNull();
    expect(localStorage.getItem('hm-theme')).toBe('dark'); // other settings stay
  });
});

// Session plumbing shared by every authenticated request.
//
// - The access token (15 min JWT) lives only in this module's memory: never localStorage/sessionStorage,
//   where any injected script could read it. A page reload restores it via the refresh cookie.
// - The refresh token is an HttpOnly cookie the browser sends to /auth/refresh by itself; JS never sees it.
// - Refresh calls are single-flight: ten requests failing at once trigger one refresh, not ten (which the
//   server would treat as token reuse).
import { apiClient, ApiRequestError, type RequestOptions } from '../../services/apiClient';
import type { SessionResponse, User } from './types';

let accessToken: string | null = null;
let csrfToken: string | null = null;
let refreshing: Promise<SessionResponse | null> | null = null;
const listeners = new Set<(user: User | null) => void>();

export const getAccessToken = () => accessToken;

/** Subscribe to sign-in/sign-out changes (used by AuthProvider). */
export function onSessionChange(listener: (user: User | null) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// "This browser was signed in" hint (not a secret: just "1"). Visitors who never signed in skip the
// refresh call on page load, so the header shows Sign in at once and the API isn't asked for nothing.
const SIGNED_IN_HINT = 'hm-signed-in';

function setHint(on: boolean) {
  try {
    if (on) localStorage.setItem(SIGNED_IN_HINT, '1');
    else localStorage.removeItem(SIGNED_IN_HINT);
  } catch {
    // Storage blocked: we simply always try the refresh.
  }
}

/** True if a refresh is worth trying (this browser had a session, or storage can't tell us). */
export function mightHaveSession() {
  try {
    return localStorage.getItem(SIGNED_IN_HINT) === '1';
  } catch {
    return true;
  }
}

export function setSession(session: SessionResponse) {
  accessToken = session.accessToken;
  setHint(true);
  for (const listener of listeners) listener(session.user);
}

export function clearSession() {
  accessToken = null;
  pendingSession = null;
  setHint(false);
  for (const listener of listeners) listener(null);
}

// A just-enabled admin session waits here while the backup codes are on screen, so the admin panel
// doesn't replace them before the admin confirms they were saved.
let pendingSession: SessionResponse | null = null;

export function holdPendingSession(session: SessionResponse) {
  pendingSession = session;
}

export function activatePendingSession() {
  if (pendingSession) setSession(pendingSession);
  pendingSession = null;
}

async function getCsrfToken(force = false) {
  if (force || !csrfToken) {
    csrfToken = (await apiClient.get<{ csrfToken: string }>('/auth/csrf')).csrfToken;
  }
  return csrfToken;
}

const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Calls one of the cookie routes (refresh/logout) with the CSRF token, renewing it once if rejected. */
async function cookieRoute<T>(path: string): Promise<T> {
  const send = async (force: boolean) => apiClient.post<T>(path, undefined, { headers: { 'X-CSRF-Token': await getCsrfToken(force) } });
  try {
    return await send(false);
  } catch (error) {
    if (error instanceof ApiRequestError && error.code === 'CSRF_FAILED') return send(true);
    throw error;
  }
}

async function doRefresh(): Promise<SessionResponse | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const session = await cookieRoute<SessionResponse>('/auth/refresh');
      setSession(session);
      return session;
    } catch (error) {
      // Another tab refreshed a moment ago: its new cookie is already in the jar, so just retry once.
      if (error instanceof ApiRequestError && error.code === 'REFRESH_RACE' && attempt === 0) {
        await wait(250);
        continue;
      }
      if (error instanceof ApiRequestError && error.status === 401) {
        clearSession();
        return null;
      }
      throw error;
    }
  }
  clearSession();
  return null;
}

/** Restore or extend the session from the refresh cookie. Resolves to null when signed out. */
export function refreshSession(): Promise<SessionResponse | null> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function signOutSession() {
  try {
    await cookieRoute<null>('/auth/logout');
  } finally {
    clearSession();
  }
}

const withBearer = (options: RequestOptions = {}, token: string): RequestOptions => ({
  ...options,
  headers: { ...options.headers, Authorization: `Bearer ${token}` },
});

/**
 * Run an authenticated request. If there's no token yet (page just loaded) or it has expired, refresh
 * once and retry; if that fails the user is signed out and the original 401 is thrown.
 */
export async function authed<T>(call: (options: RequestOptions) => Promise<T>, options: RequestOptions = {}): Promise<T> {
  let token = accessToken ?? (await refreshSession())?.accessToken ?? null;
  if (!token) throw new ApiRequestError(401, 'Please sign in', 'NO_SESSION');
  try {
    return await call(withBearer(options, token));
  } catch (error) {
    if (!(error instanceof ApiRequestError) || error.status !== 401) throw error;
    token = (await refreshSession())?.accessToken ?? null;
    if (!token) throw error;
    return call(withBearer(options, token));
  }
}

/** Test helper: forget all in-memory state. */
export function resetSessionForTests() {
  accessToken = null;
  csrfToken = null;
  refreshing = null;
  pendingSession = null;
  listeners.clear();
}

// What kind of failure reached an error screen, so it can say the right thing.
import { isRouteErrorResponse } from 'react-router';
import { ApiRequestError } from '../services/apiClient';

export type ErrorKind = 'notFound' | 'offline' | 'updated' | 'signedOut' | 'forbidden' | 'rateLimited' | 'unavailable' | 'crash';

// The browser's words when a lazily loaded page's code can't be fetched (Chrome/Edge, Safari, Firefox,
// and Vite's CSS preload). After a new version is deployed, the old file names no longer exist.
const MISSING_CODE = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i;

export const isMissingCode = (error: unknown) => error instanceof Error && MISSING_CODE.test(error.message);

export function errorKind(error: unknown, online: boolean): ErrorKind {
  if (isRouteErrorResponse(error) && error.status === 404) return 'notFound';
  // No connection explains any failure to fetch, including page code: say so first.
  if (!online) return 'offline';
  if (isMissingCode(error)) return 'updated';
  if (error instanceof ApiRequestError) {
    // The API's own answers (the global error handler gives every error a code).
    if (error.status === 404 || error.status === 410) return 'notFound';
    if (error.status === 401) return 'signedOut';
    if (error.status === 403) return 'forbidden';
    if (error.status === 429) return 'rateLimited';
    if (error.status === 503 || error.code === 'SERVICE_UNAVAILABLE') return 'unavailable';
    // A failed request that never reached the server (TypeError from fetch is not an ApiRequestError).
  }
  if (error instanceof TypeError && /Failed to fetch|NetworkError|Load failed/i.test(error.message)) return 'unavailable';
  return 'crash';
}

/** The reference a server error carries (its request ID), for readers to quote. */
export const errorReference = (error: unknown) => (error instanceof ApiRequestError ? error.reference : undefined);

// What kind of failure reached the router's error screen, so it can say the right thing.
import { isRouteErrorResponse } from 'react-router';

export type ErrorKind = 'notFound' | 'offline' | 'updated' | 'crash';

// The browser's words when a lazily loaded page's code can't be fetched (Chrome/Edge, Safari, Firefox,
// and Vite's CSS preload). After a new version is deployed, the old file names no longer exist.
const MISSING_CODE = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i;

export function errorKind(error: unknown, online: boolean): ErrorKind {
  if (isRouteErrorResponse(error) && error.status === 404) return 'notFound';
  // No connection explains any failure to fetch, including page code: say so first.
  if (!online) return 'offline';
  if (error instanceof Error && MISSING_CODE.test(error.message)) return 'updated';
  return 'crash';
}

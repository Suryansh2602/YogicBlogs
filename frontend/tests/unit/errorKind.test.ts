// Which error screen a failure gets: not found, offline, "the site was updated", or a general problem.
import { describe, expect, it } from 'vitest';
import { errorKind, errorReference } from '../../src/routes/errorKind';
import { ApiRequestError } from '../../src/services/apiClient';

const routeResponse = (status: number) => ({ status, statusText: String(status), internal: true, data: '' });

describe('error kind', () => {
  it('a 404 from the router is "not found"', () => {
    expect(errorKind(routeResponse(404), true)).toBe('notFound');
  });

  it.each([
    'Failed to fetch dynamically imported module: https://healthmarg.in/assets/RitucharyaPage-abc.js', // Chrome, Edge
    'Importing a module script failed.', // Safari
    'error loading dynamically imported module: https://healthmarg.in/assets/x.js', // Firefox
    'Unable to preload CSS for /assets/RitucharyaPage-abc.css', // Vite
  ])('page code missing after an update (%s) is "updated"', (message) => {
    expect(errorKind(new TypeError(message), true)).toBe('updated');
  });

  it('with no connection, any failure (even missing page code) is "offline"', () => {
    expect(errorKind(new TypeError('Failed to fetch dynamically imported module: x'), false)).toBe('offline');
    expect(errorKind(new Error('boom'), false)).toBe('offline');
  });

  it('anything else is a general problem, whatever was thrown', () => {
    expect(errorKind(new Error('Cannot read properties of undefined'), true)).toBe('crash');
    expect(errorKind(routeResponse(500), true)).toBe('crash');
    expect(errorKind('a string', true)).toBe('crash');
    expect(errorKind(null, true)).toBe('crash');
  });
});

describe('error kind for API answers (every API error has a status and code)', () => {
  it.each([
    [401, 'UNAUTHORIZED', 'signedOut'],
    [403, 'FORBIDDEN', 'forbidden'],
    [404, 'NOT_FOUND', 'notFound'],
    [410, 'GONE', 'notFound'],
    [429, 'RATE_LIMITED', 'rateLimited'],
    [503, 'SERVICE_UNAVAILABLE', 'unavailable'],
    [500, 'INTERNAL_ERROR', 'crash'],
  ] as const)('%i %s → %s', (status, code, kind) => {
    expect(errorKind(new ApiRequestError(status, 'x', code), true)).toBe(kind);
  });

  it('a request that never reached the server is "unavailable"; offline still wins', () => {
    expect(errorKind(new TypeError('Failed to fetch'), true)).toBe('unavailable');
    expect(errorKind(new TypeError('NetworkError when attempting to fetch resource.'), true)).toBe('unavailable');
    expect(errorKind(new TypeError('Failed to fetch'), false)).toBe('offline');
  });

  it('gives the reference of a server error, and nothing for other errors', () => {
    expect(errorReference(new ApiRequestError(500, 'x', 'INTERNAL_ERROR', undefined, undefined, 'ref-1'))).toBe('ref-1');
    expect(errorReference(new Error('x'))).toBeUndefined();
  });
});

// Which error screen a failure gets: not found, offline, "the site was updated", or a general problem.
import { describe, expect, it } from 'vitest';
import { errorKind } from '../../src/routes/errorKind';

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

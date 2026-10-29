// The website's global error handler: errors nothing else caught are reported to the API, safely.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiRequestError } from '../../src/services/apiClient';
import { installGlobalErrorHandlers, reportError, resetErrorReportsForTests } from '../../src/services/errorReporting';
import { mockApi } from '../helpers/api';

const REF = '0190a1b2-c3d4-7000-8000-00000000f00d';
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  resetErrorReportsForTests();
  window.history.replaceState(null, '', '/reset-password?token=very-secret#part');
});
afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('reportError', () => {
  it('sends the kind, the message and only the address path (never its query or fragment)', async () => {
    const api = mockApi({ 'POST /client-errors': { status: 204 } });
    reportError('crash', new TypeError('x is undefined'));
    await flush();
    expect(api.callsTo('POST /client-errors')[0]?.body).toEqual({ kind: 'crash', message: 'TypeError: x is undefined', path: '/reset-password' });
  });

  it('links a server error’s reference, and skips expected API answers (4xx)', async () => {
    const api = mockApi({ 'POST /client-errors': { status: 204 } });
    reportError('api', new ApiRequestError(401, 'Please sign in', 'UNAUTHORIZED'));
    reportError('api', new ApiRequestError(404, 'Not found', 'NOT_FOUND'));
    reportError('api', new ApiRequestError(500, 'Oops', 'INTERNAL_ERROR', undefined, undefined, REF));
    reportError('api', new ApiRequestError(502, 'Bad gateway', undefined, undefined, undefined, '<not-a-reference>'));
    await flush();
    const bodies = api.callsTo('POST /client-errors').map((c) => c.body as Record<string, string>);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.['reference']).toBe(REF);
    expect(bodies[1]?.['reference']).toBeUndefined(); // only a real request ID is passed on
  });

  it('skips duplicates and stops after 5 reports per page load', async () => {
    const api = mockApi({ 'POST /client-errors': { status: 204 } });
    for (let i = 0; i < 3; i++) reportError('crash', new Error('same'));
    for (let i = 0; i < 10; i++) reportError('crash', new Error(`different ${String(i)}`));
    await flush();
    expect(api.callsTo('POST /client-errors')).toHaveLength(5);
  });

  it('never throws, even when reporting itself fails', async () => {
    mockApi({ 'POST /client-errors': { status: 500 } });
    expect(() => {
      reportError('crash', new Error('boom'));
    }).not.toThrow();
    await flush();
  });

  it('keeps messages short (at most 300 characters)', async () => {
    const api = mockApi({ 'POST /client-errors': { status: 204 } });
    reportError('crash', new Error('x'.repeat(1000)));
    await flush();
    expect((api.callsTo('POST /client-errors')[0]?.body as { message: string }).message.length).toBeLessThanOrEqual(300);
  });
});

describe('global listeners', () => {
  it('report uncaught errors, failed background promises and page code that couldn’t load; and can be removed', async () => {
    const api = mockApi({ 'POST /client-errors': { status: 204 } });
    const uninstall = installGlobalErrorHandlers();
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('render failed'), message: 'render failed' }));
    window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: new ApiRequestError(503, 'down', 'SERVICE_UNAVAILABLE', undefined, 30, REF) }));
    window.dispatchEvent(Object.assign(new Event('vite:preloadError'), { payload: new Error('Unable to preload CSS for /assets/x.css') }));
    await flush();
    expect(api.callsTo('POST /client-errors').map((c) => (c.body as { kind: string }).kind)).toEqual(['crash', 'api', 'updated']);
    uninstall();
    // The test catches this one itself, so it isn't counted as a real uncaught error.
    const swallow = (event: Event) => {
      event.preventDefault();
    };
    window.addEventListener('error', swallow);
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('after uninstall'), message: 'after uninstall', cancelable: true }));
    window.removeEventListener('error', swallow);
    await flush();
    expect(api.callsTo('POST /client-errors')).toHaveLength(3);
  });
});

import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/utils/ApiError.js';

describe('ApiError', () => {
  it.each([
    ['badRequest', 400, 'Bad request'],
    ['unauthorized', 401, 'Unauthorized'],
    ['forbidden', 403, 'Forbidden'],
    ['notFound', 404, 'Not found'],
    ['conflict', 409, 'Conflict'],
  ])('%s() gives %i with a default message', (factory, status, message) => {
    const err = ApiError[factory]();
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(status);
    expect(err.message).toBe(message);
  });

  it('skips stack capture for expected 4xx errors but keeps it for 5xx', () => {
    const before = Error.stackTraceLimit;
    expect(ApiError.notFound().stack).not.toMatch(/\n\s+at /);
    expect(new ApiError(503, 'Unavailable').stack).toMatch(/\n\s+at /);
    expect(Error.stackTraceLimit).toBe(before); // global setting restored
  });

  it('keeps custom messages and details', () => {
    const err = ApiError.badRequest('Bad title', [{ path: 'title' }]);
    expect(err.message).toBe('Bad title');
    expect(err.details).toEqual([{ path: 'title' }]);
  });
});

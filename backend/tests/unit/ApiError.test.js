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

  it('keeps custom messages and details', () => {
    const err = ApiError.badRequest('Bad title', [{ path: 'title' }]);
    expect(err.message).toBe('Bad title');
    expect(err.details).toEqual([{ path: 'title' }]);
  });
});

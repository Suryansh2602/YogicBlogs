import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { errorHandler, notFound } from '../../src/middlewares/errorHandler.js';
import { ApiError } from '../../src/utils/ApiError.js';

function mockRes() {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

const req = { method: 'GET', originalUrl: '/api/v1/x' };

describe('errorHandler', () => {
  it('returns the status and message of an ApiError', () => {
    const res = mockRes();
    errorHandler(ApiError.forbidden('Admins only'), req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: { message: 'Admins only', details: undefined } });
  });

  it('turns a ZodError into a 400 with field details', () => {
    const res = mockRes();
    const result = z.object({ email: z.email() }).safeParse({ email: 'nope' });
    errorHandler(result.error, req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.error.message).toBe('Validation failed');
    expect(body.error.details[0].path).toBe('email');
  });

  it('hides internal error details behind a 500', () => {
    const res = mockRes();
    errorHandler(new Error('ER_ACCESS_DENIED for user root'), req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: { message: 'Internal server error' } });
  });
});

describe('notFound', () => {
  it('forwards a 404 ApiError', () => {
    const next = vi.fn();
    notFound(req, mockRes(), next);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(404);
  });
});

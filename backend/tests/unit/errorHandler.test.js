import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ConnectionRefusedError, ConnectionAcquireTimeoutError } from 'sequelize';
import { DEFAULT_CODES, errorHandler, notFound } from '../../src/middlewares/errorHandler.js';
import { ApiError } from '../../src/utils/ApiError.js';
import { requestId } from '../../src/middlewares/requestId.js';

function mockRes() {
  const res = { headers: {} };
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.set = vi.fn((name, value) => {
    res.headers[name] = value;
    return res;
  });
  return res;
}

const req = { method: 'GET', originalUrl: '/api/v1/x', id: '0190a1b2-c3d4-7000-8000-00000000f00d' };
const body = (res) => res.json.mock.calls[0][0];

describe('errorHandler (the global error handler)', () => {
  it('returns the status, message and code of an ApiError; the code defaults by status', () => {
    const res = mockRes();
    errorHandler(ApiError.forbidden('Admins only'), req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(body(res)).toEqual({ error: { message: 'Admins only', code: 'FORBIDDEN' } });

    const own = mockRes();
    errorHandler(ApiError.conflict('Taken', 'SLUG_TAKEN'), req, own, vi.fn());
    expect(body(own)).toEqual({ error: { message: 'Taken', code: 'SLUG_TAKEN' } }); // a specific code wins
  });

  it('gives every common status a code, so the website can choose its page', () => {
    for (const [status, code] of Object.entries(DEFAULT_CODES)) {
      const res = mockRes();
      errorHandler(new ApiError(Number(status), 'x'), req, res, vi.fn());
      expect(body(res).error.code).toBe(code);
    }
  });

  it('turns a ZodError into a 400 with field details', () => {
    const res = mockRes();
    const result = z.object({ email: z.email() }).safeParse({ email: 'nope' });
    errorHandler(result.error, req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(body(res).error).toMatchObject({ message: 'Validation failed', code: 'VALIDATION_FAILED' });
    expect(body(res).error.details[0].path).toBe('email');
  });

  it('hides internal error details behind a 500 with a reference to the log entry', () => {
    const res = mockRes();
    errorHandler(new Error('ER_ACCESS_DENIED for user root'), req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(body(res)).toEqual({ error: { message: 'Something went wrong on our side. Please try again.', code: 'INTERNAL_ERROR', reference: req.id } });
    expect(JSON.stringify(body(res))).not.toMatch(/ACCESS_DENIED|root/);
  });

  it('never adds a reference to client errors (4xx)', () => {
    const res = mockRes();
    errorHandler(ApiError.notFound(), req, res, vi.fn());
    expect(body(res).error.reference).toBeUndefined();
  });

  it.each([
    ['the database refusing connections', new ConnectionRefusedError(new Error('connect ECONNREFUSED 127.0.0.1:3306'))],
    ['the connection pool timing out', new ConnectionAcquireTimeoutError(new Error('pool'))],
    ['Redis being closed', Object.assign(new Error('The client is closed'), { name: 'ClientClosedError' })],
  ])('answers %s with 503, a retry time and a reference, never the details', (_what, err) => {
    const res = mockRes();
    errorHandler(err, req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.headers['Retry-After']).toBe('30');
    expect(body(res)).toEqual({ error: { message: 'Healthmarg is temporarily unavailable. Please try again in a moment.', code: 'SERVICE_UNAVAILABLE', reference: req.id } });
  });

  it('labels broken JSON and too-large bodies from the body parser', () => {
    const json = mockRes();
    errorHandler(Object.assign(new SyntaxError('Unexpected token'), { expose: true, status: 400, type: 'entity.parse.failed' }), req, json, vi.fn());
    expect(body(json).error.code).toBe('INVALID_JSON');
    const big = mockRes();
    errorHandler(Object.assign(new Error('request entity too large'), { expose: true, status: 413, type: 'entity.too.large' }), req, big, vi.fn());
    expect(body(big).error).toEqual({ message: 'request entity too large', code: 'PAYLOAD_TOO_LARGE' });
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

describe('requestId', () => {
  it('gives each request its own random ID, in the response header too, ignoring one sent by the client', () => {
    const ids = [];
    for (let i = 0; i < 3; i++) {
      const r = { headers: { 'x-request-id': 'forged' } };
      const res = mockRes();
      const next = vi.fn();
      requestId(r, res, next);
      expect(next).toHaveBeenCalled();
      expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(res.headers['X-Request-Id']).toBe(r.id);
      ids.push(r.id);
    }
    expect(new Set(ids).size).toBe(3);
  });
});

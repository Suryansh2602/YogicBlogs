// The global error handler: every error from every route ends here and leaves as one shape,
//   { error: { message, code, details?, reference? } }
// Every error has a code (the website picks its error page from it). Server errors (5xx) also carry a
// `reference` (the request ID) that finds the full log entry; nothing internal is ever sent.
import { ZodError } from 'zod';
import { ConnectionAcquireTimeoutError, ConnectionError, OptimisticLockError, TimeoutError, UniqueConstraintError, ValidationError } from 'sequelize';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { isInUseError, isMissingReferenceError } from '../utils/dbErrors.js';

// Generic message: echoing the requested URL back would reflect attacker-controlled input.
export function notFound(_req, _res, next) {
  next(ApiError.notFound('Route not found'));
}

/** The code an error gets when nothing more specific was given. */
export const DEFAULT_CODES = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  408: 'REQUEST_TIMEOUT',
  409: 'CONFLICT',
  410: 'GONE',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};

// The database or Redis can't be reached right now: the request itself was fine, so it's a 503.
const REDIS_DOWN = new Set(['ConnectionTimeoutError', 'ClientClosedError', 'ClientOfflineError', 'SocketClosedUnexpectedlyError', 'ReconnectStrategyError']);
const isServiceDown = (err) =>
  err instanceof ConnectionError || err instanceof ConnectionAcquireTimeoutError || err instanceof TimeoutError || REDIS_DOWN.has(err?.name) || err?.code === 'ECONNREFUSED';

const RETRY_AFTER_UNAVAILABLE = 30; // seconds

function send(req, res, status, message, { code, details } = {}) {
  const body = { message, code: code ?? DEFAULT_CODES[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST') };
  if (details) body.details = details;
  if (status >= 500 && req.id) body.reference = req.id;
  return res.status(status).json({ error: body });
}

// Express recognises error handlers by their 4 arguments, so _next must stay.
export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    const details = err.issues.map(({ path, message }) => ({ path: path.join('.'), message }));
    return send(req, res, 400, 'Validation failed', { code: 'VALIDATION_FAILED', details });
  }

  if (err instanceof ApiError) {
    if (err.retryAfter) res.set('Retry-After', String(err.retryAfter));
    if (err.statusCode >= 500) logger.error({ err, method: req.method, url: req.originalUrl, requestId: req.id }, 'Server error');
    return send(req, res, err.statusCode, err.message, { code: err.code, details: err.details });
  }

  // Database errors: safe, generic messages. Never the SQL, table or constraint names.
  if (err instanceof UniqueConstraintError) return send(req, res, 409, 'Already exists', { code: 'CONFLICT' });
  if (err instanceof OptimisticLockError) {
    return send(req, res, 409, 'This was changed by someone else. Reload and try again.', { code: 'STALE_VERSION' });
  }
  if (isInUseError(err)) return send(req, res, 409, 'This is still in use and can’t be removed', { code: 'IN_USE' });
  if (isMissingReferenceError(err)) return send(req, res, 400, 'A referenced item doesn’t exist', { code: 'INVALID_REFERENCE' });
  if (err instanceof ValidationError) {
    const details = err.errors.map((e) => ({ path: e.path, message: e.message }));
    return send(req, res, 400, 'Validation failed', { code: 'VALIDATION_FAILED', details });
  }

  if (isServiceDown(err)) {
    logger.error({ err, method: req.method, url: req.originalUrl, requestId: req.id }, 'A required service is unreachable');
    res.set('Retry-After', String(RETRY_AFTER_UNAVAILABLE));
    return send(req, res, 503, 'Healthmarg is temporarily unavailable. Please try again in a moment.');
  }

  // Body-parser errors (bad JSON, payload too large) carry their own safe status.
  if (err.expose && err.status >= 400 && err.status < 500) {
    const code = err.type === 'entity.parse.failed' ? 'INVALID_JSON' : undefined;
    return send(req, res, err.status, err.message, { code });
  }

  // Unknown error: log everything, tell the client nothing internal.
  logger.error({ err, method: req.method, url: req.originalUrl, requestId: req.id }, 'Unhandled error');
  return send(req, res, 500, 'Something went wrong on our side. Please try again.');
}

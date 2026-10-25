import { ZodError } from 'zod';
import { OptimisticLockError, UniqueConstraintError, ValidationError } from 'sequelize';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { isInUseError, isMissingReferenceError } from '../utils/dbErrors.js';

// Generic message: echoing the requested URL back would reflect attacker-controlled input.
export function notFound(_req, _res, next) {
  next(ApiError.notFound('Route not found'));
}

const send = (res, status, message, { code, details } = {}) =>
  res.status(status).json({ error: { message, ...(code && { code }), ...(details && { details }) } });

// Express recognises error handlers by their 4 arguments, so _next must stay.
export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    const details = err.issues.map(({ path, message }) => ({ path: path.join('.'), message }));
    return send(res, 400, 'Validation failed', { code: 'VALIDATION_FAILED', details });
  }

  if (err instanceof ApiError) {
    if (err.retryAfter) res.set('Retry-After', String(err.retryAfter));
    return send(res, err.statusCode, err.message, { code: err.code, details: err.details });
  }

  // Database errors: safe, generic messages. Never the SQL, table or constraint names.
  if (err instanceof UniqueConstraintError) return send(res, 409, 'Already exists', { code: 'CONFLICT' });
  if (err instanceof OptimisticLockError) {
    return send(res, 409, 'This was changed by someone else. Reload and try again.', { code: 'STALE_VERSION' });
  }
  if (isInUseError(err)) return send(res, 409, 'This is still in use and can’t be removed', { code: 'IN_USE' });
  if (isMissingReferenceError(err)) return send(res, 400, 'A referenced item doesn’t exist', { code: 'INVALID_REFERENCE' });
  if (err instanceof ValidationError) {
    const details = err.errors.map((e) => ({ path: e.path, message: e.message }));
    return send(res, 400, 'Validation failed', { code: 'VALIDATION_FAILED', details });
  }

  // Body-parser errors (bad JSON, payload too large) carry their own safe status.
  if (err.expose && err.status >= 400 && err.status < 500) {
    return send(res, err.status, err.message);
  }

  // Unknown error: log everything, tell the client nothing internal.
  logger.error({ err, method: req.method, url: req.originalUrl, requestId: req.id }, 'Unhandled error');
  return send(res, 500, 'Internal server error');
}

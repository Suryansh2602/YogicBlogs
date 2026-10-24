import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

// Generic message: echoing the requested URL back would reflect attacker-controlled input.
export function notFound(_req, _res, next) {
  next(ApiError.notFound('Route not found'));
}

// Express recognises error handlers by their 4 arguments, so _next must stay.
export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    const details = err.issues.map(({ path, message }) => ({ path: path.join('.'), message }));
    return res.status(400).json({ error: { message: 'Validation failed', details } });
  }

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: { message: err.message, details: err.details } });
  }

  // Body-parser errors (bad JSON, payload too large) carry their own safe status.
  if (err.expose && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: { message: err.message } });
  }

  // Unknown error: log everything, tell the client nothing internal.
  logger.error({ err, method: req.method, url: req.originalUrl }, 'Unhandled error');
  return res.status(500).json({ error: { message: 'Internal server error' } });
}

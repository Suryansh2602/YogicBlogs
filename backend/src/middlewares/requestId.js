import { randomUUID } from 'node:crypto';

/**
 * Give every request a random ID: in the X-Request-Id response header, in logs and the audit log, and as
 * the `reference` of server errors, so a reader can quote it and we can find the full log entry.
 * An ID sent by the client is never trusted (it could be used to forge or confuse log entries).
 */
export function requestId(req, res, next) {
  req.id = randomUUID();
  res.set('X-Request-Id', req.id);
  next();
}

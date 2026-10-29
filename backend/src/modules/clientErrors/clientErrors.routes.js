// Errors that happened in a visitor's browser (a page crash, a failed background request, page code
// missing after an update), reported by the website's global error handler so we hear about them.
// Logged only: nothing is stored in the database. No personal data: the address keeps its path only
// (query strings and fragments can carry reset or sign-in tokens), and anything that looks like a token
// or an email address is blanked out of the message.
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate.js';
import { logger } from '../../utils/logger.js';

export const CLIENT_ERROR_KINDS = ['crash', 'unhandled', 'updated', 'offline', 'api'];

const pathOnly = (value) => (value.split(/[?#]/)[0] ?? '').slice(0, 200);
/** Blank out what could identify someone or unlock something. */
export const scrub = (text) =>
  text
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]')
    .replace(/\?[^\s)]*/g, '?[query]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[token]');

const clientErrorSchema = z
  .object({
    kind: z.enum(CLIENT_ERROR_KINDS),
    message: z.string().trim().min(1).max(300),
    path: z.string().max(500).transform(pathOnly),
    // The API's own request ID, when the error came from an API response.
    reference: z.uuid().optional(),
  })
  .strict();

export function createClientErrorsRouter(limiter) {
  const router = Router();
  router.post('/', limiter, validate({ body: clientErrorSchema }), (req, res) => {
    const { kind, message, path, reference } = req.body;
    logger.warn(
      { clientError: { kind, message: scrub(message), path, reference }, requestId: req.id, userAgent: (req.get('User-Agent') ?? '').slice(0, 200) },
      'Error in a visitor’s browser',
    );
    res.status(204).end();
  });
  return router;
}

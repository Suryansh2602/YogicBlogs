import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import { authenticate, requireMfa, requireRole } from '../../middlewares/authenticate.js';
import { ROLES } from '../../config/constants.js';
import * as c from './admin.controller.js';
import { adminSetupSchema, listAuditLogsQuery, listUsersQuery } from './admin.validation.js';
import { adminConditionsRouter } from '../conditions/conditions.routes.js';

/** @param {import('express').RequestHandler} strictLimiter brute-force limit for the setup code */
export function createAdminRouter(strictLimiter) {
  const router = Router();

  // Bootstrap (works only while no admin exists).
  router.get('/setup/status', c.setupStatus);
  router.post('/setup', strictLimiter, validate({ body: adminSetupSchema }), c.setup);

  // Everything else: a signed-in admin whose session passed 2FA.
  router.use(authenticate, requireRole(ROLES.ADMIN), requireMfa);
  router.get('/stats', c.stats);
  router.get('/users', validate({ query: listUsersQuery }), c.users);
  router.get('/audit-logs', validate({ query: listAuditLogsQuery }), c.auditLogs);
  router.use('/conditions', adminConditionsRouter);

  return router;
}

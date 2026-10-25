import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { displayName } from '../auth/auth.validation.js';
import * as users from './users.service.js';

const updateMeSchema = z.object({ displayName }).strict();

const router = Router();
router.use(authenticate);

router.get('/me', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await users.getMe(req.auth.userId));
});

router.patch('/me', validate({ body: updateMeSchema }), async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await users.updateMe(req.auth.userId, req.body, req));
});

export default router;

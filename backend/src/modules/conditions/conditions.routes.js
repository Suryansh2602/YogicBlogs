import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import * as conditions from './conditions.service.js';
import { conditionIdParams, createConditionSchema, updateConditionSchema } from './conditions.validation.js';

/** Public: published conditions (cached on the server; browsers may cache for 5 minutes). */
export const publicConditionsRouter = Router();
publicConditionsRouter.get('/', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json(await conditions.listPublished());
});

/** Admin: mounted inside the admin router, after its authenticate → admin → 2FA gate. */
export const adminConditionsRouter = Router();

adminConditionsRouter.get('/', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await conditions.listForAdmin());
});

adminConditionsRouter.post('/', validate({ body: createConditionSchema }), async (req, res) => {
  res.status(201).json(await conditions.create(req.body, req));
});

adminConditionsRouter.patch('/:id', validate({ params: conditionIdParams, body: updateConditionSchema }), async (req, res) => {
  res.json(await conditions.update(req.params.id, req.body, req));
});

adminConditionsRouter.delete('/:id', validate({ params: conditionIdParams }), async (req, res) => {
  await conditions.remove(req.params.id, req);
  res.status(204).end();
});

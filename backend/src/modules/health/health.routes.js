import { Router } from 'express';
import { pingDatabase } from '../../config/db.js';
import { isRedisEnabled, pingRedis } from '../../config/redis.js';

const router = Router();

const check = (ping) =>
  ping().then(
    () => 'up',
    () => 'down',
  );

// Reports dependency state only (up/down/disabled), never versions, hosts or error messages.
// "disabled" is only possible in local development (production requires Redis).
router.get('/', async (_req, res) => {
  const [database, redis] = await Promise.all([
    check(pingDatabase),
    isRedisEnabled() ? check(pingRedis) : Promise.resolve('disabled'),
  ]);
  const healthy = database === 'up' && redis !== 'down';
  res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', database, redis });
});

export default router;

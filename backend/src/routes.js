import { Router } from 'express';
import healthRoutes from './modules/health/health.routes.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createAdminRouter } from './modules/admin/admin.routes.js';
import userRoutes from './modules/users/users.routes.js';
import { publicConditionsRouter } from './modules/conditions/conditions.routes.js';
import { publicArticlesRouter } from './modules/articles/articles.routes.js';

/**
 * Mount each feature module here as it is built, e.g. router.use('/articles', articleRoutes).
 * @param {{ strictLimiter: import('express').RequestHandler, uploadLimiter: import('express').RequestHandler, autosaveLimiter: import('express').RequestHandler }} deps
 */
export function createRoutes({ strictLimiter, uploadLimiter, autosaveLimiter }) {
  const router = Router();

  router.use('/health', healthRoutes);
  router.use('/auth', createAuthRouter(strictLimiter));
  router.use('/users', userRoutes);
  router.use('/admin', createAdminRouter(strictLimiter, { uploadLimiter, autosaveLimiter }));
  router.use('/articles', publicArticlesRouter);
  router.use('/conditions', publicConditionsRouter);

  return router;
}

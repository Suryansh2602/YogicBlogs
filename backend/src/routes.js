import { Router } from 'express';
import healthRoutes from './modules/health/health.routes.js';

// Mount each feature module here as it is built, e.g. router.use('/articles', articleRoutes).
const router = Router();

router.use('/health', healthRoutes);

export default router;

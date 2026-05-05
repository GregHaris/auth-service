import { Router } from 'express';
import { healthCheck } from '../controllers/health.controller';

const router = Router();

/**
 * GET /health
 * Public route — no auth required
 * Used by Docker, load balancers, and monitoring tools
 * to confirm the service is alive and connected
 */
router.get('/', healthCheck);

export default router;

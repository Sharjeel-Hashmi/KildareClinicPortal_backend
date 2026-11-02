import { Router } from 'express';
import { protect, requireSuperAdmin } from '../middleware/auth.js';
import { getSummary } from '../controllers/financeController.js';

const router = Router();
router.use(protect, requireSuperAdmin);

router.get('/summary', getSummary);

export default router;
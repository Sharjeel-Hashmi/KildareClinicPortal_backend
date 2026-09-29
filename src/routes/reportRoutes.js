import { Router } from 'express';
import { protect, requireSuperAdmin } from '../middleware/auth.js';
import { getReport, deleteReport } from '../controllers/reportController.js';

const router = Router();
router.use(protect);

router.route('/:id').get(getReport).delete(requireSuperAdmin, deleteReport);

export default router;
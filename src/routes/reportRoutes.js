import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { getReport, deleteReport } from '../controllers/reportController.js';

const router = Router();
router.use(protect);

router.route('/:id').get(getReport).delete(deleteReport);

export default router;
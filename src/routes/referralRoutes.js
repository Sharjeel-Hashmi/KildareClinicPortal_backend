import { Router } from 'express';
import { protect, requireSuperAdmin } from '../middleware/auth.js';
import { getReferral, deleteReferral } from '../controllers/referralController.js';

const router = Router();
router.use(protect);

router.route('/:id').get(getReferral).delete(requireSuperAdmin, deleteReferral);

export default router;
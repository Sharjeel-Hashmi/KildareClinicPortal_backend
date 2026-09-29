import { Router } from 'express';
import { protect, requireSuperAdmin } from '../middleware/auth.js';
import { getPrescription, deletePrescription } from '../controllers/prescriptionController.js';

const router = Router();
router.use(protect);

router.route('/:id').get(getPrescription).delete(requireSuperAdmin, deletePrescription);

export default router;
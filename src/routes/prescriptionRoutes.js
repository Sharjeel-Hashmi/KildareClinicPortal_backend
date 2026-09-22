import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { getPrescription, deletePrescription } from '../controllers/prescriptionController.js';

const router = Router();
router.use(protect);

router.route('/:id').get(getPrescription).delete(deletePrescription);

export default router;

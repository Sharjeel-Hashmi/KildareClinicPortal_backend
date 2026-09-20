import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  listAll,
  getConsultation,
  updateConsultation,
  deleteConsultation,
} from '../controllers/consultationController.js';

const router = Router();
router.use(protect);

router.get('/', listAll);
router.route('/:id').get(getConsultation).put(updateConsultation).delete(deleteConsultation);

export default router;

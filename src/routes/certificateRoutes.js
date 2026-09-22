import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { getCertificate, deleteCertificate } from '../controllers/certificateController.js';

const router = Router();
router.use(protect);

router.route('/:id').get(getCertificate).delete(deleteCertificate);

export default router;

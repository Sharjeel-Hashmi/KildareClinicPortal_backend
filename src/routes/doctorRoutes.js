import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { listDoctors } from '../controllers/userController.js';

const router = Router();
router.use(protect);

// Active doctors, for the booking form and the Settings service form (any signed-in user)
router.get('/', listDoctors);

export default router;

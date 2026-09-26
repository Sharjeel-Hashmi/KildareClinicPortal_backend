import { Router } from 'express';
import { protect, requireSettingsAccess } from '../middleware/auth.js';
import { listLabs, createLab, deleteLab } from '../controllers/labController.js';

const router = Router();
router.use(protect);

router.route('/').get(listLabs).post(requireSettingsAccess, createLab);
router.route('/:id').delete(requireSettingsAccess, deleteLab);

export default router;
import { Router } from 'express';
import { protect, requireSettingsAccess, requireSettingsRemove } from '../middleware/auth.js';
import { listLabs, createLab, deleteLab } from '../controllers/labController.js';

const router = Router();
router.use(protect);

router.route('/').get(listLabs).post(requireSettingsAccess, createLab);
router.route('/:id').delete(requireSettingsRemove, deleteLab);

export default router;
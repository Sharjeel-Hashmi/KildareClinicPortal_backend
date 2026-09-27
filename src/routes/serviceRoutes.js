import { Router } from 'express';
import { protect, requireSettingsAccess } from '../middleware/auth.js';
import { listServices, createService, updateService, deleteService } from '../controllers/serviceController.js';

const router = Router();
router.use(protect);

router.route('/').get(listServices).post(requireSettingsAccess, createService);
router.route('/:id').put(requireSettingsAccess, updateService).delete(requireSettingsAccess, deleteService);

export default router;
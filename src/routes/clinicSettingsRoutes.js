import { Router } from 'express';
import { protect, requireSuperAdmin } from '../middleware/auth.js';
import { getClinicSettings, updateClinicSettings } from '../controllers/clinicSettingsController.js';

const router = Router();
router.use(protect);

router.get('/', getClinicSettings);
router.put('/', requireSuperAdmin, updateClinicSettings);

export default router;
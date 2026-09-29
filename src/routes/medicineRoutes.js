import { Router } from 'express';
import { protect, requireSettingsAccess, requireSettingsRemove } from '../middleware/auth.js';
import { listMedicines, createMedicine, updateMedicine, deleteMedicine } from '../controllers/medicineController.js';

const router = Router();
router.use(protect);

router.route('/').get(listMedicines).post(requireSettingsAccess, createMedicine);
router.route('/:id').put(requireSettingsAccess, updateMedicine).delete(requireSettingsRemove, deleteMedicine);

export default router;
import { Router } from 'express';
import { protect, requireSettingsAccess, requireSettingsRemove } from '../middleware/auth.js';
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/medicineCategoryController.js';

const router = Router();
router.use(protect);

router.route('/').get(listCategories).post(requireSettingsAccess, createCategory);
router.route('/:id').put(requireSettingsAccess, updateCategory).delete(requireSettingsRemove, deleteCategory);

export default router;
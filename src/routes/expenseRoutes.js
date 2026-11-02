import { Router } from 'express';
import { protect, requireSuperAdmin } from '../middleware/auth.js';
import {
  listExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/expenseController.js';

const router = Router();
router.use(protect, requireSuperAdmin); // expenses are for the Super Admin only

// categories first, so "categories" is not read as an expense id
router.route('/categories').get(listCategories).post(createCategory);
router.route('/categories/:id').put(updateCategory).delete(deleteCategory);

router.route('/').get(listExpenses).post(createExpense);
router.route('/:id').put(updateExpense).delete(deleteExpense);

export default router;
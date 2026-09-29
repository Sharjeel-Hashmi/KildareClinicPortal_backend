import { Router } from 'express';
import { protect, requireAdmin, requireSuperAdmin } from '../middleware/auth.js';
import { listUsers, createUser, updateUser, deleteUser } from '../controllers/userController.js';

const router = Router();
router.use(protect, requireAdmin);

router.route('/').get(listUsers).post(createUser);
router.route('/:id').put(updateUser).delete(requireSuperAdmin, deleteUser);

export default router;
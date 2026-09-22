import { Router } from 'express';
import { protect, requireAdmin } from '../middleware/auth.js';
import { listUsers, createUser, updateUser, deleteUser } from '../controllers/userController.js';

const router = Router();
router.use(protect, requireAdmin);

router.route('/').get(listUsers).post(createUser);
router.route('/:id').put(updateUser).delete(deleteUser);

export default router;

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { listNotifications, markRead } from '../controllers/notificationController.js';

const router = Router();
router.use(protect);

router.get('/', listNotifications);
router.post('/read', markRead);

export default router;

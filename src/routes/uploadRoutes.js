import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { requestUploadToken } from '../controllers/uploadController.js';

const router = Router();
router.use(protect);

router.post('/', requestUploadToken);

export default router;
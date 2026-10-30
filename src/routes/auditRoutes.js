import { Router } from 'express';
import { protect, requireSuperAdmin } from '../middleware/auth.js';
import { listAudit, recordPrint } from '../controllers/auditController.js';

const router = Router();
router.use(protect);

router.post('/print', recordPrint); // any signed-in user: "I printed this document"
router.get('/', requireSuperAdmin, listAudit); // the log itself: Super Admin only

export default router;

import { Router } from 'express';
import { protect, requireSuperAdmin } from '../middleware/auth.js';
import { listAll, getInvoice, updateInvoice, deleteInvoice } from '../controllers/invoiceController.js';

const router = Router();
router.use(protect);

router.get('/', listAll);
router.route('/:id').get(getInvoice).put(requireSuperAdmin, updateInvoice).delete(requireSuperAdmin, deleteInvoice);

export default router;
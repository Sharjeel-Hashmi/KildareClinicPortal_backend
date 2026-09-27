import { Router } from 'express';
import { protect, requireAdmin } from '../middleware/auth.js';
import { listAll, getInvoice, updateInvoice, deleteInvoice } from '../controllers/invoiceController.js';

const router = Router();
router.use(protect);

router.get('/', listAll);
router.route('/:id').get(getInvoice).put(requireAdmin, updateInvoice).delete(requireAdmin, deleteInvoice);

export default router;
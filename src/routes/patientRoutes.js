import { Router } from 'express';
import { protect, requireSuperAdmin } from '../middleware/auth.js';
import {
  listPatients,
  createPatient,
  getPatient,
  updatePatient,
  deletePatient,
} from '../controllers/patientController.js';
import { listForPatient, createForPatient } from '../controllers/consultationController.js';
import {
  listForPatient as listPrescriptionsForPatient,
  createForPatient as createPrescriptionForPatient,
} from '../controllers/prescriptionController.js';
import {
  listForPatient as listCertificatesForPatient,
  createForPatient as createCertificateForPatient,
} from '../controllers/certificateController.js';
import {
  listForPatient as listReportsForPatient,
  createForPatient as createReportForPatient,
} from '../controllers/reportController.js';
import {
  listForPatient as listInvoicesForPatient,
  createForPatient as createInvoiceForPatient,
} from '../controllers/invoiceController.js';

const router = Router();
router.use(protect);

router.route('/').get(listPatients).post(createPatient);
router.route('/:id').get(getPatient).put(updatePatient).delete(requireSuperAdmin, deletePatient);
router.route('/:patientId/consultations').get(listForPatient).post(createForPatient);
router.route('/:patientId/prescriptions').get(listPrescriptionsForPatient).post(createPrescriptionForPatient);
router.route('/:patientId/certificates').get(listCertificatesForPatient).post(createCertificateForPatient);
router.route('/:patientId/reports').get(listReportsForPatient).post(createReportForPatient);
router.route('/:patientId/invoices').get(listInvoicesForPatient).post(createInvoiceForPatient);

export default router;
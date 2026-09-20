import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  listPatients,
  createPatient,
  getPatient,
  updatePatient,
  deletePatient,
} from '../controllers/patientController.js';
import { listForPatient, createForPatient } from '../controllers/consultationController.js';

const router = Router();
router.use(protect);

router.route('/').get(listPatients).post(createPatient);
router.route('/:id').get(getPatient).put(updatePatient).delete(deletePatient);
router.route('/:patientId/consultations').get(listForPatient).post(createForPatient);

export default router;

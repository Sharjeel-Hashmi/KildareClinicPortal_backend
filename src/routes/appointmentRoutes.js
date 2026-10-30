import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  listAppointments,
  getAppointment,
  createManualAppointment,
  changeStatus,
  linkPatient,
} from '../controllers/appointmentController.js';

const router = Router();
router.use(protect);

router.route('/').get(listAppointments).post(createManualAppointment);
router.get('/:id', getAppointment);
router.patch('/:id/status', changeStatus);
router.patch('/:id/patient', linkPatient);

export default router;

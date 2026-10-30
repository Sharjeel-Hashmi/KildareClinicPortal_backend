import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { getAvailability, saveAvailability, getSlots, getDates } from '../controllers/availabilityController.js';

const router = Router();
router.use(protect);

// :doctorId is a doctor's id, or "me" for the signed-in doctor
router.route('/:doctorId').get(getAvailability).put(saveAvailability);
router.get('/:doctorId/slots', getSlots);
router.get('/:doctorId/dates', getDates);

export default router;

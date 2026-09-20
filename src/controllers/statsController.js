import Patient from '../models/Patient.js';
import Consultation from '../models/Consultation.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// The browser sends the start of "today" / "this month" in the clinic's local time
// so the numbers match what the doctor sees on their own clock.
const parseDate = (value, fallback) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
};

export const getStats = asyncHandler(async (req, res) => {
  const now = new Date();
  const dayStart = parseDate(req.query.dayStart, new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const monthStart = parseDate(req.query.monthStart, new Date(now.getFullYear(), now.getMonth(), 1));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const [
    totalPatients,
    newPatientsThisMonth,
    consultationsToday,
    consultationsThisMonth,
    todaysConsultations,
    recentPatients,
  ] = await Promise.all([
    Patient.countDocuments(),
    Patient.countDocuments({ createdAt: { $gte: monthStart } }),
    Consultation.countDocuments({ consultationDate: { $gte: dayStart, $lt: dayEnd } }),
    Consultation.countDocuments({ consultationDate: { $gte: monthStart } }),
    Consultation.find({ consultationDate: { $gte: dayStart, $lt: dayEnd } })
      .sort({ consultationDate: 1 })
      .limit(8)
      .populate('patient', 'patientNo surname firstName dob')
      .lean(),
    Patient.find().sort({ createdAt: -1 }).limit(5).lean(),
  ]);

  res.json({
    totalPatients,
    newPatientsThisMonth,
    consultationsToday,
    consultationsThisMonth,
    todaysConsultations,
    recentPatients,
  });
});

import Patient from '../models/Patient.js';
import Consultation from '../models/Consultation.js';
import User from '../models/User.js';
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

  // A doctor's dashboard shows only their own work: the consultations they recorded, the patients they have
  // seen, and the patients they registered. Admin / Super Admin see the whole clinic. (The Patients page itself
  // stays open to every doctor, for emergencies and follow-ups.)
  const isDoctor = req.user.role === 'doctor';
  const own = isDoctor ? { createdBy: req.user._id } : {};
  const ownPatients = isDoctor ? { createdBy: req.user._id } : {};

  const [
    totalPatients,
    patientsSeen,
    newPatientsThisMonth,
    consultationsToday,
    consultationsThisMonth,
    todaysConsultations,
    recentPatients,
  ] = await Promise.all([
    isDoctor ? Promise.resolve(0) : Patient.countDocuments(),
    // distinct patients this doctor has had a consultation with (patients that still exist)
    isDoctor
      ? Consultation.distinct('patient', own).then((ids) => Patient.countDocuments({ _id: { $in: ids } }))
      : Promise.resolve(0),
    Patient.countDocuments({ ...ownPatients, createdAt: { $gte: monthStart } }),
    Consultation.countDocuments({ ...own, consultationDate: { $gte: dayStart, $lt: dayEnd } }),
    Consultation.countDocuments({ ...own, consultationDate: { $gte: monthStart } }),
    Consultation.find({ ...own, consultationDate: { $gte: dayStart, $lt: dayEnd } })
      .sort({ consultationDate: 1 })
      .limit(8)
      .populate('patient', 'patientNo surname firstName dob')
      .lean(),
    Patient.find(ownPatients).sort({ createdAt: -1 }).limit(5).lean(),
  ]);

  // Admin-only: how many patients each doctor has seen this month, for the "Team activity"
  // panel on the dashboard. Doctors already see their own total via "Consultations this month".
  let teamActivity;
  if (req.user.role !== 'doctor') {
    const [monthConsultations, doctors] = await Promise.all([
      Consultation.find({ consultationDate: { $gte: monthStart } }).select('createdBy').lean(),
      User.find({ role: 'doctor' }).select('name imcNumber').lean(),
    ]);
    const countByDoctor = new Map();
    for (const c of monthConsultations) {
      if (!c.createdBy) continue;
      const key = String(c.createdBy);
      countByDoctor.set(key, (countByDoctor.get(key) || 0) + 1);
    }
    teamActivity = doctors
      .map((d) => ({ id: d._id, name: d.name, imcNumber: d.imcNumber, count: countByDoctor.get(String(d._id)) || 0 }))
      .sort((a, b) => b.count - a.count);
  }

  res.json({
    scope: isDoctor ? 'own' : 'clinic',
    totalPatients,
    patientsSeen,
    newPatientsThisMonth,
    consultationsToday,
    consultationsThisMonth,
    todaysConsultations,
    recentPatients,
    ...(teamActivity ? { teamActivity } : {}),
  });
});
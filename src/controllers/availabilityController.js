import mongoose from 'mongoose';
import User from '../models/User.js';
import DoctorAvailability from '../models/DoctorAvailability.js';
import { isAdminLike } from '../middleware/auth.js';
import { validateAvailability } from '../utils/availabilityValidation.js';
import { getAvailableSlots, getAvailableDates } from '../services/bookingService.js';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';

// "me" means the signed-in doctor
const targetId = (req) => (req.params.doctorId === 'me' ? String(req.user._id) : req.params.doctorId);

// A doctor manages only their own availability; Admin / Super Admin can manage anyone's.
const canManage = (req, doctorId) => isAdminLike(req.user) || String(req.user._id) === String(doctorId);

async function findDoctor(req) {
  const id = targetId(req);
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'Invalid doctor');
  const doctor = await User.findById(id).select('name role isActive');
  if (!doctor || doctor.isActive === false) throw new HttpError(404, 'Doctor not found');
  return doctor;
}

// GET /api/availability/:doctorId        (doctorId or "me")
export const getAvailability = asyncHandler(async (req, res) => {
  const doctor = await findDoctor(req);
  if (!canManage(req, doctor._id)) throw new HttpError(403, 'You can only view your own availability');

  const saved = await DoctorAvailability.findOne({ doctor: doctor._id }).lean();
  res.json({
    doctor: { id: doctor._id, name: doctor.name },
    availability: saved || DoctorAvailability.defaults(doctor._id),
    saved: Boolean(saved),
  });
});

// PUT /api/availability/:doctorId        (weekly schedule, slot length, buffer, exceptions, blocks)
export const saveAvailability = asyncHandler(async (req, res) => {
  const doctor = await findDoctor(req);
  if (!canManage(req, doctor._id)) throw new HttpError(403, 'You can only edit your own availability');

  const { value, error } = validateAvailability(req.body);
  if (error) throw new HttpError(400, error);
  if (Object.keys(value).length === 0) throw new HttpError(400, 'Nothing to save');

  const availability = await DoctorAvailability.findOneAndUpdate(
    { doctor: doctor._id },
    { $set: value },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  ).lean();
  res.json({ availability, message: 'Availability saved' });
});

// Staff taking a phone booking may book inside the minimum-notice window, so the booking form
// asks for ?staff=1. The "preview what patients see" screens leave it out and get the website rules.
const slotOptions = (req) => (req.query.staff === '1' ? { minNoticeHours: 0 } : {});

// GET /api/availability/:doctorId/slots?date=YYYY-MM-DD&serviceId=...&staff=1
export const getSlots = asyncHandler(async (req, res) => {
  const doctor = await findDoctor(req);
  const result = await getAvailableSlots(
    { doctorId: String(doctor._id), date: req.query.date, serviceId: req.query.serviceId || undefined },
    slotOptions(req)
  );
  res.json(result);
});

// GET /api/availability/:doctorId/dates?from=YYYY-MM-DD&to=YYYY-MM-DD&serviceId=...
export const getDates = asyncHandler(async (req, res) => {
  const doctor = await findDoctor(req);
  const result = await getAvailableDates(
    { doctorId: String(doctor._id), from: req.query.from, to: req.query.to, serviceId: req.query.serviceId || undefined },
    slotOptions(req)
  );
  res.json(result);
});

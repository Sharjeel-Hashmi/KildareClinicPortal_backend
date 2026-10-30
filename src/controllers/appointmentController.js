import mongoose from 'mongoose';
import { DateTime } from 'luxon';
import User from '../models/User.js';
import Patient from '../models/Patient.js';
import Appointment from '../models/Appointment.js';
import { TIMEZONE } from '../config/booking.js';
import { isAdminLike } from '../middleware/auth.js';
import { isValidDateStr, dublinDateOf, dublinTimeOf } from '../utils/slotMath.js';
import { createAppointment } from '../services/bookingService.js';
import * as mailer from '../services/mailer.js';
import * as notifications from '../services/notificationService.js';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HIDDEN = '-cancelToken -slotKeys';

// What the dashboard sees. The patient's private cancel token and the internal slot list are left out.
const present = (a) => {
  const o = a.toObject ? a.toObject() : a;
  delete o.cancelToken;
  delete o.slotKeys;
  const startMs = new Date(o.startTime).getTime();
  const endMs = new Date(o.endTime).getTime();
  return {
    ...o,
    startLocal: { date: dublinDateOf(startMs), time: dublinTimeOf(startMs) },
    endLocal: { date: dublinDateOf(endMs), time: dublinTimeOf(endMs) },
  };
};

const load = (id) =>
  Appointment.findById(id)
    .populate('doctor', 'name')
    .populate('patientRef', 'patientNo surname firstName')
    .select(HIDDEN);

// Doctors work with their own appointments; Admin / Super Admin with everyone's.
const canAccess = (req, appointment) =>
  isAdminLike(req.user) || String(appointment.doctor?._id || appointment.doctor) === String(req.user._id);

// Status changes the dashboard allows. A cancelled booking is final (its slot may already be re-booked).
const TRANSITIONS = {
  confirmed: ['cancelled', 'completed', 'no_show'],
  pending_payment: ['cancelled'],
  completed: ['confirmed', 'no_show'],
  no_show: ['confirmed', 'completed'],
  cancelled: [],
};

// GET /api/appointments?from=YYYY-MM-DD&to=YYYY-MM-DD&status=confirmed,completed&doctorId=...
// Defaults to the next 7 days. Dates are Irish dates.
export const listAppointments = asyncHandler(async (req, res) => {
  const today = DateTime.now().setZone(TIMEZONE).toISODate();
  const from = req.query.from || today;
  const to = req.query.to || DateTime.fromISO(from, { zone: TIMEZONE }).plus({ days: 6 }).toISODate();
  if (!isValidDateStr(from) || !isValidDateStr(to)) throw new HttpError(400, 'Dates must be in YYYY-MM-DD format');

  const fromDt = DateTime.fromISO(from, { zone: TIMEZONE }).startOf('day');
  const toDt = DateTime.fromISO(to, { zone: TIMEZONE }).plus({ days: 1 }).startOf('day');
  if (toDt <= fromDt) throw new HttpError(400, 'The end date must not be before the start date');
  if (toDt.diff(fromDt, 'days').days > 93) throw new HttpError(400, 'Choose a range of 3 months or less');

  const filter = { startTime: { $gte: fromDt.toJSDate(), $lt: toDt.toJSDate() } };

  const statuses = String(req.query.status || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => Appointment.STATUSES.includes(s));
  if (statuses.length) filter.status = { $in: statuses };

  if (isAdminLike(req.user)) {
    if (req.query.doctorId) {
      if (!mongoose.isValidObjectId(req.query.doctorId)) throw new HttpError(400, 'Invalid doctor');
      filter.doctor = req.query.doctorId;
    }
  } else {
    filter.doctor = req.user._id;
  }

  const appointments = await Appointment.find(filter)
    .sort({ startTime: 1 })
    .limit(500)
    .populate('doctor', 'name')
    .populate('patientRef', 'patientNo surname firstName')
    .select(HIDDEN);
  res.json({ appointments: appointments.map(present), range: { from, to } });
});

export const getAppointment = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Appointment not found');
  const appointment = await load(req.params.id);
  if (!appointment) throw new HttpError(404, 'Appointment not found');
  if (!canAccess(req, appointment)) throw new HttpError(403, 'You can only view your own appointments');
  res.json({ appointment: present(appointment) });
});

// Manual booking (phone / walk-in). Doctors book for themselves; Admin / Super Admin for any doctor.
// The patient is either an existing registered patient (patientId) or typed in by hand.
export const createManualAppointment = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const doctorId = isAdminLike(req.user) ? body.doctorId : String(req.user._id);
  if (!doctorId || !mongoose.isValidObjectId(doctorId)) throw new HttpError(400, 'Choose a doctor');
  const doctor = await User.findById(doctorId).select('isActive name');
  if (!doctor || doctor.isActive === false) throw new HttpError(404, 'Doctor not found');

  let patient;
  let patientRef;
  if (body.patientId) {
    if (!mongoose.isValidObjectId(body.patientId)) throw new HttpError(400, 'Choose a registered patient');
    const existing = await Patient.findById(body.patientId).select('surname firstName phone email');
    if (!existing) throw new HttpError(404, 'Patient not found');
    patientRef = existing._id;
    patient = {
      fullName: `${existing.firstName} ${existing.surname}`.trim(),
      phone: existing.phone || '',
      email: existing.email || '',
      isNewPatient: false,
      reason: String(body.patient?.reason || '').trim(),
    };
    // staff may type a different phone / email for this visit
    if (String(body.patient?.phone || '').trim()) patient.phone = String(body.patient.phone).trim();
    if (String(body.patient?.email || '').trim()) patient.email = String(body.patient.email).trim().toLowerCase();
  } else {
    const p = body.patient || {};
    patient = {
      fullName: String(p.fullName || '').trim(),
      phone: String(p.phone || '').trim(),
      email: String(p.email || '').trim().toLowerCase(),
      isNewPatient: true,
      reason: String(p.reason || '').trim(),
    };
  }

  if (!patient.fullName) throw new HttpError(400, "Enter the patient's full name");
  if (patient.fullName.length > 120) throw new HttpError(400, "The patient's name is too long");
  if (!patient.phone) throw new HttpError(400, 'Enter a contact phone number');
  if (patient.phone.length > 30) throw new HttpError(400, 'The phone number is too long');
  if (patient.email && !EMAIL_RE.test(patient.email)) throw new HttpError(400, 'Enter a valid email address');
  if (patient.reason.length > 300) throw new HttpError(400, 'Keep the reason under 300 characters');

  const appointment = await createAppointment({
    doctorId,
    serviceId: body.serviceId,
    startTime: body.startTime,
    patient,
    patientRef,
    source: 'dashboard',
    gdprConsent: body.gdprConsent === true,
    createdBy: req.user._id,
  });

  // email the patient their confirmation (with a cancel link) when they gave an address and email is set up
  const [mail] = await Promise.all([
    patient.email ? mailer.sendBookingConfirmation(appointment, doctor.name) : { sent: false },
    // tell the doctor and the admins (not the person who made the booking)
    notifications.notifyAppointmentEvent({
      type: 'booking_created',
      appointment,
      doctorId,
      doctorName: doctor.name,
      actorId: String(req.user._id),
      source: 'dashboard',
    }),
  ]);

  const saved = await load(appointment._id);
  res.status(201).json({ appointment: present(saved), patientEmailed: mail.sent === true });
});

// Cancel / mark completed / mark no-show.  PATCH /api/appointments/:id/status   body: { status, reason? }
export const changeStatus = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Appointment not found');
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) throw new HttpError(404, 'Appointment not found');
  if (!canAccess(req, appointment)) throw new HttpError(403, 'You can only change your own appointments');

  const next = req.body?.status;
  if (!Appointment.STATUSES.includes(next)) throw new HttpError(400, 'Invalid status');
  if (!(TRANSITIONS[appointment.status] || []).includes(next)) {
    throw new HttpError(
      400,
      `A ${appointment.status.replace('_', ' ')} appointment cannot be changed to ${next.replace('_', ' ')}`
    );
  }

  appointment.status = next; // isActive is synced on save: cancelling frees the slot
  if (next === 'cancelled') {
    appointment.cancelledAt = new Date();
    appointment.cancelledBy = 'dashboard';
    appointment.cancelReason = String(req.body.reason || '').trim().slice(0, 300) || undefined;
  }
  await appointment.save();

  const saved = await load(appointment._id);

  // a cancelled booking: tell the patient by email when we have an address and email is set up
  let patientNotified = false;
  if (next === 'cancelled') {
    const doctorName = saved.doctor?.name || '';
    const [mail] = await Promise.all([
      appointment.patient.email ? mailer.sendCancellationToPatient(appointment, doctorName) : { sent: false },
      notifications.notifyAppointmentEvent({
        type: 'booking_cancelled',
        appointment,
        doctorId: appointment.doctor,
        doctorName,
        actorId: String(req.user._id),
        cancelledBy: 'staff',
      }),
    ]);
    patientNotified = mail.sent === true;
  }
  res.json({ appointment: present(saved), patientNotified });
});

// Link an appointment to a registered patient afterwards (e.g. the person registered on arrival).
// PATCH /api/appointments/:id/patient   body: { patientId }  (null/empty to unlink)
export const linkPatient = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Appointment not found');
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) throw new HttpError(404, 'Appointment not found');
  if (!canAccess(req, appointment)) throw new HttpError(403, 'You can only change your own appointments');

  const { patientId } = req.body || {};
  if (patientId) {
    if (!mongoose.isValidObjectId(patientId)) throw new HttpError(400, 'Choose a registered patient');
    if (!(await Patient.exists({ _id: patientId }))) throw new HttpError(404, 'Patient not found');
    appointment.patientRef = patientId;
    appointment.patient.isNewPatient = false;
  } else {
    appointment.patientRef = undefined;
  }
  await appointment.save();
  res.json({ appointment: present(await load(appointment._id)) });
});

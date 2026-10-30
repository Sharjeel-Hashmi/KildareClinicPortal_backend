// Booking logic that talks to the database. getAvailableSlots() is the single source of truth for
// "which times can be booked": the dashboard preview, the manual booking form and (later) the public
// website API all go through it, and createAppointment() re-checks it before saving.
import mongoose from "mongoose";
import { DateTime } from "luxon";

import config from "../config/booking.js";
import Appointment from "../models/Appointment.js";
import DoctorAvailability from "../models/DoctorAvailability.js";
import Service from "../models/Service.js";
import { computeSlots, isValidDateStr, dublinDateOf, dublinTimeLabel } from "../utils/slotMath.js";
import { BookingError, SlotTakenError } from "../utils/bookingErrors.js";

const ZONE = config.TIMEZONE;
const HOUR = 60 * 60 * 1000;

const formatSlot = (s) => ({
  start: new Date(s.startMs).toISOString(), // UTC
  end: new Date(s.endMs).toISOString(),
  label: dublinTimeLabel(s.startMs), // Irish local time as people read it, e.g. "9:30 am"
  endLabel: dublinTimeLabel(s.endMs),
});

// Loads the doctor's schedule and (optionally) the service they want to book.
async function loadContext(doctorId, serviceId) {
  if (!mongoose.isValidObjectId(doctorId)) throw new BookingError(400, "Invalid doctor");
  const availability = await DoctorAvailability.findOne({ doctor: doctorId }).lean();

  let service = null;
  let durationMinutes = availability?.slotLengthMinutes || 15; // no service chosen: one slot (dashboard preview)
  if (serviceId) {
    if (!mongoose.isValidObjectId(serviceId)) throw new BookingError(400, "Invalid service");
    service = await Service.findById(serviceId).lean();
    if (!service || !service.isBookable || !service.durationMinutes) {
      throw new BookingError(404, "That service is not available for booking");
    }
    if (!(service.doctors || []).some((d) => String(d) === String(doctorId))) {
      throw new BookingError(400, "This doctor does not offer that service");
    }
    durationMinutes = service.durationMinutes;
  }
  return { availability, service, durationMinutes };
}

// Active (non-cancelled) appointments touching [fromMs, toMs)
async function loadBusy(doctorId, fromMs, toMs) {
  // NOTE: unpaid "pending_payment" holds count as busy for now; expiry of old holds comes with online payment.
  const rows = await Appointment.find({
    doctor: doctorId,
    isActive: true,
    startTime: { $lt: new Date(toMs) },
    endTime: { $gt: new Date(fromMs) },
  })
    .select("startTime endTime")
    .lean();
  return rows.map((r) => ({ start: r.startTime, end: r.endTime }));
}

const dayWindow = (dateStr) => {
  const day = DateTime.fromISO(dateStr, { zone: ZONE });
  return { fromMs: day.startOf("day").toMillis() - HOUR, toMs: day.endOf("day").toMillis() + HOUR };
};

/**
 * Free slots for one doctor on one Irish date.
 * @param {{doctorId: string, date: string, serviceId?: string}} input
 * @param {{nowMs?: number, minNoticeHours?: number}} [opts]
 */
async function getAvailableSlots({ doctorId, date, serviceId }, opts = {}) {
  if (!isValidDateStr(date)) throw new BookingError(400, "Date must be in YYYY-MM-DD format");
  const { availability, durationMinutes } = await loadContext(doctorId, serviceId);

  const base = {
    date,
    timezone: ZONE,
    durationMinutes,
    slotLengthMinutes: availability?.slotLengthMinutes || null,
  };
  if (!availability) return { ...base, slots: [] };

  const { fromMs, toMs } = dayWindow(date);
  const busy = await loadBusy(doctorId, fromMs, toMs);
  const slots = computeSlots({
    availability,
    dateStr: date,
    durationMinutes,
    busy,
    nowMs: opts.nowMs ?? Date.now(),
    minNoticeHours: opts.minNoticeHours ?? config.minNoticeHours,
    maxAdvanceDays: config.maxAdvanceDays,
  });
  return { ...base, slots: slots.map(formatSlot) };
}

/**
 * Dates in [from, to] (max 60 days) that still have at least one free slot - for calendar highlighting.
 */
async function getAvailableDates({ doctorId, from, to, serviceId }, opts = {}) {
  if (!isValidDateStr(from) || !isValidDateStr(to)) throw new BookingError(400, "Dates must be in YYYY-MM-DD format");
  const start = DateTime.fromISO(from, { zone: ZONE });
  const end = DateTime.fromISO(to, { zone: ZONE });
  const days = Math.round(end.diff(start, "days").days);
  if (days < 0) throw new BookingError(400, "The end date must not be before the start date");
  if (days > config.MAX_RANGE_DAYS) throw new BookingError(400, `Choose a range of ${config.MAX_RANGE_DAYS} days or less`);

  const { availability, durationMinutes } = await loadContext(doctorId, serviceId);
  if (!availability) return { from, to, timezone: ZONE, dates: [] };

  const busy = await loadBusy(doctorId, dayWindow(from).fromMs, dayWindow(to).toMs);
  const nowMs = opts.nowMs ?? Date.now();
  const dates = [];
  for (let i = 0; i <= days; i += 1) {
    const dateStr = start.plus({ days: i }).toISODate();
    const slots = computeSlots({
      availability,
      dateStr,
      durationMinutes,
      busy,
      nowMs,
      minNoticeHours: opts.minNoticeHours ?? config.minNoticeHours,
      maxAdvanceDays: config.maxAdvanceDays,
    });
    if (slots.length) dates.push({ date: dateStr, freeSlots: slots.length });
  }
  return { from, to, timezone: ZONE, dates };
}

const isDuplicateOn = (err, field) =>
  err && err.code === 11000 && (err.keyPattern ? field in err.keyPattern : String(err.message).includes(field));

/**
 * Creates a booking. The slot is re-checked here (never trust the client) and the unique index makes
 * a double booking impossible even when two requests arrive at the same moment.
 * @param {object} input doctorId, serviceId, startTime (ISO), patient{}, source, gdprConsent, createdBy, paymentMethod
 * @param {{nowMs?: number}} [opts]
 */
async function createAppointment(input, opts = {}) {
  const { doctorId, serviceId, startTime, patient, patientRef = null, source = "dashboard", gdprConsent = false, createdBy = null } = input;

  if (!serviceId) throw new BookingError(400, "Choose a service");
  const startMs = Date.parse(startTime);
  if (!Number.isFinite(startMs)) throw new BookingError(400, "Choose a valid appointment time");

  const { availability, service } = await loadContext(doctorId, serviceId);
  if (!availability) throw new SlotTakenError();

  const nowMs = opts.nowMs ?? Date.now();
  const dateStr = dublinDateOf(startMs);
  const { fromMs, toMs } = dayWindow(dateStr);
  const busy = await loadBusy(doctorId, fromMs, toMs);
  const slots = computeSlots({
    availability,
    dateStr,
    durationMinutes: service.durationMinutes,
    busy,
    nowMs,
    // staff taking a phone booking may book inside the notice window; the website may not
    minNoticeHours: source === "dashboard" ? 0 : config.minNoticeHours,
    maxAdvanceDays: config.maxAdvanceDays,
  });
  const slot = slots.find((s) => s.startMs === startMs);
  if (!slot) throw new SlotTakenError();

  const pitchMs = ((availability.slotLengthMinutes || 15) + (availability.bufferMinutes || 0)) * 60 * 1000;
  const slotKeys = Array.from({ length: slot.units }, (_, i) => new Date(startMs + i * pitchMs));

  await Appointment.init(); // make sure the unique index exists before the first insert

  const doc = {
    doctor: doctorId,
    service: service._id,
    serviceName: service.name,
    servicePrice: service.price,
    startTime: new Date(slot.startMs),
    endTime: new Date(slot.endMs),
    slotKeys,
    status: "confirmed",
    patient: {
      fullName: patient.fullName,
      phone: patient.phone,
      email: patient.email || "",
      isNewPatient: patient.isNewPatient !== false,
      reason: patient.reason || "",
    },
    patientRef: patientRef || undefined,
    source,
    paymentMethod: input.paymentMethod || "pay_at_clinic",
    gdprConsent: { given: Boolean(gdprConsent), at: gdprConsent ? new Date(nowMs) : undefined },
    createdBy: createdBy || undefined,
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await Appointment.create(doc);
    } catch (err) {
      if (isDuplicateOn(err, "slotKeys") || isDuplicateOn(err, "doctor")) throw new SlotTakenError();
      // a clash on the random reference / cancel token is practically impossible; just retry with new ones
      if (isDuplicateOn(err, "reference")) doc.reference = Appointment.newReference();
      else if (isDuplicateOn(err, "cancelToken")) doc.cancelToken = Appointment.newCancelToken();
      else throw err;
    }
  }
  throw new BookingError(500, "Could not create the booking, please try again");
}

export { getAvailableSlots, getAvailableDates, createAppointment, formatSlot, dayWindow };

// Public API for the clinic website (no login). Mounted at /api/public, before the dashboard's own CORS,
// login and suspension lock, so it has its own CORS, validation and rate limits.
//
// Doctors and services are identified by their web address ("slug"); internal database IDs are never exposed.
import express from "express";
import User from "../models/User.js";
import Service from "../models/Service.js";
import Appointment from "../models/Appointment.js";
import connectDB from "../config/db.js";
import config from "../config/booking.js";
import * as booking from "../services/bookingService.js"; // used as booking.xxx()
import * as mailer from "../services/mailer.js";
import * as notifications from "../services/notificationService.js";
import * as security from "../middleware/publicSecurity.js";
import * as schemas from "../utils/publicSchemas.js";
import { BookingError } from "../utils/bookingErrors.js";
import { canCancelOnline, cancelDeadlineMs } from "../utils/cancelPolicy.js";
import { dublinDateOf, dublinTimeOf } from "../utils/slotMath.js";

const router = express.Router();

// The website is on another address: allow it to read these answers
router.use((req, res, next) => {
  res.set("Cross-Origin-Resource-Policy", "cross-origin");
  next();
});

router.use(security.publicCors);
router.use(express.json({ limit: "20kb" }));
router.use(async (req, res, next) => {
  try {
    await connectDB();
    return next();
  } catch (err) {
    console.error("[public] database unavailable:", (err && err.name) || "unknown");
    return res.status(503).json({ message: "Online booking is temporarily unavailable. Please try again shortly.", code: "UNAVAILABLE" });
  }
});

const bookingLimit = security.bookingLimiter();
const tokenLimit = security.tokenLimiter();

// ---------- helpers ----------
const invalid = (res, errors) => res.status(400).json({ message: "Please check the details and try again.", code: "VALIDATION", errors });

// Known BookingErrors are shown to the patient; anything else is logged (without details) and hidden.
function fail(res, err) {
  if (err instanceof BookingError) return res.status(err.status).json({ message: err.message, code: err.code });
  console.error("[public] unexpected error:", (err && (err.code || err.name)) || "unknown");
  return res.status(500).json({ message: "Something went wrong. Please try again.", code: "SERVER_ERROR" });
}

const notFound = () => new BookingError(404, "We could not find that doctor or service.", "NOT_FOUND");

const bookableDoctorFilter = { acceptsOnlineBookings: true, isActive: { $ne: false }, slug: { $exists: true, $ne: null } };

async function resolve(doctorSlug, serviceSlug) {
  const [doctor, service] = await Promise.all([
    User.findOne({ ...bookableDoctorFilter, slug: doctorSlug }).select("name slug email").lean(),
    Service.findOne({ slug: serviceSlug, isBookable: true, durationMinutes: { $gt: 0 } }).select("name slug durationMinutes doctors").lean(),
  ]);
  if (!doctor || !service) throw notFound();
  if (!(service.doctors || []).some((d) => String(d) === String(doctor._id))) throw notFound();
  return { doctor, service };
}

const localParts = (date) => ({ date: dublinDateOf(new Date(date).getTime()), time: dublinTimeOf(new Date(date).getTime()) });

// What the website may see of a booking (never phone, email, reason or internal IDs)
const summary = (a, doctor, service) => ({
  status: a.status,
  doctor: { slug: doctor?.slug || "", name: doctor?.name || "" },
  service: { slug: service?.slug || "", name: a.serviceName || service?.name || "" },
  start: new Date(a.startTime).toISOString(),
  end: new Date(a.endTime).toISOString(),
  startLocal: localParts(a.startTime),
  endLocal: localParts(a.endTime),
});

async function loadByToken(rawToken) {
  const parsed = schemas.parse(schemas.tokenParam, { token: rawToken });
  const missing = new BookingError(404, "We could not find that appointment.", "NOT_FOUND");
  if (parsed.errors) throw missing;
  const appointment = await Appointment.findOne({ cancelToken: parsed.value.token }).populate("doctor", "name slug email").populate("service", "name slug");
  if (!appointment) throw missing;
  return appointment;
}

function viewOf(a, nowMs = Date.now()) {
  return {
    reference: a.reference,
    patientName: a.patient.fullName,
    ...summary(a, a.doctor, a.service),
    canCancel: canCancelOnline(a, nowMs, config.cancelWindowHours),
    cancelUntil: new Date(cancelDeadlineMs(a.startTime, config.cancelWindowHours)).toISOString(),
    cancelWindowHours: config.cancelWindowHours,
    clinicPhone: process.env.CLINIC_PHONE || null,
  };
}

// ---------- GET /services ----------
router.get("/services", security.cacheShort, async (req, res) => {
  try {
    const doctors = await User.find(bookableDoctorFilter).select("_id").lean();
    const services = await Service.find({ isBookable: true, durationMinutes: { $gt: 0 }, slug: { $exists: true }, doctors: { $in: doctors.map((d) => d._id) } })
      .sort({ name: 1 })
      .select("name slug durationMinutes description")
      .lean();
    res.json({ services: services.map((s) => ({ slug: s.slug, name: s.name, durationMinutes: s.durationMinutes, description: s.description || "" })) });
  } catch (err) {
    fail(res, err);
  }
});

// ---------- GET /doctors ----------
router.get("/doctors", security.cacheShort, async (req, res) => {
  try {
    const doctors = await User.find(bookableDoctorFilter).sort({ name: 1 }).select("name slug photoUrl qualifications specialties bio").lean();
    const services = await Service.find({ isBookable: true, durationMinutes: { $gt: 0 }, slug: { $exists: true }, doctors: { $in: doctors.map((d) => d._id) } })
      .sort({ name: 1 })
      .select("name slug durationMinutes doctors")
      .lean();
    const out = doctors
      .map((d) => ({
        slug: d.slug,
        name: d.name,
        photoUrl: d.photoUrl || null,
        qualifications: d.qualifications || "",
        specialties: d.specialties || [],
        bio: d.bio || "",
        services: services
          .filter((s) => (s.doctors || []).some((id) => String(id) === String(d._id)))
          .map((s) => ({ slug: s.slug, name: s.name, durationMinutes: s.durationMinutes })),
      }))
      .filter((d) => d.services.length > 0);
    res.json({ doctors: out });
  } catch (err) {
    fail(res, err);
  }
});

// ---------- GET /doctors/:slug/availability?from=&to=&service= ----------
router.get("/doctors/:slug/availability", security.noStore, async (req, res) => {
  try {
    const p = schemas.parse(schemas.slugParam, { slug: req.params.slug });
    const q = schemas.parse(schemas.availabilityQuery, req.query);
    if (p.errors || q.errors) return invalid(res, { ...(p.errors || {}), ...(q.errors || {}) });

    const { doctor, service } = await resolve(p.value.slug, q.value.service);
    const r = await booking.getAvailableDates({ doctorId: String(doctor._id), from: q.value.from, to: q.value.to, serviceId: String(service._id) });
    res.json({ doctor: doctor.slug, service: service.slug, timezone: r.timezone, from: r.from, to: r.to, dates: r.dates.map((d) => d.date) });
  } catch (err) {
    fail(res, err);
  }
});

// ---------- GET /doctors/:slug/slots?date=&service= ----------
router.get("/doctors/:slug/slots", security.noStore, async (req, res) => {
  try {
    const p = schemas.parse(schemas.slugParam, { slug: req.params.slug });
    const q = schemas.parse(schemas.slotsQuery, req.query);
    if (p.errors || q.errors) return invalid(res, { ...(p.errors || {}), ...(q.errors || {}) });

    const { doctor, service } = await resolve(p.value.slug, q.value.service);
    const r = await booking.getAvailableSlots({ doctorId: String(doctor._id), date: q.value.date, serviceId: String(service._id) });
    res.json({
      doctor: doctor.slug,
      service: service.slug,
      date: r.date,
      timezone: r.timezone,
      durationMinutes: r.durationMinutes,
      slots: r.slots.map((s) => ({ start: s.start, end: s.end, label: s.label })),
    });
  } catch (err) {
    fail(res, err);
  }
});

// ---------- POST /appointments ----------
router.post("/appointments", bookingLimit, security.noStore, async (req, res) => {
  try {
    const parsed = schemas.parse(schemas.bookingBody, req.body ?? {});
    if (parsed.errors) return invalid(res, parsed.errors);
    const body = parsed.value;

    if (security.turnstileEnabled() && !(await security.verifyTurnstile(body.turnstileToken, req.ip))) {
      return res.status(400).json({ message: "Please complete the security check and try again.", code: "BOT_CHECK_FAILED" });
    }

    const { doctor, service } = await resolve(body.doctor, body.service);

    const upcoming = await Appointment.countDocuments({ "patient.email": body.patient.email, isActive: true, startTime: { $gte: new Date() } });
    if (upcoming >= config.maxActivePerEmail) {
      return res.status(429).json({
        message: `This email address already has ${config.maxActivePerEmail} upcoming appointments. Please contact the clinic to book another.`,
        code: "TOO_MANY_BOOKINGS",
      });
    }

    // the slot is re-checked inside createAppointment; a taken slot becomes a 409 SLOT_TAKEN
    const appointment = await booking.createAppointment({
      doctorId: String(doctor._id),
      serviceId: String(service._id),
      startTime: body.startTime,
      patient: body.patient,
      source: "website",
      gdprConsent: true,
    });

    const [patientMail] = await Promise.all([
      mailer.sendBookingConfirmation(appointment, doctor.name),
      mailer.sendClinicBookingNotice(appointment, doctor.name, doctor.email),
      // in-dashboard notification for the doctor and the admins
      notifications.notifyAppointmentEvent({ type: "booking_created", appointment, doctorId: doctor._id, doctorName: doctor.name, source: "website" }),
    ]);

    res.status(201).json({
      reference: appointment.reference,
      cancelToken: appointment.cancelToken,
      cancelUrl: mailer.cancelUrlFor(appointment.cancelToken) || null,
      emailSent: patientMail.sent === true,
      appointment: summary(appointment, doctor, service),
    });
  } catch (err) {
    fail(res, err);
  }
});

// ---------- GET /appointments/:token  (view) ----------
router.get("/appointments/:token", tokenLimit, security.noStore, async (req, res) => {
  try {
    res.json({ appointment: viewOf(await loadByToken(req.params.token)) });
  } catch (err) {
    fail(res, err);
  }
});

// ---------- POST /appointments/:token/cancel ----------
router.post("/appointments/:token/cancel", tokenLimit, security.noStore, async (req, res) => {
  try {
    const appointment = await loadByToken(req.params.token);

    if (appointment.status === "cancelled") {
      return res.json({ appointment: viewOf(appointment), message: "This appointment was already cancelled." });
    }
    if (!canCancelOnline(appointment, Date.now(), config.cancelWindowHours)) {
      const phone = process.env.CLINIC_PHONE ? ` on ${process.env.CLINIC_PHONE}` : "";
      const finished = appointment.status !== "confirmed" && appointment.status !== "pending_payment";
      throw new BookingError(
        409,
        finished
          ? "This appointment can no longer be cancelled online."
          : `Appointments can be cancelled online up to ${config.cancelWindowHours} hours beforehand. Please phone the clinic${phone}.`,
        "CANCEL_TOO_LATE"
      );
    }

    appointment.status = "cancelled"; // frees the slot
    appointment.cancelledAt = new Date();
    appointment.cancelledBy = "patient";
    await appointment.save();

    const doctorName = appointment.doctor?.name || "";
    await Promise.all([
      mailer.sendCancellationToPatient(appointment, doctorName),
      mailer.sendCancellationToClinic(appointment, doctorName, appointment.doctor?.email),
      notifications.notifyAppointmentEvent({ type: "booking_cancelled", appointment, doctorId: appointment.doctor?._id, doctorName, cancelledBy: "patient" }),
    ]);

    res.json({ appointment: viewOf(appointment), message: "Your appointment has been cancelled." });
  } catch (err) {
    fail(res, err);
  }
});

router.use((req, res) => res.status(404).json({ message: "Not found", code: "NOT_FOUND" }));

// bad JSON / too-large body etc.
router.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err && (err.type === "entity.parse.failed" || err.type === "entity.too.large")) {
    return res.status(400).json({ message: "The request could not be read.", code: "BAD_REQUEST" });
  }
  return fail(res, err);
});

export default router;

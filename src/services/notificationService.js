// In-app notifications for appointment events. They go to the doctor the appointment is with and to
// every Admin / Super Admin, except the person who did it themselves. Notifications are a convenience:
// this never throws, so a problem here can never break a booking.
import { DateTime } from "luxon";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import { TIMEZONE } from "../config/booking.js";
import { dublinDateOf } from "../utils/slotMath.js";

// "Thu 22 Oct at 10:00 am" (Irish time)
const shortWhen = (d) => DateTime.fromJSDate(new Date(d), { zone: TIMEZONE }).setLocale("en-IE").toFormat("ccc d LLL 'at' h:mm a");

async function recipientIds(doctorId, actorId) {
  const staff = await User.find({ role: { $in: ["admin", "super_admin"] }, isActive: { $ne: false } }).select("_id").lean();
  const ids = new Set(staff.map((u) => String(u._id)));
  if (doctorId) ids.add(String(doctorId));
  if (actorId) ids.delete(String(actorId)); // whoever did it already knows
  return [...ids];
}

function describe({ type, appointment, doctorName, source, cancelledBy }) {
  const details = `${appointment.patient?.fullName || "A patient"} with ${doctorName || "the doctor"} · ${appointment.serviceName || "Appointment"} · ${shortWhen(appointment.startTime)}`;
  if (type === "booking_cancelled") {
    return { title: cancelledBy === "patient" ? "Appointment cancelled by patient" : "Appointment cancelled", body: details };
  }
  return { title: source === "website" ? "New online booking" : "New appointment", body: details };
}

/**
 * @param {object} p
 * @param {"booking_created"|"booking_cancelled"} p.type
 * @param {object} p.appointment  needs _id, startTime, serviceName, patient.fullName
 * @param {string} p.doctorId     the doctor the appointment is with
 * @param {string} p.doctorName
 * @param {string} [p.actorId]    the logged-in user who did it (not notified); leave out for the website
 * @param {"website"|"dashboard"} [p.source]
 * @param {"patient"|"staff"} [p.cancelledBy]
 */
async function notifyAppointmentEvent(p) {
  try {
    const recipients = await recipientIds(p.doctorId, p.actorId);
    if (recipients.length === 0) return { created: 0 };
    const { title, body } = describe(p);
    const date = dublinDateOf(new Date(p.appointment.startTime).getTime());
    await Notification.insertMany(
      recipients.map((recipient) => ({ recipient, type: p.type, title, body, appointment: p.appointment._id, date }))
    );
    return { created: recipients.length };
  } catch (err) {
    console.error("[notify] failed:", err.name); // no patient details in the log
    return { created: 0, failed: true };
  }
}

export { notifyAppointmentEvent, shortWhen };

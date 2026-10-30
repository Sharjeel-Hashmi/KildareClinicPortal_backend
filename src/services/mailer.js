// Small mailer. Provider is chosen with env variables; with no provider configured nothing is sent
// (the booking itself always succeeds). Patient details are never written to the logs.
//
//   MAIL_PROVIDER=resend            (anything else = stub: emails are skipped)
//   RESEND_API_KEY=...              MAIL_FROM="Kildare Clinic <bookings@your-domain.ie>"
//   CLINIC_NOTIFY_EMAIL=...         where "new booking" notices go (the doctor is copied too)
//   CLINIC_NAME / CLINIC_PHONE / CLINIC_ADDRESS   shown in the emails
//   PUBLIC_SITE_URL + PUBLIC_CANCEL_PATH          build the patient's cancel link
//
// TODO (when the clinic has a sending domain): verify it with the provider and set the variables above.
import { DateTime } from "luxon";
import { TIMEZONE, cancelWindowHours } from "../config/booking.js";

const settings = () => ({
  provider: String(process.env.MAIL_PROVIDER || "none").toLowerCase(),
  apiKey: process.env.RESEND_API_KEY || "",
  from: process.env.MAIL_FROM || "",
  clinicEmail: process.env.CLINIC_NOTIFY_EMAIL || "",
  clinicName: process.env.CLINIC_NAME || "Kildare Clinic",
  clinicPhone: process.env.CLINIC_PHONE || "",
  clinicAddress: process.env.CLINIC_ADDRESS || "",
  siteUrl: String(process.env.PUBLIC_SITE_URL || "").trim().replace(/\/$/, ""),
  cancelPath: `/${String(process.env.PUBLIC_CANCEL_PATH || "/appointment").replace(/^\/+|\/+$/g, "")}`,
});

const escapeHtml = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// e.g. "Wednesday 21 October 2026 at 9:30 am" (Irish time)
const formatWhen = (startTime) =>
  DateTime.fromJSDate(new Date(startTime), { zone: TIMEZONE }).setLocale("en-IE").toFormat("cccc d LLLL yyyy 'at' h:mm a");

// Link the patient uses to view / cancel; empty when the website address is not configured yet
const cancelUrlFor = (token) => {
  const { siteUrl, cancelPath } = settings();
  return siteUrl && token ? `${siteUrl}${cancelPath}/${token}` : "";
};

const firstName = (full) => String(full || "").trim().split(/\s+/)[0] || "there";

function wrapHtml(clinicName, bodyHtml) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1f2937;max-width:560px">${bodyHtml}<p style="color:#6b7280;font-size:13px;margin-top:28px">${escapeHtml(clinicName)}</p></div>`;
}

const detailsText = (rows) => rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
const detailsHtml = (rows) =>
  `<table style="border-collapse:collapse;margin:14px 0">${rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:3px 16px 3px 0;color:#6b7280">${escapeHtml(k)}</td><td style="padding:3px 0;font-weight:600">${escapeHtml(v)}</td></tr>`)
    .join("")}</table>`;

// ---- message builders (pure: easy to test) ----
function buildPatientConfirmation(appt, doctorName) {
  const c = settings();
  const when = formatWhen(appt.startTime);
  const link = cancelUrlFor(appt.cancelToken);
  const rows = [
    ["Doctor", doctorName],
    ["Service", appt.serviceName],
    ["When", when],
    ["Reference", appt.reference],
    ["Where", c.clinicAddress],
  ];
  const change = link
    ? `If you need to cancel, you can do so up to ${cancelWindowHours} hours before your appointment using this link:\n${link}`
    : `If you need to cancel or change your appointment, please contact the clinic${c.clinicPhone ? ` on ${c.clinicPhone}` : ""}.`;
  const phone = link && c.clinicPhone ? `\nWithin ${cancelWindowHours} hours of the appointment, please phone us on ${c.clinicPhone}.` : "";
  const name = firstName(appt.patient.fullName);

  return {
    subject: `Your appointment at ${c.clinicName} is confirmed`,
    text: `Hello ${name},\n\nYour appointment is confirmed.\n\n${detailsText(rows)}\n\n${change}${phone}\n\n${c.clinicName}`,
    html: wrapHtml(
      c.clinicName,
      `<p>Hello ${escapeHtml(name)},</p><p>Your appointment is confirmed.</p>${detailsHtml(rows)}` +
        (link
          ? `<p>If you need to cancel, you can do so up to ${cancelWindowHours} hours before your appointment:</p><p><a href="${escapeHtml(link)}" style="color:#1a56db">Cancel or view my appointment</a></p>${
              c.clinicPhone ? `<p>Within ${cancelWindowHours} hours of the appointment, please phone us on ${escapeHtml(c.clinicPhone)}.</p>` : ""
            }`
          : `<p>If you need to cancel or change your appointment, please contact the clinic${c.clinicPhone ? ` on ${escapeHtml(c.clinicPhone)}` : ""}.</p>`)
    ),
  };
}

function buildClinicNotification(appt, doctorName) {
  const c = settings();
  const when = formatWhen(appt.startTime);
  const rows = [
    ["Patient", appt.patient.fullName],
    ["Phone", appt.patient.phone],
    ["Email", appt.patient.email],
    ["Patient type", appt.patient.isNewPatient ? "New patient" : "Existing patient"],
    ["Doctor", doctorName],
    ["Service", appt.serviceName],
    ["When", when],
    ["Reason", appt.patient.reason],
    ["Reference", appt.reference],
  ];
  return {
    subject: `New online booking: ${when} - ${doctorName}`,
    text: `A new appointment was booked on the website.\n\n${detailsText(rows)}`,
    html: wrapHtml(c.clinicName, `<p>A new appointment was booked on the website.</p>${detailsHtml(rows)}`),
  };
}

function buildPatientCancellation(appt, doctorName) {
  const c = settings();
  const when = formatWhen(appt.startTime);
  const name = firstName(appt.patient.fullName);
  const contact = c.clinicPhone ? ` Please phone us on ${c.clinicPhone} to arrange a new time.` : " Please contact us to arrange a new time.";
  return {
    subject: `Your appointment at ${c.clinicName} has been cancelled`,
    text: `Hello ${name},\n\nYour appointment with ${doctorName} on ${when} (reference ${appt.reference}) has been cancelled.${contact}\n\n${c.clinicName}`,
    html: wrapHtml(
      c.clinicName,
      `<p>Hello ${escapeHtml(name)},</p><p>Your appointment with ${escapeHtml(doctorName)} on <strong>${escapeHtml(when)}</strong> (reference ${escapeHtml(appt.reference)}) has been cancelled.${escapeHtml(contact)}</p>`
    ),
  };
}

function buildClinicCancellation(appt, doctorName) {
  const c = settings();
  const when = formatWhen(appt.startTime);
  const rows = [
    ["Patient", appt.patient.fullName],
    ["Phone", appt.patient.phone],
    ["Doctor", doctorName],
    ["Service", appt.serviceName],
    ["Was booked for", when],
    ["Reference", appt.reference],
  ];
  return {
    subject: `Appointment cancelled by patient: ${when} - ${doctorName}`,
    text: `A patient cancelled their appointment online. The time is free again.\n\n${detailsText(rows)}`,
    html: wrapHtml(c.clinicName, `<p>A patient cancelled their appointment online. The time is free again.</p>${detailsHtml(rows)}`),
  };
}

// ---- sending ----
async function deliver(kind, to, message) {
  const c = settings();
  const recipients = [...new Set([].concat(to).map((x) => String(x || "").trim()).filter(Boolean))];
  if (recipients.length === 0) return { sent: false, reason: "no_recipient" };
  if (c.provider !== "resend" || !c.apiKey || !c.from) {
    console.log(`[mail] ${kind}: not sent (mail provider is not configured)`);
    return { sent: false, reason: "not_configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${c.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: c.from, to: recipients, subject: message.subject, text: message.text, html: message.html }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`[mail] ${kind}: provider error ${res.status}`);
      return { sent: false, reason: "provider_error" };
    }
    return { sent: true };
  } catch (err) {
    console.error(`[mail] ${kind}: failed (${err.name})`);
    return { sent: false, reason: "failed" };
  }
}

const clinicRecipients = (doctorEmail) => [settings().clinicEmail, doctorEmail];

// Each of these returns { sent, reason? } and never throws.
const sendBookingConfirmation = (appt, doctorName) => deliver("booking confirmation", appt.patient.email, buildPatientConfirmation(appt, doctorName));
const sendClinicBookingNotice = (appt, doctorName, doctorEmail) => deliver("clinic booking notice", clinicRecipients(doctorEmail), buildClinicNotification(appt, doctorName));
const sendCancellationToPatient = (appt, doctorName) => deliver("cancellation to patient", appt.patient.email, buildPatientCancellation(appt, doctorName));
const sendCancellationToClinic = (appt, doctorName, doctorEmail) => deliver("cancellation to clinic", clinicRecipients(doctorEmail), buildClinicCancellation(appt, doctorName));

export {
  sendBookingConfirmation,
  sendClinicBookingNotice,
  sendCancellationToPatient,
  sendCancellationToClinic,
  cancelUrlFor,
  formatWhen,
  escapeHtml,
  buildPatientConfirmation,
  buildClinicNotification,
  buildPatientCancellation,
  buildClinicCancellation,
};

import crypto from "crypto";
import mongoose from "mongoose";

const STATUSES = ["confirmed", "pending_payment", "cancelled", "completed", "no_show"];
const SOURCES = ["website", "dashboard"];
const PAYMENT_METHODS = ["pay_at_clinic", "online"];
const PAYMENT_STATUSES = ["unpaid", "pending", "paid", "refunded"];

// Readable reference for the patient (no 0/O/1/I so it is easy to read out over the phone)
const REF_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newReference = () =>
  `KC-${Array.from({ length: 6 }, () => REF_CHARS[crypto.randomInt(REF_CHARS.length)]).join("")}`;
// Unguessable token used in the patient's cancel link
const newCancelToken = () => crypto.randomBytes(24).toString("hex");

const appointmentSchema = new mongoose.Schema(
  {
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    service: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true },
    serviceName: { type: String, trim: true }, // snapshot, so old bookings keep their name
    servicePrice: { type: Number, min: 0 }, // snapshot (used later for online payment)

    // Stored in UTC. endTime = real length of the booking (buffer not included).
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },

    // Start of every slot this booking occupies. A unique index on (doctor, slotKeys) makes it
    // impossible for two active bookings to share any slot, even when requests arrive together.
    slotKeys: { type: [Date], required: true },

    status: { type: String, enum: STATUSES, default: "confirmed" },
    // true for every status except "cancelled" (kept in sync in the pre-validate hook below).
    // The unique index only applies to active bookings, so a cancelled slot can be booked again.
    isActive: { type: Boolean, default: true },

    patient: {
      fullName: { type: String, required: true, trim: true, maxlength: 120 },
      phone: { type: String, required: true, trim: true, maxlength: 30 },
      email: { type: String, trim: true, lowercase: true, maxlength: 200, default: "" },
      isNewPatient: { type: Boolean, default: true },
      reason: { type: String, trim: true, maxlength: 300, default: "" }, // short, optional - no medical history
    },
    // Optional link to a registered Patient, set by staff later (bookings never create patients by themselves)
    patientRef: { type: mongoose.Schema.Types.ObjectId, ref: "Patient" },

    source: { type: String, enum: SOURCES, default: "dashboard" },
    reference: { type: String, default: newReference },
    cancelToken: { type: String, default: newCancelToken },

    // Payment (online payment arrives later; for now everything is pay at the clinic)
    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: "pay_at_clinic" },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: "unpaid" },
    holdExpiresAt: { type: Date }, // only for pending_payment bookings

    gdprConsent: {
      given: { type: Boolean, default: false },
      at: { type: Date },
    },

    cancelledAt: { type: Date },
    cancelledBy: { type: String, enum: ["patient", "dashboard", "system"] },
    cancelReason: { type: String, trim: true, maxlength: 300 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // set for dashboard bookings
  },
  { timestamps: true }
);

appointmentSchema.pre("validate", function syncIsActive(next) {
  this.isActive = this.status !== "cancelled";
  next();
});

// No double booking: one active booking per doctor per slot
appointmentSchema.index({ doctor: 1, slotKeys: 1 }, { unique: true, partialFilterExpression: { isActive: true } });
appointmentSchema.index({ doctor: 1, startTime: 1 });
appointmentSchema.index({ startTime: 1 });
appointmentSchema.index({ "patient.email": 1, startTime: 1 }); // "how many upcoming bookings does this email have"
appointmentSchema.index({ reference: 1 }, { unique: true });
appointmentSchema.index({ cancelToken: 1 }, { unique: true });

const Appointment = mongoose.models.Appointment || mongoose.model("Appointment", appointmentSchema);
Appointment.STATUSES = STATUSES;
Appointment.newReference = newReference;
Appointment.newCancelToken = newCancelToken;

export default Appointment;

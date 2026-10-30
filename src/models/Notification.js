import mongoose from "mongoose";

const KEEP_DAYS = 60;

// One row per person who should see it (so each person can mark theirs as read on their own).
const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["booking_created", "booking_cancelled"], required: true },
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, default: "", maxlength: 400 }, // patient name, doctor, service, time - no phone / reason
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment" },
    date: { type: String }, // Irish date of the appointment (YYYY-MM-DD): where the Appointments page opens
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, readAt: 1 });
// old notifications delete themselves
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: KEEP_DAYS * 24 * 60 * 60 });

export default mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
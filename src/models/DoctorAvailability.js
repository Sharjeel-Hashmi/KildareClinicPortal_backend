import mongoose from "mongoose";
import { SLOT_LENGTHS, MAX_BUFFER_MINUTES } from "../config/booking.js";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// All times below are Irish local time ("09:00"), dates are Irish dates ("2026-12-24").
const rangeSchema = new mongoose.Schema(
  {
    start: { type: String, required: true, match: HHMM },
    end: { type: String, required: true, match: HHMM },
  },
  { _id: false }
);

const weekdaySchema = new mongoose.Schema(
  {
    day: { type: Number, required: true, min: 1, max: 7 }, // 1 = Monday ... 7 = Sunday
    enabled: { type: Boolean, default: false },
    ranges: { type: [rangeSchema], default: [] },
  },
  { _id: false }
);

// A specific date that overrides the weekly schedule: "off" (leave / holiday) or "custom" hours.
const exceptionSchema = new mongoose.Schema({
  date: { type: String, required: true, match: DATE },
  type: { type: String, enum: ["off", "custom"], required: true },
  ranges: { type: [rangeSchema], default: [] },
  note: { type: String, trim: true, maxlength: 200, default: "" },
});

// A one-off block inside a working day (e.g. 11:00-12:00 meeting)
const blockSchema = new mongoose.Schema({
  date: { type: String, required: true, match: DATE },
  start: { type: String, required: true, match: HHMM },
  end: { type: String, required: true, match: HHMM },
  note: { type: String, trim: true, maxlength: 200, default: "" },
});

const availabilitySchema = new mongoose.Schema(
  {
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    slotLengthMinutes: { type: Number, enum: SLOT_LENGTHS, default: 15 },
    bufferMinutes: { type: Number, min: 0, max: MAX_BUFFER_MINUTES, default: 0 },
    weekly: { type: [weekdaySchema], default: [] },
    exceptions: { type: [exceptionSchema], default: [] },
    blocks: { type: [blockSchema], default: [] },
  },
  { timestamps: true }
);

// What the editor shows for a doctor who has not saved anything yet (nothing is stored)
availabilitySchema.statics.defaults = function defaults(doctorId) {
  return {
    doctor: doctorId,
    slotLengthMinutes: 15,
    bufferMinutes: 0,
    weekly: [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, enabled: false, ranges: [] })),
    exceptions: [],
    blocks: [],
  };
};

export default mongoose.models.DoctorAvailability || mongoose.model("DoctorAvailability", availabilitySchema);
// Booking / appointment scheduler settings. Override with env variables if needed.
const num = (v, fallback, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const config = {
  // Schedules are typed and shown in Irish time; everything is stored in UTC.
  TIMEZONE: 'Europe/Dublin',
  SLOT_LENGTHS: [10, 15, 20, 30],
  MAX_BUFFER_MINUTES: 30,
  MAX_RANGE_DAYS: 60, // widest date range the availability calendar will scan in one call

  // No bookings sooner than this many hours from now (website bookings)
  minNoticeHours: num(process.env.BOOKING_MIN_NOTICE_HOURS, 2, 0, 168),
  // No bookings further ahead than this many days
  maxAdvanceDays: num(process.env.BOOKING_MAX_ADVANCE_DAYS, 60, 1, 365),
  // Patients can cancel online up to this many hours before the appointment (after that: phone the clinic)
  cancelWindowHours: num(process.env.BOOKING_CANCEL_WINDOW_HOURS, 24, 0, 168),
  // One email address may hold at most this many upcoming bookings (stops a bot filling the diary)
  maxActivePerEmail: num(process.env.BOOKING_MAX_ACTIVE_PER_EMAIL, 3, 1, 20),
  // Reserved for online payment: how long an unpaid slot stays on hold
  paymentHoldMinutes: num(process.env.BOOKING_PAYMENT_HOLD_MINUTES, 15, 5, 60),
};

export const {
  TIMEZONE,
  SLOT_LENGTHS,
  MAX_BUFFER_MINUTES,
  MAX_RANGE_DAYS,
  minNoticeHours,
  maxAdvanceDays,
  cancelWindowHours,
  maxActivePerEmail,
  paymentHoldMinutes,
} = config;

export default config;

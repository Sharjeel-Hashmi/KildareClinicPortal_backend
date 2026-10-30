// When may a patient cancel online? Until `windowHours` before the appointment starts.
const HOUR = 60 * 60 * 1000;

const cancelDeadlineMs = (startTime, windowHours) => new Date(startTime).getTime() - windowHours * HOUR;

// status must still be cancellable, and "now" must be before the deadline
const canCancelOnline = ({ status, startTime }, nowMs, windowHours) =>
  (status === "confirmed" || status === "pending_payment") && nowMs <= cancelDeadlineMs(startTime, windowHours);

export { cancelDeadlineMs, canCancelOnline };

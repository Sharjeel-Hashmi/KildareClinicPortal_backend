import { SLOT_LENGTHS, MAX_BUFFER_MINUTES } from "../config/booking.js";
import { isValidDateStr } from "./slotMath.js";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const toMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

const fail = (message) => ({ error: message });

function cleanRanges(ranges, label) {
  if (!Array.isArray(ranges)) return fail(`${label}: time ranges are missing`);
  if (ranges.length > 6) return fail(`${label}: at most 6 time ranges`);
  const value = ranges.map((r) => ({ start: String(r?.start || ""), end: String(r?.end || "") }));
  for (const r of value) {
    if (!HHMM.test(r.start) || !HHMM.test(r.end)) return fail(`${label}: use times like 09:00`);
    if (toMinutes(r.end) <= toMinutes(r.start)) return fail(`${label}: the end time must be after the start time`);
  }
  value.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  for (let i = 1; i < value.length; i += 1) {
    if (toMinutes(value[i].start) < toMinutes(value[i - 1].end)) return fail(`${label}: time ranges overlap`);
  }
  return { value };
}

// Validates the "My Availability" form payload. Returns { value } (clean, ready to save) or { error }.
// Only the parts that are present are checked and returned.
function validateAvailability(body = {}) {
  const value = {};

  if (body.slotLengthMinutes !== undefined) {
    const n = Number(body.slotLengthMinutes);
    if (!SLOT_LENGTHS.includes(n)) return fail(`Slot length must be ${SLOT_LENGTHS.join(", ")} minutes`);
    value.slotLengthMinutes = n;
  }

  if (body.bufferMinutes !== undefined) {
    const n = Number(body.bufferMinutes);
    if (!Number.isInteger(n) || n < 0 || n > MAX_BUFFER_MINUTES) {
      return fail(`Buffer must be a whole number from 0 to ${MAX_BUFFER_MINUTES} minutes`);
    }
    value.bufferMinutes = n;
  }

  if (body.weekly !== undefined) {
    if (!Array.isArray(body.weekly)) return fail("Weekly schedule is invalid");
    const byDay = {};
    for (const item of body.weekly) {
      const day = Number(item?.day);
      if (!Number.isInteger(day) || day < 1 || day > 7) return fail("Weekly schedule has an invalid day");
      if (byDay[day]) return fail(`${DAY_NAMES[day]} appears twice`);
      const enabled = item.enabled === true;
      const cleaned = cleanRanges(item.ranges || [], DAY_NAMES[day]);
      if (cleaned.error) return cleaned;
      if (enabled && cleaned.value.length === 0) {
        return fail(`${DAY_NAMES[day]}: add a time range or switch the day off`);
      }
      byDay[day] = { day, enabled, ranges: cleaned.value };
    }
    value.weekly = [1, 2, 3, 4, 5, 6, 7].map((d) => byDay[d] || { day: d, enabled: false, ranges: [] });
  }

  if (body.exceptions !== undefined) {
    if (!Array.isArray(body.exceptions) || body.exceptions.length > 400) return fail("Exceptions list is invalid");
    const seen = new Set();
    value.exceptions = [];
    for (const e of body.exceptions) {
      if (!isValidDateStr(e?.date)) return fail("An exception has an invalid date");
      if (seen.has(e.date)) return fail(`Only one exception is allowed per date (${e.date})`);
      seen.add(e.date);
      if (e.type !== "off" && e.type !== "custom") return fail(`${e.date}: choose unavailable or custom hours`);
      let ranges = [];
      if (e.type === "custom") {
        const cleaned = cleanRanges(e.ranges || [], e.date);
        if (cleaned.error) return cleaned;
        if (cleaned.value.length === 0) return fail(`${e.date}: add the custom hours`);
        ranges = cleaned.value;
      }
      value.exceptions.push({ date: e.date, type: e.type, ranges, note: String(e.note || "").trim().slice(0, 200) });
    }
  }

  if (body.blocks !== undefined) {
    if (!Array.isArray(body.blocks) || body.blocks.length > 400) return fail("Blocked times list is invalid");
    value.blocks = [];
    for (const b of body.blocks) {
      if (!isValidDateStr(b?.date)) return fail("A blocked time has an invalid date");
      const start = String(b.start || "");
      const end = String(b.end || "");
      if (!HHMM.test(start) || !HHMM.test(end)) return fail(`${b.date}: use times like 11:00`);
      if (toMinutes(end) <= toMinutes(start)) return fail(`${b.date}: the end time must be after the start time`);
      value.blocks.push({ date: b.date, start, end, note: String(b.note || "").trim().slice(0, 200) });
    }
  }

  return { value };
}

export { validateAvailability, HHMM };

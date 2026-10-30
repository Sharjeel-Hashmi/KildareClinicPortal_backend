// Pure slot maths (no database): given a doctor's schedule and what is already booked,
// work out which start times a patient could pick. Used by both the dashboard preview and
// the public API (through services/bookingService.js), so they always agree.
//
// All schedule times ("09:00") are Irish local time. Slots are computed in real elapsed time
// (milliseconds), so clock-change days (last Sunday of March / October) come out right.
import { DateTime } from "luxon";
import { TIMEZONE } from "../config/booking.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

const isValidDateStr = (s) =>
  typeof s === "string" && DATE_RE.test(s) && DateTime.fromISO(s, { zone: TIMEZONE }).isValid;

// "YYYY-MM-DD" + "HH:mm" in Irish time -> DateTime
const atLocal = (dateStr, hhmm) => DateTime.fromISO(`${dateStr}T${hhmm}`, { zone: TIMEZONE });

const dublinDateOf = (ms) => DateTime.fromMillis(ms, { zone: TIMEZONE }).toISODate();
const dublinTimeOf = (ms) => DateTime.fromMillis(ms, { zone: TIMEZONE }).toFormat("HH:mm"); // "13:00" (for data)
// "1:00 pm" - the form people read on screens and in emails
const dublinTimeLabel = (ms) => DateTime.fromMillis(ms, { zone: TIMEZONE }).setLocale("en-IE").toFormat("h:mm a");

// The working ranges for one date: a date exception wins, otherwise the weekly schedule.
function rangesForDate(availability, dateStr) {
  const exception = (availability.exceptions || []).find((e) => e.date === dateStr);
  if (exception) return exception.type === "off" ? [] : exception.ranges || [];
  const weekday = DateTime.fromISO(dateStr, { zone: TIMEZONE }).weekday; // 1 = Monday ... 7 = Sunday
  const day = (availability.weekly || []).find((d) => d.day === weekday);
  return day && day.enabled ? day.ranges || [] : [];
}

// How many slot-lengths a service needs (duration rounded UP to the doctor's slot length)
const unitsFor = (durationMinutes, slotLengthMinutes) =>
  Math.max(1, Math.ceil(durationMinutes / slotLengthMinutes));

/**
 * @param {object} p
 * @param {object} p.availability  { slotLengthMinutes, bufferMinutes, weekly[], exceptions[], blocks[] }
 * @param {string} p.dateStr       "YYYY-MM-DD" (Irish date)
 * @param {number} p.durationMinutes  service length
 * @param {{start: Date|number|string, end: Date|number|string}[]} p.busy  existing active appointments
 * @param {number} p.nowMs
 * @param {number} p.minNoticeHours
 * @param {number} p.maxAdvanceDays
 * @returns {{startMs:number,endMs:number,units:number}[]} free slots, earliest first
 */
function computeSlots({ availability, dateStr, durationMinutes, busy = [], nowMs, minNoticeHours, maxAdvanceDays }) {
  if (!availability || !isValidDateStr(dateStr)) return [];

  const today = DateTime.fromMillis(nowMs, { zone: TIMEZONE }).startOf("day");
  const day = DateTime.fromISO(dateStr, { zone: TIMEZONE });
  if (day < today) return [];
  if (day > today.plus({ days: maxAdvanceDays })) return [];

  const slotLength = availability.slotLengthMinutes || 15;
  const buffer = availability.bufferMinutes || 0;
  const units = unitsFor(durationMinutes, slotLength);

  const bufferMs = buffer * MIN;
  const pitchMs = (slotLength + buffer) * MIN; // distance between possible start times
  const spanMs = (units * slotLength + (units - 1) * buffer) * MIN; // length of the booking
  const earliestMs = nowMs + minNoticeHours * HOUR;

  const blocks = (availability.blocks || [])
    .filter((b) => b.date === dateStr)
    .map((b) => [atLocal(dateStr, b.start).toMillis(), atLocal(dateStr, b.end).toMillis()]);
  const busyWindows = busy.map((b) => [new Date(b.start).getTime(), new Date(b.end).getTime()]);

  const found = new Map();
  for (const range of rangesForDate(availability, dateStr)) {
    const rangeStart = atLocal(dateStr, range.start).toMillis();
    const rangeEnd = atLocal(dateStr, range.end).toMillis();

    for (let start = rangeStart; start + spanMs <= rangeEnd; start += pitchMs) {
      if (start < earliestMs) continue;
      const end = start + spanMs;
      if (blocks.some(([bs, be]) => start < be && end > bs)) continue;
      // keep the buffer on both sides of an existing appointment
      if (busyWindows.some(([bs, be]) => start < be + bufferMs && end + bufferMs > bs)) continue;
      found.set(start, { startMs: start, endMs: end, units });
    }
  }
  return [...found.values()].sort((a, b) => a.startMs - b.startMs);
}

export {
  DATE_RE,
  isValidDateStr,
  atLocal,
  dublinDateOf,
  dublinTimeOf,
  dublinTimeLabel,
  rangesForDate,
  unitsFor,
  computeSlots,
};

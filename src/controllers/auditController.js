import mongoose from 'mongoose';
import { DateTime } from 'luxon';
import AuditLog from '../models/AuditLog.js';
import * as audit from '../services/auditService.js';
import { TIMEZONE } from '../config/booking.js';
import { isValidDateStr } from '../utils/slotMath.js';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';

const ACTIONS = AuditLog.schema.path('action').enumValues;
const PRINT_KINDS = new Set(['registration', 'consultation', 'prescription', 'referral', 'certificate', 'invoice']);

// What the screen is printing: the patient and (optionally) the record
// POST /api/audit/print    body: { kind, patientId, recordId? }   (any signed-in user)
export const recordPrint = asyncHandler(async (req, res) => {
  const { kind, patientId, recordId } = req.body || {};
  if (!PRINT_KINDS.has(kind)) throw new HttpError(400, 'Unknown document');
  await audit.record({
    user: req.user._id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'print',
    resource: kind === 'registration' ? 'patient registration' : kind,
    resourceId: audit.isId(String(recordId || '')) ? String(recordId) : undefined,
    patient: audit.isId(String(patientId || '')) ? String(patientId) : undefined,
    status: 200,
    method: 'POST',
    path: '/api/audit/print',
    ...audit.clientInfo(req),
  });
  res.json({ ok: true });
});

// The log itself: Super Admin only.
// GET /api/audit?from=YYYY-MM-DD&to=YYYY-MM-DD&user=&patient=&action=&resource=&limit=50&before=<entry id>
export const listAudit = asyncHandler(async (req, res) => {
  const { from, to, user, patient, action, resource, before } = req.query;
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const filter = {};

  if (from || to) {
    filter.at = {};
    if (from) {
      if (!isValidDateStr(from)) throw new HttpError(400, 'Dates must be in YYYY-MM-DD format');
      filter.at.$gte = DateTime.fromISO(from, { zone: TIMEZONE }).startOf('day').toJSDate();
    }
    if (to) {
      if (!isValidDateStr(to)) throw new HttpError(400, 'Dates must be in YYYY-MM-DD format');
      filter.at.$lt = DateTime.fromISO(to, { zone: TIMEZONE }).plus({ days: 1 }).startOf('day').toJSDate();
    }
  }
  if (user) {
    if (!mongoose.isValidObjectId(user)) throw new HttpError(400, 'Invalid user');
    filter.user = user;
  }
  if (patient) {
    if (!mongoose.isValidObjectId(patient)) throw new HttpError(400, 'Invalid patient');
    filter.patient = patient;
  }
  if (action) {
    if (!ACTIONS.includes(action)) throw new HttpError(400, 'Invalid action');
    filter.action = action;
  }
  if (resource) filter.resource = String(resource).slice(0, 60);
  if (before) {
    if (!mongoose.isValidObjectId(before)) throw new HttpError(400, 'Invalid page');
    filter._id = { $lt: before };
  }

  const rows = await AuditLog.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate('patient', 'surname firstName patientNo')
    .lean();
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  res.set('Cache-Control', 'no-store');
  res.json({
    entries: page.map((e) => ({
      id: String(e._id),
      at: e.at,
      userName: e.userName || '',
      userRole: e.userRole || '',
      userId: e.user ? String(e.user) : null,
      action: e.action,
      resource: e.resource || '',
      resourceId: e.resourceId || null,
      patient: e.patient
        ? {
            id: String(e.patient._id || e.patient),
            name: `${e.patient.firstName || ''} ${e.patient.surname || ''}`.trim(),
            patientNo: e.patient.patientNo || '',
          }
        : null,
      fields: e.fields || [],
      status: e.status || null,
      ip: e.ip || '',
      userAgent: e.userAgent || '',
      note: e.note || '',
    })),
    nextCursor: hasMore ? String(page[page.length - 1]._id) : null,
  });
});

// Audit trail. A middleware (middleware/audit.js) records every signed-in request that views or changes
// records; this file decides what each request means (classify) and writes the entry (record).
// Auditing is a safety net: it never throws, so a problem here can never break the app.
import AuditLog from '../models/AuditLog.js';

const OBJECT_ID = /^[a-f\d]{24}$/i;
export const isId = (v) => typeof v === 'string' && OBJECT_ID.test(v);

// First path segment -> what the record is called in the log
const RECORD_NAMES = {
  patients: 'patient',
  consultations: 'consultation',
  prescriptions: 'prescription',
  referrals: 'referral',
  certificates: 'certificate',
  reports: 'report',
  invoices: 'invoice',
};
// Records that have their own top-level route (their response carries a `patient` field)
const TOP_LEVEL_RECORDS = new Set(['consultations', 'prescriptions', 'referrals', 'certificates', 'reports', 'invoices']);
const SETTINGS_LISTS = {
  services: 'service',
  labs: 'lab',
  medicines: 'medicine',
  'medicine-categories': 'medicine category',
};
// Never logged: polling / dashboards / the log itself. (Availability is only logged when it is changed.)
const SKIP_FIRST_SEGMENTS = new Set(['notifications', 'stats', 'audit', 'availability', 'health', 'public', 'uploads']);

const MUTATION_ACTION = { POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' };

// The field NAMES sent with a create / update, never the values
export function fieldNames(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  const names = Object.keys(body).map((k) => k.slice(0, 60)).slice(0, 40);
  return names.length ? names : undefined;
}

// "/api/patients/64b.../consultations" -> "/api/patients/:id/consultations"
const pathPattern = (segments) => `/${segments.map((s) => (isId(s) ? ':id' : s.slice(0, 40))).join('/')}`;

/**
 * Decide whether (and how) a request goes into the audit log.
 * @param {{method: string, url: string, status: number}} req
 * @returns {null | {action, resource, resourceId?, patient?, note?, patientFromBody?: boolean, idFromBody?: boolean, path}}
 */
export function classify({ method, url, status }) {
  const m = String(method || '').toUpperCase();
  if (m === 'OPTIONS' || m === 'HEAD') return null;
  const segments = String(url || '').split('?')[0].split('/').filter(Boolean); // ["api","patients","<id>",...]
  if (segments[0] !== 'api' || segments.length < 2) return null;
  const [, first, second, third, fourth] = segments;
  if (SKIP_FIRST_SEGMENTS.has(first) && !(first === 'availability' && m === 'PUT')) return null;
  const path = pathPattern(segments);

  // Someone tried something their role does not allow
  const denied = status === 403;
  if (!denied && status >= 400) return null; // failed or invalid requests are not records of access

  const base = (extra) => ({
    path,
    ...extra,
    ...(denied ? { action: 'denied', note: `${m} ${extra.resource || first}`.slice(0, 200) } : {}),
  });

  // Sign-in events (login / failed login / logout) are written by the auth controller itself
  if (first === 'auth') {
    if (m === 'PUT' && second === 'me') return base({ action: 'update', resource: 'account' });
    return null;
  }

  // Patient records
  if (first === 'patients') {
    if (m === 'GET') {
      if (!isId(second)) return null; // the patient list / search is not logged, opening a patient is
      if (!third) return base({ action: 'view', resource: 'patient', resourceId: second, patient: second });
      return base({
        action: 'view',
        resource: RECORD_NAMES[third] || third,
        resourceId: isId(fourth) ? fourth : undefined,
        patient: second,
        note: isId(fourth) ? undefined : 'list',
      });
    }
    const action = MUTATION_ACTION[m];
    if (!action) return null;
    if (!isId(second)) return base({ action, resource: 'patient', idFromBody: true, patientFromBody: true }); // new patient
    if (!third) return base({ action, resource: 'patient', resourceId: second, patient: second });
    return base({
      action,
      resource: RECORD_NAMES[third] || third,
      resourceId: isId(fourth) ? fourth : undefined,
      idFromBody: !isId(fourth) && action === 'create',
      patient: second,
    });
  }

  // Consultations / prescriptions / ... opened or changed by their own id
  if (TOP_LEVEL_RECORDS.has(first)) {
    const resource = RECORD_NAMES[first];
    if (m === 'GET') {
      if (isId(second)) return base({ action: 'view', resource, resourceId: second, patientFromBody: true });
      return first === 'invoices' ? base({ action: 'view', resource, note: 'list' }) : null; // other lists are not logged
    }
    const action = MUTATION_ACTION[m];
    return action ? base({ action, resource, resourceId: isId(second) ? second : undefined, patientFromBody: true }) : null;
  }

  // Everything else that is changed: accounts, settings lists, appointments, availability ...
  if (m === 'GET') return null;
  const action = MUTATION_ACTION[m];
  if (!action) return null;
  const resource =
    first === 'users'
      ? 'user'
      : SETTINGS_LISTS[first] || (first === 'appointments' ? 'appointment' : first === 'availability' ? 'availability' : first);
  const resourceId = [second, third].find(isId);
  return base({ action, resource, resourceId, idFromBody: !resourceId && action === 'create' });
}

// Kildare answers with { invoice: {...} } / { patient: {...} } — the record is the first object value with an _id
const mainRecord = (body) => {
  if (!body || typeof body !== 'object') return undefined;
  if (body._id) return body;
  return Object.values(body).find((v) => v && typeof v === 'object' && !Array.isArray(v) && v._id);
};

// Finds the patient id in a response body: the record's `patient` (id or populated object), or the patient itself
export function patientFromBody(body, resource) {
  const rec = mainRecord(body);
  if (!rec) return undefined;
  if (resource === 'patient') return isId(String(rec._id)) ? String(rec._id) : undefined;
  const p = rec.patient;
  if (isId(String(p || ''))) return String(p);
  if (p && typeof p === 'object' && isId(String(p._id || ''))) return String(p._id);
  return undefined;
}

export const idFromBody = (body) => {
  const rec = mainRecord(body);
  return rec && isId(String(rec._id || '')) ? String(rec._id) : undefined;
};

// Writes one entry. Never throws.
export async function record(entry) {
  try {
    const doc = { ...entry };
    if (doc.patient && !isId(String(doc.patient))) delete doc.patient;
    await AuditLog.create(doc);
    return true;
  } catch (err) {
    console.error('[audit] could not write an entry:', err.name);
    return false;
  }
}

export const clientInfo = (req) => ({
  ip: (req.ip || '').slice(0, 60),
  userAgent: String(req.get?.('user-agent') || '').slice(0, 200),
});

// Sign-in events (used by authController)
export const recordAuth = (req, { action, user, note }) =>
  record({
    action,
    user: user?._id || user?.id || undefined,
    userName: user?.name,
    userRole: user?.role || 'doctor',
    resource: 'account',
    note: note ? String(note).slice(0, 200) : undefined,
    method: req.method,
    path: req.originalUrl ? req.originalUrl.split('?')[0].slice(0, 200) : undefined,
    ...clientInfo(req),
  });

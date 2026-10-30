// Records signed-in requests that view or change records, without touching each route.
// The entry is written just BEFORE the response is sent (hosting like Vercel can freeze the function the
// moment the response goes out, which would lose a later write). Waits at most 2 seconds and never fails the request.
import * as audit from "../services/auditService.js";

const MAX_WAIT_MS = 2000;
const withTimeout = (promise) => Promise.race([promise, new Promise((resolve) => setTimeout(resolve, MAX_WAIT_MS))]);

function buildEntry(req, res, body) {
  if (!req.user || !req.user.id) return null; // not signed in: nothing to attribute
  const kind = audit.classify({ method: req.method, url: req.originalUrl, status: res.statusCode });
  if (!kind) return null;
  const isMutation = req.method === "POST" || req.method === "PUT" || req.method === "PATCH";
  const patient = kind.patient || (kind.patientFromBody ? audit.patientFromBody(body, kind.resource) : undefined);
  return {
    user: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: kind.action,
    resource: kind.resource,
    resourceId: kind.resourceId || (kind.idFromBody ? audit.idFromBody(body) : undefined),
    patient,
    fields: isMutation && kind.action !== "denied" ? audit.fieldNames(req.body) : undefined,
    status: res.statusCode,
    method: req.method,
    path: kind.path,
    note: kind.note,
    ...audit.clientInfo(req),
  };
}

export default function auditMiddleware(req, res, next) {
  if (req.method === "OPTIONS" || req.method === "HEAD") return next();
  let handled = false;
  const originalJson = res.json.bind(res);

  res.json = function auditedJson(body) {
    if (handled) return originalJson(body);
    handled = true;
    let entry = null;
    try {
      entry = buildEntry(req, res, body);
    } catch (err) {
      console.error("[audit] could not read the request:", err.name);
    }
    if (!entry) {
      originalJson(body);
      return this;
    }
    withTimeout(audit.record(entry)).finally(() => originalJson(body));
    return this;
  };

  // routes that answer without res.json (files, redirects): still record, but we cannot wait for it
  res.on("finish", () => {
    if (handled) return;
    handled = true;
    try {
      const entry = buildEntry(req, res, undefined);
      if (entry) audit.record(entry);
    } catch (err) {
      console.error("[audit] could not read the request:", err.name);
    }
  });

  next();
};
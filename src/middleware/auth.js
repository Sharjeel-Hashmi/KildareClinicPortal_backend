import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';

export const protect = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Please sign in to continue');

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new HttpError(401, 'Your session has expired. Please sign in again');
  }

  const user = await User.findById(payload.id);
  if (!user) throw new HttpError(401, 'Account no longer exists');

  if (user.isActive === false) {
    throw new HttpError(403, 'This account has been deactivated. Please contact an administrator');
  }

  req.user = user;
  next();
});

export const isSuperAdmin = (user) => user?.role === 'super_admin';
// Admin or Super Admin
export const isAdminLike = (user) => user?.role === 'admin' || user?.role === 'super_admin';

// Doctor-account management: Admin and Super Admin
export const requireAdmin = (req, _res, next) => {
  if (!isAdminLike(req.user)) throw new HttpError(403, 'Only an administrator can do this');
  next();
};

// Super Admin only: every record delete (patients, consultations, prescriptions, certificates,
// reports, invoices, accounts), invoice edits, and creating Admin accounts
export const requireSuperAdmin = (req, _res, next) => {
  if (!isSuperAdmin(req.user)) throw new HttpError(403, 'Only the Super Admin can do this');
  next();
};

// Settings (medicines, labs, services) add/edit — Admin and Super Admin, plus any doctor
// an admin has granted access to
export const requireSettingsAccess = (req, _res, next) => {
  const allowed = isAdminLike(req.user) || req.user.canManageSettings === true;
  if (!allowed) throw new HttpError(403, 'Only an administrator can do this');
  next();
};

// Removing items from the Settings lists: Admin and Super Admin only (a doctor with Settings
// access can add and edit, but not remove)
export const requireSettingsRemove = (req, _res, next) => {
  if (!isAdminLike(req.user)) throw new HttpError(403, 'Only an administrator can do this');
  next();
};
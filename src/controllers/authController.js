import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { asyncHandler, pick, HttpError } from '../utils/asyncHandler.js';
import { recordAuth } from '../services/auditService.js';

const ME_FIELDS = ['name', 'email', 'phone', 'imcNumber', 'signatureUrl'];

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });

export const login = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!email || !password) throw new HttpError(400, 'Enter your email and password');

  const user = await User.findOne({ email }).select('+password');
  const ok = user ? await user.comparePassword(password) : false;
  if (!ok) {
    // never store what was typed; only that a sign-in failed (and for which account, if it exists)
    await recordAuth(req, { action: 'login_failed', user, note: user ? undefined : 'Unknown email address' });
    throw new HttpError(401, 'Incorrect email or password');
  }
  if (user.isActive === false) {
    await recordAuth(req, { action: 'login_failed', user, note: 'Deactivated account' });
    throw new HttpError(403, 'This account has been deactivated. Please contact an administrator');
  }

  await recordAuth(req, { action: 'login', user });
  res.json({ token: signToken(user._id), user: user.toSafeJSON() });
});

// The browser forgets the token itself; this only leaves a record that the person signed out.
export const logout = asyncHandler(async (req, res) => {
  // body.reason === 'inactivity' when the portal signed the person out after 15 minutes without activity
  const auto = req.body?.reason === 'inactivity';
  await recordAuth(req, { action: 'logout', user: req.user, note: auto ? 'Auto sign-out (inactivity)' : undefined });
  res.json({ ok: true });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user.toSafeJSON() });
});

// A signed-in user (admin or doctor) editing their own profile: name, email, phone,
// IMC number, and optionally a new password. Role can only be changed by an admin
// via the /api/users endpoints, never by the account holder here.
export const updateMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) throw new HttpError(404, 'Account not found');

  const body = pick(req.body, ME_FIELDS);

  if (user.role === 'doctor' && body.imcNumber !== undefined && !String(body.imcNumber).trim()) {
    throw new HttpError(400, 'IMC number is required for a doctor account');
  }

  if (body.email) {
    const email = String(body.email).trim().toLowerCase();
    const clash = await User.findOne({ email, _id: { $ne: user._id } });
    if (clash) throw new HttpError(409, 'An account with this email already exists');
    body.email = email;
  }

  user.set(body);

  if (req.body.password) {
    if (String(req.body.password).length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
    user.password = req.body.password;
  }

  await user.save();
  res.json({ user: user.toSafeJSON() });
});
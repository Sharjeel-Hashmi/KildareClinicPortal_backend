import User from '../models/User.js';
import Consultation from '../models/Consultation.js';
import { asyncHandler, pick, HttpError } from '../utils/asyncHandler.js';
import { uniqueSlug, SLUG_RE } from '../utils/slug.js';

const BOOKING_FIELDS = ['slug', 'photoUrl', 'qualifications', 'specialties', 'bio', 'acceptsOnlineBookings'];
const USER_FIELDS = ['name', 'email', 'phone', 'imcNumber', 'role', 'canManageSettings', ...BOOKING_FIELDS];
const UPDATE_FIELDS = [...USER_FIELDS, 'isActive'];

// A Super Admin account can never be created through the API (it is made by `npm run seed`)
const normaliseRole = (role) => (role === 'admin' ? 'admin' : 'doctor');

const isSuper = (user) => user.role === 'super_admin';

// Online-booking profile: tidy the values and make sure the web address (slug) is valid and unique
async function cleanBookingFields(body, user) {
  if (body.specialties !== undefined) {
    const list = Array.isArray(body.specialties) ? body.specialties : String(body.specialties).split(',');
    body.specialties = list.map((s) => String(s).trim()).filter(Boolean).slice(0, 12);
  }
  if (body.acceptsOnlineBookings !== undefined) body.acceptsOnlineBookings = body.acceptsOnlineBookings === true;
  if (body.slug !== undefined) {
    body.slug = String(body.slug || '').trim().toLowerCase();
    if (body.slug && !SLUG_RE.test(body.slug)) {
      throw new HttpError(400, 'The web address can only use lowercase letters, numbers and hyphens');
    }
  }
  const accepts = body.acceptsOnlineBookings ?? user?.acceptsOnlineBookings;
  const nextSlug = body.slug !== undefined ? body.slug : user?.slug;
  if (accepts && !nextSlug) {
    body.slug = await uniqueSlug(User, body.name || user?.name, user?._id);
  } else if (body.slug) {
    const clash = await User.exists({ slug: body.slug, _id: { $ne: user?._id } });
    if (clash) throw new HttpError(409, 'Another doctor already uses this web address');
  }
  return body;
}

// Active doctors — everyone signed in can read this (the booking form needs it)
export const listDoctors = asyncHandler(async (_req, res) => {
  const doctors = await User.find({ role: 'doctor', isActive: { $ne: false } }).sort({ name: 1 }).select('name imcNumber');
  res.json({ doctors: doctors.map((d) => ({ id: d._id, name: d.name, imcNumber: d.imcNumber || '' })) });
});

export const listUsers = asyncHandler(async (req, res) => {
  const [users, consultations] = await Promise.all([
    // Admin manages doctors only; Super Admin sees every account
    User.find(isSuper(req.user) ? {} : { role: 'doctor' }).sort({ createdAt: -1 }),
    Consultation.find().select('createdBy').lean(),
  ]);
  const countByDoctor = new Map();
  for (const c of consultations) {
    if (!c.createdBy) continue;
    const key = String(c.createdBy);
    countByDoctor.set(key, (countByDoctor.get(key) || 0) + 1);
  }
  res.json({
    users: users.map((u) => ({ ...u.toSafeJSON(), consultationCount: countByDoctor.get(String(u._id)) || 0 })),
  });
});

export const createUser = asyncHandler(async (req, res) => {
  const body = pick(req.body, USER_FIELDS);
  if (body.role === 'super_admin') throw new HttpError(403, 'A Super Admin account cannot be created here');
  const role = normaliseRole(body.role);

  // Only the Super Admin can create Admin accounts; an Admin can only create doctors
  if (role === 'admin' && !isSuper(req.user)) {
    throw new HttpError(403, 'Only the Super Admin can create Admin accounts');
  }

  if (role === 'doctor' && !String(body.imcNumber || '').trim()) {
    throw new HttpError(400, 'IMC number is required for a doctor account');
  }

  const password = String(req.body.password || '');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');

  const email = String(body.email || '').trim().toLowerCase();
  if (!email) throw new HttpError(400, 'Enter an email address');
  if (await User.findOne({ email })) throw new HttpError(409, 'An account with this email already exists');

  await cleanBookingFields(body, null);
  const user = await User.create({ ...body, email, role, password });
  res.status(201).json({ user: user.toSafeJSON() });
});

export const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'Account not found');

  // Super Admin accounts are edited only by their owner, from "My profile"
  if (isSuper(user)) throw new HttpError(403, 'Edit your own details from My profile');
  // An Admin can only manage doctor accounts
  if (!isSuper(req.user) && user.role !== 'doctor') {
    throw new HttpError(403, 'Only the Super Admin can change Admin accounts');
  }

  const body = pick(req.body, UPDATE_FIELDS);
  if (body.role === 'super_admin') throw new HttpError(403, 'A Super Admin account cannot be created here');
  if (body.role !== undefined) {
    body.role = normaliseRole(body.role);
    if (body.role !== user.role && !isSuper(req.user)) {
      throw new HttpError(403, 'Only the Super Admin can change an account\'s role');
    }
  }
  if (body.isActive !== undefined) {
    body.isActive = Boolean(body.isActive);
    if (!body.isActive && String(user._id) === String(req.user._id)) {
      throw new HttpError(400, 'You cannot deactivate your own account');
    }
  }

  const nextRole = body.role || user.role;
  const nextImc = body.imcNumber !== undefined ? body.imcNumber : user.imcNumber;
  if (nextRole === 'doctor' && !String(nextImc || '').trim()) {
    throw new HttpError(400, 'IMC number is required for a doctor account');
  }
  if (body.email) {
    const email = String(body.email).trim().toLowerCase();
    const clash = await User.findOne({ email, _id: { $ne: user._id } });
    if (clash) throw new HttpError(409, 'An account with this email already exists');
    body.email = email;
  }

  await cleanBookingFields(body, user);
  user.set(body);

  if (req.body.password) {
    if (String(req.body.password).length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
    user.password = req.body.password;
  }

  await user.save();
  res.json({ user: user.toSafeJSON() });
});

// Super Admin only (see userRoutes.js)
export const deleteUser = asyncHandler(async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) {
    throw new HttpError(400, 'You cannot delete your own account while signed in to it');
  }

  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'Account not found');

  if (isSuper(user)) throw new HttpError(400, 'A Super Admin account cannot be deleted');

  await user.deleteOne();
  res.json({ message: 'Account deleted' });
});
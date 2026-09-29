import User from '../models/User.js';
import Consultation from '../models/Consultation.js';
import { asyncHandler, pick, HttpError } from '../utils/asyncHandler.js';

const USER_FIELDS = ['name', 'email', 'phone', 'imcNumber', 'role', 'canManageSettings'];
const UPDATE_FIELDS = [...USER_FIELDS, 'isActive'];

// A Super Admin account can never be created through the API (it is made by `npm run seed`)
const normaliseRole = (role) => (role === 'admin' ? 'admin' : 'doctor');

const isSuper = (user) => user.role === 'super_admin';

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
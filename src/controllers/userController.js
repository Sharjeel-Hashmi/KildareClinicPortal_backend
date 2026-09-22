import User from '../models/User.js';
import Consultation from '../models/Consultation.js';
import { asyncHandler, pick, HttpError } from '../utils/asyncHandler.js';

const USER_FIELDS = ['name', 'email', 'phone', 'imcNumber', 'role'];

const normaliseRole = (role) => (role === 'admin' ? 'admin' : 'doctor');

export const listUsers = asyncHandler(async (_req, res) => {
  const [users, consultations] = await Promise.all([
    User.find().sort({ createdAt: -1 }),
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
  const role = normaliseRole(body.role);

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

  const body = pick(req.body, USER_FIELDS);
  if (body.role !== undefined) body.role = normaliseRole(body.role);

  const nextRole = body.role || user.role;
  const nextImc = body.imcNumber !== undefined ? body.imcNumber : user.imcNumber;
  if (nextRole === 'doctor' && !String(nextImc || '').trim()) {
    throw new HttpError(400, 'IMC number is required for a doctor account');
  }
  if (nextRole !== 'admin' && String(user._id) === String(req.user._id) && user.role === 'admin') {
    throw new HttpError(400, 'You cannot remove your own administrator access');
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

export const deleteUser = asyncHandler(async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) {
    throw new HttpError(400, 'You cannot delete your own account while signed in to it');
  }

  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'Account not found');

  if (user.role === 'admin') {
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount <= 1) throw new HttpError(400, 'At least one administrator account must remain');
  }

  await user.deleteOne();
  res.json({ message: 'Account deleted' });
});
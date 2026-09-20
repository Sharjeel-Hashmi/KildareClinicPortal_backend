import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';

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
  if (!ok) throw new HttpError(401, 'Incorrect email or password');

  res.json({ token: signToken(user._id), user: user.toSafeJSON() });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user.toSafeJSON() });
});

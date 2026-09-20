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

  req.user = user;
  next();
});

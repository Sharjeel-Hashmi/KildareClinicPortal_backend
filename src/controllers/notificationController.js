import mongoose from 'mongoose';
import Notification from '../models/Notification.js';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';

const present = (n) => ({
  id: String(n._id),
  type: n.type,
  title: n.title,
  body: n.body,
  date: n.date || null,
  appointmentId: n.appointment ? String(n.appointment) : null,
  read: Boolean(n.readAt),
  createdAt: n.createdAt,
});

// Your own notifications, newest first, plus how many are unread. The dashboard asks for this every ~30 seconds.
// GET /api/notifications?limit=20
export const listNotifications = asyncHandler(async (req, res) => {
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const mine = { recipient: req.user._id };
  const [items, unreadCount] = await Promise.all([
    Notification.find(mine).sort({ createdAt: -1 }).limit(limit).lean(),
    Notification.countDocuments({ ...mine, readAt: null }),
  ]);
  res.set('Cache-Control', 'no-store');
  res.json({ notifications: items.map(present), unreadCount });
});

// Mark some (ids) or all of your notifications as read.
// POST /api/notifications/read   body: { all: true } or { ids: ["..."] }
export const markRead = asyncHandler(async (req, res) => {
  const { all, ids } = req.body || {};
  const filter = { recipient: req.user._id, readAt: null };
  if (all !== true) {
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100 || ids.some((id) => !mongoose.isValidObjectId(id))) {
      throw new HttpError(400, 'Choose which notifications to mark as read');
    }
    filter._id = { $in: ids };
  }
  const result = await Notification.updateMany(filter, { $set: { readAt: new Date() } });
  res.json({ updated: result.modifiedCount ?? 0 });
});

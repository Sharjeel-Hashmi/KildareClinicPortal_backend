import ClinicSettings from '../models/ClinicSettings.js';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';

const present = (s) => ({ stampUrl: s?.stampUrl || '', updatedAt: s?.updatedAt || null });

// Every signed-in user reads these (printing needs the stamp). Only a Super Admin changes them.
export const getClinicSettings = asyncHandler(async (_req, res) => {
  const settings = await ClinicSettings.findOne({ key: 'clinic' }).lean();
  res.set('Cache-Control', 'no-store');
  res.json({ settings: present(settings) });
});

export const updateClinicSettings = asyncHandler(async (req, res) => {
  const update = { updatedBy: req.user._id };

  if (req.body?.stampUrl !== undefined) {
    const url = String(req.body.stampUrl || '').trim();
    if (url && (!/^https:\/\//i.test(url) || url.length > 500)) throw new HttpError(400, 'The stamp must be an uploaded image');
    update.stampUrl = url; // '' = go back to the standard stamp
  }

  const settings = await ClinicSettings.findOneAndUpdate(
    { key: 'clinic' },
    { $set: update, $setOnInsert: { key: 'clinic' } },
    { new: true, upsert: true, runValidators: true }
  ).lean();
  res.json({ settings: present(settings) });
});
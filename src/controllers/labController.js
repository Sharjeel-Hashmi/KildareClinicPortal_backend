import Lab, { LAB_FIELDS } from '../models/Lab.js';
import { asyncHandler, pick, HttpError, escapeRegex } from '../utils/asyncHandler.js';

// Clinic-wide shared list — every signed-in user can read it (Reports Lab Name dropdown);
// only Settings-access users can write to it.
export const listLabs = asyncHandler(async (_req, res) => {
  const labs = await Lab.find().sort({ name: 1 }).lean();
  res.json({ labs });
});

export const createLab = asyncHandler(async (req, res) => {
  const body = pick(req.body, LAB_FIELDS);
  const name = String(body.name || '').trim();
  if (!name) throw new HttpError(400, 'Enter the lab name');

  if (await Lab.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') })) {
    throw new HttpError(409, 'This lab already exists');
  }

  const lab = await Lab.create({ name });
  res.status(201).json({ lab });
});

export const deleteLab = asyncHandler(async (req, res) => {
  const lab = await Lab.findById(req.params.id);
  if (!lab) throw new HttpError(404, 'Lab not found');
  await lab.deleteOne();
  res.json({ message: 'Lab removed' });
});
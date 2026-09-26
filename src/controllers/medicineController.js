import Medicine, { MEDICINE_FIELDS } from '../models/Medicine.js';
import { asyncHandler, pick, HttpError, escapeRegex } from '../utils/asyncHandler.js';

// Clinic-wide shared list — every signed-in user (doctor or admin) can read it,
// so it can populate dropdowns; only Settings-access users can write to it.
export const listMedicines = asyncHandler(async (_req, res) => {
  const medicines = await Medicine.find().sort({ name: 1 }).lean();
  res.json({ medicines });
});

const cleanDosages = (dosages) =>
  Array.isArray(dosages)
    ? [...new Set(dosages.map((d) => String(d).trim()).filter(Boolean))]
    : [];

export const createMedicine = asyncHandler(async (req, res) => {
  const body = pick(req.body, MEDICINE_FIELDS);
  const name = String(body.name || '').trim();
  if (!name) throw new HttpError(400, 'Enter the medicine name');

  if (await Medicine.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') })) {
    throw new HttpError(409, 'This medicine already exists');
  }

  const medicine = await Medicine.create({ name, dosages: cleanDosages(body.dosages) });
  res.status(201).json({ medicine });
});

export const updateMedicine = asyncHandler(async (req, res) => {
  const medicine = await Medicine.findById(req.params.id);
  if (!medicine) throw new HttpError(404, 'Medicine not found');

  const body = pick(req.body, MEDICINE_FIELDS);
  if (body.name !== undefined) medicine.name = String(body.name).trim();
  if (body.dosages !== undefined) medicine.dosages = cleanDosages(body.dosages);

  await medicine.save();
  res.json({ medicine });
});

export const deleteMedicine = asyncHandler(async (req, res) => {
  const medicine = await Medicine.findById(req.params.id);
  if (!medicine) throw new HttpError(404, 'Medicine not found');
  await medicine.deleteOne();
  res.json({ message: 'Medicine removed' });
});
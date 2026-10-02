import MedicineCategory, { CATEGORY_FIELDS, UNCATEGORISED_NAME } from '../models/MedicineCategory.js';
import Medicine from '../models/Medicine.js';
import { asyncHandler, pick, HttpError, escapeRegex } from '../utils/asyncHandler.js';

const cleanName = (value) => String(value || '').trim().replace(/\s+/g, ' ');

const assertNameAllowed = async (name, ignoreId) => {
  if (!name) throw new HttpError(400, 'Enter the category name');
  if (name.toLowerCase() === UNCATEGORISED_NAME.toLowerCase()) {
    throw new HttpError(409, `"${UNCATEGORISED_NAME}" is a built-in category`);
  }
  const clash = await MedicineCategory.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
  if (clash && String(clash._id) !== String(ignoreId)) {
    throw new HttpError(409, 'This category already exists');
  }
};

// Clinic-wide list — every signed-in user can read it (it feeds the prescription dropdowns).
// Returns only the stored categories; the built-in "Uncategorised" is added by the UI.
export const listCategories = asyncHandler(async (_req, res) => {
  const categories = await MedicineCategory.find().sort({ name: 1 }).lean();
  res.json({ categories });
});

export const createCategory = asyncHandler(async (req, res) => {
  const name = cleanName(pick(req.body, CATEGORY_FIELDS).name);
  await assertNameAllowed(name);
  const category = await MedicineCategory.create({ name });
  res.status(201).json({ category });
});

export const updateCategory = asyncHandler(async (req, res) => {
  const category = await MedicineCategory.findById(req.params.id);
  if (!category) throw new HttpError(404, 'Category not found');

  const name = cleanName(pick(req.body, CATEGORY_FIELDS).name);
  await assertNameAllowed(name, category._id);
  category.name = name;
  await category.save();
  res.json({ category });
});

// Deleting a category never deletes medicines — they fall back to "Uncategorised".
export const deleteCategory = asyncHandler(async (req, res) => {
  const category = await MedicineCategory.findById(req.params.id);
  if (!category) throw new HttpError(404, 'Category not found');

  const moved = await Medicine.updateMany({ category: category._id }, { $set: { category: null } });
  await category.deleteOne();
  res.json({ message: 'Category removed', moved: moved.modifiedCount ?? 0 });
});
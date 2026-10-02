import mongoose from 'mongoose';

const { Schema } = mongoose;

// Admin-managed medicine categories (Antibiotic, Painkiller, Thyroid, …).
// "Uncategorised" is a built-in fallback: it is NOT stored here. Any medicine with no
// category belongs to it, so it always exists and can never be deleted.
const medicineCategorySchema = new Schema(
  {
    name: { type: String, required: [true, 'Category name is required'], trim: true, maxlength: 60 },
  },
  { timestamps: true }
);

medicineCategorySchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export const CATEGORY_FIELDS = ['name'];
export const UNCATEGORISED_NAME = 'Uncategorised';

export default mongoose.models.MedicineCategory || mongoose.model('MedicineCategory', medicineCategorySchema);
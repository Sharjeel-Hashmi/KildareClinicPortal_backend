import mongoose from 'mongoose';

const { Schema } = mongoose;

const medicineSchema = new Schema(
  {
    name: { type: String, required: [true, 'Medicine name is required'], trim: true, maxlength: 150 },
    // e.g. ['25mcg', '50mcg', '75mcg'] — free text so any unit (mg, mcg, ml, tablets…) fits
    dosages: {
      type: [{ type: String, trim: true, maxlength: 40 }],
      default: [],
    },
    // null / missing = the built-in "Uncategorised" category (so existing medicines need no migration)
    category: { type: Schema.Types.ObjectId, ref: 'MedicineCategory', default: null },
  },
  { timestamps: true }
);

medicineSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export const MEDICINE_FIELDS = ['name', 'dosages', 'category'];

export default mongoose.models.Medicine || mongoose.model('Medicine', medicineSchema);
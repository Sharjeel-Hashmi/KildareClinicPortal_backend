import mongoose from 'mongoose';

const { Schema } = mongoose;

// A type of clinic expense (Rent, Electricity, Medical supplies ...) with the amount it usually costs.
const expenseCategorySchema = new Schema(
  {
    name: { type: String, required: [true, 'Category name is required'], trim: true, maxlength: 80 },
    defaultAmount: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true }
);

expenseCategorySchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export default mongoose.models.ExpenseCategory || mongoose.model('ExpenseCategory', expenseCategorySchema);
import mongoose from 'mongoose';

const { Schema } = mongoose;

const expenseSchema = new Schema(
  {
    category: { type: Schema.Types.ObjectId, ref: 'ExpenseCategory' },
    // Name at the time of saving, so the expense still reads correctly if the category is renamed or removed
    categoryName: { type: String, required: true, trim: true, maxlength: 80 },
    name: { type: String, required: [true, 'Expense name is required'], trim: true, maxlength: 150 },
    detail: { type: String, trim: true, maxlength: 500, default: '' },
    amount: { type: Number, required: [true, 'Amount is required'], min: 0.01, max: 10000000 },
    date: { type: Date, required: [true, 'Date is required'], index: true },
    receiptUrl: { type: String, trim: true, maxlength: 500, default: '' },
    receiptName: { type: String, trim: true, maxlength: 200, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export const EXPENSE_FIELDS = ['category', 'name', 'detail', 'amount', 'date', 'receiptUrl', 'receiptName'];

export default mongoose.models.Expense || mongoose.model('Expense', expenseSchema);
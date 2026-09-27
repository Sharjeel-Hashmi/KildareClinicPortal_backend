import mongoose from 'mongoose';

const { Schema } = mongoose;

const PAYMENT_METHODS = ['cash', 'card', 'online'];

const lineItemSchema = new Schema(
  {
    description: {
      type: String,
      required: [true, 'Line item description is required'],
      trim: true,
      maxlength: 200,
    },
    amount: { type: Number, required: [true, 'Line item amount is required'], min: 0 },
  },
  { _id: false }
);

const invoiceSchema = new Schema(
  {
    patient: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    // Optional link to the visit this invoice was raised for (not required — an invoice
    // can be created for a walk-in payment, e.g. a certificate only, with no consultation yet).
    consultation: { type: Schema.Types.ObjectId, ref: 'Consultation' },

    receiptNumber: { type: String, unique: true, index: true },
    date: { type: Date, required: [true, 'Date is required'], default: Date.now },

    lineItems: {
      type: [lineItemSchema],
      validate: { validator: (v) => Array.isArray(v) && v.length > 0, message: 'Add at least one line item' },
    },
    subtotal: { type: Number, required: true, min: 0 },

    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: [true, 'Select the payment method'] },
    // Only populated when paymentMethod === 'card'
    cardLast4: { type: String, trim: true, maxlength: 4 },
    cardAuthCode: { type: String, trim: true, maxlength: 40 },

    // Snapshot of who took the payment at the time (see Prescription.js doctorName for the same pattern)
    takenBy: { type: String, trim: true, maxlength: 150 },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

invoiceSchema.index({ date: -1 });

// Fields the client is allowed to set directly (receiptNumber/subtotal/takenBy are server-controlled)
export const INVOICE_FIELDS = [
  'consultation', 'date', 'lineItems', 'paymentMethod',
  'cardLast4', 'cardAuthCode',
];

export default mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);
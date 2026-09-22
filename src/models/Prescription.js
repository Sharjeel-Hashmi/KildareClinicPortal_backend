import mongoose from 'mongoose';

const { Schema } = mongoose;

const prescriptionSchema = new Schema(
  {
    patient: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },

    date: { type: Date, required: [true, 'Date is required'], default: Date.now },
    medication: {
      type: String,
      required: [true, 'Medication is required'],
      trim: true,
      maxlength: 4000,
    },

    // Snapshot of the issuing doctor at the time of writing — kept even if their
    // profile changes later, so a printed/saved prescription never silently changes.
    doctorName: { type: String, required: true, trim: true, maxlength: 150 },
    doctorImc: { type: String, required: true, trim: true, maxlength: 30 },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

prescriptionSchema.index({ date: -1 });

// Fields the client is allowed to set directly (doctor identity is server-controlled)
export const PRESCRIPTION_FIELDS = ['date', 'medication'];

export default mongoose.models.Prescription || mongoose.model('Prescription', prescriptionSchema);

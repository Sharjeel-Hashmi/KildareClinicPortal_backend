import mongoose from 'mongoose';

const { Schema } = mongoose;

export const REFERRAL_TYPES = ['specialist', 'ed_hospital', 'other'];

const referralSchema = new Schema(
  {
    patient: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },

    date: { type: Date, required: [true, 'Date is required'], default: Date.now },
    referralType: {
      type: String,
      enum: { values: REFERRAL_TYPES, message: 'Select who the patient is being referred to' },
      required: [true, 'Select who the patient is being referred to'],
    },
    // Name of the specialist / hospital / department being written to
    referredTo: { type: String, trim: true, maxlength: 200 },
    letter: {
      type: String,
      required: [true, 'Write the referral letter'],
      trim: true,
      maxlength: 6000,
    },

    // Snapshot of the issuing doctor at the time of writing (see Prescription.js)
    doctorName: { type: String, required: true, trim: true, maxlength: 150 },
    doctorImc: { type: String, required: true, trim: true, maxlength: 30 },
    doctorSignatureUrl: { type: String, trim: true, default: '' },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

referralSchema.index({ date: -1 });

// Fields the client is allowed to set directly (doctor identity is server-controlled)
export const REFERRAL_FIELDS = ['date', 'referralType', 'referredTo', 'letter'];

export default mongoose.models.Referral || mongoose.model('Referral', referralSchema);
import mongoose from 'mongoose';

const { Schema } = mongoose;

const certificateSchema = new Schema(
  {
    patient: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },

    dateOfConsultation: { type: Date, required: [true, 'Date of consultation is required'], default: Date.now },
    diagnosis: { type: String, trim: true, maxlength: 2000 },
    certification: {
      type: String,
      enum: {
        values: ['unfit', 'fit'],
        message: 'Select whether the patient is fit or unfit for work',
      },
      required: [true, 'Select whether the patient is fit or unfit for work'],
    },
    periodFrom: { type: Date },
    periodTo: { type: Date },

    // Snapshot of the issuing doctor at the time of writing (see Prescription.js)
    doctorName: { type: String, required: true, trim: true, maxlength: 150 },
    doctorImc: { type: String, required: true, trim: true, maxlength: 30 },
    // Snapshot of the doctor's signature image at the time of writing (see Prescription.js)
    doctorSignatureUrl: { type: String, trim: true, default: '' },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

certificateSchema.index({ dateOfConsultation: -1 });

// Fields the client is allowed to set directly (doctor identity is server-controlled)
export const CERTIFICATE_FIELDS = ['dateOfConsultation', 'diagnosis', 'certification', 'periodFrom', 'periodTo'];

export default mongoose.models.MedicalCertificate || mongoose.model('MedicalCertificate', certificateSchema);
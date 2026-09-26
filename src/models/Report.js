import mongoose from 'mongoose';

const { Schema } = mongoose;

const reportSchema = new Schema(
  {
    patient: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },

    lab: { type: Schema.Types.ObjectId, ref: 'Lab' },
    // Snapshot of the lab name at the time of upload (see Prescription.js doctorName for the
    // same pattern) — kept even if the lab is later renamed/removed from Settings.
    labName: { type: String, required: [true, 'Lab name is required'], trim: true, maxlength: 150 },

    date: { type: Date, required: [true, 'Report date is required'], default: Date.now },
    notes: { type: String, trim: true, maxlength: 2000 },

    // Vercel Blob file (PDF or image)
    fileUrl: { type: String, required: [true, 'A report file is required'], trim: true },
    fileName: { type: String, trim: true, maxlength: 255 },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

reportSchema.index({ date: -1 });

// Fields the client is allowed to set directly (lab is resolved server-side from labId)
export const REPORT_FIELDS = ['date', 'notes', 'fileUrl', 'fileName'];

export default mongoose.models.Report || mongoose.model('Report', reportSchema);
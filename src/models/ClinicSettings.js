import mongoose from 'mongoose';

const { Schema } = mongoose;

// One document for the whole clinic (key = 'clinic'): settings every doctor's documents share.
const clinicSettingsSchema = new Schema(
  {
    key: { type: String, default: 'clinic', unique: true, immutable: true },
    // Stamp printed beside the doctor's signature. Empty = the standard Kildare stamp built into the portal.
    stampUrl: { type: String, trim: true, maxlength: 500, default: '' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.models.ClinicSettings || mongoose.model('ClinicSettings', clinicSettingsSchema);
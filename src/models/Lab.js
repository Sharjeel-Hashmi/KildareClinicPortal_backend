import mongoose from 'mongoose';

const { Schema } = mongoose;

const labSchema = new Schema(
  {
    name: { type: String, required: [true, 'Lab name is required'], trim: true, maxlength: 150 },
  },
  { timestamps: true }
);

labSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export const LAB_FIELDS = ['name'];

export default mongoose.models.Lab || mongoose.model('Lab', labSchema);
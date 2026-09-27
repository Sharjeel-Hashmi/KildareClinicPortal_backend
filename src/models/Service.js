import mongoose from 'mongoose';

const { Schema } = mongoose;

const serviceSchema = new Schema(
  {
    name: { type: String, required: [true, 'Service name is required'], trim: true, maxlength: 150 },
    price: { type: Number, required: [true, 'Price is required'], min: 0 },
  },
  { timestamps: true }
);

serviceSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export const SERVICE_FIELDS = ['name', 'price'];

export default mongoose.models.Service || mongoose.model('Service', serviceSchema);
import mongoose from 'mongoose';

const { Schema } = mongoose;

const serviceSchema = new Schema(
  {
    name: { type: String, required: [true, 'Service name is required'], trim: true, maxlength: 150 },
    price: { type: Number, required: [true, 'Price is required'], min: 0 },

    // ---- Online / dashboard booking (all optional: a service without a duration is invoice-only) ----
    // Length of the appointment in minutes. 0 / empty = cannot be booked.
    durationMinutes: { type: Number, min: 0, max: 240, default: 0 },
    // Shown on the clinic website booking page and in the dashboard booking form
    isBookable: { type: Boolean, default: false },
    // Web address piece used by the public website API; set automatically from the name
    slug: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 100,
      set: (v) => (v && String(v).trim() ? v : undefined),
    },
    description: { type: String, trim: true, maxlength: 300, default: '' },
    // Doctors who offer this service for booking
    doctors: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

serviceSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
serviceSchema.index({ slug: 1 }, { unique: true, sparse: true });

export const SERVICE_FIELDS = ['name', 'price', 'durationMinutes', 'isBookable', 'description', 'doctors'];

export default mongoose.models.Service || mongoose.model('Service', serviceSchema);

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, minlength: 8, select: false },
    // super_admin: full control, the only role that can create Admins or delete anything.
    // admin: can create/manage doctor accounts, cannot delete records or edit invoices.
    role: { type: String, enum: ['super_admin', 'admin', 'doctor'], default: 'doctor' },
    phone: { type: String, trim: true, maxlength: 30 },
    // Irish Medical Council registration number. Required for doctor accounts
    // (enforced in userController, not here, so an admin account can leave it blank).
    // A blank value is stored as "no value" (undefined), never '' — the unique sparse index below
    // would otherwise treat every blank '' as the same IMC number and reject the second account.
    imcNumber: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 30,
      set: (v) => (v && String(v).trim() ? v : undefined),
    },
    // Vercel Blob URL of the doctor's uploaded signature image, used on printed
    // prescriptions & medical certificates. Optional — falls back to typed name.
    signatureUrl: { type: String, trim: true, default: '' },
    // Lets a Super Admin grant an individual doctor account access to Settings
    // (manage medicines & labs) without making them a full administrator.
    // Ignored for admin / super_admin, who always have Settings access.
    canManageSettings: { type: Boolean, default: false },
    // Deactivated accounts cannot sign in (Admin / Super Admin toggle). Missing = active.
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Sparse: only enforced when an IMC number is actually set, so multiple blank admins are fine.
userSchema.index({ imcNumber: 1 }, { unique: true, sparse: true });

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    phone: this.phone || '',
    imcNumber: this.imcNumber || '',
    signatureUrl: this.signatureUrl || '',
    canManageSettings: this.role !== 'doctor' ? true : Boolean(this.canManageSettings),
    isActive: this.isActive !== false,
  };
};

export default mongoose.models.User || mongoose.model('User', userSchema);
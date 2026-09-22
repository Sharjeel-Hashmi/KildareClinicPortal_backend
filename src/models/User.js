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
    role: { type: String, enum: ['admin', 'doctor'], default: 'admin' },
    phone: { type: String, trim: true, maxlength: 30 },
    // Irish Medical Council registration number. Required for doctor accounts
    // (enforced in userController, not here, so an admin account can leave it blank).
    imcNumber: { type: String, trim: true, uppercase: true, maxlength: 30 },
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
  };
};

export default mongoose.models.User || mongoose.model('User', userSchema);

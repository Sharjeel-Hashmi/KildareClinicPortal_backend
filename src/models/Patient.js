import mongoose from 'mongoose';

const { Schema } = mongoose;

// Optional-field validator: empty values always pass
const optional = (test, message) => ({
  validator: (v) => !v || test(v),
  message,
});

const patientSchema = new Schema(
  {
    // Section 1 – Patient details
    patientNo: { type: String, unique: true, index: true },
    registrationDate: { type: Date, default: Date.now },
    surname: {
      type: String,
      required: [true, 'Surname is required'],
      trim: true,
      maxlength: 80,
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: 80,
    },
    dob: {
      type: Date,
      required: [true, 'Date of birth is required'],
      validate: {
        validator: (v) => v <= new Date(),
        message: 'Date of birth cannot be in the future',
      },
    },
    sex: { type: String, enum: ['', 'female', 'male', 'other'], default: '' },
    ppsn: { type: String, trim: true, uppercase: true, maxlength: 20 },
    addressLine1: { type: String, trim: true, maxlength: 200 },
    addressLine2: { type: String, trim: true, maxlength: 200 },
    eircode: { type: String, trim: true, uppercase: true, maxlength: 20 },
    phone: {
      type: String,
      required: [true, 'A mobile / telephone number is required'],
      trim: true,
      maxlength: 30,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      validate: optional((v) => /^\S+@\S+\.\S+$/.test(v), 'Enter a valid email address'),
    },

    // Section 2 – GP & medical information
    usualGp: { type: String, trim: true, maxlength: 200 },
    medicalConditions: { type: String, trim: true, maxlength: 4000 },
    medications: { type: String, trim: true, maxlength: 4000 },
    allergyStatus: { type: String, enum: ['', 'none', 'yes'], default: '' },
    allergyDetails: { type: String, trim: true, maxlength: 1000 },

    // Section 3 – Emergency contact
    emergencyContact: {
      name: { type: String, trim: true, maxlength: 120 },
      relationship: { type: String, trim: true, maxlength: 60 },
      phone: { type: String, trim: true, maxlength: 30 },
    },

    // Section 4 – Registration / administrative
    reasonForRegistration: { type: String, trim: true, maxlength: 1000 },
    infoProvided: { type: Boolean, default: false },
    preferredContact: { type: String, enum: ['', 'phone', 'email', 'other'], default: '' },
    preferredContactOther: { type: String, trim: true, maxlength: 100 },
    notes: { type: String, trim: true, maxlength: 4000 },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

patientSchema.index({ surname: 1, firstName: 1 });
patientSchema.index({ createdAt: -1 });

// Fields the client is allowed to set (patientNo & audit fields are server-controlled)
export const PATIENT_FIELDS = [
  'registrationDate', 'surname', 'firstName', 'dob', 'sex', 'ppsn',
  'addressLine1', 'addressLine2', 'eircode', 'phone', 'email',
  'usualGp', 'medicalConditions', 'medications', 'allergyStatus', 'allergyDetails',
  'emergencyContact',
  'reasonForRegistration', 'infoProvided', 'preferredContact', 'preferredContactOther', 'notes',
];

export default mongoose.models.Patient || mongoose.model('Patient', patientSchema);
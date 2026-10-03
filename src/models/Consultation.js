import mongoose from 'mongoose';

const { Schema } = mongoose;

const INVESTIGATIONS = ['none', 'bloods', 'imaging', 'other'];
const REFERRALS = ['none', 'specialist', 'ed_hospital', 'other'];

const consultationSchema = new Schema(
  {
    patient: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },

    // Section 1 – Consultation details (patient no./name/DOB come from the patient record)
    consultationDate: { type: Date, required: [true, 'Consultation date & time is required'], default: Date.now },
    clinician: { type: String, required: [true, 'GP / clinician is required'], trim: true, maxlength: 150 },
    consultationType: { type: String, enum: ['new', 'follow_up', 'other'], default: 'new' },
    consultationTypeOther: { type: String, trim: true, maxlength: 100 },

    // Section 2 – Presenting complaint
    mainComplaint: {
      type: String,
      required: [true, 'Main complaint is required'],
      trim: true,
      maxlength: 4000,
    },
    historyOfPresentingComplaint: { type: String, trim: true, maxlength: 8000 },

    // Section 3 – Relevant history
    pastMedicalHistory: { type: String, trim: true, maxlength: 4000 },
    surgicalHistory: { type: String, trim: true, maxlength: 4000 },
    currentMedications: { type: String, trim: true, maxlength: 4000 },
    allergyStatus: { type: String, enum: ['', 'none', 'yes'], default: '' },
    allergyDetails: { type: String, trim: true, maxlength: 1000 },
    familySocialHistory: { type: String, trim: true, maxlength: 4000 },

    // Section 4 – Examination & observations
    vitals: {
      bp: { type: String, trim: true, maxlength: 20 },
      pulse: { type: String, trim: true, maxlength: 20 },
      temp: { type: String, trim: true, maxlength: 20 },
      spo2: { type: String, trim: true, maxlength: 20 },
      weight: { type: String, trim: true, maxlength: 20 },
      other: { type: String, trim: true, maxlength: 200 },
    },
    examinationFindings: { type: String, trim: true, maxlength: 8000 },

    // Section 5 – Assessment & plan
    diagnosis: { type: String, trim: true, maxlength: 4000 },
    managementPlan: { type: String, trim: true, maxlength: 8000 },
    investigations: [{ type: String, enum: INVESTIGATIONS }],
    investigationsOther: { type: String, trim: true, maxlength: 200 },
    referral: [{ type: String, enum: REFERRALS }],
    referralOther: { type: String, trim: true, maxlength: 200 },
    // Referral letter (only used when the referral is not "none"). Doctor identity is a server-set
    // snapshot, like Prescription.js, so a saved letter never silently changes.
    referralDetails: { type: String, trim: true, maxlength: 6000 },
    referralDoctor: {
      name: { type: String, trim: true, maxlength: 150 },
      imc: { type: String, trim: true, maxlength: 30 },
      signatureUrl: { type: String, trim: true, default: '' },
    },
    followUp: { type: String, trim: true, maxlength: 1000 },

    // Section 6 – Prescription
    prescription: {
      medication: { type: String, trim: true, maxlength: 4000 },
      dose: { type: String, trim: true, maxlength: 1000 },
      prescriberSignature: { type: String, trim: true, maxlength: 150 },
    },

    // Section 7 – Additional notes & sign-off
    notes: { type: String, trim: true, maxlength: 8000 },
    clinicianSignature: { type: String, trim: true, maxlength: 150 },
    signatureDate: { type: Date },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

consultationSchema.index({ consultationDate: -1 });

export const CONSULTATION_FIELDS = [
  'consultationDate', 'clinician', 'consultationType', 'consultationTypeOther',
  'mainComplaint', 'historyOfPresentingComplaint',
  'pastMedicalHistory', 'surgicalHistory', 'currentMedications',
  'allergyStatus', 'allergyDetails', 'familySocialHistory',
  'vitals', 'examinationFindings',
  'diagnosis', 'managementPlan', 'investigations', 'investigationsOther',
  'referral', 'referralOther', 'referralDetails', 'followUp',
  'prescription', 'notes', 'clinicianSignature', 'signatureDate',
];

export default mongoose.models.Consultation || mongoose.model('Consultation', consultationSchema);
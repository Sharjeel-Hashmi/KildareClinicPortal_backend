import Patient, { PATIENT_FIELDS } from '../models/Patient.js';
import Consultation from '../models/Consultation.js';
import Prescription from '../models/Prescription.js';
import MedicalCertificate from '../models/MedicalCertificate.js';
import Report from '../models/Report.js';
import Invoice from '../models/Invoice.js';
import Referral from '../models/Referral.js';
import { asyncHandler, pick, escapeRegex, HttpError } from '../utils/asyncHandler.js';
import { generatePatientNo } from '../utils/generatePatientNo.js';

const buildSearch = (q) => {
  const term = String(q || '').trim();
  if (!term) return {};
  const rx = new RegExp(escapeRegex(term), 'i');
  const parts = term.split(/\s+/).map((p) => new RegExp(escapeRegex(p), 'i'));
  return {
    $or: [
      { patientNo: rx },
      { phone: rx },
      { email: rx },
      { eircode: rx },
      // every word must match either name field, so "john mur" finds John Murphy
      {
        $and: parts.map((p) => ({ $or: [{ surname: p }, { firstName: p }] })),
      },
    ],
  };
};

export const listPatients = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
  const filter = buildSearch(req.query.search);

  const [total, patients] = await Promise.all([
    Patient.countDocuments(filter),
    Patient.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  // Visit count + last visit for the patients on this page
  const visits = await Consultation.find({ patient: { $in: patients.map((p) => p._id) } })
    .select('patient consultationDate')
    .lean();
  const byPatient = new Map();
  visits.forEach((v) => {
    const key = String(v.patient);
    const entry = byPatient.get(key) || { consultationCount: 0, lastVisit: null };
    entry.consultationCount += 1;
    if (!entry.lastVisit || v.consultationDate > entry.lastVisit) entry.lastVisit = v.consultationDate;
    byPatient.set(key, entry);
  });

  res.json({
    patients: patients.map((p) => ({
      ...p,
      consultationCount: byPatient.get(String(p._id))?.consultationCount || 0,
      lastVisit: byPatient.get(String(p._id))?.lastVisit || null,
    })),
    total,
    page,
    pages: Math.max(Math.ceil(total / limit), 1),
  });
});

export const createPatient = asyncHandler(async (req, res) => {
  const patient = new Patient({
    ...pick(req.body, PATIENT_FIELDS),
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  // Validate first so a rejected form never burns a patient number (no gaps in KC-xxxxx)
  await patient.validate();

  // Same name + same date of birth is almost certainly a double registration.
  // The UI asks the doctor to confirm; resending with confirmDuplicate: true overrides.
  if (!req.body.confirmDuplicate) {
    const exact = (v) => new RegExp(`^${escapeRegex(v)}$`, 'i');
    const duplicate = await Patient.findOne({
      surname: exact(patient.surname),
      firstName: exact(patient.firstName),
      dob: patient.dob,
    }).select('patientNo');
    if (duplicate) {
      return res.status(409).json({
        code: 'DUPLICATE',
        message: `A patient with the same name and date of birth is already registered (${duplicate.patientNo}).`,
        patientId: duplicate._id,
        patientNo: duplicate.patientNo,
      });
    }
  }

  patient.patientNo = await generatePatientNo();
  await patient.save();

  res.status(201).json({ patient });
});

export const getPatient = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.id);
  if (!patient) throw new HttpError(404, 'Patient not found');
  res.json({ patient });
});

export const updatePatient = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.id);
  if (!patient) throw new HttpError(404, 'Patient not found');

  patient.set(pick(req.body, PATIENT_FIELDS));
  patient.updatedBy = req.user._id;
  await patient.save();
  res.json({ patient });
});

// Super Admin only (see patientRoutes.js). Removes the patient AND everything filed under them,
// so no orphaned invoices / prescriptions (which show as blank pages) are left behind.
export const deletePatient = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.id);
  if (!patient) throw new HttpError(404, 'Patient not found');

  const filter = { patient: patient._id };
  const [consultations, prescriptions, certificates, reports, referrals, invoices] = await Promise.all([
    Consultation.deleteMany(filter),
    Prescription.deleteMany(filter),
    MedicalCertificate.deleteMany(filter),
    Report.deleteMany(filter),
    Referral.deleteMany(filter),
    Invoice.deleteMany(filter),
  ]);
  await patient.deleteOne();

  res.json({
    message: 'Patient and all their records were deleted',
    deleted: {
      consultations: consultations.deletedCount,
      prescriptions: prescriptions.deletedCount,
      certificates: certificates.deletedCount,
      reports: reports.deletedCount,
      referrals: referrals.deletedCount,
      invoices: invoices.deletedCount,
    },
  });
});
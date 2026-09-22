import Consultation, { CONSULTATION_FIELDS } from '../models/Consultation.js';
import Patient from '../models/Patient.js';
import { asyncHandler, pick, escapeRegex, HttpError } from '../utils/asyncHandler.js';

const PATIENT_SUMMARY = 'patientNo surname firstName dob sex';

// Emptying the signature date input arrives as "" – store it as "not set"
const clean = (data) => {
  if (data.signatureDate === '') data.signatureDate = null;
  return data;
};

// A patient's own record always shows every doctor's consultations (continuity of care) —
// this one is never filtered by who is signed in.
export const listForPatient = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.patientId).select('_id');
  if (!patient) throw new HttpError(404, 'Patient not found');

  const consultations = await Consultation.find({ patient: patient._id })
    .sort({ consultationDate: -1 })
    .lean();
  res.json({ consultations });
});

export const createForPatient = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.patientId).select('_id');
  if (!patient) throw new HttpError(404, 'Patient not found');

  const consultation = new Consultation({
    ...clean(pick(req.body, CONSULTATION_FIELDS)),
    patient: patient._id,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  await consultation.save();
  res.status(201).json({ consultation });
});

export const listAll = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
  const term = String(req.query.search || '').trim();

  let filter = {};
  if (term) {
    const rx = new RegExp(escapeRegex(term), 'i');
    const matchingPatients = await Patient.find({
      $or: [{ surname: rx }, { firstName: rx }, { patientNo: rx }],
    }).select('_id');
    filter = {
      $or: [
        { patient: { $in: matchingPatients.map((p) => p._id) } },
        { mainComplaint: rx },
        { diagnosis: rx },
        { clinician: rx },
      ],
    };
  }

  // This list/dashboard view (as opposed to a single patient's record, which always shows
  // full history) is scoped per doctor: a doctor only sees consultations they created.
  // Admins are never scoped by default, but may look at one doctor's activity via ?doctorId=.
  if (req.user.role === 'doctor') {
    filter = { ...filter, createdBy: req.user._id };
  } else if (req.query.doctorId) {
    filter = { ...filter, createdBy: req.query.doctorId };
  }

  const [total, consultations] = await Promise.all([
    Consultation.countDocuments(filter),
    Consultation.find(filter)
      .sort({ consultationDate: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('patient', PATIENT_SUMMARY)
      .lean(),
  ]);

  res.json({ consultations, total, page, pages: Math.max(Math.ceil(total / limit), 1) });
});

export const getConsultation = asyncHandler(async (req, res) => {
  const consultation = await Consultation.findById(req.params.id).populate('patient');
  if (!consultation) throw new HttpError(404, 'Consultation not found');
  res.json({ consultation });
});

export const updateConsultation = asyncHandler(async (req, res) => {
  const consultation = await Consultation.findById(req.params.id);
  if (!consultation) throw new HttpError(404, 'Consultation not found');

  consultation.set(clean(pick(req.body, CONSULTATION_FIELDS)));
  consultation.updatedBy = req.user._id;
  await consultation.save();
  res.json({ consultation });
});

export const deleteConsultation = asyncHandler(async (req, res) => {
  const consultation = await Consultation.findById(req.params.id);
  if (!consultation) throw new HttpError(404, 'Consultation not found');
  await consultation.deleteOne();
  res.json({ message: 'Consultation deleted' });
});
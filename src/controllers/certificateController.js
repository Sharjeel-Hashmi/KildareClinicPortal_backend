import MedicalCertificate, { CERTIFICATE_FIELDS } from '../models/MedicalCertificate.js';
import Patient from '../models/Patient.js';
import { asyncHandler, pick, HttpError } from '../utils/asyncHandler.js';

// Emptying a date input arrives as "" – store it as "not set"
const clean = (data) => {
  if (data.periodFrom === '') data.periodFrom = null;
  if (data.periodTo === '') data.periodTo = null;
  return data;
};

// Every doctor can see a patient's full certificate history (continuity of care) —
// this list is never filtered by who is signed in.
export const listForPatient = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.patientId).select('_id');
  if (!patient) throw new HttpError(404, 'Patient not found');

  const certificates = await MedicalCertificate.find({ patient: patient._id })
    .sort({ dateOfConsultation: -1 })
    .lean();
  res.json({ certificates });
});

export const createForPatient = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.patientId).select('_id');
  if (!patient) throw new HttpError(404, 'Patient not found');

  if (!req.user.imcNumber) {
    throw new HttpError(400, 'Add your IMC number to your profile before issuing a medical certificate');
  }

  const certificate = new MedicalCertificate({
    ...clean(pick(req.body, CERTIFICATE_FIELDS)),
    patient: patient._id,
    doctorName: req.user.name,
    doctorImc: req.user.imcNumber,
    createdBy: req.user._id,
  });
  await certificate.save();
  res.status(201).json({ certificate });
});

export const getCertificate = asyncHandler(async (req, res) => {
  const certificate = await MedicalCertificate.findById(req.params.id).populate('patient');
  if (!certificate) throw new HttpError(404, 'Medical certificate not found');
  res.json({ certificate });
});

export const deleteCertificate = asyncHandler(async (req, res) => {
  const certificate = await MedicalCertificate.findById(req.params.id);
  if (!certificate) throw new HttpError(404, 'Medical certificate not found');
  await certificate.deleteOne();
  res.json({ message: 'Medical certificate deleted' });
});

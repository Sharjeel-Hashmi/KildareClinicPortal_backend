import Prescription, { PRESCRIPTION_FIELDS } from '../models/Prescription.js';
import Patient from '../models/Patient.js';
import { asyncHandler, pick, HttpError } from '../utils/asyncHandler.js';

// Every doctor can see a patient's full prescription history (continuity of care) —
// this list is never filtered by who is signed in.
export const listForPatient = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.patientId).select('_id');
  if (!patient) throw new HttpError(404, 'Patient not found');

  const prescriptions = await Prescription.find({ patient: patient._id }).sort({ date: -1 }).lean();
  res.json({ prescriptions });
});

export const createForPatient = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.patientId).select('_id');
  if (!patient) throw new HttpError(404, 'Patient not found');

  if (!req.user.imcNumber) {
    throw new HttpError(400, 'Add your IMC number to your profile before issuing a prescription');
  }

  const prescription = new Prescription({
    ...pick(req.body, PRESCRIPTION_FIELDS),
    patient: patient._id,
    doctorName: req.user.name,
    doctorImc: req.user.imcNumber,
    doctorSignatureUrl: req.user.signatureUrl || '',
    createdBy: req.user._id,
  });
  await prescription.save();
  res.status(201).json({ prescription });
});

export const getPrescription = asyncHandler(async (req, res) => {
  const prescription = await Prescription.findById(req.params.id).populate('patient');
  if (!prescription) throw new HttpError(404, 'Prescription not found');
  res.json({ prescription });
});

export const deletePrescription = asyncHandler(async (req, res) => {
  const prescription = await Prescription.findById(req.params.id);
  if (!prescription) throw new HttpError(404, 'Prescription not found');
  await prescription.deleteOne();
  res.json({ message: 'Prescription deleted' });
});
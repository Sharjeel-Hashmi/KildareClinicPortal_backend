import Referral, { REFERRAL_FIELDS } from '../models/Referral.js';
import Patient from '../models/Patient.js';
import { asyncHandler, pick, HttpError } from '../utils/asyncHandler.js';

// Every doctor can see a patient's full referral history (continuity of care) —
// this list is never filtered by who is signed in.
export const listForPatient = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.patientId).select('_id');
  if (!patient) throw new HttpError(404, 'Patient not found');

  const referrals = await Referral.find({ patient: patient._id }).sort({ date: -1 }).lean();
  res.json({ referrals });
});

export const createForPatient = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.patientId).select('_id');
  if (!patient) throw new HttpError(404, 'Patient not found');

  if (!req.user.imcNumber) {
    throw new HttpError(400, 'Add your IMC number to your profile before writing a referral');
  }

  const referral = new Referral({
    ...pick(req.body, REFERRAL_FIELDS),
    patient: patient._id,
    doctorName: req.user.name,
    doctorImc: req.user.imcNumber,
    doctorSignatureUrl: req.user.signatureUrl || '',
    createdBy: req.user._id,
  });
  await referral.save();
  res.status(201).json({ referral });
});

export const getReferral = asyncHandler(async (req, res) => {
  const referral = await Referral.findById(req.params.id).populate('patient');
  if (!referral) throw new HttpError(404, 'Referral not found');
  res.json({ referral });
});

export const deleteReferral = asyncHandler(async (req, res) => {
  const referral = await Referral.findById(req.params.id);
  if (!referral) throw new HttpError(404, 'Referral not found');
  await referral.deleteOne();
  res.json({ message: 'Referral deleted' });
});
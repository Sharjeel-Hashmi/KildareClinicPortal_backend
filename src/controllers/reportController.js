import Report, { REPORT_FIELDS } from '../models/Report.js';
import Lab from '../models/Lab.js';
import Patient from '../models/Patient.js';
import { asyncHandler, pick, HttpError } from '../utils/asyncHandler.js';

// Every doctor can see a patient's full report history (continuity of care) —
// this list is never filtered by who is signed in.
export const listForPatient = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.patientId).select('_id');
  if (!patient) throw new HttpError(404, 'Patient not found');

  const reports = await Report.find({ patient: patient._id }).sort({ date: -1 }).lean();
  res.json({ reports });
});

export const createForPatient = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.patientId).select('_id');
  if (!patient) throw new HttpError(404, 'Patient not found');

  let lab = null;
  let labName = String(req.body.labName || '').trim();
  if (req.body.labId) {
    lab = await Lab.findById(req.body.labId).select('_id name');
    if (!lab) throw new HttpError(404, 'Lab not found');
    labName = lab.name;
  }
  if (!labName) throw new HttpError(400, 'Select the lab name');

  const report = new Report({
    ...pick(req.body, REPORT_FIELDS),
    patient: patient._id,
    lab: lab?._id,
    labName,
    createdBy: req.user._id,
  });
  await report.save();
  res.status(201).json({ report });
});

export const getReport = asyncHandler(async (req, res) => {
  const report = await Report.findById(req.params.id).populate('patient');
  if (!report) throw new HttpError(404, 'Report not found');
  res.json({ report });
});

export const deleteReport = asyncHandler(async (req, res) => {
  const report = await Report.findById(req.params.id);
  if (!report) throw new HttpError(404, 'Report not found');
  await report.deleteOne();
  res.json({ message: 'Report deleted' });
});
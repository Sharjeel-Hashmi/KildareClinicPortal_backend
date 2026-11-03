import mongoose from 'mongoose';
import { DateTime } from 'luxon';
import Invoice, { INVOICE_FIELDS } from '../models/Invoice.js';
import Patient from '../models/Patient.js';
import User from '../models/User.js';
import { asyncHandler, pick, escapeRegex, HttpError } from '../utils/asyncHandler.js';
import { generateReceiptNo } from '../utils/generateReceiptNo.js';
import { TIMEZONE } from '../config/booking.js';
import { isValidDateStr } from '../utils/slotMath.js';

const PATIENT_SUMMARY = 'patientNo surname firstName dob sex phone';

const round2 = (n) => Math.round(n * 100) / 100;

const cleanLineItems = (items) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => ({
      description: String(it?.description || '').trim(),
      amount: round2(Number(it?.amount) || 0),
    }))
    .filter((it) => it.description && it.amount > 0);
};

// Card fields only make sense for card payments — strip them for cash/online so a form
// can't accidentally leave a stale card number attached to a different payment method.
const cleanCardFields = (body) => {
  if (body.paymentMethod !== 'card') {
    body.cardLast4 = '';
    body.cardAuthCode = '';
  }
  return body;
};

// The doctor an invoice belongs to. A doctor always raises invoices in their own name; Admin / Super Admin
// have to choose the doctor (so the income is counted for the right doctor in Reports).
async function resolveDoctor(req, { activeOnly = true } = {}) {
  if (req.user.role === 'doctor') return { _id: req.user._id, name: req.user.name };
  const id = req.body?.doctor;
  if (!id) return null;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'Choose the doctor this invoice is for');
  const doctor = await User.findOne({ _id: id, role: 'doctor' }).select('name isActive');
  if (!doctor || (activeOnly && doctor.isActive === false)) throw new HttpError(400, 'That doctor was not found');
  return doctor;
}

// Invoices that count for a doctor: ones raised in their name, plus older ones that have no doctor set
// and were created by them
const attributedTo = (doctorId) => ({
  $or: [
    { doctor: doctorId },
    { $and: [{ $or: [{ doctor: { $exists: false } }, { doctor: null }] }, { createdBy: doctorId }] },
  ],
});

// Every doctor can see a patient's full invoice/billing history (continuity of care) —
// this list is never filtered by who is signed in.
export const listForPatient = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.patientId).select('_id');
  if (!patient) throw new HttpError(404, 'Patient not found');

  const invoices = await Invoice.find({ patient: patient._id }).sort({ date: -1 }).lean();
  res.json({ invoices });
});

export const createForPatient = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.patientId).select('_id');
  if (!patient) throw new HttpError(404, 'Patient not found');

  const lineItems = cleanLineItems(req.body.lineItems);
  if (!lineItems.length) throw new HttpError(400, 'Add at least one line item');

  const body = cleanCardFields(pick(req.body, INVOICE_FIELDS));
  if (body.paymentMethod === 'card' && !String(body.cardLast4 || '').trim()) {
    throw new HttpError(400, 'Enter the last 4 digits of the card');
  }

  const doctor = await resolveDoctor(req);
  if (!doctor) throw new HttpError(400, 'Choose the doctor this invoice is for');

  const invoice = new Invoice({
    ...body,
    lineItems,
    subtotal: round2(lineItems.reduce((sum, it) => sum + it.amount, 0)),
    patient: patient._id,
    receiptNumber: await generateReceiptNo(),
    doctor: doctor._id,
    takenBy: doctor.name,
    createdBy: req.user._id,
  });
  await invoice.save();
  res.status(201).json({ invoice });
});

// List-all (Invoices tab). Scoped per doctor like consultations: a doctor only sees invoices
// they created; admins see everything, or one doctor's activity via ?doctorId=.
export const listAll = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
  const term = String(req.query.search || '').trim();

  const and = [];
  if (term) {
    const rx = new RegExp(escapeRegex(term), 'i');
    const matchingPatients = await Patient.find({
      $or: [{ surname: rx }, { firstName: rx }, { patientNo: rx }],
    }).select('_id');
    and.push({ $or: [{ patient: { $in: matchingPatients.map((p) => p._id) } }, { receiptNumber: rx }] });
  }

  // a doctor sees the invoices that count for them; admins see everything, or one doctor's via ?doctorId=
  if (req.user.role === 'doctor') {
    and.push(attributedTo(req.user._id));
  } else if (req.query.doctorId) {
    if (!mongoose.isValidObjectId(req.query.doctorId)) throw new HttpError(400, 'Invalid doctor');
    and.push(attributedTo(req.query.doctorId));
  }

  // Optional date range (Irish dates, YYYY-MM-DD) - used when opening a doctor's invoices from the Reports tab
  const { from, to } = req.query;
  if (from || to) {
    const range = {};
    if (from) {
      if (!isValidDateStr(String(from))) throw new HttpError(400, 'Dates must be in YYYY-MM-DD format');
      range.$gte = DateTime.fromISO(String(from), { zone: TIMEZONE }).startOf('day').toJSDate();
    }
    if (to) {
      if (!isValidDateStr(String(to))) throw new HttpError(400, 'Dates must be in YYYY-MM-DD format');
      range.$lt = DateTime.fromISO(String(to), { zone: TIMEZONE }).plus({ days: 1 }).startOf('day').toJSDate();
    }
    and.push({ date: range });
  }

  // Never list an invoice whose patient no longer exists (it would show as a blank row / blank page)
  const existingPatients = await Patient.distinct('_id');
  and.push({ patient: { $in: existingPatients } });
  const filter = { $and: and };

  const [total, invoices] = await Promise.all([
    Invoice.countDocuments(filter),
    Invoice.find(filter)
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('patient', PATIENT_SUMMARY)
      .populate('doctor', 'name')
      .populate('createdBy', 'name')
      .lean(),
  ]);

  // the filtered total, so a doctor's (or a month's) income can be read straight off the list
  const amounts = await Invoice.find(filter).select('subtotal').lean();
  const totalAmount = Math.round(amounts.reduce((acc, i) => acc + i.subtotal, 0) * 100) / 100;

  res.json({ invoices, total, totalAmount, page, pages: Math.max(Math.ceil(total / limit), 1) });
});

export const getInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id)
    .populate('patient')
    .populate('doctor', 'name imcNumber')
    .populate('createdBy', 'name role');
  if (!invoice) throw new HttpError(404, 'Invoice not found');
  res.json({ invoice });
});

// Super Admin only (see invoiceRoutes.js) — neither Admin nor the doctor who created it can edit
export const updateInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) throw new HttpError(404, 'Invoice not found');

  const lineItems = cleanLineItems(req.body.lineItems);
  if (!lineItems.length) throw new HttpError(400, 'Add at least one line item');

  const body = cleanCardFields(pick(req.body, INVOICE_FIELDS));
  if (body.paymentMethod === 'card' && !String(body.cardLast4 || '').trim()) {
    throw new HttpError(400, 'Enter the last 4 digits of the card');
  }

  // the doctor can be changed here; an older invoice with no doctor must be given one
  const doctor = await resolveDoctor(req, { activeOnly: false });
  if (doctor) {
    invoice.doctor = doctor._id;
    invoice.takenBy = doctor.name;
  } else if (!invoice.doctor) {
    const creator = await User.findById(invoice.createdBy).select('name role');
    if (creator?.role !== 'doctor') throw new HttpError(400, 'Choose the doctor this invoice is for');
    invoice.doctor = creator._id;
    invoice.takenBy = creator.name;
  }

  invoice.set({
    ...body,
    lineItems,
    subtotal: round2(lineItems.reduce((sum, it) => sum + it.amount, 0)),
  });
  await invoice.save();
  res.json({ invoice });
});

// Super Admin only (see invoiceRoutes.js)
export const deleteInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) throw new HttpError(404, 'Invoice not found');
  await invoice.deleteOne();
  res.json({ message: 'Invoice deleted' });
});
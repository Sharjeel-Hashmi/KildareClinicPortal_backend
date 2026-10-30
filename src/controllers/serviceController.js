import mongoose from 'mongoose';
import Service, { SERVICE_FIELDS } from '../models/Service.js';
import User from '../models/User.js';
import { asyncHandler, pick, HttpError, escapeRegex } from '../utils/asyncHandler.js';
import { uniqueSlug } from '../utils/slug.js';

// Clinic-wide shared list — every signed-in user can read it (invoice line items, booking form);
// only Settings-access users can write to it.
export const listServices = asyncHandler(async (_req, res) => {
  const services = await Service.find().sort({ name: 1 }).populate('doctors', 'name').lean();
  res.json({ services });
});

const parsePrice = (v) => {
  const price = Number(v);
  if (!Number.isFinite(price) || price < 0) throw new HttpError(400, 'Enter a valid price');
  return Math.round(price * 100) / 100;
};

const parseDuration = (v) => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 240) throw new HttpError(400, 'Duration must be a whole number of minutes (0–240)');
  return n;
};

const cleanDoctorIds = async (value) => {
  if (value === undefined) return undefined;
  const ids = [...new Set((Array.isArray(value) ? value : []).map((d) => String(d?._id || d)))];
  if (ids.some((id) => !mongoose.isValidObjectId(id))) throw new HttpError(400, 'One of the chosen doctors is not valid');
  const found = await User.countDocuments({ _id: { $in: ids }, role: 'doctor' });
  if (found !== ids.length) throw new HttpError(400, 'One of the chosen doctors was not found');
  return ids;
};

// A bookable service needs a length and at least one doctor offering it
const checkBookable = (service) => {
  if (!service.isBookable) return;
  if (!service.durationMinutes) throw new HttpError(400, 'Enter how many minutes this appointment takes to make it bookable');
  if (!service.doctors || service.doctors.length === 0) throw new HttpError(400, 'Choose at least one doctor who offers this service');
};

export const createService = asyncHandler(async (req, res) => {
  const body = pick(req.body, SERVICE_FIELDS);
  const name = String(body.name || '').trim();
  if (!name) throw new HttpError(400, 'Enter the service name');
  const price = parsePrice(body.price);

  if (await Service.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') })) {
    throw new HttpError(409, 'This service already exists');
  }

  const doc = {
    name,
    price,
    durationMinutes: parseDuration(body.durationMinutes),
    isBookable: body.isBookable === true,
    description: String(body.description || '').trim().slice(0, 300),
    doctors: (await cleanDoctorIds(body.doctors)) || [],
  };
  checkBookable(doc);
  doc.slug = await uniqueSlug(Service, name);

  const service = await Service.create(doc);
  res.status(201).json({ service });
});

export const updateService = asyncHandler(async (req, res) => {
  const service = await Service.findById(req.params.id);
  if (!service) throw new HttpError(404, 'Service not found');

  const body = pick(req.body, SERVICE_FIELDS);
  if (body.name !== undefined) service.name = String(body.name).trim();
  if (body.price !== undefined) service.price = parsePrice(body.price);
  if (body.durationMinutes !== undefined) service.durationMinutes = parseDuration(body.durationMinutes);
  if (body.isBookable !== undefined) service.isBookable = body.isBookable === true;
  if (body.description !== undefined) service.description = String(body.description).trim().slice(0, 300);
  if (body.doctors !== undefined) service.doctors = await cleanDoctorIds(body.doctors);

  checkBookable(service);
  if (!service.slug) service.slug = await uniqueSlug(Service, service.name, service._id);

  await service.save();
  res.json({ service });
});

export const deleteService = asyncHandler(async (req, res) => {
  const service = await Service.findById(req.params.id);
  if (!service) throw new HttpError(404, 'Service not found');
  await service.deleteOne();
  res.json({ message: 'Service removed' });
});

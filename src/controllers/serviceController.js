import Service, { SERVICE_FIELDS } from '../models/Service.js';
import { asyncHandler, pick, HttpError, escapeRegex } from '../utils/asyncHandler.js';

// Clinic-wide shared list — every signed-in user can read it (Invoice line-item dropdown);
// only Settings-access users can write to it.
export const listServices = asyncHandler(async (_req, res) => {
  const services = await Service.find().sort({ name: 1 }).lean();
  res.json({ services });
});

const parsePrice = (v) => {
  const price = Number(v);
  if (!Number.isFinite(price) || price < 0) throw new HttpError(400, 'Enter a valid price');
  return Math.round(price * 100) / 100;
};

export const createService = asyncHandler(async (req, res) => {
  const body = pick(req.body, SERVICE_FIELDS);
  const name = String(body.name || '').trim();
  if (!name) throw new HttpError(400, 'Enter the service name');
  const price = parsePrice(body.price);

  if (await Service.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') })) {
    throw new HttpError(409, 'This service already exists');
  }

  const service = await Service.create({ name, price });
  res.status(201).json({ service });
});

export const updateService = asyncHandler(async (req, res) => {
  const service = await Service.findById(req.params.id);
  if (!service) throw new HttpError(404, 'Service not found');

  const body = pick(req.body, SERVICE_FIELDS);
  if (body.name !== undefined) service.name = String(body.name).trim();
  if (body.price !== undefined) service.price = parsePrice(body.price);

  await service.save();
  res.json({ service });
});

export const deleteService = asyncHandler(async (req, res) => {
  const service = await Service.findById(req.params.id);
  if (!service) throw new HttpError(404, 'Service not found');
  await service.deleteOne();
  res.json({ message: 'Service removed' });
});
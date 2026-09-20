import Counter from '../models/Counter.js';

// Atomic auto-increment → KC-00001, KC-00002 …
export async function generatePatientNo() {
  const counter = await Counter.findOneAndUpdate(
    { _id: 'patientNo' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `KC-${String(counter.seq).padStart(5, '0')}`;
}

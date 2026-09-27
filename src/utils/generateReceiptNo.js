import Counter from '../models/Counter.js';

// Atomic auto-increment, reset every calendar year → RCP-2026-0001, RCP-2026-0002 …
export async function generateReceiptNo() {
  const year = new Date().getFullYear();
  const counter = await Counter.findOneAndUpdate(
    { _id: `receiptNo-${year}` },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `RCP-${year}-${String(counter.seq).padStart(4, '0')}`;
}
// One-off cleanup for records whose patient no longer exists (shown as blank rows / blank pages).
//
//   node src/scripts/cleanupOrphans.js            → DRY RUN: only lists what it found, deletes nothing
//   node src/scripts/cleanupOrphans.js --delete   → deletes the orphan INVOICES listed above
//
// Other record types (consultations, prescriptions, certificates, reports, referrals) are only
// reported — they are never deleted by this script.
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Patient from '../models/Patient.js';
import Invoice from '../models/Invoice.js';
import Consultation from '../models/Consultation.js';
import Prescription from '../models/Prescription.js';
import MedicalCertificate from '../models/MedicalCertificate.js';
import Report from '../models/Report.js';
import Referral from '../models/Referral.js';

const doDelete = process.argv.includes('--delete');

const orphansOf = async (Model, patientIds) => Model.find({ patient: { $nin: patientIds } }).lean();

async function run() {
  await connectDB();
  const patientIds = (await Patient.find().select('_id').lean()).map((p) => p._id);
  console.log(`Patients in database: ${patientIds.length}\n`);

  const invoices = await orphansOf(Invoice, patientIds);
  console.log(`Orphan invoices (patient no longer exists): ${invoices.length}`);
  invoices.forEach((i) =>
    console.log(
      `  ${i.receiptNumber}  ${new Date(i.date).toLocaleDateString('en-IE')}  €${Number(i.subtotal).toFixed(2)}  ${i.paymentMethod}  (id ${i._id})`
    )
  );

  console.log('\nOther orphan records (reported only, never deleted here):');
  for (const [label, Model] of [
    ['consultations', Consultation],
    ['prescriptions', Prescription],
    ['certificates', MedicalCertificate],
    ['reports', Report],
    ['referrals', Referral],
  ]) {
    console.log(`  ${label}: ${(await orphansOf(Model, patientIds)).length}`);
  }

  if (!doDelete) {
    console.log('\nDRY RUN — nothing was deleted. Re-run with --delete to remove the orphan invoices above.');
  } else if (!invoices.length) {
    console.log('\nNothing to delete.');
  } else {
    const res = await Invoice.deleteMany({ _id: { $in: invoices.map((i) => i._id) } });
    console.log(`\nDeleted ${res.deletedCount} orphan invoice(s).`);
  }
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
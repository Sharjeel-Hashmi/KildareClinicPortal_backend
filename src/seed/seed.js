// Usage:
//   npm run seed        → creates / promotes the single SUPER ADMIN account only
//                         (SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD, falling back to the old
//                          ADMIN_EMAIL / ADMIN_PASSWORD so an existing admin is promoted in place)
//   npm run seed:demo   → also inserts a few FICTIONAL patients so you can preview the UI
//                         (never run the demo seed against the live clinic database)
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import Patient from '../models/Patient.js';
import Consultation from '../models/Consultation.js';
import { generatePatientNo } from '../utils/generatePatientNo.js';

const withDemo = process.argv.includes('--demo');

const daysAgo = (n, hour = 10, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d;
};

async function seedAdmin() {
  const name = process.env.SUPERADMIN_NAME || process.env.ADMIN_NAME || 'Dr. Admin';
  const email = process.env.SUPERADMIN_EMAIL || process.env.ADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD (or ADMIN_EMAIL / ADMIN_PASSWORD) in .env before seeding');
  }
  if (password.length < 8) throw new Error('The Super Admin password must be at least 8 characters');

  // One-time cleanup: older accounts saved a blank IMC number as '' which clashes on the unique index
  const cleaned = await User.collection.updateMany({ imcNumber: '' }, { $unset: { imcNumber: 1 } });
  if (cleaned.modifiedCount) console.log(`Cleared blank IMC number on ${cleaned.modifiedCount} account(s)`);

  let user = await User.findOne({ email: email.toLowerCase() });
  if (user) {
    const wasRole = user.role;
    user.name = name;
    user.password = password; // re-hashed by the pre-save hook
    user.role = 'super_admin';
    user.isActive = true;
    await user.save();
    console.log(`Updated Super Admin account: ${user.email}${wasRole !== 'super_admin' ? ` (promoted from ${wasRole})` : ''}`);
  } else {
    user = await User.create({ name, email, password, role: 'super_admin' });
    console.log(`Created Super Admin account: ${user.email}`);
  }

  // There must only ever be ONE Super Admin. Any other super_admin left over from an earlier
  // seed run (e.g. a different SUPERADMIN_EMAIL / ADMIN_EMAIL) is demoted to a normal Admin.
  const demoted = await User.find({ role: 'super_admin', _id: { $ne: user._id } });
  for (const other of demoted) {
    other.role = 'admin';
    await other.save();
    console.log(`Demoted extra Super Admin to Admin: ${other.email}`);
  }
  return user;
}

async function seedDemo(admin) {
  if (await Patient.countDocuments()) {
    console.log('Patients already exist – skipping demo data.');
    return;
  }

  const people = [
    {
      surname: 'Murphy', firstName: 'Aoife', dob: '1988-03-14', sex: 'female', phone: '087 123 4567',
      email: 'aoife.murphy@example.com', addressLine1: '12 Main Street', addressLine2: 'Naas, Co. Kildare',
      eircode: 'W91 XY12', usualGp: 'Dr. Brennan, Naas', medicalConditions: 'Asthma (mild, since childhood)',
      medications: 'Salbutamol inhaler PRN', allergyStatus: 'yes', allergyDetails: 'Penicillin – rash',
      emergencyContact: { name: 'Conor Murphy', relationship: 'Husband', phone: '086 555 0101' },
      reasonForRegistration: 'Moved to the area', infoProvided: true, preferredContact: 'phone',
    },
    {
      surname: "O'Brien", firstName: 'Seán', dob: '1961-11-02', sex: 'male', phone: '085 222 3344',
      addressLine1: '4 Curragh Road', addressLine2: 'Newbridge, Co. Kildare', eircode: 'W12 XY34',
      usualGp: 'Dr. Kavanagh, Newbridge', medicalConditions: 'Hypertension, Type 2 diabetes',
      medications: 'Ramipril 5mg OD\nMetformin 500mg BD', allergyStatus: 'none',
      emergencyContact: { name: 'Mary O\'Brien', relationship: 'Wife', phone: '085 222 3355' },
      reasonForRegistration: 'Chronic disease review', infoProvided: true, preferredContact: 'phone',
    },
    {
      surname: 'Khan', firstName: 'Ayesha', dob: '1995-07-21', sex: 'female', phone: '083 909 8877',
      email: 'ayesha.khan@example.com', addressLine1: '27 Liffey Court', addressLine2: 'Celbridge, Co. Kildare',
      eircode: 'W23 CD56', allergyStatus: 'none', reasonForRegistration: 'New patient – general check-up',
      infoProvided: true, preferredContact: 'email',
    },
    {
      surname: 'Byrne', firstName: 'Liam', dob: '2014-05-09', sex: 'male', phone: '087 777 1212',
      addressLine1: '9 Oakfield Drive', addressLine2: 'Maynooth, Co. Kildare', eircode: 'W23 EF78',
      medicalConditions: 'Eczema', allergyStatus: 'yes', allergyDetails: 'Peanuts',
      emergencyContact: { name: 'Niamh Byrne', relationship: 'Mother', phone: '087 777 1213' },
      reasonForRegistration: 'Family registration', infoProvided: false, preferredContact: 'phone',
    },
    {
      surname: 'Walsh', firstName: 'Margaret', dob: '1949-01-30', sex: 'female', phone: '086 404 5566',
      addressLine1: '2 Abbey View', addressLine2: 'Kildare Town', eircode: 'R51 HK90',
      usualGp: 'Dr. Doyle, Kildare Town', medicalConditions: 'Osteoarthritis (knees), high cholesterol',
      medications: 'Atorvastatin 20mg ON\nParacetamol PRN', allergyStatus: 'none',
      emergencyContact: { name: 'Helen Walsh', relationship: 'Daughter', phone: '086 404 5577' },
      reasonForRegistration: 'Transfer of care', infoProvided: true, preferredContact: 'phone',
    },
    {
      surname: 'Nowak', firstName: 'Piotr', dob: '1979-09-18', sex: 'male', phone: '089 330 2211',
      email: 'piotr.nowak@example.com', addressLine1: '31 Station Road', addressLine2: 'Sallins, Co. Kildare',
      eircode: 'W91 HK12', allergyStatus: 'none', reasonForRegistration: 'Back pain',
      infoProvided: true, preferredContact: 'email',
    },
  ];

  const patients = [];
  for (let i = 0; i < people.length; i += 1) {
    const p = await Patient.create({
      ...people[i],
      patientNo: await generatePatientNo(),
      registrationDate: daysAgo(people.length - i + 2),
      createdBy: admin._id,
      updatedBy: admin._id,
    });
    patients.push(p);
  }

  const [murphy, obrien, khan, byrne, walsh, nowak] = patients;
  const base = { clinician: admin.name, createdBy: admin._id, updatedBy: admin._id };

  await Consultation.create([
    {
      ...base, patient: murphy._id, consultationDate: daysAgo(0, 9, 30), consultationType: 'new',
      mainComplaint: 'Wheeze and night-time cough for 5 days',
      historyOfPresentingComplaint: 'Worse after a cold last week. Using inhaler 4–5 times a day. No fever.',
      pastMedicalHistory: 'Asthma', currentMedications: 'Salbutamol inhaler PRN',
      allergyStatus: 'yes', allergyDetails: 'Penicillin – rash',
      vitals: { bp: '118/76', pulse: '82', temp: '36.8', spo2: '97%', weight: '64 kg' },
      examinationFindings: 'Widespread expiratory wheeze. Chest otherwise clear.',
      diagnosis: 'Mild asthma exacerbation', managementPlan: 'Start preventer inhaler. Review technique. Safety-net advice given.',
      investigations: ['none'], referral: ['none'], followUp: 'Review in 2 weeks',
      prescription: { medication: 'Beclometasone 100mcg inhaler', dose: '2 puffs twice daily, ongoing' },
    },
    {
      ...base, patient: obrien._id, consultationDate: daysAgo(0, 11, 15), consultationType: 'follow_up',
      mainComplaint: 'Diabetes and blood pressure review',
      historyOfPresentingComplaint: 'Feels well. Home BP readings around 135/85.',
      pastMedicalHistory: 'Hypertension, Type 2 diabetes', currentMedications: 'Ramipril 5mg OD, Metformin 500mg BD',
      allergyStatus: 'none', vitals: { bp: '136/84', pulse: '72', weight: '92 kg' },
      diagnosis: 'Type 2 diabetes – fair control. Hypertension – borderline.',
      managementPlan: 'Continue current medication. Diet advice. Repeat bloods.',
      investigations: ['bloods'], referral: ['none'], followUp: 'Review in 3 months',
    },
    {
      ...base, patient: obrien._id, consultationDate: daysAgo(94, 10, 0), consultationType: 'follow_up',
      mainComplaint: 'Routine chronic disease review', allergyStatus: 'none',
      vitals: { bp: '142/88', pulse: '76' }, diagnosis: 'Hypertension – above target',
      managementPlan: 'Increase Ramipril to 5mg. Recheck in 3 months.', investigations: ['none'], referral: ['none'],
    },
    {
      ...base, patient: khan._id, consultationDate: daysAgo(1, 14, 0), consultationType: 'new',
      mainComplaint: 'General check-up and contraception advice', allergyStatus: 'none',
      vitals: { bp: '110/70', pulse: '68', weight: '58 kg' }, diagnosis: 'Well',
      managementPlan: 'Contraception options discussed. Bloods requested.', investigations: ['bloods'], referral: ['none'],
    },
    {
      ...base, patient: walsh._id, consultationDate: daysAgo(3, 12, 30), consultationType: 'new',
      mainComplaint: 'Worsening right knee pain', allergyStatus: 'none',
      historyOfPresentingComplaint: 'Pain on stairs for 2 months. No injury.',
      vitals: { bp: '138/80', pulse: '70' }, examinationFindings: 'Crepitus right knee. No effusion. Full flexion.',
      diagnosis: 'Osteoarthritis right knee', managementPlan: 'Physiotherapy. Topical NSAID. Weight-bearing exercise advice.',
      investigations: ['imaging'], referral: ['specialist'], referralOther: '', followUp: 'Review in 6 weeks',
    },
    {
      ...base, patient: nowak._id, consultationDate: daysAgo(6, 16, 0), consultationType: 'new',
      mainComplaint: 'Low back pain after lifting', allergyStatus: 'none',
      diagnosis: 'Mechanical low back pain', managementPlan: 'Analgesia and gentle mobilisation. Red-flag advice given.',
      investigations: ['none'], referral: ['none'], followUp: 'If not improving in 2 weeks',
    },
  ]);

  console.log(`Inserted ${patients.length} demo patients and 6 demo consultations.`);
  void byrne;
}

(async () => {
  try {
    await connectDB();
    const admin = await seedAdmin();
    if (withDemo) await seedDemo(admin);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import patientRoutes from './routes/patientRoutes.js';
import consultationRoutes from './routes/consultationRoutes.js';
import prescriptionRoutes from './routes/prescriptionRoutes.js';
import certificateRoutes from './routes/certificateRoutes.js';
import userRoutes from './routes/userRoutes.js';
import statsRoutes from './routes/statsRoutes.js';
import medicineRoutes from './routes/medicineRoutes.js';
import medicineCategoryRoutes from './routes/medicineCategoryRoutes.js';
import labRoutes from './routes/labRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import invoiceRoutes from './routes/invoiceRoutes.js';
import serviceRoutes from './routes/serviceRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const app = express();

app.set('trust proxy', 1); // Vercel sits behind a proxy (needed for rate-limit IPs)
app.use(helmet());

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

const isLocalDevOrigin = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

// Vercel sets VERCEL=1 automatically. Checking it (instead of NODE_ENV) means a stray
// NODE_ENV=production in a local .env can't push local testing into "live" mode.
const isHosted = Boolean(process.env.VERCEL);

app.use(
  cors({
    origin(origin, cb) {
      // No Origin header = curl / server-to-server. Otherwise it must be whitelisted
      // (any localhost / 127.0.0.1 port is also accepted, but only when not running on Vercel).
      const ok =
        !origin ||
        allowedOrigins.includes(origin) ||
        (!isHosted && isLocalDevOrigin(origin));
      cb(null, ok);
    },
  })
);
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Connect (or reuse the cached connection) before any data route runs
app.use('/api', async (_req, _res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    err.status = 503;
    err.message = 'Database is unavailable. Please try again shortly.';
    next(err);
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/consultations', consultationRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/users', userRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/medicine-categories', medicineCategoryRoutes);
app.use('/api/labs', labRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/uploads', uploadRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
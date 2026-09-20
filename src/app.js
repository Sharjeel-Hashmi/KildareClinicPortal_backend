import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import patientRoutes from './routes/patientRoutes.js';
import consultationRoutes from './routes/consultationRoutes.js';
import statsRoutes from './routes/statsRoutes.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const app = express();

app.set('trust proxy', 1); // Vercel sits behind a proxy (needed for rate-limit IPs)
app.use(helmet());

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

const isLocalDevOrigin = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

app.use(
  cors({
    origin(origin, cb) {
      // No Origin header = curl / server-to-server. Otherwise it must be whitelisted
      // (any localhost / 127.0.0.1 port is also accepted, but only outside production).
      const ok =
        !origin ||
        allowedOrigins.includes(origin) ||
        (process.env.NODE_ENV !== 'production' && isLocalDevOrigin(origin));
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
app.use('/api/stats', statsRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;

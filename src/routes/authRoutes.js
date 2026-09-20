import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, me } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

// Slow down password guessing: 10 attempts / 15 min / IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many sign-in attempts. Please wait 15 minutes and try again.' },
});

router.post('/login', loginLimiter, login);
router.get('/me', protect, me);

export default router;

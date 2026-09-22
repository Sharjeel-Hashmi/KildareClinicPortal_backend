import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, me, updateMe } from '../controllers/authController.js';
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
router.put('/me', protect, updateMe);

export default router;

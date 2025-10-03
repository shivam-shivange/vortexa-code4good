import express from 'express';
import { signup, login } from '../controllers/authController.js';
import { authRateLimit } from '../middleware/rateLimitMiddleware.js';

const router = express.Router();

// Apply auth-specific rate limiting
router.post('/signup', authRateLimit, signup);
router.post('/login', authRateLimit, login);

export default router;

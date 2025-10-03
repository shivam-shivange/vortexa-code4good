import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { logEvent } from '../controllers/eventController.js';
const router = express.Router();

router.post('/', authenticate, logEvent);
export default router;

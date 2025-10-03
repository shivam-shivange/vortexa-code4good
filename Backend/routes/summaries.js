import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { getSummary, regenerateSummary } from '../controllers/summaryController.js';

const router = express.Router();
router.get('/:id', authenticate, getSummary);
router.post('/:id/regenerate', authenticate, regenerateSummary);

export default router;

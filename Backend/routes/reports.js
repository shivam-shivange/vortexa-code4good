import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { reportsRateLimit } from '../middleware/rateLimitMiddleware.js';
import {
  getEngagementReport,
  getQuizReport,
  getLearningProgressReport,
  getTopContentReport,
  getUserPerformanceReport,
  getDashboardSummary,
  getETLStatus,
  triggerETL,
  getAnalyticsExport
} from '../controllers/reportsController.js';

const router = express.Router();

// Apply reports-specific rate limiting
router.use(reportsRateLimit);

// All routes require authentication
router.use(authenticate);

// Dashboard summary - role-based data
router.get('/dashboard', getDashboardSummary);

// Get detailed performance analysis
router.get('/performance-analysis', async (req, res) => {
  try {
    const userId = req.user.id;
    const analysis = await performanceAnalysisService.getUserPerformanceAnalysis(userId);
    res.json(analysis);
  } catch (error) {
    console.error('Error getting performance analysis:', error);
    res.status(500).json({ error: 'Failed to get performance analysis' });
  }
});

// Engagement analytics
router.get('/engagement', getEngagementReport);

// Quiz performance analytics
router.get('/quiz-performance', getQuizReport);

// Learning progress analytics
router.get('/learning-progress', getLearningProgressReport);

// Top performing content
router.get('/top-content', getTopContentReport);

// User performance report
router.get('/users/:id/performance', getUserPerformanceReport);

// Analytics data export (CSV/JSON)
router.get('/export', getAnalyticsExport);

// ETL management (admin only)
router.get('/etl/status', getETLStatus);
router.post('/etl/trigger', triggerETL);

export default router;

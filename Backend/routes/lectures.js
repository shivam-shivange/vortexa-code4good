import express from 'express';
import upload, { validateFileSize, validateFileContent, cleanupOnError } from '../utils/multer.js';
import { authenticate } from '../middleware/authMiddleware.js';
import xapiMiddleware from '../middleware/xapiMiddleware.js';
import {
  generalRateLimit,
  uploadRateLimit,
  aiServiceRateLimit,
  userUploadRateLimit,
  userAIServiceRateLimit
} from '../middleware/rateLimitMiddleware.js';
import {
  uploadLecture,
  getLectures,
  getLectureById,
  getLectureSummary,
  getLectureQuiz,
  getProcessingStatus,
  reprocessLecture,
  deleteLecture
} from '../controllers/lectureController.js';

const router = express.Router();

// Apply general rate limiting to all routes
router.use(generalRateLimit);

// Apply xAPI middleware to all routes
router.use(xapiMiddleware.middleware());

// Upload lecture with video and optional PPT
router.post('/upload', 
  uploadRateLimit, // IP-based upload rate limiting
  authenticate, 
  userUploadRateLimit, // User-based upload rate limiting
  upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'ppt', maxCount: 1 }
  ]),
  validateFileSize, // Validate file sizes per field
  validateFileContent, // Validate file content/signatures
  uploadLecture,
  cleanupOnError // Cleanup files on error
);

// Get all lectures with pagination and filtering
router.get('/', authenticate, getLectures);

// Get specific lecture by ID
router.get('/:id', authenticate, getLectureById);

// Get lecture summary with language and style options
router.get('/:id/summary', 
  authenticate, 
  aiServiceRateLimit, // IP-based AI service rate limiting
  userAIServiceRateLimit, // User-based AI service rate limiting
  getLectureSummary
);

// Get lecture quiz with language and difficulty options
router.get('/:id/quiz', 
  authenticate, 
  aiServiceRateLimit, // IP-based AI service rate limiting
  userAIServiceRateLimit, // User-based AI service rate limiting
  getLectureQuiz
);

// Get processing status for a lecture
router.get('/:id/status', authenticate, getProcessingStatus);

// Reprocess lecture with new options
router.post('/:id/reprocess', 
  authenticate, 
  aiServiceRateLimit, // IP-based AI service rate limiting
  userAIServiceRateLimit, // User-based AI service rate limiting
  reprocessLecture
);

// Delete lecture (only uploader or admin)
router.delete('/:id', authenticate, deleteLecture);

export default router;

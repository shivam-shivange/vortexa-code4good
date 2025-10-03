import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { 
  generateQuiz, 
  submitQuizAttempt, 
  getQuizAttempts, 
  getQuizPerformanceReport 
} from '../controllers/quizController.js';

const router = express.Router();
router.post('/:id/generate', authenticate, generateQuiz);
router.post('/submit', authenticate, submitQuizAttempt);
router.get('/:quizId/attempts', authenticate, getQuizAttempts);
router.get('/performance/:lectureId', authenticate, getQuizPerformanceReport);

export default router;

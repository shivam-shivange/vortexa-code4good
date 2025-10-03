import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import lectureRoutes from './routes/lectures.js';
import summaryRoutes from './routes/summaries.js';
import quizRoutes from './routes/quizzes.js';
import eventRoutes from './routes/events.js';
import reportsRoutes from './routes/reports.js';
import cacheService from './services/cacheService.js';
import reportsService from './services/reportsService.js';
import { createRateLimitTable, cleanupRateLimitEntries } from './middleware/rateLimitMiddleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/lectures', lectureRoutes);
app.use('/api/summaries', summaryRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/xapi', eventRoutes);
app.use('/api/reports', reportsRoutes);

// Health check endpoints
import { getHealthStatus, getDetailedHealth } from './controllers/healthController.js';
import { authenticate } from './middleware/authMiddleware.js';

app.get('/health', getHealthStatus);
app.get('/health/detailed', authenticate, getDetailedHealth);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});

const PORT = process.env.PORT || 5000;

// Start services
const startServer = async () => {
  try {
    // Initialize database tables
    await createRateLimitTable();
    console.log('Database tables initialized');
    
    // Start cache cleanup scheduler
    cacheService.startCleanupScheduler();
    
    // Start rate limit cleanup (runs every 6 hours)
    setInterval(async () => {
      await cleanupRateLimitEntries();
    }, 6 * 60 * 60 * 1000);
    
    // Reports service ETL scheduler is started automatically in constructor
    console.log('Background services initialized');
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`📈 Reports API: http://localhost:${PORT}/api/reports`);
      console.log(`📁 Static files: http://localhost:${PORT}/uploads`);
      console.log(`🔐 Auth API: http://localhost:${PORT}/api/auth`);
      console.log(`🎥 Lectures API: http://localhost:${PORT}/api/lectures`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

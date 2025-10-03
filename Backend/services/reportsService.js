import db from '../utils/db.js';
import cron from 'node-cron';

class ReportsService {
  constructor() {
    this.isETLRunning = false;
    this.lastETLRun = null;
    this.startScheduledETL();
  }

  /**
   * Start scheduled ETL process
   * Runs every hour to process events and generate reports
   */
  startScheduledETL() {
    // Run ETL every hour at minute 0
    cron.schedule('0 * * * *', async () => {
      try {
        await this.runETLPipeline();
      } catch (error) {
        console.error('Scheduled ETL failed:', error);
      }
    });

    console.log('Reports ETL scheduler started - runs every hour');
  }

  /**
   * Run the complete ETL pipeline
   */
  async runETLPipeline() {
    if (this.isETLRunning) {
      console.log('ETL pipeline already running, skipping...');
      return;
    }

    this.isETLRunning = true;
    console.log('Starting ETL pipeline...');

    try {
      // Create aggregated tables if they don't exist
      await this.createAggregatedTables();

      // Process engagement metrics
      await this.processEngagementMetrics();

      // Process quiz performance metrics
      await this.processQuizMetrics();

      // Process learning path analytics
      await this.processLearningPathMetrics();

      // Clean up old aggregated data (keep last 90 days)
      await this.cleanupOldData();

      this.lastETLRun = new Date();
      console.log('ETL pipeline completed successfully');

    } catch (error) {
      console.error('ETL pipeline failed:', error);
      throw error;
    } finally {
      this.isETLRunning = false;
    }
  }

  /**
   * Create aggregated tables for reports
   */
  async createAggregatedTables() {
    const queries = [
      // Daily engagement metrics
      `CREATE TABLE IF NOT EXISTS daily_engagement (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        lecture_id INT REFERENCES lectures(id) ON DELETE CASCADE,
        total_views INT DEFAULT 0,
        total_time_spent INT DEFAULT 0, -- in seconds
        summaries_viewed INT DEFAULT 0,
        quizzes_attempted INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, user_id, lecture_id)
      )`,

      // Weekly quiz performance
      `CREATE TABLE IF NOT EXISTS weekly_quiz_performance (
        id SERIAL PRIMARY KEY,
        week_start DATE NOT NULL,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        lecture_id INT REFERENCES lectures(id) ON DELETE CASCADE,
        quizzes_completed INT DEFAULT 0,
        average_score DECIMAL(5,2) DEFAULT 0,
        best_score DECIMAL(5,2) DEFAULT 0,
        total_attempts INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(week_start, user_id, lecture_id)
      )`,

      // Learning path progress
      `CREATE TABLE IF NOT EXISTS learning_progress (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        lecture_id INT REFERENCES lectures(id) ON DELETE CASCADE,
        first_viewed_at TIMESTAMP,
        last_viewed_at TIMESTAMP,
        total_sessions INT DEFAULT 0,
        completion_percentage DECIMAL(5,2) DEFAULT 0,
        has_completed_quiz BOOLEAN DEFAULT FALSE,
        best_quiz_score DECIMAL(5,2) DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, lecture_id)
      )`
    ];

    for (const query of queries) {
      await db.query(query);
    }

    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_daily_engagement_date ON daily_engagement(date)',
      'CREATE INDEX IF NOT EXISTS idx_daily_engagement_user ON daily_engagement(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_weekly_quiz_week ON weekly_quiz_performance(week_start)',
      'CREATE INDEX IF NOT EXISTS idx_learning_progress_user ON learning_progress(user_id)'
    ];

    for (const index of indexes) {
      await db.query(index);
    }
  }

  /**
   * Process engagement metrics from events
   */
  async processEngagementMetrics() {
    const query = `
      INSERT INTO daily_engagement (date, user_id, lecture_id, total_views, total_time_spent, summaries_viewed, quizzes_attempted)
      SELECT 
        DATE(e.created_at) as date,
        e.user_id,
        e.lecture_id,
        COUNT(CASE WHEN e.event_type = 'lecture.viewed' THEN 1 END) as total_views,
        COALESCE(SUM(CASE WHEN e.event_type = 'lecture.viewed' THEN (e.details->>'duration')::int END), 0) as total_time_spent,
        COUNT(CASE WHEN e.event_type = 'summary.viewed' THEN 1 END) as summaries_viewed,
        COUNT(CASE WHEN e.event_type IN ('quiz.attempted', 'quiz.completed') THEN 1 END) as quizzes_attempted
      FROM events e
      WHERE e.created_at >= CURRENT_DATE - INTERVAL '7 days'
        AND e.created_at < CURRENT_DATE
      GROUP BY DATE(e.created_at), e.user_id, e.lecture_id
      ON CONFLICT (date, user_id, lecture_id) 
      DO UPDATE SET
        total_views = EXCLUDED.total_views,
        total_time_spent = EXCLUDED.total_time_spent,
        summaries_viewed = EXCLUDED.summaries_viewed,
        quizzes_attempted = EXCLUDED.quizzes_attempted
    `;

    await db.query(query);
    console.log('Processed engagement metrics');
  }

  /**
   * Process quiz performance metrics
   */
  async processQuizMetrics() {
    const query = `
      INSERT INTO weekly_quiz_performance (week_start, user_id, lecture_id, quizzes_completed, average_score, best_score, total_attempts)
      SELECT 
        DATE_TRUNC('week', qa.attempted_at)::date as week_start,
        qa.user_id,
        q.lecture_id,
        COUNT(DISTINCT qa.id) as quizzes_completed,
        AVG(qa.score) as average_score,
        MAX(qa.score) as best_score,
        COUNT(qa.id) as total_attempts
      FROM quiz_attempts qa
      JOIN quizzes q ON qa.quiz_id = q.id
      WHERE qa.attempted_at >= CURRENT_DATE - INTERVAL '14 days'
        AND qa.attempted_at < CURRENT_DATE
      GROUP BY DATE_TRUNC('week', qa.attempted_at)::date, qa.user_id, q.lecture_id
      ON CONFLICT (week_start, user_id, lecture_id)
      DO UPDATE SET
        quizzes_completed = EXCLUDED.quizzes_completed,
        average_score = EXCLUDED.average_score,
        best_score = EXCLUDED.best_score,
        total_attempts = EXCLUDED.total_attempts
    `;

    await db.query(query);
    console.log('Processed quiz performance metrics');
  }

  /**
   * Process learning path progress
   */
  async processLearningPathMetrics() {
    const query = `
      INSERT INTO learning_progress (user_id, lecture_id, first_viewed_at, last_viewed_at, total_sessions, has_completed_quiz, best_quiz_score)
      SELECT 
        e.user_id,
        e.lecture_id,
        MIN(CASE WHEN e.event_type = 'lecture.viewed' THEN e.created_at END) as first_viewed_at,
        MAX(CASE WHEN e.event_type = 'lecture.viewed' THEN e.created_at END) as last_viewed_at,
        COUNT(DISTINCT DATE(e.created_at)) as total_sessions,
        BOOL_OR(e.event_type = 'quiz.completed') as has_completed_quiz,
        COALESCE(MAX(CASE WHEN e.event_type = 'quiz.completed' THEN (e.details->>'score')::decimal END), 0) as best_quiz_score
      FROM events e
      WHERE e.event_type IN ('lecture.viewed', 'quiz.completed')
      GROUP BY e.user_id, e.lecture_id
      ON CONFLICT (user_id, lecture_id)
      DO UPDATE SET
        first_viewed_at = LEAST(learning_progress.first_viewed_at, EXCLUDED.first_viewed_at),
        last_viewed_at = GREATEST(learning_progress.last_viewed_at, EXCLUDED.last_viewed_at),
        total_sessions = EXCLUDED.total_sessions,
        has_completed_quiz = learning_progress.has_completed_quiz OR EXCLUDED.has_completed_quiz,
        best_quiz_score = GREATEST(learning_progress.best_quiz_score, EXCLUDED.best_quiz_score),
        updated_at = CURRENT_TIMESTAMP
    `;

    await db.query(query);
    console.log('Processed learning progress metrics');
  }

  /**
   * Clean up old aggregated data
   */
  async cleanupOldData() {
    const queries = [
      'DELETE FROM daily_engagement WHERE date < CURRENT_DATE - INTERVAL \'90 days\'',
      'DELETE FROM weekly_quiz_performance WHERE week_start < CURRENT_DATE - INTERVAL \'90 days\''
    ];

    for (const query of queries) {
      const result = await db.query(query);
      console.log(`Cleaned up ${result.rowCount} old records`);
    }
  }

  /**
   * Get engagement analytics
   */
  async getEngagementAnalytics(filters = {}) {
    const {
      userId,
      lectureId,
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      endDate = new Date(),
      groupBy = 'day'
    } = filters;

    let dateFormat = 'DATE(de.date)';
    if (groupBy === 'week') {
      dateFormat = 'DATE_TRUNC(\'week\', de.date)::date';
    } else if (groupBy === 'month') {
      dateFormat = 'DATE_TRUNC(\'month\', de.date)::date';
    }

    let query = `
      SELECT 
        ${dateFormat} as period,
        COUNT(DISTINCT de.user_id) as unique_users,
        COUNT(DISTINCT de.lecture_id) as unique_lectures,
        SUM(de.total_views) as total_views,
        SUM(de.total_time_spent) as total_time_spent,
        SUM(de.summaries_viewed) as summaries_viewed,
        SUM(de.quizzes_attempted) as quizzes_attempted,
        AVG(de.total_time_spent::decimal / NULLIF(de.total_views, 0)) as avg_session_duration
      FROM daily_engagement de
      WHERE de.date >= $1 AND de.date <= $2
    `;

    const params = [startDate, endDate];
    let paramIndex = 3;

    if (userId) {
      query += ` AND de.user_id = $${paramIndex++}`;
      params.push(userId);
    }

    if (lectureId) {
      query += ` AND de.lecture_id = $${paramIndex++}`;
      params.push(lectureId);
    }

    query += ` GROUP BY ${dateFormat} ORDER BY period DESC`;

    const result = await db.query(query, params);
    return result.rows;
  }

  /**
   * Get quiz performance analytics
   */
  async getQuizAnalytics(filters = {}) {
    const {
      userId,
      lectureId,
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate = new Date()
    } = filters;

    let query = `
      SELECT 
        wqp.week_start,
        COUNT(DISTINCT wqp.user_id) as unique_users,
        COUNT(DISTINCT wqp.lecture_id) as unique_lectures,
        SUM(wqp.quizzes_completed) as total_quizzes_completed,
        AVG(wqp.average_score) as overall_average_score,
        MAX(wqp.best_score) as highest_score,
        SUM(wqp.total_attempts) as total_attempts,
        AVG(wqp.total_attempts::decimal / NULLIF(wqp.quizzes_completed, 0)) as avg_attempts_per_completion
      FROM weekly_quiz_performance wqp
      WHERE wqp.week_start >= DATE_TRUNC('week', $1::date)
        AND wqp.week_start <= DATE_TRUNC('week', $2::date)
    `;

    const params = [startDate, endDate];
    let paramIndex = 3;

    if (userId) {
      query += ` AND wqp.user_id = $${paramIndex++}`;
      params.push(userId);
    }

    if (lectureId) {
      query += ` AND wqp.lecture_id = $${paramIndex++}`;
      params.push(lectureId);
    }

    query += ' GROUP BY wqp.week_start ORDER BY wqp.week_start DESC';

    const result = await db.query(query, params);
    return result.rows;
  }

  /**
   * Get learning progress analytics
   */
  async getLearningProgress(filters = {}) {
    const { userId, lectureId } = filters;

    let query = `
      SELECT 
        lp.*,
        u.name as user_name,
        u.email as user_email,
        l.title as lecture_title,
        l.duration_seconds as lecture_duration,
        CASE 
          WHEN l.duration_seconds > 0 AND lp.total_sessions > 0 
          THEN LEAST(100, (lp.total_sessions * 300.0 / l.duration_seconds) * 100)
          ELSE 0 
        END as estimated_completion_percentage
      FROM learning_progress lp
      JOIN users u ON lp.user_id = u.id
      JOIN lectures l ON lp.lecture_id = l.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (userId) {
      query += ` AND lp.user_id = $${paramIndex++}`;
      params.push(userId);
    }

    if (lectureId) {
      query += ` AND lp.lecture_id = $${paramIndex++}`;
      params.push(lectureId);
    }

    query += ' ORDER BY lp.last_viewed_at DESC';

    const result = await db.query(query, params);
    return result.rows;
  }

  /**
   * Get top performing content
   */
  async getTopContent(filters = {}) {
    const {
      limit = 10,
      metric = 'views', // views, engagement, quiz_performance
      period = 30 // days
    } = filters;

    const startDate = new Date(Date.now() - period * 24 * 60 * 60 * 1000);

    let query;
    if (metric === 'views') {
      query = `
        SELECT 
          l.id,
          l.title,
          l.description,
          u.name as uploader_name,
          SUM(de.total_views) as total_views,
          COUNT(DISTINCT de.user_id) as unique_viewers,
          AVG(de.total_time_spent::decimal / NULLIF(de.total_views, 0)) as avg_session_duration
        FROM lectures l
        JOIN users u ON l.uploader_id = u.id
        JOIN daily_engagement de ON l.id = de.lecture_id
        WHERE de.date >= $1
        GROUP BY l.id, l.title, l.description, u.name
        ORDER BY total_views DESC
        LIMIT $2
      `;
    } else if (metric === 'engagement') {
      query = `
        SELECT 
          l.id,
          l.title,
          l.description,
          u.name as uploader_name,
          SUM(de.total_time_spent) as total_time_spent,
          SUM(de.summaries_viewed) as summaries_viewed,
          SUM(de.quizzes_attempted) as quizzes_attempted,
          COUNT(DISTINCT de.user_id) as unique_users
        FROM lectures l
        JOIN users u ON l.uploader_id = u.id
        JOIN daily_engagement de ON l.id = de.lecture_id
        WHERE de.date >= $1
        GROUP BY l.id, l.title, l.description, u.name
        ORDER BY total_time_spent DESC
        LIMIT $2
      `;
    } else if (metric === 'quiz_performance') {
      query = `
        SELECT 
          l.id,
          l.title,
          l.description,
          u.name as uploader_name,
          AVG(wqp.average_score) as avg_quiz_score,
          SUM(wqp.quizzes_completed) as total_completions,
          COUNT(DISTINCT wqp.user_id) as unique_quiz_takers
        FROM lectures l
        JOIN users u ON l.uploader_id = u.id
        JOIN weekly_quiz_performance wqp ON l.id = wqp.lecture_id
        WHERE wqp.week_start >= DATE_TRUNC('week', $1::date)
        GROUP BY l.id, l.title, l.description, u.name
        HAVING SUM(wqp.quizzes_completed) > 0
        ORDER BY avg_quiz_score DESC
        LIMIT $2
      `;
    }

    const result = await db.query(query, [startDate, limit]);
    return result.rows;
  }

  /**
   * Get user performance summary
   */
  async getUserPerformance(userId, period = 30) {
    const startDate = new Date(Date.now() - period * 24 * 60 * 60 * 1000);

    const queries = [
      // Overall engagement
      `SELECT 
        COUNT(DISTINCT de.lecture_id) as lectures_viewed,
        SUM(de.total_views) as total_views,
        SUM(de.total_time_spent) as total_time_spent,
        SUM(de.summaries_viewed) as summaries_viewed,
        SUM(de.quizzes_attempted) as quizzes_attempted
      FROM daily_engagement de
      WHERE de.user_id = $1 AND de.date >= $2`,

      // Quiz performance
      `SELECT 
        COUNT(DISTINCT wqp.lecture_id) as lectures_with_quizzes,
        SUM(wqp.quizzes_completed) as quizzes_completed,
        AVG(wqp.average_score) as overall_average_score,
        MAX(wqp.best_score) as best_score
      FROM weekly_quiz_performance wqp
      WHERE wqp.user_id = $1 AND wqp.week_start >= DATE_TRUNC('week', $2::date)`,

      // Learning progress
      `SELECT 
        COUNT(*) as total_lectures_started,
        COUNT(CASE WHEN has_completed_quiz THEN 1 END) as lectures_with_completed_quiz,
        AVG(best_quiz_score) as avg_best_quiz_score
      FROM learning_progress lp
      WHERE lp.user_id = $1`
    ];

    const results = await Promise.all(
      queries.map(query => db.query(query, [userId, startDate]))
    );

    return {
      engagement: results[0].rows[0],
      quiz_performance: results[1].rows[0],
      learning_progress: results[2].rows[0]
    };
  }

  /**
   * Get ETL status
   */
  getETLStatus() {
    return {
      isRunning: this.isETLRunning,
      lastRun: this.lastETLRun,
      nextScheduledRun: this.getNextScheduledRun()
    };
  }

  /**
   * Get next scheduled ETL run time
   */
  getNextScheduledRun() {
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(now.getHours() + 1, 0, 0, 0);
    return nextHour;
  }

  /**
   * Manually trigger ETL pipeline
   */
  async triggerETL() {
    if (this.isETLRunning) {
      throw new Error('ETL pipeline is already running');
    }
    
    return await this.runETLPipeline();
  }
}

export default new ReportsService();

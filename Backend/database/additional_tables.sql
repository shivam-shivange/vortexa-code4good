-- Additional tables required by the Learning App Backend
-- Run this after creating the core tables

-- Add missing columns to existing tables
ALTER TABLE lectures ADD COLUMN IF NOT EXISTS audio_path TEXT;
ALTER TABLE lectures ADD COLUMN IF NOT EXISTS processing_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE lectures ADD COLUMN IF NOT EXISTS ppt_content JSONB;

-- Additional tables for caching and performance
CREATE TABLE IF NOT EXISTS api_cache (
    id SERIAL PRIMARY KEY,
    cache_key VARCHAR(255) UNIQUE NOT NULL,
    cache_value JSONB NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rate limiting table
CREATE TABLE IF NOT EXISTS rate_limit_requests (
    id SERIAL PRIMARY KEY,
    key VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Daily engagement metrics for reports
CREATE TABLE IF NOT EXISTS daily_engagement (
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
);

-- Weekly quiz performance for reports
CREATE TABLE IF NOT EXISTS weekly_quiz_performance (
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
);

-- Learning path progress for reports
CREATE TABLE IF NOT EXISTS learning_progress (
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
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_lectures_uploader ON lectures(uploader_id);
CREATE INDEX IF NOT EXISTS idx_lectures_processing_status ON lectures(processing_status);
CREATE INDEX IF NOT EXISTS idx_transcript_chunks_lecture ON transcript_chunks(lecture_id);
CREATE INDEX IF NOT EXISTS idx_summaries_lecture_lang ON summaries(lecture_id, lang);
CREATE INDEX IF NOT EXISTS idx_quizzes_lecture_lang ON quizzes(lecture_id, lang);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_quiz ON quiz_attempts(user_id, quiz_id);
CREATE INDEX IF NOT EXISTS idx_events_user_lecture ON events(user_id, lecture_id);
CREATE INDEX IF NOT EXISTS idx_events_type_created ON events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_api_cache_key ON api_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_api_cache_expires ON api_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_rate_limit_key_time ON rate_limit_requests(key, created_at);
CREATE INDEX IF NOT EXISTS idx_daily_engagement_date ON daily_engagement(date);
CREATE INDEX IF NOT EXISTS idx_daily_engagement_user ON daily_engagement(user_id);
CREATE INDEX IF NOT EXISTS idx_weekly_quiz_week ON weekly_quiz_performance(week_start);
CREATE INDEX IF NOT EXISTS idx_learning_progress_user ON learning_progress(user_id);

-- Insert a default admin user (password: admin123)
-- Password hash for 'admin123' using bcrypt with 12 rounds
INSERT INTO users (name, email, role, password_hash) 
VALUES ('Admin User', 'admin@learningapp.com', 'admin', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6hsxq8S/EG')
ON CONFLICT (email) DO NOTHING;

-- Insert a test teacher user (password: teacher123)
INSERT INTO users (name, email, role, password_hash) 
VALUES ('Test Teacher', 'teacher@learningapp.com', 'teacher', '$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi')
ON CONFLICT (email) DO NOTHING;

-- Insert a test student user (password: student123)
INSERT INTO users (name, email, role, password_hash) 
VALUES ('Test Student', 'student@learningapp.com', 'student', '$2b$12$Dwt1BjqIBv6VR7vTXSd07OuqJgDQGShoRsLElwhMYr5oJZjLhSRgS')
ON CONFLICT (email) DO NOTHING;

-- Learning App Database Schema
-- Run this script to create all required tables

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    role VARCHAR(20) CHECK (role IN ('student','teacher','admin')) DEFAULT 'student',
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lectures (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    course_id INT,  -- optional if linked to course table
    uploader_id INT REFERENCES users(id) ON DELETE SET NULL,
    video_path TEXT NOT NULL,   -- path to local video file
    ppt_path TEXT,              -- path to local PPT file
    ppt_content JSONB,          -- extracted PPT structure (slides, notes)
    audio_path TEXT,            -- path to extracted audio file
    duration_seconds INT,
    processing_status VARCHAR(20) CHECK (processing_status IN ('pending','processing','completed','failed')) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transcript_chunks (
    id SERIAL PRIMARY KEY,
    lecture_id INT REFERENCES lectures(id) ON DELETE CASCADE,
    start_ts INT NOT NULL,   -- in seconds
    end_ts INT NOT NULL,
    speaker VARCHAR(50),     -- optional speaker diarization
    text TEXT NOT NULL,
    confidence DECIMAL(3,2), -- transcription confidence score
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS summaries (
    id SERIAL PRIMARY KEY,
    lecture_id INT REFERENCES lectures(id) ON DELETE CASCADE,
    lang VARCHAR(10) NOT NULL,   -- e.g. 'en', 'hi', 'mr'
    style VARCHAR(50) CHECK (style IN ('concise','detailed','exam-prep')) DEFAULT 'concise',
    content_md TEXT NOT NULL,   -- store as Markdown
    summary_type VARCHAR(20) CHECK (summary_type IN ('chunk','session')) DEFAULT 'session',
    source_chunks JSONB,        -- IDs of transcript_chunks used
    gemini_model VARCHAR(50),
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quizzes (
    id SERIAL PRIMARY KEY,
    lecture_id INT REFERENCES lectures(id) ON DELETE CASCADE,
    lang VARCHAR(10) NOT NULL,
    difficulty VARCHAR(20) CHECK (difficulty IN ('easy','medium','hard')) DEFAULT 'medium',
    items_json JSONB NOT NULL,  -- full quiz structure {questions:[{q,options[],correct,...}]}
    gemini_model VARCHAR(50),
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
    id SERIAL PRIMARY KEY,
    quiz_id INT REFERENCES quizzes(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    score DECIMAL(5,2),
    attempt_data JSONB,   -- store answers, time_taken, etc.
    attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    lecture_id INT REFERENCES lectures(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,  -- 'lecture.viewed','summary.viewed','quiz.attempted'
    details JSONB,   -- flexible: store {lang:'hi', time_spent:120, summary_id:3}
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Additional tables for caching and performance
CREATE TABLE IF NOT EXISTS api_cache (
    id SERIAL PRIMARY KEY,
    cache_key VARCHAR(255) UNIQUE NOT NULL,
    cache_value JSONB NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_lectures_uploader ON lectures(uploader_id);
CREATE INDEX IF NOT EXISTS idx_transcript_chunks_lecture ON transcript_chunks(lecture_id);
CREATE INDEX IF NOT EXISTS idx_summaries_lecture_lang ON summaries(lecture_id, lang);
CREATE INDEX IF NOT EXISTS idx_quizzes_lecture_lang ON quizzes(lecture_id, lang);
CREATE INDEX IF NOT EXISTS idx_events_user_lecture ON events(user_id, lecture_id);
CREATE INDEX IF NOT EXISTS idx_events_type_created ON events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_api_cache_key ON api_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_api_cache_expires ON api_cache(expires_at);

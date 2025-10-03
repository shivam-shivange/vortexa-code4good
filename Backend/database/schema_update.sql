-- Drop and recreate quiz attempts table with updated schema
DROP TABLE IF EXISTS quiz_attempts;
CREATE TABLE quiz_attempts (
    id SERIAL PRIMARY KEY,
    quiz_id INT REFERENCES quizzes(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    lecture_id INT REFERENCES lectures(id) ON DELETE CASCADE,
    answers_json JSONB,
    score INT DEFAULT 0,
    total_questions INT DEFAULT 0,
    attempted_questions INT DEFAULT 0,
    correct_answers INT DEFAULT 0,
    time_taken INT DEFAULT 0,  -- in seconds
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user ON quiz_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz ON quiz_attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_lecture ON quiz_attempts(lecture_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_lecture_difficulty ON quizzes(lecture_id, difficulty);

-- Add additional columns to quizzes if not exists
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS total_questions INT DEFAULT 0;
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS has_explanations BOOLEAN DEFAULT false;

-- Add constraint to items_json to ensure it's valid JSON
ALTER TABLE quizzes DROP CONSTRAINT IF EXISTS items_json_check;
ALTER TABLE quizzes ADD CONSTRAINT items_json_check CHECK (
    jsonb_typeof(items_json->'questions') = 'array'
);
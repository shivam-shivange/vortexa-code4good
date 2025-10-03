-- Update quizzes table to support longer language names
ALTER TABLE quizzes ALTER COLUMN lang TYPE VARCHAR(50);

-- Update summaries table to support longer language names
ALTER TABLE summaries ALTER COLUMN lang TYPE VARCHAR(50);
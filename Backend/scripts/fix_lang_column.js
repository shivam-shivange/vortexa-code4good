import pool from '../utils/db.js';

async function alterColumnLength() {
  try {
    console.log('Altering quizzes table lang column length...');
    await pool.query('ALTER TABLE quizzes ALTER COLUMN lang TYPE VARCHAR(50)');
    console.log('Successfully altered quizzes.lang column to VARCHAR(50)');
  } catch (error) {
    console.error('Error altering column:', error);
  }
}

alterColumnLength();
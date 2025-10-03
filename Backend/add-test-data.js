import db from './utils/db.js';
import fs from 'fs/promises';

async function addTestData() {
  try {
    console.log('Adding test transcript data...');
    
    // Read the SQL file
    const sql = await fs.readFile('./test-transcript.sql', 'utf8');
    
    // Execute the SQL
    await db.query(sql);
    
    console.log('✅ Test transcript data added successfully!');
    
    // Verify the data was added
    const result = await db.query('SELECT COUNT(*) as count FROM transcript_chunks WHERE lecture_id = 2');
    console.log(`📊 Lecture 2 now has ${result.rows[0].count} transcript chunks`);
    
    // Check if lecture 2 exists
    const lectureResult = await db.query('SELECT id, title FROM lectures WHERE id = 2');
    if (lectureResult.rows.length > 0) {
      console.log(`📚 Lecture found: "${lectureResult.rows[0].title}"`);
    } else {
      console.log('⚠️  Lecture 2 not found. Creating a test lecture...');
      
      // Create a test lecture
      await db.query(`
        INSERT INTO lectures (id, title, description, uploader_id, processing_status, created_at)
        VALUES (2, 'Introduction to AI and Machine Learning', 'A comprehensive overview of artificial intelligence and machine learning concepts', 1, 'completed', NOW())
        ON CONFLICT (id) DO NOTHING
      `);
      
      console.log('✅ Test lecture created!');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding test data:', error);
    process.exit(1);
  }
}

addTestData();

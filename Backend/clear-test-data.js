import db from './utils/db.js';

async function clearTestData() {
  try {
    console.log('🧹 Clearing test transcript data...');
    
    // Remove test transcript chunks
    const result = await db.query('DELETE FROM transcript_chunks WHERE lecture_id = 2');
    console.log(`✅ Removed ${result.rowCount} test transcript chunks`);
    
    // Clear cached summaries and quizzes
    const summaryResult = await db.query('DELETE FROM summaries WHERE lecture_id = 2');
    console.log(`✅ Cleared ${summaryResult.rowCount} cached summaries`);
    
    const quizResult = await db.query('DELETE FROM quizzes WHERE lecture_id = 2');
    console.log(`✅ Cleared ${quizResult.rowCount} cached quizzes`);
    
    // Reset lecture processing status to allow reprocessing
    await db.query(`
      UPDATE lectures 
      SET processing_status = 'pending' 
      WHERE id = 2 AND processing_status = 'completed'
    `);
    
    console.log('🎉 Test data cleared! The system will now use real video processing.');
    console.log('📝 Next steps:');
    console.log('   1. Upload a new video to trigger real ASR processing');
    console.log('   2. Or reprocess existing videos to generate real transcripts');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error clearing test data:', error);
    process.exit(1);
  }
}

clearTestData();

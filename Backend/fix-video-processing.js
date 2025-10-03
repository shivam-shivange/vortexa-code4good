import db from './utils/db.js';

async function fixVideoProcessing() {
  try {
    console.log('🔧 Fixing video processing for real ASR...');
    
    // 1. Clear any test transcript data that might interfere
    console.log('🧹 Clearing test transcript data...');
    await db.query('DELETE FROM transcript_chunks WHERE lecture_id = 2 AND speaker = $1', ['speaker_1']);
    
    // 2. Clear cached summaries and quizzes to force regeneration from real data
    console.log('🗑️ Clearing cached AI content...');
    await db.query('DELETE FROM summaries WHERE lecture_id = 2');
    await db.query('DELETE FROM quizzes WHERE lecture_id = 2');
    
    // 3. Check current lecture status
    const lectureResult = await db.query('SELECT id, title, processing_status, audio_path FROM lectures WHERE id = 2');
    
    if (lectureResult.rows.length === 0) {
      console.log('📝 No lecture with ID 2 found. Upload a video to test real ASR processing.');
      console.log('');
      console.log('🎯 To test real ASR processing:');
      console.log('   1. Go to frontend (http://localhost:3000)');
      console.log('   2. Login and go to Upload section');
      console.log('   3. Upload a video file');
      console.log('   4. Wait for processing to complete');
      console.log('   5. Then generate summaries and quizzes from real transcript');
    } else {
      const lecture = lectureResult.rows[0];
      console.log(`📚 Found lecture: "${lecture.title}"`);
      console.log(`📊 Status: ${lecture.processing_status}`);
      
      // Check if there are any real transcript chunks (not test data)
      const transcriptResult = await db.query(`
        SELECT COUNT(*) as count 
        FROM transcript_chunks 
        WHERE lecture_id = 2 AND (speaker != 'speaker_1' OR speaker IS NULL)
      `);
      
      const realTranscriptCount = transcriptResult.rows[0].count;
      
      if (realTranscriptCount > 0) {
        console.log(`✅ Found ${realTranscriptCount} real transcript chunks from video processing`);
        console.log('🎉 You can now generate summaries and quizzes from real video content!');
      } else {
        console.log('⚠️  No real transcript found. The video may need reprocessing.');
        
        if (lecture.processing_status === 'completed' && lecture.audio_path) {
          console.log('🔄 Setting lecture for reprocessing...');
          await db.query('UPDATE lectures SET processing_status = $1 WHERE id = 2', ['pending']);
          console.log('✅ Lecture marked for reprocessing. Restart backend to trigger ASR.');
        } else {
          console.log('📤 Upload a new video to trigger real ASR processing.');
        }
      }
    }
    
    console.log('');
    console.log('🎯 Summary:');
    console.log('   ✅ Test data cleared');
    console.log('   ✅ Cached AI content cleared');
    console.log('   ✅ System ready for real video processing');
    console.log('');
    console.log('📋 Next steps:');
    console.log('   1. Upload a video through the frontend');
    console.log('   2. Wait for ASR processing to complete');
    console.log('   3. Generate summaries and quizzes from real speech recognition');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing video processing:', error);
    process.exit(1);
  }
}

fixVideoProcessing();

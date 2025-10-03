import db from './utils/db.js';

async function debugQuizIssue() {
  try {
    console.log('🔍 Debugging quiz generation issue...\n');
    
    // 1. Check what lectures exist
    console.log('📚 Checking lectures:');
    const lectures = await db.query('SELECT id, title, processing_status FROM lectures ORDER BY id');
    
    if (lectures.rows.length === 0) {
      console.log('❌ No lectures found! You need to upload a video first.');
      console.log('\n🎯 Solution: Upload a video through the frontend to trigger real ASR processing.');
      process.exit(0);
    }
    
    lectures.rows.forEach(lecture => {
      console.log(`   📖 ID ${lecture.id}: "${lecture.title}" (${lecture.processing_status})`);
    });
    
    // 2. Check transcript data for each lecture
    console.log('\n📝 Checking transcript data:');
    for (const lecture of lectures.rows) {
      const transcripts = await db.query(
        'SELECT COUNT(*) as count, MIN(start_ts) as first_chunk, MAX(end_ts) as last_chunk FROM transcript_chunks WHERE lecture_id = $1',
        [lecture.id]
      );
      
      const count = transcripts.rows[0].count;
      if (count > 0) {
        console.log(`   ✅ Lecture ${lecture.id}: ${count} transcript chunks (${transcripts.rows[0].first_chunk}s - ${transcripts.rows[0].last_chunk}s)`);
        
        // Show sample transcript text
        const sample = await db.query(
          'SELECT text FROM transcript_chunks WHERE lecture_id = $1 ORDER BY start_ts LIMIT 1',
          [lecture.id]
        );
        console.log(`      Sample: "${sample.rows[0].text.substring(0, 100)}..."`);
      } else {
        console.log(`   ❌ Lecture ${lecture.id}: No transcript chunks found`);
      }
    }
    
    // 3. Check if Gemini API key is working
    console.log('\n🔑 Checking Gemini API configuration:');
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      console.log(`   ✅ Gemini API key configured (${geminiKey.substring(0, 10)}...)`);
    } else {
      console.log('   ❌ Gemini API key not found in environment variables');
    }
    
    // 4. Test a simple Gemini request
    console.log('\n🧪 Testing Gemini API connection:');
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const client = new GoogleGenerativeAI(geminiKey);
      const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });
      
      const result = await model.generateContent('Generate a simple JSON object with one question about AI: {"questions":[{"question":"What is AI?","options":["A","B","C","D"],"correct_answer":"A"}]}');
      const response = result.response.text();
      console.log('   ✅ Gemini API is working');
      console.log(`   📝 Sample response: ${response.substring(0, 100)}...`);
    } catch (error) {
      console.log('   ❌ Gemini API test failed:', error.message);
    }
    
    // 5. Provide specific solution
    console.log('\n🎯 SOLUTION:');
    
    const hasTranscripts = lectures.rows.some(async (lecture) => {
      const result = await db.query('SELECT COUNT(*) as count FROM transcript_chunks WHERE lecture_id = $1', [lecture.id]);
      return result.rows[0].count > 0;
    });
    
    if (!hasTranscripts) {
      console.log('❌ ROOT CAUSE: No transcript data from real video processing');
      console.log('\n📋 Steps to fix:');
      console.log('   1. Delete the test-transcript.sql file (it\'s interfering)');
      console.log('   2. Upload a NEW video through the frontend');
      console.log('   3. Wait for ASR processing to complete');
      console.log('   4. Then try generating quiz from real speech data');
    } else {
      console.log('✅ Transcript data exists. Quiz generation should work.');
      console.log('   If quiz still fails, check browser console for detailed error messages.');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Debug failed:', error);
    process.exit(1);
  }
}

debugQuizIssue();

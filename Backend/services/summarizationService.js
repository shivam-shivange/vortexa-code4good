import axios from 'axios';
import pool from '../utils/db.js';

export const generateSummary = async (lectureId, targetLang='en', style='concise') => {
  const chunks = (await pool.query('SELECT * FROM transcript_chunks WHERE lecture_id=$1', [lectureId])).rows;

  // Call Gemini API for each chunk
  for (const chunk of chunks) {
    const prompt = `
Summarize the following transcript chunk:
Transcript: ${chunk.text}
Language: ${targetLang}
Style: ${style}
Return as JSON with bullets and timestamps.
    `;
    // Replace with actual Gemini API call
    const summaryResult = { bullets: ['Point1','Point2'], timestamps: [chunk.start_ts, chunk.end_ts] };

    await pool.query(
      'INSERT INTO summaries(lecture_id, lang, style, content_md, summary_type, source_chunks, gemini_model) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [lectureId, targetLang, style, JSON.stringify(summaryResult.bullets), 'chunk', JSON.stringify([chunk.id]), 'gemini-v1']
    );
  }

  // Aggregate session summary
  const sessionPrompt = `Aggregate all chunk summaries in ${targetLang}`;
  // TODO: Gemini API call for session summary
};

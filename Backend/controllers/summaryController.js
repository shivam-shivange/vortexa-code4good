import pool from '../utils/db.js';
import { generateSummary as generateSummaryService } from '../services/summarizationService.js';

/**
 * Get summaries for a lecture
 * Query params:
 *   lang = language code ('en', 'hi', etc.)
 *   style = 'concise', 'detailed', 'exam-prep'
 */
export const getSummary = async (req, res) => {
  try {
    const lectureId = req.params.id;
    const lang = req.query.lang || 'en';
    const style = req.query.style || 'concise';

    // Check if session summary already exists
    const existingSummary = (await pool.query(
      'SELECT * FROM summaries WHERE lecture_id=$1 AND lang=$2 AND style=$3 AND summary_type=$4',
      [lectureId, lang, style, 'session']
    )).rows[0];

    if (existingSummary) return res.json(existingSummary);

    // If not, generate via Gemini
    await generateSummaryService(lectureId, lang, style);

    const newSummary = (await pool.query(
      'SELECT * FROM summaries WHERE lecture_id=$1 AND lang=$2 AND style=$3 AND summary_type=$4',
      [lectureId, lang, style, 'session']
    )).rows[0];

    res.json(newSummary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch or generate summary' });
  }
};

/**
 * Optional: Regenerate summary in different language
 */
export const regenerateSummary = async (req, res) => {
  try {
    const lectureId = req.params.id;
    const { lang, style } = req.body;

    await generateSummaryService(lectureId, lang, style);

    const updatedSummary = (await pool.query(
      'SELECT * FROM summaries WHERE lecture_id=$1 AND lang=$2 AND style=$3 AND summary_type=$4',
      [lectureId, lang, style, 'session']
    )).rows[0];

    res.json(updatedSummary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to regenerate summary' });
  }
};

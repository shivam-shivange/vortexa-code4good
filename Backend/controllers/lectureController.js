import db from '../utils/db.js';
import enhancedIngestionService from '../services/enhancedIngestionService.js';
import geminiFilesService from '../services/geminiFilesService.js';
import cacheService from '../services/cacheService.js';
import xapiMiddleware from '../middleware/xapiMiddleware.js';

export const uploadLecture = async (req, res) => {
  try {
    const { title, description, language = 'en' } = req.body;
    const uploader_id = req.user.id;
    
    // Validate required files
    if (!req.files || !req.files.video) {
      return res.status(400).json({ 
        error: 'Video file is required' 
      });
    }

    const files = {
      video: {
        path: req.files.video[0].path,
        originalName: req.files.video[0].originalname,
        size: req.files.video[0].size
      }
    };

    // Add PPT file if provided
    if (req.files.ppt && req.files.ppt[0]) {
      files.ppt = {
        path: req.files.ppt[0].path,
        originalName: req.files.ppt[0].originalname,
        size: req.files.ppt[0].size
      };
    }

    const lectureData = {
      title,
      description,
      uploader_id,
      language
    };

    // Start processing asynchronously
    const processingResult = await enhancedIngestionService.processLecture(lectureData, files);
    
    // Log lecture upload event
    if (req.logXAPIEvent) {
      await req.logXAPIEvent('lecture.uploaded', {
        lecture_id: processingResult.lectureId,
        file_size: files.video.size,
        has_ppt: !!files.ppt
      });
    }

    res.json({ 
      success: true, 
      message: 'Lecture uploaded and processing started',
      lectureId: processingResult.lectureId,
      processing: processingResult
    });

  } catch (error) {
    console.error('Lecture upload error:', error);
    res.status(500).json({ 
      error: error.message || 'Lecture upload failed' 
    });
  }
};

export const getLectures = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      uploader_id,
      search 
    } = req.query;

    const offset = (page - 1) * limit;
    let query = `
      SELECT 
        l.*,
        u.name as uploader_name,
        u.email as uploader_email,
        COUNT(tc.id) as transcript_chunks,
        COUNT(DISTINCT s.id) as summaries_count,
        COUNT(DISTINCT q.id) as quizzes_count
      FROM lectures l
      LEFT JOIN users u ON l.uploader_id = u.id
      LEFT JOIN transcript_chunks tc ON l.id = tc.lecture_id
      LEFT JOIN summaries s ON l.id = s.lecture_id
      LEFT JOIN quizzes q ON l.id = q.lecture_id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND l.processing_status = $${paramIndex++}`;
      params.push(status);
    }

    if (uploader_id) {
      query += ` AND l.uploader_id = $${paramIndex++}`;
      params.push(uploader_id);
    }

    if (search) {
      query += ` AND (l.title ILIKE $${paramIndex++} OR l.description ILIKE $${paramIndex++})`;
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ` 
      GROUP BY l.id, u.name, u.email
      ORDER BY l.created_at DESC 
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    
    params.push(limit, offset);

    const result = await db.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM lectures l WHERE 1=1';
    const countParams = [];
    let countParamIndex = 1;

    if (status) {
      countQuery += ` AND l.processing_status = $${countParamIndex++}`;
      countParams.push(status);
    }

    if (uploader_id) {
      countQuery += ` AND l.uploader_id = $${countParamIndex++}`;
      countParams.push(uploader_id);
    }

    if (search) {
      countQuery += ` AND (l.title ILIKE $${countParamIndex++} OR l.description ILIKE $${countParamIndex++})`;
      countParams.push(`%${search}%`, `%${search}%`);
    }

    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      lectures: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get lectures error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to fetch lectures' 
    });
  }
};

export const getLectureById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        l.*,
        u.name as uploader_name,
        u.email as uploader_email,
        u.role as uploader_role
      FROM lectures l
      LEFT JOIN users u ON l.uploader_id = u.id
      WHERE l.id = $1
    `;

    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lecture not found' });
    }

    const lecture = result.rows[0];

    // Get transcript chunks
    const transcriptQuery = `
      SELECT * FROM transcript_chunks 
      WHERE lecture_id = $1 
      ORDER BY start_ts
    `;
    const transcriptResult = await db.query(transcriptQuery, [id]);

    // Get available summaries
    const summariesQuery = `
      SELECT id, lang, style, summary_type, generated_at 
      FROM summaries 
      WHERE lecture_id = $1
    `;
    const summariesResult = await db.query(summariesQuery, [id]);

    // Get available quizzes
    const quizzesQuery = `
      SELECT id, lang, difficulty, generated_at 
      FROM quizzes 
      WHERE lecture_id = $1
    `;
    const quizzesResult = await db.query(quizzesQuery, [id]);

    // Log lecture view event
    if (req.logXAPIEvent && req.user) {
      req.lecture = lecture; // Set lecture context for xAPI
      await req.logXAPIEvent('lecture.viewed', {
        lecture_id: parseInt(id),
        duration: lecture.duration_seconds
      });
    }

    res.json({
      lecture: lecture,
      transcript: transcriptResult.rows,
      summaries: summariesResult.rows,
      quizzes: quizzesResult.rows
    });

  } catch (error) {
    console.error('Get lecture by ID error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to fetch lecture' 
    });
  }
};

export const getLectureSummary = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      lang = 'en', 
      style = 'concise',
      regenerate = false 
    } = req.query;

    // Check if lecture exists
    const lectureQuery = 'SELECT * FROM lectures WHERE id = $1';
    const lectureResult = await db.query(lectureQuery, [id]);

    if (lectureResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lecture not found' });
    }

    const lecture = lectureResult.rows[0];

    // Check for existing summary if not regenerating
    if (!regenerate) {
      const existingQuery = `
        SELECT * FROM summaries 
        WHERE lecture_id = $1 AND lang = $2 AND style = $3
        ORDER BY generated_at DESC
        LIMIT 1
      `;
      
      const existingResult = await db.query(existingQuery, [id, lang, style]);
      
      if (existingResult.rows.length > 0) {
        const summary = existingResult.rows[0];
        
        // Log summary view event
        if (req.logXAPIEvent && req.user) {
          req.lecture = lecture;
          await req.logXAPIEvent('summary.viewed', {
            summary_id: summary.id,
            language: lang,
            style: style
          });
        }

        return res.json({
          summary: summary,
          cached: true
        });
      }
    }

    // Generate new summary using cache
    const summaryResult = await cacheService.cacheSummary(
      parseInt(id),
      { lang, style },
      async () => {
        // Get transcript content
        const transcriptQuery = `
          SELECT text FROM transcript_chunks 
          WHERE lecture_id = $1 
          ORDER BY start_ts
        `;
        const transcriptResult = await db.query(transcriptQuery, [id]);
        const fullTranscript = transcriptResult.rows.map(row => row.text).join(' ');

        // Generate summary
        return await geminiFilesService.generateSummary(fullTranscript, {
          style: style,
          language: lang
        });
      }
    );

    if (!summaryResult.success) {
      return res.status(500).json({ 
        error: 'Failed to generate summary' 
      });
    }

    // Store in database
    const insertQuery = `
      INSERT INTO summaries (lecture_id, lang, style, content_md, gemini_model)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const insertResult = await db.query(insertQuery, [
      id,
      lang,
      style,
      summaryResult.summary,
      'gemini-2.5-flash'
    ]);

    const summary = insertResult.rows[0];

    // Log summary view event
    if (req.logXAPIEvent && req.user) {
      req.lecture = lecture;
      await req.logXAPIEvent('summary.viewed', {
        summary_id: summary.id,
        language: lang,
        style: style,
        generated: true
      });
    }

    res.json({
      summary: summary,
      cached: false,
      generated: true
    });

  } catch (error) {
    console.error('Get lecture summary error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to get lecture summary' 
    });
  }
};

export const getLectureQuiz = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      lang = 'en', 
      difficulty = 'medium',
      question_count = 5,
      regenerate = false 
    } = req.query;

    // Check if lecture exists
    const lectureQuery = 'SELECT * FROM lectures WHERE id = $1';
    const lectureResult = await db.query(lectureQuery, [id]);

    if (lectureResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lecture not found' });
    }

    const lecture = lectureResult.rows[0];

    // Check for existing quiz if not regenerating
    if (!regenerate) {
      const existingQuery = `
        SELECT * FROM quizzes 
        WHERE lecture_id = $1 AND lang = $2 AND difficulty = $3
        ORDER BY generated_at DESC
        LIMIT 1
      `;
      
      const existingResult = await db.query(existingQuery, [id, lang, difficulty]);
      
      if (existingResult.rows.length > 0) {
        const quiz = existingResult.rows[0];
        
        // Parse the items_json back to object for response
        if (quiz.items_json && typeof quiz.items_json === 'string') {
          try {
            quiz.items_json = JSON.parse(quiz.items_json);
          } catch (e) {
            console.error('Failed to parse cached quiz JSON:', e);
          }
        }
        
        return res.json({
          quiz: quiz,
          cached: true
        });
      }
    }

    // Generate new quiz using cache
    const quizResult = await cacheService.cacheQuiz(
      parseInt(id),
      { lang, difficulty },
      async () => {
        // Get transcript content
        const transcriptQuery = `
          SELECT text FROM transcript_chunks 
          WHERE lecture_id = $1 
          ORDER BY start_ts
        `;
        const transcriptResult = await db.query(transcriptQuery, [id]);
        const fullTranscript = transcriptResult.rows.map(row => row.text).join(' ');

        // Generate quiz
        return await geminiFilesService.generateQuiz(fullTranscript, {
          difficulty: difficulty,
          language: lang,
          numQuestions: parseInt(question_count) || 5
        });
      }
    );

    if (!quizResult.success) {
      return res.status(500).json({ 
        error: 'Failed to generate quiz' 
      });
    }

    // Store in database
    const insertQuery = `
      INSERT INTO quizzes (lecture_id, lang, difficulty, items_json, gemini_model)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const insertResult = await db.query(insertQuery, [
      id,
      lang,
      difficulty,
      JSON.stringify(quizResult.quiz),
      'gemini-2.5-flash'
    ]);

    const quiz = insertResult.rows[0];
    
    // Parse the items_json back to object for response
    if (quiz.items_json && typeof quiz.items_json === 'string') {
      try {
        quiz.items_json = JSON.parse(quiz.items_json);
      } catch (e) {
        console.error('Failed to parse stored quiz JSON:', e);
      }
    }

    res.json({
      quiz: quiz,
      cached: false,
      generated: true
    });

  } catch (error) {
    console.error('Get lecture quiz error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to get lecture quiz' 
    });
  }
};

export const getProcessingStatus = async (req, res) => {
  try {
    const { id } = req.params;

    // Get status from database
    const query = 'SELECT processing_status FROM lectures WHERE id = $1';
    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lecture not found' });
    }

    const dbStatus = result.rows[0].processing_status;

    // Get detailed status from ingestion service
    const detailedStatus = enhancedIngestionService.getProcessingStatus(parseInt(id));

    res.json({
      lectureId: parseInt(id),
      status: dbStatus,
      details: detailedStatus
    });

  } catch (error) {
    console.error('Get processing status error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to get processing status' 
    });
  }
};

export const reprocessLecture = async (req, res) => {
  try {
    const { id } = req.params;
    const options = req.body;

    const result = await enhancedIngestionService.reprocessLecture(parseInt(id), options);

    res.json(result);

  } catch (error) {
    console.error('Reprocess lecture error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to reprocess lecture' 
    });
  }
};

export const deleteLecture = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if lecture exists and user has permission
    const lectureQuery = 'SELECT * FROM lectures WHERE id = $1';
    const lectureResult = await db.query(lectureQuery, [id]);

    if (lectureResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lecture not found' });
    }

    const lecture = lectureResult.rows[0];

    // Check permission (only uploader or admin can delete)
    if (lecture.uploader_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Delete lecture (cascade will handle related records)
    const deleteQuery = 'DELETE FROM lectures WHERE id = $1';
    await db.query(deleteQuery, [id]);

    // Invalidate cache
    await cacheService.invalidateLectureCache(parseInt(id));

    res.json({ 
      success: true, 
      message: 'Lecture deleted successfully' 
    });

  } catch (error) {
    console.error('Delete lecture error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to delete lecture' 
    });
  }
};

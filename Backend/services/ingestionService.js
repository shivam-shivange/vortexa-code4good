import fs from 'fs/promises';
import path from 'path';
import db from '../utils/db.js';
import audioExtractionService from './audioExtractionService.js';
import geminiService from './geminiService.js';
import pptExtractionService from './pptExtractionService.js';
import cacheService from './cacheService.js';

class IngestionService {
  constructor() {
    this.processingQueue = new Map();
  }

  /**
   * Process a complete lecture with video and optional PPT
   * @param {Object} lectureData - Lecture information
   * @param {Object} files - Uploaded files (video, ppt)
   * @returns {Promise<Object>} - Processing result
   */
  async processLecture(lectureData, files) {
    const lectureId = `temp_${Date.now()}`;
    
    try {
      // Mark as processing
      this.processingQueue.set(lectureId, { status: 'processing', progress: 0 });

      // Step 1: Insert lecture metadata into database
      const lecture = await this.createLectureRecord(lectureData, files);
      const actualLectureId = lecture.id;
      
      // Update processing queue with actual ID
      this.processingQueue.delete(lectureId);
      this.processingQueue.set(actualLectureId, { status: 'processing', progress: 10 });

      // Step 2: Extract audio from video
      console.log('Extracting audio from video...');
      const audioResult = await audioExtractionService.extractAudio(files.video.path);
      
      if (!audioResult.success) {
        throw new Error(`Audio extraction failed: ${audioResult.error}`);
      }

      // Update lecture with audio path
      await this.updateLectureAudioPath(actualLectureId, audioResult.relativePath);
      this.updateProgress(actualLectureId, 30);

      // Step 3: Transcribe audio using Gemini
      console.log('Transcribing audio...');
      const transcriptionResult = await geminiService.transcribeAudio(audioResult.audioPath, {
        includeTimestamps: true,
        includeSpeakerLabels: true,
        language: lectureData.language || 'auto'
      });

      if (!transcriptionResult.success) {
        throw new Error(`Transcription failed: ${transcriptionResult.error}`);
      }

      // Step 4: Store transcript chunks in database
      await this.storeTranscriptChunks(actualLectureId, transcriptionResult.chunks);
      this.updateProgress(actualLectureId, 60);

      // Step 5: Extract text from PPT if provided
      let pptText = '';
      if (files.ppt) {
        console.log('Extracting text from PPT...');
        const pptResult = await pptExtractionService.extractTextFromPPT(files.ppt.path);
        
        if (pptResult.success) {
          pptText = pptResult.slides.map(slide => 
            `Slide ${slide.slideNumber}: ${slide.title}\n${slide.content}`
          ).join('\n\n');
          
          // Store PPT content in a separate table or as metadata
          await this.storePPTContent(actualLectureId, pptResult);
        }
      }
      this.updateProgress(actualLectureId, 80);

      // Step 6: Generate initial summary and quiz
      const fullContent = transcriptionResult.transcript + (pptText ? '\n\nSlide Content:\n' + pptText : '');
      
      // Generate default summary
      const summaryResult = await geminiService.generateSummary(fullContent, {
        style: 'concise',
        language: lectureData.language || 'en'
      });

      if (summaryResult.success) {
        await this.storeSummary(actualLectureId, summaryResult, lectureData.language || 'en');
      }

      // Generate default quiz
      const quizResult = await geminiService.generateQuiz(fullContent, {
        difficulty: 'medium',
        language: lectureData.language || 'en',
        numQuestions: 10
      });

      if (quizResult.success) {
        await this.storeQuiz(actualLectureId, quizResult, lectureData.language || 'en');
      }

      // Step 7: Update lecture status to completed
      await this.updateLectureStatus(actualLectureId, 'completed');
      this.updateProgress(actualLectureId, 100);

      // Clean up processing queue
      this.processingQueue.delete(actualLectureId);

      return {
        success: true,
        lectureId: actualLectureId,
        lecture: lecture,
        transcription: {
          totalChunks: transcriptionResult.chunks.length,
          language: transcriptionResult.metadata.language
        },
        ppt: files.ppt ? {
          totalSlides: pptText ? pptText.split('Slide ').length - 1 : 0
        } : null,
        summary: summaryResult.success,
        quiz: quizResult.success
      };

    } catch (error) {
      console.error('Lecture processing failed:', error);
      
      // Update status to failed
      if (this.processingQueue.has(lectureId)) {
        this.processingQueue.set(lectureId, { status: 'failed', error: error.message });
      }
      
      // If we have a lecture ID, update database status
      if (lectureData.id) {
        await this.updateLectureStatus(lectureData.id, 'failed');
      }

      throw error;
    }
  }

  /**
   * Create lecture record in database
   * @param {Object} lectureData - Lecture information
   * @param {Object} files - Uploaded files
   * @returns {Promise<Object>} - Created lecture record
   */
  async createLectureRecord(lectureData, files) {
    const query = `
      INSERT INTO lectures (title, description, uploader_id, video_path, ppt_path, processing_status)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const values = [
      lectureData.title,
      lectureData.description,
      lectureData.uploader_id,
      files.video.path,
      files.ppt ? files.ppt.path : null,
      'processing'
    ];
    
    const result = await db.query(query, values);
    return result.rows[0];
  }

  /**
   * Update lecture with audio path
   * @param {number} lectureId - Lecture ID
   * @param {string} audioPath - Path to extracted audio
   */
  async updateLectureAudioPath(lectureId, audioPath) {
    const query = 'UPDATE lectures SET audio_path = $1 WHERE id = $2';
    await db.query(query, [audioPath, lectureId]);
  }

  /**
   * Store transcript chunks in database
   * @param {number} lectureId - Lecture ID
   * @param {Array} chunks - Transcript chunks
   */
  async storeTranscriptChunks(lectureId, chunks) {
    const query = `
      INSERT INTO transcript_chunks (lecture_id, start_ts, end_ts, speaker, text)
      VALUES ($1, $2, $3, $4, $5)
    `;

    for (const chunk of chunks) {
      await db.query(query, [
        lectureId,
        chunk.start_ts,
        chunk.end_ts,
        chunk.speaker,
        chunk.text
      ]);
    }
  }

  /**
   * Store PPT content (could be in a separate table or as JSON)
   * @param {number} lectureId - Lecture ID
   * @param {Object} pptResult - PPT extraction result
   */
  async storePPTContent(lectureId, pptResult) {
    // Store as JSON in lecture metadata or create a separate table
    const query = `
      UPDATE lectures 
      SET ppt_content = $1 
      WHERE id = $2
    `;
    
    await db.query(query, [JSON.stringify(pptResult), lectureId]);
  }

  /**
   * Store summary in database
   * @param {number} lectureId - Lecture ID
   * @param {Object} summaryResult - Summary generation result
   * @param {string} language - Language code
   */
  async storeSummary(lectureId, summaryResult, language) {
    const query = `
      INSERT INTO summaries (lecture_id, lang, content_md, gemini_model)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `;

    const values = [
      lectureId,
      language,
      summaryResult.summary,
      'gemini-2.5-flash'
    ];

    await db.query(query, values);
  }

  /**
   * Store quiz in database
   * @param {number} lectureId - Lecture ID
   * @param {Object} quizResult - Quiz generation result
   * @param {string} language - Language code
   */
  async storeQuiz(lectureId, quizResult, language) {
    const query = `
      INSERT INTO quizzes (lecture_id, lang, items_json, gemini_model)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `;

    const values = [
      lectureId,
      language,
      JSON.stringify(quizResult.quiz),
      'gemini-2.5-flash'
    ];

    await db.query(query, values);
  }

  /**
   * Update lecture processing status
   * @param {number} lectureId - Lecture ID
   * @param {string} status - New status
   */
  async updateLectureStatus(lectureId, status) {
    const query = 'UPDATE lectures SET processing_status = $1 WHERE id = $2';
    await db.query(query, [status, lectureId]);
  }

  /**
   * Update processing progress
   * @param {number} lectureId - Lecture ID
   * @param {number} progress - Progress percentage
   */
  updateProgress(lectureId, progress) {
    if (this.processingQueue.has(lectureId)) {
      const current = this.processingQueue.get(lectureId);
      this.processingQueue.set(lectureId, { ...current, progress });
    }
  }

  /**
   * Get processing status
   * @param {number} lectureId - Lecture ID
   * @returns {Object} - Processing status
   */
  getProcessingStatus(lectureId) {
    return this.processingQueue.get(lectureId) || { status: 'not_found' };
  }

  /**
   * Reprocess lecture with different options
   * @param {number} lectureId - Lecture ID
   * @param {Object} options - Reprocessing options
   */
  async reprocessLecture(lectureId, options = {}) {
    try {
      // Get existing lecture
      const lectureQuery = 'SELECT * FROM lectures WHERE id = $1';
      const lectureResult = await db.query(lectureQuery, [lectureId]);
      
      if (lectureResult.rows.length === 0) {
        throw new Error('Lecture not found');
      }

      const lecture = lectureResult.rows[0];
      
      // Mark as processing
      this.processingQueue.set(lectureId, { status: 'reprocessing', progress: 0 });
      await this.updateLectureStatus(lectureId, 'processing');

      // Reprocess based on options
      if (options.regenerateSummary) {
        await this.regenerateSummary(lectureId, options.summaryOptions);
      }

      if (options.regenerateQuiz) {
        await this.regenerateQuiz(lectureId, options.quizOptions);
      }

      if (options.retranscribe) {
        await this.retranscribeAudio(lectureId, options.transcriptionOptions);
      }

      await this.updateLectureStatus(lectureId, 'completed');
      this.processingQueue.delete(lectureId);

      return { success: true, message: 'Lecture reprocessed successfully' };

    } catch (error) {
      console.error('Lecture reprocessing failed:', error);
      await this.updateLectureStatus(lectureId, 'failed');
      this.processingQueue.delete(lectureId);
      throw error;
    }
  }

  /**
   * Regenerate summary for existing lecture
   * @param {number} lectureId - Lecture ID
   * @param {Object} options - Summary options
   */
  async regenerateSummary(lectureId, options = {}) {
    // Get transcript content
    const transcriptQuery = 'SELECT text FROM transcript_chunks WHERE lecture_id = $1 ORDER BY start_ts';
    const transcriptResult = await db.query(transcriptQuery, [lectureId]);
    
    const fullTranscript = transcriptResult.rows.map(row => row.text).join(' ');
    
    // Generate new summary
    const summaryResult = await geminiService.generateSummary(fullTranscript, options);
    
    if (summaryResult.success) {
      // Delete old summary and insert new one
      await db.query('DELETE FROM summaries WHERE lecture_id = $1 AND lang = $2', 
        [lectureId, options.language || 'en']);
      
      await this.storeSummary(lectureId, summaryResult, options.language || 'en');
    }
  }

  /**
   * Regenerate quiz for existing lecture
   * @param {number} lectureId - Lecture ID
   * @param {Object} options - Quiz options
   */
  async regenerateQuiz(lectureId, options = {}) {
    // Get transcript content
    const transcriptQuery = 'SELECT text FROM transcript_chunks WHERE lecture_id = $1 ORDER BY start_ts';
    const transcriptResult = await db.query(transcriptQuery, [lectureId]);
    
    const fullTranscript = transcriptResult.rows.map(row => row.text).join(' ');
    
    // Generate new quiz
    const quizResult = await geminiService.generateQuiz(fullTranscript, options);
    
    if (quizResult.success) {
      // Delete old quiz and insert new one
      await db.query('DELETE FROM quizzes WHERE lecture_id = $1 AND lang = $2', 
        [lectureId, options.language || 'en']);
      
      await this.storeQuiz(lectureId, quizResult, options.language || 'en');
    }
  }
}

export default new IngestionService();

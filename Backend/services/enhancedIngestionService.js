import fs from 'fs/promises';
import path from 'path';
import db from '../utils/db.js';
import audioExtractionService from './audioExtractionService.js';
import geminiFilesService from './geminiFilesService.js';
import whisperService from './whisperService.js';
import pptExtractionService from './pptExtractionService.js';
import cacheService from './cacheService.js';
import { 
  withRetry, 
  geminiCircuitBreaker, 
  whisperCircuitBreaker 
} from '../middleware/rateLimitMiddleware.js';

class EnhancedIngestionService {
  constructor() {
    this.processingQueue = new Map();
    this.transcriptionPreference = process.env.TRANSCRIPTION_SERVICE || 'auto'; // auto, gemini, whisper
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
      const audioResult = await withRetry(
        () => audioExtractionService.extractAudio(files.video.path),
        3,
        1000
      );
      
      if (!audioResult.success) {
        throw new Error(`Audio extraction failed: ${audioResult.error}`);
      }

      // Update lecture with audio path
      await this.updateLectureAudioPath(actualLectureId, audioResult.relativePath);
      this.updateProgress(actualLectureId, 30);

      // Step 3: Transcribe audio using best available service
      console.log('Transcribing audio...');
      const transcriptionResult = await this.transcribeAudioWithFallback(audioResult.audioPath, {
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
        const pptResult = await withRetry(
          () => pptExtractionService.extractTextFromPPT(files.ppt.path),
          2,
          1000
        );
        
        if (pptResult.success) {
          pptText = pptResult.slides.map(slide => 
            `Slide ${slide.slideNumber}: ${slide.title}\n${slide.content}`
          ).join('\n\n');
          
          // Store PPT content in database
          await this.storePPTContent(actualLectureId, pptResult);
        }
      }
      this.updateProgress(actualLectureId, 80);

      // Step 6: Generate initial summary and quiz with fallback
      const fullContent = transcriptionResult.transcript + (pptText ? '\n\nSlide Content:\n' + pptText : '');
      
      // Generate default summary with circuit breaker
      let summaryResult;
      try {
        summaryResult = await geminiCircuitBreaker.execute(() =>
          geminiFilesService.generateSummary(fullContent, {
            style: 'concise',
            language: lectureData.language || 'en'
          })
        );
      } catch (error) {
        console.warn('Gemini summary generation failed, skipping:', error.message);
        summaryResult = { success: false };
      }

      if (summaryResult.success) {
        await this.storeSummary(actualLectureId, summaryResult, lectureData.language || 'en');
      }

      // Generate default quiz with circuit breaker
      let quizResult;
      try {
        quizResult = await geminiCircuitBreaker.execute(() =>
          geminiFilesService.generateQuiz(fullContent, {
            difficulty: 'medium',
            language: lectureData.language || 'en',
            numQuestions: 10
          })
        );
      } catch (error) {
        console.warn('Gemini quiz generation failed, skipping:', error.message);
        quizResult = { success: false };
      }

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
          language: transcriptionResult.metadata.language,
          service: transcriptionResult.metadata.service
        },
        ppt: files.ppt ? {
          totalSlides: pptText ? pptText.split('Slide ').length - 1 : 0
        } : null,
        summary: summaryResult?.success || false,
        quiz: quizResult?.success || false
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
   * Transcribe audio with fallback between services
   * @param {string} audioPath - Path to audio file
   * @param {Object} options - Transcription options
   * @returns {Promise<Object>} - Transcription result
   */
  async transcribeAudioWithFallback(audioPath, options = {}) {
    const services = this.getTranscriptionServices();
    let lastError;

    for (const service of services) {
      try {
        console.log(`Attempting transcription with ${service.name}...`);
        
        if (service.name === 'gemini') {
          return await geminiCircuitBreaker.execute(() =>
            geminiFilesService.transcribeAudio(audioPath, options)
          );
        } else if (service.name === 'whisper') {
          return await whisperCircuitBreaker.execute(() =>
            whisperService.transcribeAudio(audioPath, options)
          );
        }
      } catch (error) {
        console.warn(`${service.name} transcription failed:`, error.message);
        lastError = error;
        continue;
      }
    }

    throw new Error(`All transcription services failed. Last error: ${lastError?.message}`);
  }

  /**
   * Get available transcription services in order of preference
   * @returns {Array} - Array of service objects
   */
  getTranscriptionServices() {
    const services = [];

    if (this.transcriptionPreference === 'gemini') {
      services.push({ name: 'gemini', available: true });
      if (whisperService.isAvailable()) {
        services.push({ name: 'whisper', available: true });
      }
    } else if (this.transcriptionPreference === 'whisper') {
      if (whisperService.isAvailable()) {
        services.push({ name: 'whisper', available: true });
      }
      services.push({ name: 'gemini', available: true });
    } else {
      // Auto mode - prefer Whisper if available, fallback to Gemini
      if (whisperService.isAvailable()) {
        services.push({ name: 'whisper', available: true });
      }
      services.push({ name: 'gemini', available: true });
    }

    return services.filter(service => service.available);
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
   * Store PPT content
   * @param {number} lectureId - Lecture ID
   * @param {Object} pptResult - PPT extraction result
   */
  async storePPTContent(lectureId, pptResult) {
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
   * Get service health status
   * @returns {Object} - Service health information
   */
  getServiceHealth() {
    return {
      audioExtraction: {
        available: true,
        service: 'ffmpeg'
      },
      transcription: {
        services: this.getTranscriptionServices(),
        preference: this.transcriptionPreference,
        gemini: {
          available: true,
          circuitBreaker: geminiCircuitBreaker.getState()
        },
        whisper: {
          available: whisperService.isAvailable(),
          circuitBreaker: whisperCircuitBreaker.getState(),
          info: whisperService.getServiceInfo()
        }
      },
      pptExtraction: {
        available: true,
        service: 'native'
      }
    };
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
    
    // Generate new summary with circuit breaker
    const summaryResult = await geminiCircuitBreaker.execute(() =>
      geminiFilesService.generateSummary(fullTranscript, options)
    );
    
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
    
    // Generate new quiz with circuit breaker
    const quizResult = await geminiCircuitBreaker.execute(() =>
      geminiFilesService.generateQuiz(fullTranscript, options)
    );
    
    if (quizResult.success) {
      // Delete old quiz and insert new one
      await db.query('DELETE FROM quizzes WHERE lecture_id = $1 AND lang = $2', 
        [lectureId, options.language || 'en']);
      
      await this.storeQuiz(lectureId, quizResult, options.language || 'en');
    }
  }

  /**
   * Retranscribe audio for existing lecture
   * @param {number} lectureId - Lecture ID
   * @param {Object} options - Transcription options
   */
  async retranscribeAudio(lectureId, options = {}) {
    // Get lecture audio path
    const lectureQuery = 'SELECT audio_path FROM lectures WHERE id = $1';
    const lectureResult = await db.query(lectureQuery, [lectureId]);
    
    if (lectureResult.rows.length === 0 || !lectureResult.rows[0].audio_path) {
      throw new Error('Audio file not found for lecture');
    }

    const audioPath = lectureResult.rows[0].audio_path;
    
    // Retranscribe with fallback
    const transcriptionResult = await this.transcribeAudioWithFallback(audioPath, options);
    
    if (transcriptionResult.success) {
      // Delete old transcript chunks
      await db.query('DELETE FROM transcript_chunks WHERE lecture_id = $1', [lectureId]);
      
      // Store new transcript chunks
      await this.storeTranscriptChunks(lectureId, transcriptionResult.chunks);
    }
  }
}

export default new EnhancedIngestionService();

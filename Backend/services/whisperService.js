import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

class WhisperService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    if (!this.apiKey) {
      console.warn('OPENAI_API_KEY not found. Whisper service will not be available.');
      this.client = null;
      return;
    }
    
    this.client = new OpenAI({
      apiKey: this.apiKey
    });
  }

  /**
   * Check if Whisper service is available
   * @returns {boolean} - Whether the service is available
   */
  isAvailable() {
    return this.client !== null;
  }

  /**
   * Transcribe audio file using OpenAI Whisper
   * @param {string} audioPath - Path to audio file
   * @param {Object} options - Transcription options
   * @returns {Promise<Object>} - Transcription result
   */
  async transcribeAudio(audioPath, options = {}) {
    if (!this.isAvailable()) {
      throw new Error('Whisper service is not available. Please set OPENAI_API_KEY.');
    }

    const {
      language = null, // auto-detect if null
      prompt = null,
      temperature = 0,
      response_format = 'verbose_json', // get timestamps
      chunkSize = 300 // seconds
    } = options;

    try {
      // Check file size (OpenAI has 25MB limit)
      const stats = fs.statSync(audioPath);
      const fileSizeMB = stats.size / (1024 * 1024);
      
      if (fileSizeMB > 25) {
        throw new Error(`Audio file is too large (${fileSizeMB.toFixed(1)}MB). Maximum size is 25MB.`);
      }

      console.log(`Transcribing audio file: ${path.basename(audioPath)} (${fileSizeMB.toFixed(1)}MB)`);

      // Prepare transcription request
      const transcriptionOptions = {
        file: fs.createReadStream(audioPath),
        model: 'whisper-1',
        response_format: response_format,
        temperature: temperature
      };

      if (language) {
        transcriptionOptions.language = language;
      }

      if (prompt) {
        transcriptionOptions.prompt = prompt;
      }

      // Call OpenAI Whisper API
      const transcription = await this.client.audio.transcriptions.create(transcriptionOptions);

      let transcriptText;
      let segments = [];

      if (response_format === 'verbose_json') {
        transcriptText = transcription.text;
        segments = transcription.segments || [];
      } else {
        transcriptText = transcription;
      }

      // Convert segments to our chunk format
      const chunks = this.convertSegmentsToChunks(segments, chunkSize);

      return {
        success: true,
        transcript: transcriptText,
        chunks: chunks,
        segments: segments, // Raw Whisper segments
        metadata: {
          audioFile: path.basename(audioPath),
          language: transcription.language || language || 'auto',
          duration: transcription.duration || null,
          totalChunks: chunks.length,
          totalSegments: segments.length,
          generatedAt: new Date().toISOString(),
          service: 'whisper'
        }
      };

    } catch (error) {
      console.error('Whisper transcription failed:', error);
      throw new Error(`Whisper transcription failed: ${error.message}`);
    }
  }

  /**
   * Convert Whisper segments to our chunk format
   * @param {Array} segments - Whisper segments
   * @param {number} chunkSize - Chunk size in seconds
   * @returns {Array} - Array of transcript chunks
   */
  convertSegmentsToChunks(segments, chunkSize = 300) {
    if (!segments || segments.length === 0) {
      return [];
    }

    const chunks = [];
    let currentChunk = {
      start_ts: 0,
      end_ts: chunkSize,
      text: '',
      speaker: null,
      segments: []
    };

    for (const segment of segments) {
      const segmentStart = Math.floor(segment.start);
      const segmentEnd = Math.ceil(segment.end);

      // If this segment would exceed the current chunk, finalize current chunk
      if (segmentStart >= currentChunk.end_ts) {
        if (currentChunk.text.trim()) {
          chunks.push({
            start_ts: currentChunk.start_ts,
            end_ts: currentChunk.segments.length > 0 ? 
              Math.max(...currentChunk.segments.map(s => Math.ceil(s.end))) : 
              currentChunk.end_ts,
            text: currentChunk.text.trim(),
            speaker: currentChunk.speaker
          });
        }

        // Start new chunk
        const chunkIndex = Math.floor(segmentStart / chunkSize);
        currentChunk = {
          start_ts: chunkIndex * chunkSize,
          end_ts: (chunkIndex + 1) * chunkSize,
          text: '',
          speaker: null,
          segments: []
        };
      }

      // Add segment to current chunk
      currentChunk.text += segment.text + ' ';
      currentChunk.segments.push(segment);

      // Update chunk timing based on actual segments
      if (currentChunk.segments.length === 1) {
        currentChunk.start_ts = Math.floor(segment.start);
      }
    }

    // Add the last chunk
    if (currentChunk.text.trim()) {
      chunks.push({
        start_ts: currentChunk.start_ts,
        end_ts: currentChunk.segments.length > 0 ? 
          Math.max(...currentChunk.segments.map(s => Math.ceil(s.end))) : 
          currentChunk.end_ts,
        text: currentChunk.text.trim(),
        speaker: currentChunk.speaker
      });
    }

    return chunks;
  }

  /**
   * Transcribe audio with speaker diarization (using segments)
   * @param {string} audioPath - Path to audio file
   * @param {Object} options - Transcription options
   * @returns {Promise<Object>} - Transcription result with speaker labels
   */
  async transcribeWithSpeakers(audioPath, options = {}) {
    // Note: OpenAI Whisper doesn't have built-in speaker diarization
    // This is a placeholder for potential future enhancement or integration
    // with other services like pyannote.audio or similar
    
    const result = await this.transcribeAudio(audioPath, options);
    
    // For now, we'll just return the regular transcription
    // In a real implementation, you might:
    // 1. Use a separate speaker diarization service
    // 2. Apply speaker labels to segments
    // 3. Group segments by speaker
    
    console.warn('Speaker diarization not implemented in Whisper service');
    return result;
  }

  /**
   * Translate audio to English using Whisper
   * @param {string} audioPath - Path to audio file
   * @param {Object} options - Translation options
   * @returns {Promise<Object>} - Translation result
   */
  async translateAudio(audioPath, options = {}) {
    if (!this.isAvailable()) {
      throw new Error('Whisper service is not available. Please set OPENAI_API_KEY.');
    }

    const {
      prompt = null,
      temperature = 0,
      response_format = 'verbose_json'
    } = options;

    try {
      console.log(`Translating audio file to English: ${path.basename(audioPath)}`);

      const translationOptions = {
        file: fs.createReadStream(audioPath),
        model: 'whisper-1',
        response_format: response_format,
        temperature: temperature
      };

      if (prompt) {
        translationOptions.prompt = prompt;
      }

      const translation = await this.client.audio.translations.create(translationOptions);

      let translatedText;
      let segments = [];

      if (response_format === 'verbose_json') {
        translatedText = translation.text;
        segments = translation.segments || [];
      } else {
        translatedText = translation;
      }

      return {
        success: true,
        translation: translatedText,
        segments: segments,
        metadata: {
          audioFile: path.basename(audioPath),
          targetLanguage: 'en',
          duration: translation.duration || null,
          totalSegments: segments.length,
          generatedAt: new Date().toISOString(),
          service: 'whisper'
        }
      };

    } catch (error) {
      console.error('Whisper translation failed:', error);
      throw new Error(`Whisper translation failed: ${error.message}`);
    }
  }

  /**
   * Get supported languages for Whisper
   * @returns {Array} - Array of supported language codes
   */
  getSupportedLanguages() {
    return [
      'af', 'am', 'ar', 'as', 'az', 'ba', 'be', 'bg', 'bn', 'bo', 'br', 'bs', 'ca', 'cs', 'cy', 'da', 'de', 'el', 'en', 'es', 'et', 'eu', 'fa', 'fi', 'fo', 'fr', 'gl', 'gu', 'ha', 'haw', 'he', 'hi', 'hr', 'ht', 'hu', 'hy', 'id', 'is', 'it', 'ja', 'jw', 'ka', 'kk', 'km', 'kn', 'ko', 'la', 'lb', 'ln', 'lo', 'lt', 'lv', 'mg', 'mi', 'mk', 'ml', 'mn', 'mr', 'ms', 'mt', 'my', 'ne', 'nl', 'nn', 'no', 'oc', 'pa', 'pl', 'ps', 'pt', 'ro', 'ru', 'sa', 'sd', 'si', 'sk', 'sl', 'sn', 'so', 'sq', 'sr', 'su', 'sv', 'sw', 'ta', 'te', 'tg', 'th', 'tk', 'tl', 'tr', 'tt', 'uk', 'ur', 'uz', 'vi', 'yi', 'yo', 'zh'
    ];
  }

  /**
   * Validate language code
   * @param {string} language - Language code to validate
   * @returns {boolean} - Whether the language is supported
   */
  isLanguageSupported(language) {
    return this.getSupportedLanguages().includes(language);
  }

  /**
   * Get service info
   * @returns {Object} - Service information
   */
  getServiceInfo() {
    return {
      name: 'OpenAI Whisper',
      available: this.isAvailable(),
      maxFileSize: '25MB',
      supportedFormats: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'],
      features: {
        transcription: true,
        translation: true,
        speakerDiarization: false,
        timestamps: true,
        languageDetection: true
      },
      supportedLanguages: this.getSupportedLanguages().length
    };
  }
}

export default new WhisperService();

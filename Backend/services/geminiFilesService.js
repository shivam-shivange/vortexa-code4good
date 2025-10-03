import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs/promises';
import path from 'path';

class GeminiFilesService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    
    this.client = new GoogleGenerativeAI(this.apiKey);
    this.model = this.client.getGenerativeModel({ model: 'gemini-2.5-flash' });
  }

  /**
   * Convert audio file to base64 for inline processing
   * @param {string} audioPath - Path to audio file
   * @returns {Promise<Object>} - Base64 encoded audio data
   */
  async prepareAudioForProcessing(audioPath) {
    try {
      const audioBuffer = await fs.readFile(audioPath);
      const mimeType = this.getMimeType(audioPath);
      const base64Audio = audioBuffer.toString('base64');

      return {
        inlineData: {
          data: base64Audio,
          mimeType: mimeType
        }
      };
    } catch (error) {
      console.error('Failed to prepare audio file:', error);
      throw new Error(`Audio preparation failed: ${error.message}`);
    }
  }

  /**
   * Generate transcript from audio file using Files API
   * @param {string} audioPath - Path to audio file
   * @param {Object} options - Transcription options
   * @returns {Promise<Object>} - Transcription result
   */
  async transcribeAudio(audioPath, options = {}) {
    const {
      includeTimestamps = true,
      language = 'auto',
      chunkSize = 300
    } = options;

    try {
      // Prepare audio for inline processing
      const audioData = await this.prepareAudioForProcessing(audioPath);

      let prompt = 'Generate a detailed transcript of the speech in this audio file.';
      if (includeTimestamps) {
        prompt += ' Include timestamps in the format [MM:SS] for each segment.';
      }

      // Generate content using inline audio
      const result = await this.model.generateContent([
        prompt,
        audioData
      ]);

      const transcriptText = result.response.text();
      const chunks = this.parseTranscriptIntoChunks(transcriptText, chunkSize);

      return {
        success: true,
        transcript: transcriptText,
        chunks: chunks,
        metadata: {
          audioFile: path.basename(audioPath),
          language: language,
          totalChunks: chunks.length,
          generatedAt: new Date().toISOString(),
          service: 'gemini'
        }
      };

    } catch (error) {
      console.error('Transcription failed:', error);
      throw new Error(`Transcription failed: ${error.message}`);
    }
  }

  /**
   * Generate summary from text content
   * @param {string} content - Text content to summarize
   * @param {Object} options - Summarization options
   * @returns {Promise<Object>} - Summary result
   */
  async generateSummary(content, options = {}) {
    const {
      style = 'concise',
      language = 'en',
      maxLength = 500,
      includeKeyPoints = true
    } = options;

    try {
      let prompt = `Generate a ${style} summary of the following content`;
      
      if (language !== 'en') {
        prompt += ` in ${language} language`;
      }
      
      if (maxLength) {
        prompt += ` (approximately ${maxLength} words)`;
      }
      
      if (includeKeyPoints) {
        prompt += '. Include key points and main concepts.';
      }
      
      prompt += '\n\nContent:\n' + content;

      const result = await this.model.generateContent(prompt);

      const summaryText = result.response.text();

      return {
        success: true,
        summary: summaryText,
        metadata: {
          style: style,
          language: language,
          originalLength: content.length,
          summaryLength: summaryText.length,
          generatedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('Summary generation failed:', error);
      throw new Error(`Summary generation failed: ${error.message}`);
    }
  }

  /**
   * Generate quiz from content
   * @param {string} content - Content to generate quiz from
   * @param {Object} options - Quiz generation options
   * @returns {Promise<Object>} - Quiz result
   */
  async generateQuiz(content, options = {}) {
    const {
      difficulty = 'medium',
      language = 'en',
      numQuestions = 10,
      questionTypes = ['mcq', 'short_answer'],
      includeExplanations = true
    } = options;

    try {
      let prompt = `Generate a ${difficulty} difficulty quiz with ${numQuestions} questions based on the following content`;
      
      if (language !== 'en') {
        prompt += ` in ${language} language`;
      }
      
      prompt += '.\n\n';
      
      if (questionTypes.includes('mcq')) {
        prompt += 'Include multiple choice questions with 4 options each. ';
      }
      
      if (questionTypes.includes('short_answer')) {
        prompt += 'Include short answer questions. ';
      }
      
      if (includeExplanations) {
        prompt += 'Provide explanations for correct answers. ';
      }
      
      prompt += '\n\nFormat the output as JSON with the following structure (no comments, valid JSON only):\n';
      prompt += '{\n';
      prompt += '  "questions": [\n';
      prompt += '    {\n';
      prompt += '      "id": 1,\n';
      prompt += '      "type": "mcq",\n';
      prompt += '      "question": "Question text here",\n';
      prompt += '      "options": ["Option A", "Option B", "Option C", "Option D"],\n';
      prompt += '      "correct_answer": "Option A",\n';
      prompt += '      "explanation": "Explanation for the correct answer"\n';
      prompt += '    }\n';
      prompt += '  ]\n';
      prompt += '}\n\n';
      prompt += 'Content:\n' + content;

      const result = await this.model.generateContent(prompt);

      let quizText = result.response.text();

      // Clean up the response to extract JSON
      quizText = quizText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      try {
        const quizData = JSON.parse(quizText);
        
        return {
          success: true,
          quiz: quizData,
          metadata: {
            difficulty: difficulty,
            language: language,
            numQuestions: quizData.questions?.length || 0,
            questionTypes: questionTypes,
            includeExplanations: includeExplanations,
            generatedAt: new Date().toISOString()
          }
        };
      } catch (parseError) {
        console.error('Failed to parse quiz JSON:', parseError);
        // Return raw text if JSON parsing fails
        return {
          success: true,
          quiz: { raw: quizText },
          metadata: {
            difficulty: difficulty,
            language: language,
            format: 'raw_text',
            generatedAt: new Date().toISOString()
          }
        };
      }

    } catch (error) {
      console.error('Quiz generation failed:', error);
      throw new Error(`Quiz generation failed: ${error.message}`);
    }
  }

  /**
   * Translate content to specified language
   * @param {string} content - Content to translate
   * @param {string} targetLanguage - Target language code
   * @param {string} sourceLanguage - Source language code (optional)
   * @returns {Promise<Object>} - Translation result
   */
  async translateContent(content, targetLanguage, sourceLanguage = 'auto') {
    try {
      let prompt = `Translate the following content to ${targetLanguage}`;
      
      if (sourceLanguage !== 'auto') {
        prompt += ` from ${sourceLanguage}`;
      }
      
      prompt += '. Maintain the original formatting and structure.\n\nContent:\n' + content;

      const result = await this.model.generateContent(prompt);

      const translatedText = result.response.text();

      return {
        success: true,
        translation: translatedText,
        metadata: {
          sourceLanguage: sourceLanguage,
          targetLanguage: targetLanguage,
          originalLength: content.length,
          translatedLength: translatedText.length,
          generatedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('Translation failed:', error);
      throw new Error(`Translation failed: ${error.message}`);
    }
  }

  /**
   * Parse transcript into time-based chunks
   * @param {string} transcript - Raw transcript text
   * @param {number} chunkSize - Chunk size in seconds
   * @returns {Array} - Array of transcript chunks
   */
  parseTranscriptIntoChunks(transcript, chunkSize = 300) {
    const chunks = [];
    const lines = transcript.split('\n').filter(line => line.trim());
    
    let currentChunk = {
      start_ts: 0,
      end_ts: chunkSize,
      text: '',
      speaker: null
    };
    
    let chunkIndex = 0;
    
    for (const line of lines) {
      // Try to extract timestamp if present - format [MM:SS] or [HH:MM:SS]
      const timestampMatch = line.match(/\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/);
      
      if (timestampMatch) {
        const [, minutes, seconds, hours] = timestampMatch;
        const timeInSeconds = (hours ? parseInt(hours) * 3600 : 0) + 
                             parseInt(minutes) * 60 + 
                             parseInt(seconds);
        
        // If we've exceeded the chunk size, start a new chunk
        if (timeInSeconds > currentChunk.end_ts) {
          if (currentChunk.text.trim()) {
            chunks.push({ ...currentChunk });
          }
          
          chunkIndex++;
          currentChunk = {
            start_ts: chunkIndex * chunkSize,
            end_ts: (chunkIndex + 1) * chunkSize,
            text: '',
            speaker: null
          };
        }
        
        currentChunk.start_ts = Math.min(currentChunk.start_ts, timeInSeconds);
      }
      
      // Extract speaker if present
      const speakerMatch = line.match(/^(Speaker \d+|[A-Z][a-z]+):/);
      if (speakerMatch) {
        currentChunk.speaker = speakerMatch[1];
      }
      
      currentChunk.text += line + '\n';
    }
    
    // Add the last chunk
    if (currentChunk.text.trim()) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  }

  /**
   * Delete uploaded file from Gemini (not used with inline data)
   * @param {string} fileName - Name of the uploaded file
   */
  async deleteUploadedFile(fileName) {
    // Not used with inline data approach
    console.log(`File cleanup not needed for inline data processing: ${fileName}`);
  }

  /**
   * Get MIME type for audio file
   * @param {string} filePath - Path to the file
   * @returns {string} - MIME type
   */
  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',
      '.ogg': 'audio/ogg',
      '.flac': 'audio/flac'
    };
    
    return mimeTypes[ext] || 'audio/mpeg';
  }

  /**
   * List uploaded files (not used with inline data)
   * @returns {Promise<Array>} - List of uploaded files
   */
  async listUploadedFiles() {
    // Not used with inline data approach
    return [];
  }

  /**
   * Get file information (not used with inline data)
   * @param {string} fileName - Name of the file
   * @returns {Promise<Object>} - File information
   */
  async getFileInfo(fileName) {
    // Not used with inline data approach
    return null;
  }
}

export default new GeminiFilesService();

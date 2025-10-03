import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs/promises';
import path from 'path';

class GeminiService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    
    this.genAI = new GoogleGenerativeAI(this.apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }

  /**
   * Upload audio file to Gemini Files API
   * @param {string} audioPath - Path to audio file
   * @returns {Promise<Object>} - Uploaded file object
   */
  async uploadAudioFile(audioPath) {
    try {
      const mimeType = this.getMimeType(audioPath);
      const uploadResult = await this.genAI.uploadFile(audioPath, {
        mimeType: mimeType,
        displayName: path.basename(audioPath)
      });

      console.log(`Uploaded file ${uploadResult.file.displayName} as: ${uploadResult.file.name}`);
      return uploadResult.file;
    } catch (error) {
      console.error('Failed to upload audio file:', error);
      throw new Error(`Audio upload failed: ${error.message}`);
    }
  }

  /**
   * Generate transcript from audio file
   * @param {string} audioPath - Path to audio file
   * @param {Object} options - Transcription options
   * @returns {Promise<Object>} - Transcription result
   */
  async transcribeAudio(audioPath, options = {}) {
    const {
      includeTimestamps = true,
      includeSpeakerLabels = false,
      language = 'auto',
      chunkSize = 300 // seconds
    } = options;

    try {
      // Upload the audio file
      const uploadedFile = await this.uploadAudioFile(audioPath);

      // Create prompt for transcription
      let prompt = 'Generate a detailed transcript of the speech in this audio file.';
      
      if (includeTimestamps) {
        prompt += ' Include timestamps for each segment.';
      }
      
      if (includeSpeakerLabels) {
        prompt += ' If multiple speakers are present, identify and label them as Speaker 1, Speaker 2, etc.';
      }
      
      if (language !== 'auto') {
        prompt += ` The audio is in ${language} language.`;
      }

      prompt += ' Format the output as a structured transcript with clear segmentation.';

      // Generate content
      const result = await this.model.generateContent([
        prompt,
        {
          fileData: {
            mimeType: uploadedFile.mimeType,
            fileUri: uploadedFile.uri
          }
        }
      ]);

      const response = await result.response;
      const transcriptText = response.text();

      // Parse the transcript into chunks
      const chunks = this.parseTranscriptIntoChunks(transcriptText, chunkSize);

      // Clean up uploaded file
      await this.deleteUploadedFile(uploadedFile.name);

      return {
        success: true,
        transcript: transcriptText,
        chunks: chunks,
        metadata: {
          audioFile: path.basename(audioPath),
          language: language,
          includeTimestamps: includeTimestamps,
          includeSpeakerLabels: includeSpeakerLabels,
          totalChunks: chunks.length,
          generatedAt: new Date().toISOString()
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
      const response = await result.response;
      const summaryText = response.text();

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
      questionTypes = ['mcq'],
      includeExplanations = true
    } = options;

    try {
      let prompt = `Generate ONLY multiple choice questions (MCQ) for a ${difficulty} difficulty quiz with exactly ${numQuestions} questions based on the following content`;
      
      if (language !== 'en') {
        prompt += ` in ${language} language`;
      }
      
      prompt += '.\n\n';
      prompt += 'IMPORTANT REQUIREMENTS:\n';
      prompt += '- Generate ONLY multiple choice questions (MCQ)\n';
      prompt += '- Each question must have exactly 4 options (A, B, C, D)\n';
      prompt += '- Each question must have exactly one correct answer\n';
      prompt += '- Do NOT include any short answer, true/false, or other question types\n';
      prompt += '- Questions should test understanding of key concepts from the content\n';
      
      if (includeExplanations) {
        prompt += '- Provide clear explanations for why the correct answer is right\n';
      }
      
      prompt += '\n\nFormat the output as valid JSON with the following exact structure:\n';
      prompt += '{\n';
      prompt += '  "questions": [\n';
      prompt += '    {\n';
      prompt += '      "id": 1,\n';
      prompt += '      "type": "mcq",\n';
      prompt += '      "question": "Clear question text ending with ?",\n';
      prompt += '      "options": ["Option A text", "Option B text", "Option C text", "Option D text"],\n';
      prompt += '      "correct_answer": 0,\n';
      prompt += '      "explanation": "Clear explanation of why this answer is correct"\n';
      prompt += '    }\n';
      prompt += '  ]\n';
      prompt += '}\n\n';
      prompt += 'NOTE: correct_answer should be the index (0, 1, 2, or 3) of the correct option in the options array.\n\n';
      prompt += 'Content to generate quiz from:\n' + content;

      console.log('Sending quiz generation request to Gemini...');
      
      // Truncate content if too long (Gemini has token limits)
      if (content.length > 30000) { // Approximate token limit
        content = content.substring(0, 30000) + '...';
        console.log('Content truncated to 30000 characters due to length limits');
      }
      
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      let quizText = response.text();
      
      console.log('Received response from Gemini');

      // Clean up the response to extract JSON
      quizText = quizText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      try {
        // Validate JSON structure before returning
        const parsedQuiz = JSON.parse(quizText);
        if (!parsedQuiz.questions || !Array.isArray(parsedQuiz.questions)) {
          console.error('Invalid quiz structure received:', quizText);
          throw new Error('Quiz generation failed: Invalid response structure');
        }
        console.log(`Successfully generated ${parsedQuiz.questions.length} questions`);
      } catch (e) {
        console.error('Failed to parse quiz JSON:', e);
        console.error('Raw quiz text:', quizText);
        throw new Error('Quiz generation failed: Invalid JSON response');
      }
      
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
      const response = await result.response;
      const translatedText = response.text();

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
      // Try to extract timestamp if present
      const timestampMatch = line.match(/(\d{1,2}):(\d{2}):(\d{2})/);
      
      if (timestampMatch) {
        const [, hours, minutes, seconds] = timestampMatch;
        const timeInSeconds = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
        
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
   * Delete uploaded file from Gemini
   * @param {string} fileName - Name of the uploaded file
   */
  async deleteUploadedFile(fileName) {
    try {
      await this.genAI.deleteFile(fileName);
      console.log(`Deleted uploaded file: ${fileName}`);
    } catch (error) {
      console.error(`Failed to delete uploaded file ${fileName}:`, error);
    }
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
}

export default new GeminiService();

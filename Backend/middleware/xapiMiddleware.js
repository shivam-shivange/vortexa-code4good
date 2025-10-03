import db from '../utils/db.js';
import axios from 'axios';

const EXTENSION_KEYS = {
  USER_ROLE: 'http://learningapp.com/extensions/user_role',
  LECTURE_ID: 'http://learningapp.com/extensions/lecture_id',
  COURSE_ID: 'http://learningapp.com/extensions/course_id',
  DURATION: 'http://learningapp.com/extensions/duration',
  PROGRESS: 'http://learningapp.com/extensions/progress',
  TIME_TAKEN: 'http://learningapp.com/extensions/time_taken',
  QUESTIONS_ANSWERED: 'http://learningapp.com/extensions/questions_answered',
  DIFFICULTY: 'http://learningapp.com/extensions/difficulty'
};

class XAPIMiddleware {
  #eventQueue = [];
  #batchProcessor = null;
  #lrsEndpoint = process.env.LRS_ENDPOINT || null;
  #lrsEnabled = false;
  #lrsAuth = null;
  #batchSize = 10;
  #retryAttempts = 3;
  #retryDelay = 1000;
  #flushInterval = 30000;

  constructor() {
    this.#lrsEnabled = !!this.#lrsEndpoint;
    
    if (this.#lrsEnabled) {
      this.#lrsAuth = {
        username: process.env.LRS_USERNAME || 'admin',
        password: process.env.LRS_PASSWORD || 'password'
      };
      this.#batchSize = parseInt(process.env.LRS_BATCH_SIZE, 10) || 10;
      this.#retryAttempts = parseInt(process.env.LRS_RETRY_ATTEMPTS, 10) || 3;
      this.#retryDelay = parseInt(process.env.LRS_RETRY_DELAY_MS, 10) || 1000;
      this.#flushInterval = parseInt(process.env.LRS_FLUSH_INTERVAL_MS, 10) || 30000;
      
      console.log('[xAPI] Initialized with endpoint:', this.#lrsEndpoint);
      this.#startBatchProcessor();
    } else {
      console.log('[xAPI] No LRS endpoint configured - xAPI tracking disabled');
    }
  }

  // Generate a UUID for xAPI statements
  #generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  // Create xAPI statement from event data
  #createXAPIStatement = (eventData, user, lecture) => {
    try {
      const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
      const timestamp = new Date().toISOString();
      
      const statement = {
        id: this.#generateUUID(),
        timestamp,
        actor: {
          mbox: `mailto:${user.email}`,
          objectType: 'Agent'
        },
        context: {
          platform: 'Learning App',
          language: eventData.language || 'en',
          extensions: {
            [EXTENSION_KEYS.USER_ROLE]: user.role,
            [EXTENSION_KEYS.LECTURE_ID]: lecture.id,
            [EXTENSION_KEYS.COURSE_ID]: lecture.course_id
          }
        }
      };

      // Set verb and object based on event type
      switch (eventData.event_type) {
        case 'lecture.viewed':
          statement.verb = {
            id: 'http://adlnet.gov/expapi/verbs/experienced',
            display: { 'en-US': 'experienced' }
          };
          statement.object = {
            id: `${baseUrl}/lectures/${lecture.id}`,
            definition: {
              name: { 'en-US': lecture.title },
              description: { 'en-US': 'Video lecture' },
              type: 'http://adlnet.gov/expapi/activities/media'
            },
            objectType: 'Activity'
          };
          statement.result = {
            extensions: {
              [EXTENSION_KEYS.DURATION]: eventData.details?.duration || 0,
              [EXTENSION_KEYS.PROGRESS]: eventData.details?.progress || 0
            }
          };
          break;

        case 'quiz.attempted':
        case 'quiz.completed':
          statement.verb = {
            id: eventData.event_type === 'quiz.completed' 
              ? 'http://adlnet.gov/expapi/verbs/completed'
              : 'http://adlnet.gov/expapi/verbs/attempted',
            display: { 
              'en-US': eventData.event_type === 'quiz.completed' ? 'completed' : 'attempted'
            }
          };
          statement.object = {
            id: `${baseUrl}/lectures/${lecture.id}/quiz`,
            definition: {
              name: { 'en-US': `Quiz for ${lecture.title}` },
              description: { 'en-US': 'Lecture quiz' },
              type: 'http://adlnet.gov/expapi/activities/assessment'
            },
            objectType: 'Activity'
          };
          statement.result = {
            score: {
              scaled: eventData.details?.score ? eventData.details.score / 100 : 0,
              raw: eventData.details?.score || 0,
              max: 100
            },
            completion: eventData.event_type === 'quiz.completed',
            success: eventData.details?.passed || false,
            extensions: {
              [EXTENSION_KEYS.TIME_TAKEN]: eventData.details?.time_taken || 0,
              [EXTENSION_KEYS.QUESTIONS_ANSWERED]: eventData.details?.questions_answered || 0,
              [EXTENSION_KEYS.DIFFICULTY]: eventData.details?.difficulty || 'medium'
            }
          };
          break;

        default:
          statement.verb = {
            id: 'http://adlnet.gov/expapi/verbs/interacted',
            display: { 'en-US': 'interacted' }
          };
          statement.object = {
            id: `${baseUrl}/lectures/${lecture.id}`,
            definition: {
              name: { 'en-US': lecture.title },
              description: { 'en-US': eventData.event_type },
              type: 'http://adlnet.gov/expapi/activities/interaction'
            },
            objectType: 'Activity'
          };
      }

      return statement;
    } catch (error) {
      console.error('[xAPI] Error creating statement:', error);
      throw new Error('Failed to create xAPI statement');
    }
  }

  // Start the batch processor
  #startBatchProcessor() {
    if (this.#batchProcessor) {
      clearInterval(this.#batchProcessor);
    }

    this.#batchProcessor = setInterval(async () => {
      try {
        await this.#flushEventQueue();
      } catch (error) {
        console.error('[xAPI] Batch processor error:', error);
      }
    }, this.#flushInterval);

    console.log('[xAPI] Batch processor started');
  }

  // Flush the event queue to LRS
  async #flushEventQueue() {
    if (!this.#lrsEnabled || this.#eventQueue.length === 0) return;

    const batch = this.#eventQueue.splice(0, this.#batchSize);
    
    try {
      const statements = batch.map(item => item.statement);
      
      await axios.post(`${this.#lrsEndpoint}/statements`, statements, {
        auth: this.#lrsAuth,
        headers: {
          'Content-Type': 'application/json',
          'X-Experience-API-Version': '1.0.3'
        },
        timeout: 10000
      });

      console.log(`[xAPI] Successfully sent ${statements.length} statements to LRS`);

    } catch (error) {
      console.error('[xAPI] Failed to send statements:', error);
      
      // Re-queue failed items with retry logic
      for (const item of batch) {
        if (item.retries < this.#retryAttempts) {
          item.retries++;
          this.#eventQueue.push(item);
          console.log(`[xAPI] Retrying statement ${item.eventId} (attempt ${item.retries}/${this.#retryAttempts})`);
        } else {
          console.warn(`[xAPI] Dropping statement after ${this.#retryAttempts} retries: ${item.eventId}`);
        }
      }
    }
  }

  // Log an event
  async logEvent(eventData, user, lecture) {
    if (!this.#lrsEnabled) {
      console.debug('[xAPI] Logging disabled - skipping event');
      return { success: true, skipped: true };
    }

    try {
      // Store in local database
      const query = `
        INSERT INTO events (user_id, lecture_id, event_type, details)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `;
      
      const result = await db.query(query, [
        user.id,
        lecture.id,
        eventData.event_type,
        JSON.stringify(eventData.details || {})
      ]);

      const eventId = result.rows[0].id;

      // Create and queue xAPI statement
      const xapiStatement = this.#createXAPIStatement(eventData, user, lecture);
      this.#eventQueue.push({
        eventId,
        statement: xapiStatement,
        retries: 0
      });

      // Flush immediately if queue is full
      if (this.#eventQueue.length >= this.#batchSize) {
        await this.#flushEventQueue();
      }

      return { success: true, eventId };

    } catch (error) {
      console.error('[xAPI] Event logging failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Express middleware factory
  middleware() {
    return async (req, res, next) => {
      req.logXAPIEvent = async (eventType, details = {}) => {
        try {
          if (!req.user || !req.lecture) {
            console.debug('[xAPI] Skipping log - missing context');
            return { success: false, reason: 'missing_context' };
          }

          return await this.logEvent(
            { event_type: eventType, details },
            req.user,
            req.lecture
          );
        } catch (error) {
          console.error('[xAPI] Middleware error:', error);
          return { success: false, error: error.message };
        }
      };

      next();
    };
  }
}

// Export a singleton instance
export default new XAPIMiddleware();

import rateLimit from 'express-rate-limit';
import db from '../utils/db.js';

// Create different rate limiters for different endpoints
export const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 login attempts per windowMs
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
});

export const uploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // limit each IP to 10 uploads per hour
  message: {
    error: 'Too many upload requests, please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const aiServiceRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // limit each IP to 50 AI service requests per hour
  message: {
    error: 'Too many AI service requests, please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const reportsRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // limit each IP to 20 report requests per 5 minutes
  message: {
    error: 'Too many report requests, please try again later.',
    retryAfter: '5 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// User-based rate limiting (requires authentication)
export const createUserRateLimit = (windowMs, max, message) => {
  const userRequests = new Map();

  return async (req, res, next) => {
    if (!req.user) {
      return next(); // Skip if not authenticated
    }

    const userId = req.user.id;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean up old entries
    if (userRequests.has(userId)) {
      const userRequestList = userRequests.get(userId);
      const validRequests = userRequestList.filter(timestamp => timestamp > windowStart);
      userRequests.set(userId, validRequests);
    } else {
      userRequests.set(userId, []);
    }

    const userRequestList = userRequests.get(userId);

    if (userRequestList.length >= max) {
      return res.status(429).json({
        error: message || 'Too many requests from this user, please try again later.',
        retryAfter: Math.ceil(windowMs / 1000 / 60) + ' minutes'
      });
    }

    // Add current request
    userRequestList.push(now);
    userRequests.set(userId, userRequestList);

    next();
  };
};

// AI service specific user rate limiting
export const userAIServiceRateLimit = createUserRateLimit(
  60 * 60 * 1000, // 1 hour
  30, // 30 requests per hour per user
  'Too many AI service requests from this user, please try again later.'
);

// Upload specific user rate limiting
export const userUploadRateLimit = createUserRateLimit(
  60 * 60 * 1000, // 1 hour
  5, // 5 uploads per hour per user
  'Too many upload requests from this user, please try again later.'
);

// Database-backed rate limiting for more persistent tracking
export const createDatabaseRateLimit = (windowMs, max, keyGenerator) => {
  return async (req, res, next) => {
    try {
      const key = keyGenerator(req);
      const now = new Date();
      const windowStart = new Date(now.getTime() - windowMs);

      // Clean up old entries
      await db.query(
        'DELETE FROM rate_limit_requests WHERE key = $1 AND created_at < $2',
        [key, windowStart]
      );

      // Count current requests
      const result = await db.query(
        'SELECT COUNT(*) as count FROM rate_limit_requests WHERE key = $1 AND created_at >= $2',
        [key, windowStart]
      );

      const currentCount = parseInt(result.rows[0].count);

      if (currentCount >= max) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          retryAfter: Math.ceil(windowMs / 1000 / 60) + ' minutes'
        });
      }

      // Record this request
      await db.query(
        'INSERT INTO rate_limit_requests (key, created_at) VALUES ($1, $2)',
        [key, now]
      );

      next();
    } catch (error) {
      console.error('Database rate limiting error:', error);
      // Fall back to allowing the request if database fails
      next();
    }
  };
};

// Create rate limit tracking table
export const createRateLimitTable = async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS rate_limit_requests (
        id SERIAL PRIMARY KEY,
        key VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_rate_limit_key_time 
      ON rate_limit_requests(key, created_at)
    `);

    console.log('Rate limit table created successfully');
  } catch (error) {
    console.error('Failed to create rate limit table:', error);
  }
};

// Cleanup old rate limit entries (run periodically)
export const cleanupRateLimitEntries = async () => {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await db.query(
      'DELETE FROM rate_limit_requests WHERE created_at < $1',
      [oneDayAgo]
    );
    
    console.log(`Cleaned up ${result.rowCount} old rate limit entries`);
  } catch (error) {
    console.error('Failed to cleanup rate limit entries:', error);
  }
};

// Retry mechanism for external API calls
export const withRetry = async (fn, maxRetries = 3, delay = 1000) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry on certain errors
      if (error.status === 401 || error.status === 403 || error.status === 400) {
        throw error;
      }
      
      if (attempt === maxRetries) {
        break;
      }
      
      // Exponential backoff
      const waitTime = delay * Math.pow(2, attempt - 1);
      console.log(`Attempt ${attempt} failed, retrying in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  throw lastError;
};

// Circuit breaker pattern for external services
export class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000, monitoringPeriod = 10000) {
    this.threshold = threshold;
    this.timeout = timeout;
    this.monitoringPeriod = monitoringPeriod;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime
    };
  }
}

// Create circuit breakers for external services
export const geminiCircuitBreaker = new CircuitBreaker(5, 60000); // 5 failures, 1 minute timeout
export const whisperCircuitBreaker = new CircuitBreaker(3, 30000); // 3 failures, 30 second timeout
export const lrsCircuitBreaker = new CircuitBreaker(5, 120000); // 5 failures, 2 minute timeout

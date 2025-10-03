import db from '../utils/db.js';

class CacheService {
  constructor() {
    this.defaultTTL = 3600; // 1 hour in seconds
  }

  /**
   * Generate cache key from parameters
   * @param {string} prefix - Cache key prefix
   * @param {Object} params - Parameters to include in key
   * @returns {string} - Generated cache key
   */
  generateKey(prefix, params) {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join('|');
    
    return `${prefix}:${Buffer.from(sortedParams).toString('base64')}`;
  }

  /**
   * Set cache value
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<boolean>} - Success status
   */
  async set(key, value, ttl = this.defaultTTL) {
    try {
      const expiresAt = new Date(Date.now() + (ttl * 1000));
      
      const query = `
        INSERT INTO api_cache (cache_key, cache_value, expires_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (cache_key) 
        DO UPDATE SET 
          cache_value = EXCLUDED.cache_value,
          expires_at = EXCLUDED.expires_at,
          created_at = CURRENT_TIMESTAMP
      `;
      
      await db.query(query, [key, JSON.stringify(value), expiresAt]);
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  }

  /**
   * Get cache value
   * @param {string} key - Cache key
   * @returns {Promise<any|null>} - Cached value or null if not found/expired
   */
  async get(key) {
    try {
      const query = `
        SELECT cache_value, expires_at 
        FROM api_cache 
        WHERE cache_key = $1 AND expires_at > CURRENT_TIMESTAMP
      `;
      
      const result = await db.query(query, [key]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return JSON.parse(result.rows[0].cache_value);
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Delete cache entry
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} - Success status
   */
  async delete(key) {
    try {
      const query = 'DELETE FROM api_cache WHERE cache_key = $1';
      await db.query(query, [key]);
      return true;
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  }

  /**
   * Clear expired cache entries
   * @returns {Promise<number>} - Number of deleted entries
   */
  async clearExpired() {
    try {
      const query = 'DELETE FROM api_cache WHERE expires_at <= CURRENT_TIMESTAMP';
      const result = await db.query(query);
      console.log(`Cleared ${result.rowCount} expired cache entries`);
      return result.rowCount;
    } catch (error) {
      console.error('Cache clear expired error:', error);
      return 0;
    }
  }

  /**
   * Clear all cache entries with a specific prefix
   * @param {string} prefix - Cache key prefix
   * @returns {Promise<number>} - Number of deleted entries
   */
  async clearByPrefix(prefix) {
    try {
      const query = 'DELETE FROM api_cache WHERE cache_key LIKE $1';
      const result = await db.query(query, [`${prefix}:%`]);
      console.log(`Cleared ${result.rowCount} cache entries with prefix ${prefix}`);
      return result.rowCount;
    } catch (error) {
      console.error('Cache clear by prefix error:', error);
      return 0;
    }
  }

  /**
   * Get or set cache value with a generator function
   * @param {string} key - Cache key
   * @param {Function} generator - Function to generate value if not cached
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<any>} - Cached or generated value
   */
  async getOrSet(key, generator, ttl = this.defaultTTL) {
    try {
      // Try to get from cache first
      let value = await this.get(key);
      
      if (value !== null) {
        console.log(`Cache hit for key: ${key}`);
        return value;
      }
      
      // Generate new value
      console.log(`Cache miss for key: ${key}, generating new value`);
      value = await generator();
      
      // Cache the new value
      await this.set(key, value, ttl);
      
      return value;
    } catch (error) {
      console.error('Cache getOrSet error:', error);
      // If caching fails, still return the generated value
      return await generator();
    }
  }

  /**
   * Cache summary generation
   * @param {number} lectureId - Lecture ID
   * @param {Object} options - Summary options
   * @param {Function} generator - Summary generator function
   * @returns {Promise<any>} - Summary result
   */
  async cacheSummary(lectureId, options, generator) {
    const key = this.generateKey('summary', {
      lectureId,
      ...options
    });
    
    return await this.getOrSet(key, generator, 7200); // 2 hours TTL for summaries
  }

  /**
   * Cache quiz generation
   * @param {number} lectureId - Lecture ID
   * @param {Object} options - Quiz options
   * @param {Function} generator - Quiz generator function
   * @returns {Promise<any>} - Quiz result
   */
  async cacheQuiz(lectureId, options, generator) {
    const key = this.generateKey('quiz', {
      lectureId,
      ...options
    });
    
    return await this.getOrSet(key, generator, 7200); // 2 hours TTL for quizzes
  }

  /**
   * Cache translation
   * @param {string} content - Content to translate
   * @param {string} targetLanguage - Target language
   * @param {string} sourceLanguage - Source language
   * @param {Function} generator - Translation generator function
   * @returns {Promise<any>} - Translation result
   */
  async cacheTranslation(content, targetLanguage, sourceLanguage, generator) {
    const contentHash = Buffer.from(content).toString('base64').substring(0, 50);
    const key = this.generateKey('translation', {
      contentHash,
      targetLanguage,
      sourceLanguage
    });
    
    return await this.getOrSet(key, generator, 86400); // 24 hours TTL for translations
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>} - Cache statistics
   */
  async getStats() {
    try {
      const queries = [
        'SELECT COUNT(*) as total FROM api_cache',
        'SELECT COUNT(*) as expired FROM api_cache WHERE expires_at <= CURRENT_TIMESTAMP',
        'SELECT COUNT(*) as active FROM api_cache WHERE expires_at > CURRENT_TIMESTAMP',
        `SELECT 
           cache_key, 
           LENGTH(cache_value::text) as size,
           expires_at,
           created_at
         FROM api_cache 
         ORDER BY created_at DESC 
         LIMIT 10`
      ];

      const [totalResult, expiredResult, activeResult, recentResult] = await Promise.all(
        queries.map(query => db.query(query))
      );

      return {
        total: parseInt(totalResult.rows[0].total),
        expired: parseInt(expiredResult.rows[0].expired),
        active: parseInt(activeResult.rows[0].active),
        recent: recentResult.rows.map(row => ({
          key: row.cache_key,
          size: parseInt(row.size),
          expiresAt: row.expires_at,
          createdAt: row.created_at
        }))
      };
    } catch (error) {
      console.error('Cache stats error:', error);
      return {
        total: 0,
        expired: 0,
        active: 0,
        recent: []
      };
    }
  }

  /**
   * Invalidate cache for a specific lecture
   * @param {number} lectureId - Lecture ID
   * @returns {Promise<number>} - Number of invalidated entries
   */
  async invalidateLectureCache(lectureId) {
    try {
      const patterns = [
        `summary:%${lectureId}%`,
        `quiz:%${lectureId}%`,
        `transcript:%${lectureId}%`
      ];

      let totalDeleted = 0;
      for (const pattern of patterns) {
        const query = 'DELETE FROM api_cache WHERE cache_key LIKE $1';
        const result = await db.query(query, [pattern]);
        totalDeleted += result.rowCount;
      }

      console.log(`Invalidated ${totalDeleted} cache entries for lecture ${lectureId}`);
      return totalDeleted;
    } catch (error) {
      console.error('Cache invalidation error:', error);
      return 0;
    }
  }

  /**
   * Start cache cleanup scheduler
   * Runs every hour to clean up expired entries
   */
  startCleanupScheduler() {
    setInterval(async () => {
      try {
        await this.clearExpired();
      } catch (error) {
        console.error('Scheduled cache cleanup failed:', error);
      }
    }, 3600000); // Run every hour

    console.log('Cache cleanup scheduler started');
  }
}

export default new CacheService();

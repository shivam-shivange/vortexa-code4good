import db from '../utils/db.js';
import enhancedIngestionService from '../services/enhancedIngestionService.js';
import whisperService from '../services/whisperService.js';
import cacheService from '../services/cacheService.js';
import reportsService from '../services/reportsService.js';
import { geminiCircuitBreaker, whisperCircuitBreaker, lrsCircuitBreaker } from '../middleware/rateLimitMiddleware.js';

export const getHealthStatus = async (req, res) => {
  try {
    const health = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      services: {}
    };

    // Database health
    try {
      const dbResult = await db.query('SELECT NOW() as current_time');
      health.services.database = {
        status: 'healthy',
        responseTime: Date.now(),
        lastCheck: dbResult.rows[0].current_time
      };
    } catch (error) {
      health.services.database = {
        status: 'unhealthy',
        error: error.message
      };
      health.status = 'DEGRADED';
    }

    // Ingestion service health
    health.services.ingestion = enhancedIngestionService.getServiceHealth();

    // Cache service health
    try {
      const cacheStats = await cacheService.getStats();
      health.services.cache = {
        status: 'healthy',
        stats: cacheStats
      };
    } catch (error) {
      health.services.cache = {
        status: 'unhealthy',
        error: error.message
      };
    }

    // Reports/ETL service health
    health.services.reports = {
      status: 'healthy',
      etl: reportsService.getETLStatus()
    };

    // Circuit breaker status
    health.services.circuitBreakers = {
      gemini: geminiCircuitBreaker.getState(),
      whisper: whisperCircuitBreaker.getState(),
      lrs: lrsCircuitBreaker.getState()
    };

    // File system health (check upload directories)
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const uploadDirs = ['uploads', 'uploads/videos', 'uploads/presentations', 'uploads/audio'];
      
      const dirStatus = {};
      for (const dir of uploadDirs) {
        try {
          await fs.access(dir);
          dirStatus[dir] = 'accessible';
        } catch {
          dirStatus[dir] = 'missing';
        }
      }
      
      health.services.fileSystem = {
        status: Object.values(dirStatus).every(status => status === 'accessible') ? 'healthy' : 'degraded',
        directories: dirStatus
      };
    } catch (error) {
      health.services.fileSystem = {
        status: 'unhealthy',
        error: error.message
      };
    }

    // Memory usage
    const memUsage = process.memoryUsage();
    health.system = {
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
        external: Math.round(memUsage.external / 1024 / 1024) + ' MB'
      },
      cpu: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version
      }
    };

    // Overall health determination
    const unhealthyServices = Object.values(health.services).filter(
      service => service.status === 'unhealthy'
    ).length;

    if (unhealthyServices > 0) {
      health.status = unhealthyServices > 2 ? 'CRITICAL' : 'DEGRADED';
    }

    // Set appropriate HTTP status code
    const statusCode = health.status === 'OK' ? 200 : 
                      health.status === 'DEGRADED' ? 200 : 503;

    res.status(statusCode).json(health);

  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'CRITICAL',
      timestamp: new Date().toISOString(),
      error: error.message,
      uptime: process.uptime()
    });
  }
};

export const getDetailedHealth = async (req, res) => {
  try {
    // Only allow detailed health for authenticated admin users
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied. Admin privileges required.'
      });
    }

    const detailedHealth = await getHealthStatus(req, res);
    
    // Add more detailed information for admins
    const additionalInfo = {
      database: {
        connections: await getDatabaseConnectionInfo(),
        tableStats: await getDatabaseTableStats()
      },
      processing: {
        activeJobs: enhancedIngestionService.processingQueue.size,
        queueStatus: Array.from(enhancedIngestionService.processingQueue.entries())
      },
      rateLimiting: await getRateLimitStats(),
      recentErrors: await getRecentErrors()
    };

    // Merge additional info
    detailedHealth.detailed = additionalInfo;
    
  } catch (error) {
    console.error('Detailed health check failed:', error);
    res.status(500).json({
      error: 'Failed to generate detailed health report',
      message: error.message
    });
  }
};

// Helper functions
async function getDatabaseConnectionInfo() {
  try {
    const result = await db.query(`
      SELECT 
        count(*) as total_connections,
        count(*) FILTER (WHERE state = 'active') as active_connections,
        count(*) FILTER (WHERE state = 'idle') as idle_connections
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `);
    return result.rows[0];
  } catch (error) {
    return { error: error.message };
  }
}

async function getDatabaseTableStats() {
  try {
    const result = await db.query(`
      SELECT 
        schemaname,
        tablename,
        n_tup_ins as inserts,
        n_tup_upd as updates,
        n_tup_del as deletes,
        n_live_tup as live_tuples
      FROM pg_stat_user_tables 
      ORDER BY n_live_tup DESC
      LIMIT 10
    `);
    return result.rows;
  } catch (error) {
    return { error: error.message };
  }
}

async function getRateLimitStats() {
  try {
    const result = await db.query(`
      SELECT 
        key,
        COUNT(*) as request_count,
        MAX(created_at) as last_request
      FROM rate_limit_requests 
      WHERE created_at > NOW() - INTERVAL '1 hour'
      GROUP BY key
      ORDER BY request_count DESC
      LIMIT 20
    `);
    return result.rows;
  } catch (error) {
    return { error: error.message };
  }
}

async function getRecentErrors() {
  // This would typically come from a logging system
  // For now, return placeholder
  return {
    note: 'Error tracking not implemented. Check application logs.',
    logLocation: './logs/app.log'
  };
}

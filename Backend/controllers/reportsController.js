import reportsService from '../services/reportsService.js';

export const getEngagementReport = async (req, res) => {
  try {
    const {
      userId,
      lectureId,
      startDate,
      endDate,
      groupBy = 'day'
    } = req.query;

    const filters = {
      userId: userId ? parseInt(userId) : undefined,
      lectureId: lectureId ? parseInt(lectureId) : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      groupBy
    };

    const data = await reportsService.getEngagementAnalytics(filters);

    res.json({
      success: true,
      data: data,
      filters: filters,
      total: data.length
    });

  } catch (error) {
    console.error('Get engagement report error:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate engagement report'
    });
  }
};

export const getQuizReport = async (req, res) => {
  try {
    const {
      userId,
      lectureId,
      startDate,
      endDate
    } = req.query;

    const filters = {
      userId: userId ? parseInt(userId) : undefined,
      lectureId: lectureId ? parseInt(lectureId) : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined
    };

    const data = await reportsService.getQuizAnalytics(filters);

    res.json({
      success: true,
      data: data,
      filters: filters,
      total: data.length
    });

  } catch (error) {
    console.error('Get quiz report error:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate quiz report'
    });
  }
};

export const getLearningProgressReport = async (req, res) => {
  try {
    const {
      userId,
      lectureId
    } = req.query;

    const filters = {
      userId: userId ? parseInt(userId) : undefined,
      lectureId: lectureId ? parseInt(lectureId) : undefined
    };

    const data = await reportsService.getLearningProgress(filters);

    res.json({
      success: true,
      data: data,
      filters: filters,
      total: data.length
    });

  } catch (error) {
    console.error('Get learning progress report error:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate learning progress report'
    });
  }
};

export const getTopContentReport = async (req, res) => {
  try {
    const {
      limit = 10,
      metric = 'views',
      period = 30
    } = req.query;

    const filters = {
      limit: parseInt(limit),
      metric,
      period: parseInt(period)
    };

    const data = await reportsService.getTopContent(filters);

    res.json({
      success: true,
      data: data,
      filters: filters,
      total: data.length
    });

  } catch (error) {
    console.error('Get top content report error:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate top content report'
    });
  }
};

export const getUserPerformanceReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { period = 30 } = req.query;

    // Check if user exists and has permission to view
    if (parseInt(id) !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({
        error: 'Permission denied'
      });
    }

    const data = await reportsService.getUserPerformance(parseInt(id), parseInt(period));

    res.json({
      success: true,
      data: data,
      userId: parseInt(id),
      period: parseInt(period)
    });

  } catch (error) {
    console.error('Get user performance report error:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate user performance report'
    });
  }
};

export const getDashboardSummary = async (req, res) => {
  try {
    const { period = 7 } = req.query;
    const isAdmin = req.user.role === 'admin';
    const isTeacher = req.user.role === 'teacher';

    // Get different data based on user role
    let filters = {};
    if (!isAdmin && !isTeacher) {
      // Students can only see their own data
      filters.userId = req.user.id;
    }

    const [
      engagementData,
      quizData,
      topContent,
      userPerformance
    ] = await Promise.all([
      reportsService.getEngagementAnalytics({
        ...filters,
        startDate: new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000),
        endDate: new Date()
      }),
      reportsService.getQuizAnalytics({
        ...filters,
        startDate: new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000),
        endDate: new Date()
      }),
      isAdmin || isTeacher ? reportsService.getTopContent({
        limit: 5,
        metric: 'views',
        period: parseInt(period)
      }) : Promise.resolve([]),
      !isAdmin && !isTeacher ? reportsService.getUserPerformance(req.user.id, parseInt(period)) : Promise.resolve(null)
    ]);

    // Calculate summary statistics
    const engagementSummary = engagementData.reduce((acc, day) => ({
      totalViews: acc.totalViews + parseInt(day.total_views || 0),
      totalTimeSpent: acc.totalTimeSpent + parseInt(day.total_time_spent || 0),
      totalSummariesViewed: acc.totalSummariesViewed + parseInt(day.summaries_viewed || 0),
      totalQuizzesAttempted: acc.totalQuizzesAttempted + parseInt(day.quizzes_attempted || 0),
      uniqueUsers: Math.max(acc.uniqueUsers, parseInt(day.unique_users || 0)),
      uniqueLectures: Math.max(acc.uniqueLectures, parseInt(day.unique_lectures || 0))
    }), {
      totalViews: 0,
      totalTimeSpent: 0,
      totalSummariesViewed: 0,
      totalQuizzesAttempted: 0,
      uniqueUsers: 0,
      uniqueLectures: 0
    });

    const quizSummary = quizData.reduce((acc, week) => ({
      totalQuizzesCompleted: acc.totalQuizzesCompleted + parseInt(week.total_quizzes_completed || 0),
      averageScore: (acc.averageScore + parseFloat(week.overall_average_score || 0)) / 2,
      highestScore: Math.max(acc.highestScore, parseFloat(week.highest_score || 0)),
      totalAttempts: acc.totalAttempts + parseInt(week.total_attempts || 0)
    }), {
      totalQuizzesCompleted: 0,
      averageScore: 0,
      highestScore: 0,
      totalAttempts: 0
    });

    res.json({
      success: true,
      data: {
        engagement: {
          summary: engagementSummary,
          timeline: engagementData
        },
        quiz: {
          summary: quizSummary,
          timeline: quizData
        },
        topContent: topContent,
        userPerformance: userPerformance
      },
      period: parseInt(period),
      userRole: req.user.role
    });

  } catch (error) {
    console.error('Get dashboard summary error:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate dashboard summary'
    });
  }
};

export const getETLStatus = async (req, res) => {
  try {
    // Only admins can view ETL status
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Permission denied'
      });
    }

    const status = reportsService.getETLStatus();

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('Get ETL status error:', error);
    res.status(500).json({
      error: error.message || 'Failed to get ETL status'
    });
  }
};

export const triggerETL = async (req, res) => {
  try {
    // Only admins can trigger ETL
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Permission denied'
      });
    }

    await reportsService.triggerETL();

    res.json({
      success: true,
      message: 'ETL pipeline triggered successfully'
    });

  } catch (error) {
    console.error('Trigger ETL error:', error);
    res.status(500).json({
      error: error.message || 'Failed to trigger ETL pipeline'
    });
  }
};

export const getAnalyticsExport = async (req, res) => {
  try {
    const {
      type = 'engagement',
      format = 'json',
      startDate,
      endDate,
      userId,
      lectureId
    } = req.query;

    // Check permissions
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({
        error: 'Permission denied'
      });
    }

    const filters = {
      userId: userId ? parseInt(userId) : undefined,
      lectureId: lectureId ? parseInt(lectureId) : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined
    };

    let data;
    switch (type) {
      case 'engagement':
        data = await reportsService.getEngagementAnalytics(filters);
        break;
      case 'quiz':
        data = await reportsService.getQuizAnalytics(filters);
        break;
      case 'progress':
        data = await reportsService.getLearningProgress(filters);
        break;
      default:
        return res.status(400).json({
          error: 'Invalid export type'
        });
    }

    if (format === 'csv') {
      // Convert to CSV format
      if (data.length === 0) {
        return res.status(404).json({
          error: 'No data found for export'
        });
      }

      const headers = Object.keys(data[0]);
      const csvContent = [
        headers.join(','),
        ...data.map(row => headers.map(header => 
          JSON.stringify(row[header] || '')
        ).join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${type}_report_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvContent);
    } else {
      res.json({
        success: true,
        data: data,
        type: type,
        filters: filters,
        exportedAt: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('Get analytics export error:', error);
    res.status(500).json({
      error: error.message || 'Failed to export analytics data'
    });
  }
};

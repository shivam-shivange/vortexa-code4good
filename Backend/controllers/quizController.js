import pool from '../utils/db.js';
import { generateQuiz as generateQuizService, calculateQuizScore } from '../services/quizService.js';
import {
  generateCustomMessage,
  analyzeQuestionsByTopic,
  generateLearningRecommendations
} from '../utils/quizUtils.js';

// Utility functions for text-based analysis
function extractKeyConcepts(content) {
  const concepts = [];
  // Simple regex-based concept extraction
  const conceptPatterns = [
    /(?:is|are|means|refers to) ((?:[a-zA-Z\s-]+(?:\([^)]*\))?)+)/g,
    /\b(?:called|known as|termed) ((?:[a-zA-Z\s-]+(?:\([^)]*\))?)+)/g,
    /\b(?:concept|principle|method|technique) of ((?:[a-zA-Z\s-]+(?:\([^)]*\))?)+)/g
  ];
  
  conceptPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1].length > 5 && match[1].length < 100) {
        concepts.push(match[1].trim());
      }
    }
  });
  
  return [...new Set(concepts)]; // Remove duplicates
}

function calculateImprovementMetrics(performanceTrends) {
  if (performanceTrends.length < 2) {
    return {
      overall_improvement: 0,
      consistent_improvement: false,
      improvement_rate: 0,
      areas_of_improvement: []
    };
  }

  const scores = performanceTrends.map(t => t.score);
  const overallImprovement = scores[0] - scores[scores.length - 1];
  const improvements = [];
  
  // Calculate improvement between consecutive attempts
  for (let i = 0; i < scores.length - 1; i++) {
    improvements.push(scores[i] - scores[i + 1]);
  }

  // Analyze topic improvements
  const topicImprovements = new Map();
  performanceTrends.forEach(trend => {
    if (trend.topics && typeof trend.topics === 'object') {
      Object.entries(trend.topics).forEach(([topic, analysis]) => {
        if (!topicImprovements.has(topic)) {
          topicImprovements.set(topic, []);
        }
        const masteryLevel = analysis && typeof analysis.mastery_level === 'number' 
          ? analysis.mastery_level 
          : 0;
        topicImprovements.get(topic).push(masteryLevel);
      });
    }
  });

  const areasOfImprovement = [];
  topicImprovements.forEach((scores, topic) => {
    if (scores.length >= 2 && scores[0] > scores[scores.length - 1]) {
      areasOfImprovement.push({
        topic,
        improvement: scores[0] - scores[scores.length - 1]
      });
    }
  });

  return {
    overall_improvement: overallImprovement,
    consistent_improvement: improvements.every(imp => imp >= 0),
    improvement_rate: overallImprovement / (performanceTrends.length - 1),
    areas_of_improvement: areasOfImprovement.sort((a, b) => b.improvement - a.improvement)
  };
}

function generateComprehensiveRecommendations(topicMastery, improvementMetrics, keyConcepts) {
  const recommendations = [];

  // Topic-based recommendations
  if (topicMastery && typeof topicMastery === 'object') {
    Object.entries(topicMastery).forEach(([topic, data]) => {
      if (data && typeof data === 'object' && data.total > 0) {
        const masteryLevel = (data.correct / data.total) * 100;
        
        if (masteryLevel < 60) {
          recommendations.push({
            type: 'topic_focus',
            topic: topic,
            message: `Focus on improving your understanding of ${topic}. Current mastery: ${Math.round(masteryLevel)}%`,
            priority: 'high'
          });
        }
      }
    });
  }

  // Improvement-based recommendations
  if (improvementMetrics && typeof improvementMetrics === 'object') {
    if (improvementMetrics.consistent_improvement) {
      recommendations.push({
        type: 'progress',
        message: 'Keep up the good work! Your scores are consistently improving.',
        priority: 'low'
      });
    } else if (improvementMetrics.overall_improvement < 0) {
      recommendations.push({
        type: 'strategy',
        message: 'Consider reviewing your study approach. Focus on understanding rather than memorization.',
        priority: 'high'
      });
    }
  }

  // Key concepts focus
  if (keyConcepts && Array.isArray(keyConcepts) && keyConcepts.length > 0) {
    recommendations.push({
      type: 'concepts',
      message: 'Review these key concepts from the lecture:',
      concepts: keyConcepts.slice(0, 5),
      priority: 'medium'
    });
  }

  const priorityOrder = { 'high': 1, 'medium': 2, 'low': 3 };
  return recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

/**
 * Generate quiz for a lecture
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
export const generateQuiz = async (req, res) => {
  try {
    const lectureId = req.params.id;
    const { lang = 'en', difficulty = 'medium' } = req.body;

    console.log(`[Quiz Generation] Starting quiz generation for lecture ${lectureId}`);

    // First validate the lecture exists and is ready
    const lectureResult = await pool.query(
      'SELECT id, title, processing_status FROM lectures WHERE id = $1',
      [lectureId]
    );

    if (lectureResult.rows.length === 0) {
      console.error(`[Quiz Generation] Lecture ${lectureId} not found`);
      return res.status(404).json({ error: 'Lecture not found' });
    }

    const lecture = lectureResult.rows[0];
    if (lecture.processing_status !== 'completed') {
      console.error(`[Quiz Generation] Lecture ${lectureId} processing not complete. Status: ${lecture.processing_status}`);
      return res.status(400).json({
        error: 'Lecture processing not complete',
        status: lecture.processing_status
      });
    }

    // Check for transcript chunks
    const transcriptResult = await pool.query(
      'SELECT COUNT(*) as chunk_count FROM transcript_chunks WHERE lecture_id = $1',
      [lectureId]
    );

    if (transcriptResult.rows[0].chunk_count === 0) {
      console.error(`[Quiz Generation] No transcript chunks found for lecture ${lectureId}`);
      return res.status(404).json({ error: 'No transcript found for this lecture' });
    }

    // Call service to generate quiz via Gemini
    console.log('[Quiz Generation] Calling quiz generation service...');
    const quizResult = await generateQuizService(lectureId, lang, difficulty);
    console.log('[Quiz Generation] Service response:', quizResult);

    if (!quizResult.success) {
      console.error('[Quiz Generation] Generation failed:', quizResult.error);
      return res.status(500).json({ 
        error: 'Failed to generate quiz',
        details: quizResult.error
      });
    }

    // Fetch the newly generated quiz
    const quiz = (await pool.query(
      `SELECT id, lecture_id, lang, difficulty, items_json, generated_at 
       FROM quizzes 
       WHERE lecture_id=$1 AND lang=$2 AND difficulty=$3 
       ORDER BY generated_at DESC 
       LIMIT 1`,
      [lectureId, lang, difficulty]
    )).rows[0];

    if (!quiz) {
      console.error('[Quiz Generation] Quiz not found in database after generation');
      return res.status(404).json({ error: 'Quiz not found after generation' });
    }

    // Ensure items_json is properly parsed
    let questions;
    try {
      questions = typeof quiz.items_json === 'string' 
        ? JSON.parse(quiz.items_json) 
        : quiz.items_json;

      if (!questions || !Array.isArray(questions.questions) || questions.questions.length === 0) {
        throw new Error('Invalid quiz format: No questions found');
      }

      // Return successful response with quiz data
      console.log(`[Quiz Generation] Successfully generated quiz with ${questions.questions.length} questions`);
      return res.json({
        id: quiz.id,
        lecture_id: quiz.lecture_id,
        lang: quiz.lang,
        difficulty: quiz.difficulty,
        generated_at: quiz.generated_at,
        questions: questions.questions,
        question_count: questions.questions.length
      });
    } catch (e) {
      console.error('[Quiz Generation] Error parsing quiz items_json:', e);
      return res.status(500).json({ 
        error: 'Invalid quiz data format',
        details: e.message
      });
    }
  } catch (err) {
    console.error('Quiz generation error:', err);
    res.status(500).json({ 
      error: 'Failed to generate quiz',
      details: err.message
    });
  }
};

export const submitQuizAttempt = async (req, res) => {
  try {
    console.log('[Quiz Submission] Starting quiz submission...');
    console.log('[Quiz Submission] Request body:', req.body);
    console.log('[Quiz Submission] User object:', req.user);

    const { quiz_id, answers = {}, time_taken = 0, lecture_id } = req.body;
    
    // Check if user is authenticated
    if (!req.user) {
      console.error('[Quiz Submission] No authenticated user found');
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user_id = req.user.userId || req.user.id; // Try both possible user ID fields
    console.log('[Quiz Submission] User ID:', user_id);

    // Validate required fields
    if (!quiz_id) {
      console.error('[Quiz Submission] Missing quiz_id');
      return res.status(400).json({ error: 'Quiz ID is required' });
    }

    if (!user_id) {
      console.error('[Quiz Submission] Missing user_id');
      return res.status(400).json({ error: 'User authentication required' });
    }

    // Get the quiz questions to calculate accurate score
    const quiz = await pool.query(
      'SELECT * FROM quizzes WHERE id = $1',
      [quiz_id]
    );

    if (quiz.rows.length === 0) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    let quizQuestions = [];
    try {
      const quizData = typeof quiz.rows[0].items_json === 'string' 
        ? JSON.parse(quiz.rows[0].items_json) 
        : quiz.rows[0].items_json;
      quizQuestions = quizData.questions || [];
    } catch (e) {
      console.error('Error parsing quiz questions:', e);
      return res.status(500).json({ error: 'Invalid quiz data' });
    }

    // Calculate comprehensive score and performance metrics
    console.log('[Quiz Submission] Calculating quiz score...');
    console.log('[Quiz Submission] Quiz questions count:', quizQuestions.length);
    console.log('[Quiz Submission] User answers:', answers);
    
    const performance = calculateQuizScore(quizQuestions, answers);
    console.log('[Quiz Submission] Performance calculated:', performance);

    // Get previous attempts for comparison
    const previousAttempts = await pool.query(`
      SELECT qa.*, q.difficulty, q.lang
      FROM quiz_attempts qa
      JOIN quizzes q ON qa.quiz_id = q.id
      WHERE qa.user_id = $1 AND q.lecture_id = $2
      ORDER BY qa.attempted_at DESC
    `, [user_id, lecture_id]);

    // Calculate improvement metrics
    const improvementMetrics = {
      previousBestScore: 0,
      scoreImprovement: 0,
      attemptsCount: previousAttempts.rows.length + 1,
      consistentlyImproving: false
    };

    if (previousAttempts.rows.length > 0) {
      const previousBest = previousAttempts.rows.reduce((best, current) => 
        current.score > best.score ? current : best
      , previousAttempts.rows[0]);

      improvementMetrics.previousBestScore = previousBest.score;
      improvementMetrics.scoreImprovement = performance.percentage - previousBest.score;
      
      if (previousAttempts.rows.length >= 2) {
        const scores = previousAttempts.rows.map(a => a.score);
        improvementMetrics.consistentlyImproving = scores.every((score, i) => 
          i === 0 || score <= scores[i - 1]
        );
      }
    }

    // Get topic analysis from the lecture content
    const lectureContent = await pool.query(`
      SELECT tc.text as content, l.title
      FROM transcript_chunks tc
      JOIN lectures l ON tc.lecture_id = l.id
      WHERE l.id = $1
      ORDER BY tc.start_ts
    `, [lecture_id]);

    // Group questions by topics/concepts
    console.log('[Quiz Submission] Analyzing questions by topic...');
    let topicAnalysis = {};
    try {
      topicAnalysis = analyzeQuestionsByTopic(quizQuestions, answers);
      console.log('[Quiz Submission] Topic analysis completed:', topicAnalysis);
    } catch (e) {
      console.error('[Quiz Submission] Error in topic analysis:', e);
      topicAnalysis = {}; // Use empty object as fallback
    }

    // Store the quiz attempt with comprehensive data
    console.log('[Quiz Submission] Storing quiz attempt in database...');
    const attemptData = {
      answers, 
      time_taken, 
      performance: {
        ...performance,
        topics: topicAnalysis
      },
      improvement: improvementMetrics,
      partial_submission: performance.unattemptedQuestions > 0
    };
    
    console.log('[Quiz Submission] Attempt data to store:', JSON.stringify(attemptData, null, 2));
    
    const result = await pool.query(
      'INSERT INTO quiz_attempts(quiz_id, user_id, score, attempt_data, attempted_at) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [
        quiz_id, 
        user_id, 
        performance.percentage, 
        JSON.stringify(attemptData),
        new Date()
      ]
    );
    
    console.log('[Quiz Submission] Quiz attempt stored successfully:', result.rows[0]);

    // Emit xAPI event for analytics
    if (lecture_id) {
      await pool.query(
        'INSERT INTO events(user_id, lecture_id, event_type, details) VALUES($1,$2,$3,$4)',
        [
          user_id, 
          lecture_id, 
          performance.unattemptedQuestions > 0 ? 'quiz.partially_completed' : 'quiz.completed', 
          JSON.stringify({ 
            quiz_id, 
            score: performance.percentage, 
            time_taken, 
            attempted_questions: performance.attemptedQuestions,
            total_questions: performance.totalQuestions,
            topics: Object.keys(topicAnalysis)
          })
        ]
      );
    }

    // Generate response data
    console.log('[Quiz Submission] Generating response...');
    
    let keyConcepts = [];
    try {
      const lectureText = lectureContent.rows.map(r => r.content).join(' ');
      keyConcepts = extractKeyConcepts(lectureText);
      console.log('[Quiz Submission] Key concepts extracted:', keyConcepts.length);
    } catch (e) {
      console.error('[Quiz Submission] Error extracting key concepts:', e);
    }
    
    let recommendations = [];
    try {
      recommendations = generateComprehensiveRecommendations(
        topicAnalysis,
        improvementMetrics,
        keyConcepts
      );
      console.log('[Quiz Submission] Recommendations generated:', recommendations.length);
    } catch (e) {
      console.error('[Quiz Submission] Error generating recommendations:', e);
    }
    
    let customMessage = '';
    try {
      customMessage = generateCustomMessage(performance, improvementMetrics);
      console.log('[Quiz Submission] Custom message generated');
    } catch (e) {
      console.error('[Quiz Submission] Error generating custom message:', e);
      customMessage = `Your score: ${Math.round(performance.percentage)}%`;
    }

    // Return comprehensive response
    const response = {
      attempt: {
        id: result.rows[0].id,
        score: performance.percentage,
        submitted_at: new Date().toISOString()
      },
      performance: {
        ...performance,
        topics: topicAnalysis,
        improvement: improvementMetrics,
        lecture: {
          title: lectureContent.rows[0]?.title || '',
          key_concepts: keyConcepts,
        }
      },
      recommendations: recommendations,
      message: customMessage
    };
    
    console.log('[Quiz Submission] Sending response...');
    res.json(response);

  } catch (err) {
    console.error('[Quiz Submission] Quiz submission error:', err);
    console.error('[Quiz Submission] Error stack:', err.stack);
    res.status(500).json({ 
      error: 'Failed to submit quiz attempt',
      details: err.message
    });
  }
};

export const getQuizAttempts = async (req, res) => {
  try {
    const quizId = req.params.quizId;
    const userId = req.user.userId;

    const attempts = (await pool.query(
      'SELECT * FROM quiz_attempts WHERE quiz_id=$1 AND user_id=$2 ORDER BY attempted_at DESC',
      [quizId, userId]
    )).rows;

    // Parse and enhance attempt data
    const enhancedAttempts = attempts.map(attempt => {
      let attemptData = {};
      try {
        attemptData = typeof attempt.attempt_data === 'string' 
          ? JSON.parse(attempt.attempt_data) 
          : attempt.attempt_data;
      } catch (e) {
        console.error('Error parsing attempt data:', e);
      }

      return {
        id: attempt.id,
        quiz_id: attempt.quiz_id,
        score: attempt.score,
        attempted_at: attempt.attempted_at,
        performance: attemptData.performance || {
          correctAnswers: 0,
          attemptedQuestions: 0,
          totalQuestions: 0,
          percentage: attempt.score
        },
        topics: attemptData.performance?.topics || {},
        improvement: attemptData.improvement || {
          previousBestScore: 0,
          scoreImprovement: 0
        }
      };
    });

    res.json(enhancedAttempts);
  } catch (err) {
    console.error('Error fetching quiz attempts:', err);
    res.status(500).json({ error: 'Failed to fetch quiz attempts' });
  }
};

export const getQuizPerformanceReport = async (req, res) => {
  try {
    const { lectureId } = req.params;
    
    // Input validation
    if (!lectureId) {
      console.error('[Performance Report] Missing lecture ID');
      return res.status(400).json({ 
        error: 'Lecture ID is required',
        message: 'Please provide a valid lecture ID'
      });
    }

    // Check if user is authenticated
    if (!req.user) {
      console.error('[Performance Report] No authenticated user found');
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'You must be logged in to view quiz performance'
      });
    }

    const userId = req.user.userId;
    console.log(`[Performance Report] Generating report for lecture ${lectureId}, user ${userId}`);

    // Get lecture content and comprehensive data
    const [lectureData, quizAttempts] = await Promise.all([
      // Get lecture content and metadata
      pool.query(`
        SELECT 
          l.*,
          COALESCE(
            array_agg(
              CASE 
                WHEN tc.text IS NOT NULL AND tc.text != '' 
                THEN tc.text 
                ELSE NULL 
              END
            ) FILTER (WHERE tc.text IS NOT NULL AND tc.text != ''),
            ARRAY[]::text[]
          ) as transcript_chunks
        FROM lectures l
        LEFT JOIN transcript_chunks tc ON l.id = tc.lecture_id
        WHERE l.id = $1
        GROUP BY l.id
      `, [lectureId]),
      
      // Get all quiz attempts with details
      pool.query(`
        SELECT qa.*, q.difficulty, q.lang, q.items_json
        FROM quiz_attempts qa
        JOIN quizzes q ON qa.quiz_id = q.id
        WHERE q.lecture_id = $1 AND qa.user_id = $2
        ORDER BY qa.attempted_at DESC
      `, [lectureId, userId])
    ]);

    if (!lectureData.rows[0]) {
      console.error(`[Performance Report] Lecture ${lectureId} not found`);
      return res.status(404).json({ 
        error: 'Lecture not found',
        message: 'The requested lecture does not exist'
      });
    }

    const lecture = lectureData.rows[0];
    const attempts = quizAttempts.rows;

    // Handle case with no quiz attempts
    if (attempts.length === 0) {
      console.log(`[Performance Report] No quiz attempts found for lecture ${lectureId}`);
      return res.json({
        lecture: {
          id: lecture.id,
          title: lecture.title,
          key_concepts: [],
          topic_coverage: []
        },
        performance_summary: {
          attempts_count: 0,
          best_score: 0,
          average_score: 0,
          improvement_trend: {
            overall_improvement: 0,
            consistent_improvement: false,
            improvement_rate: 0,
            areas_of_improvement: []
          },
          latest_attempt: null
        },
        topic_mastery: [],
        performance_history: [],
        recommendations: [{
          type: 'initial',
          message: 'Take your first quiz to start tracking your performance',
          priority: 'high'
        }]
      });
    }

    // Analyze performance trends with error handling
    const performanceTrends = attempts.map(attempt => {
      let attemptData = {};
      try {
        attemptData = typeof attempt.attempt_data === 'string'
          ? JSON.parse(attempt.attempt_data)
          : attempt.attempt_data;
      } catch (e) {
        console.error(`[Performance Report] Error parsing attempt data:`, e);
        attemptData = {};
      }

      return {
        date: attempt.attempted_at,
        score: attempt.score,
        time_taken: attemptData.time_taken || 0,
        topics: attemptData.performance?.topics || {}
      };
    });

    // Calculate topic mastery levels with validation
    const topicMastery = {};
    performanceTrends.forEach(attempt => {
      if (!attempt.topics) return;
      
      Object.entries(attempt.topics).forEach(([topic, analysis]) => {
        if (!topic || !analysis || typeof analysis !== 'object') return;
        
        if (!topicMastery[topic]) {
          topicMastery[topic] = {
            attempts: 0,
            correct: 0,
            total: 0
          };
        }
        
        const correct = Number(analysis.correct) || 0;
        const total = Number(analysis.total) || 0;
        
        if (total > 0) { // Only count valid attempts
          topicMastery[topic].attempts++;
          topicMastery[topic].correct += correct;
          topicMastery[topic].total += total;
        }
      });
    });

    // Generate comprehensive report with safe text processing
    const transcriptText = Array.isArray(lecture.transcript_chunks)
      ? lecture.transcript_chunks.filter(chunk => chunk && typeof chunk === 'string').join(' ')
      : '';
    
    const keyConcepts = transcriptText ? extractKeyConcepts(transcriptText) : [];
    const improvementMetrics = calculateImprovementMetrics(performanceTrends);

    // Safe parsing of the latest attempt data
    let latestAttemptPerformance = null;
    if (attempts[0]) {
      try {
        latestAttemptPerformance = JSON.parse(attempts[0].attempt_data).performance;
      } catch (e) {
        console.error('[Performance Report] Error parsing latest attempt:', e);
      }
    }

    const enhancedReport = {
      lecture: {
        id: lecture.id,
        title: lecture.title || 'Untitled Lecture',
        key_concepts: keyConcepts,
        topic_coverage: Object.keys(topicMastery)
      },
      performance_summary: {
        attempts_count: attempts.length,
        best_score: Math.max(...attempts.map(a => Number(a.score) || 0), 0),
        average_score: attempts.length > 0 
          ? attempts.reduce((sum, a) => sum + (Number(a.score) || 0), 0) / attempts.length 
          : 0,
        improvement_trend: improvementMetrics,
        latest_attempt: attempts[0] ? {
          score: attempts[0].score,
          date: attempts[0].attempted_at,
          performance: latestAttemptPerformance
        } : null
      },
      topic_mastery: Object.entries(topicMastery).map(([topic, data]) => ({
        topic,
        mastery_level: data.total > 0 ? (data.correct / data.total) * 100 : 0,
        attempts: data.attempts,
        accuracy: data.total > 0 ? (data.correct / data.total) * 100 : 0,
        total_questions: data.total
      })),
      performance_history: performanceTrends.map(trend => ({
        date: trend.date,
        score: trend.score,
        time_taken: trend.time_taken,
        topic_breakdown: Object.entries(trend.topics || {}).map(([topic, data]) => ({
          topic,
          accuracy: (data && data.total) ? (data.correct / data.total) * 100 : 0,
          questions_count: data?.total || 0
        })).filter(breakdown => breakdown.questions_count > 0)
      })),
      recommendations: generateComprehensiveRecommendations(
        topicMastery,
        improvementMetrics,
        keyConcepts
      )
    };

    console.log('[Performance Report] Successfully generated enhanced report');
    res.json(enhancedReport);

  } catch (err) {
    console.error('[Performance Report] Error generating report:', err);
    console.error('[Performance Report] Error stack:', err.stack);
    res.status(500).json({ 
      error: 'Failed to generate performance report',
      message: 'An error occurred while generating the performance report',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

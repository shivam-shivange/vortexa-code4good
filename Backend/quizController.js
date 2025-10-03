import pool from '../utils/db.js';
import { generateQuiz as generateQuizService, calculateQuizScore } from '../services/quizService.js';
import { 
  extractKeyConcepts,
  calculateImprovementMetrics,
  generateComprehensiveRecommendations
} from '../services/performanceAnalysisService.js';
import {
  generateCustomMessage,
  analyzeQuestionsByTopic,
  generateLearningRecommendations
} from '../utils/quizUtils.js';


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
    const { quiz_id, answers = {}, time_taken = 0, lecture_id } = req.body;
    const user_id = req.user.userId; // Changed from req.user.id to match JWT payload

    // Validate required fields
    if (!quiz_id) {
      return res.status(400).json({ error: 'Quiz ID is required' });
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
    const performance = calculateQuizScore(quizQuestions, answers);

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
      SELECT tc.content, l.title
      FROM transcript_chunks tc
      JOIN lectures l ON tc.lecture_id = l.id
      WHERE l.id = $1
      ORDER BY tc.chunk_order
    `, [lecture_id]);

    // Group questions by topics/concepts
    const topicAnalysis = analyzeQuestionsByTopic(quizQuestions, answers);

    // Store the quiz attempt with comprehensive data
    const result = await pool.query(
      'INSERT INTO quiz_attempts(quiz_id, user_id, score, attempt_data, attempted_at) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [
        quiz_id, 
        user_id, 
        performance.percentage, 
        JSON.stringify({ 
          answers, 
          time_taken, 
          performance: {
            ...performance,
            topics: topicAnalysis
          },
          improvement: improvementMetrics,
          partial_submission: performance.unattemptedQuestions > 0
        }),
        new Date()
      ]
    );

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

    // Return comprehensive response
    res.json({
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
          key_concepts: extractKeyConcepts(lectureContent.rows.map(r => r.content).join(' ')),
        }
      },
      recommendations: generateComprehensiveRecommendations(
        topicAnalysis,
        improvementMetrics,
        extractKeyConcepts(lectureContent.rows.map(r => r.content).join(' '))
      ),
      message: generateCustomMessage(performance, improvementMetrics)
    });

  } catch (err) {
    console.error('Quiz submission error:', err);
    res.status(500).json({ error: 'Failed to submit quiz attempt' });
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
        SELECT l.*, array_agg(tc.content ORDER BY tc.chunk_order) as transcript_chunks
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
      return res.status(404).json({ error: 'Lecture not found' });
    }

    const lecture = lectureData.rows[0];
    const attempts = quizAttempts.rows;

    // Analyze performance trends
    const performanceTrends = attempts.map(attempt => {
      const attemptData = JSON.parse(attempt.attempt_data);
      return {
        date: attempt.attempted_at,
        score: attempt.score,
        time_taken: attemptData.time_taken,
        topics: attemptData.performance?.topics || {}
      };
    });

    // Calculate topic mastery levels
    const topicMastery = {};
    performanceTrends.forEach(attempt => {
      Object.entries(attempt.topics).forEach(([topic, analysis]) => {
        if (!topicMastery[topic]) {
          topicMastery[topic] = {
            attempts: 0,
            correct: 0,
            total: 0
          };
        }
        topicMastery[topic].attempts++;
        topicMastery[topic].correct += analysis.correct;
        topicMastery[topic].total += analysis.total;
      });
    });

    // Generate comprehensive report
    const transcriptText = lecture.transcript_chunks?.join(' ') || '';
    const keyConcepts = extractKeyConcepts(transcriptText);
    const improvementMetrics = calculateImprovementMetrics(performanceTrends);

    const enhancedReport = {
      lecture: {
        id: lecture.id,
        title: lecture.title,
        key_concepts: keyConcepts,
        topic_coverage: Object.keys(topicMastery)
      },
      performance_summary: {
        attempts_count: attempts.length,
        best_score: Math.max(...attempts.map(a => a.score), 0),
        average_score: attempts.length > 0 
          ? attempts.reduce((sum, a) => sum + a.score, 0) / attempts.length 
          : 0,
        improvement_trend: improvementMetrics,
        latest_attempt: attempts[0] ? {
          score: attempts[0].score,
          date: attempts[0].attempted_at,
          performance: JSON.parse(attempts[0].attempt_data).performance
        } : null
      },
      topic_mastery: Object.entries(topicMastery).map(([topic, data]) => ({
        topic,
        mastery_level: (data.correct / data.total) * 100,
        attempts: data.attempts,
        accuracy: (data.correct / data.total) * 100
      })),
      performance_history: performanceTrends.map(trend => ({
        date: trend.date,
        score: trend.score,
        time_taken: trend.time_taken,
        topic_breakdown: Object.entries(trend.topics).map(([topic, data]) => ({
          topic,
          accuracy: (data.correct / data.total) * 100,
          questions_count: data.total
        }))
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
    res.status(500).json({ 
      error: 'Failed to generate performance report',
      details: err.message
    });
  }
};

function generateCustomMessage(performance, improvement) {
  let message = '';
  
  if (performance.percentage >= 90) {
    message = 'Outstanding performance! ';
  } else if (performance.percentage >= 75) {
    message = 'Great job! ';
  } else if (performance.percentage >= 60) {
    message = 'Good effort! ';
  } else {
    message = 'Keep practicing! ';
  }

  if (improvement.scoreImprovement > 0) {
    message += `You've improved by ${Math.round(improvement.scoreImprovement)}% from your previous best. `;
  }

  message += `You answered ${performance.correctAnswers} out of ${performance.totalQuestions} questions correctly.`;
  
  return message;
}


/**
 * Generate personalized recommendations based on quiz performance
 */
function analyzeQuestionsByTopic(questions, answers) {
  const topicAnalysis = {};
  
  questions.forEach((question, index) => {
    // Extract topic from question using keywords or categories
    const topic = extractTopicFromQuestion(question.question);
    
    if (!topicAnalysis[topic]) {
      topicAnalysis[topic] = {
        total: 0,
        correct: 0,
        incorrect: 0,
        questions: [],
        weak_points: [],
        mastery_level: 0
      };
    }
    
    const isCorrect = answers[index] === question.correct;
    topicAnalysis[topic].total++;
    topicAnalysis[topic][isCorrect ? 'correct' : 'incorrect']++;
    topicAnalysis[topic].questions.push({
      text: question.question,
      correct: isCorrect,
      explanation: question.explanation
    });
    
    // Calculate mastery level (0-100)
    topicAnalysis[topic].mastery_level = 
      (topicAnalysis[topic].correct / topicAnalysis[topic].total) * 100;
      
    // Identify weak points based on incorrect answers
    if (!isCorrect) {
      topicAnalysis[topic].weak_points.push(
        extractConceptFromQuestion(question.question)
      );
    }
  });
  
  return topicAnalysis;
}

function extractTopicFromQuestion(question) {
  // Simple keyword-based topic extraction
  const topics = {
    'algorithm': ['complexity', 'sorting', 'searching', 'optimization'],
    'data structure': ['array', 'linked list', 'tree', 'graph', 'hash'],
    'database': ['SQL', 'query', 'table', 'index', 'join'],
    'networking': ['protocol', 'TCP', 'IP', 'HTTP', 'request'],
    'security': ['encryption', 'authentication', 'authorization', 'token']
    // Add more topics and keywords as needed
  };
  
  for (const [topic, keywords] of Object.entries(topics)) {
    if (keywords.some(keyword => 
      question.toLowerCase().includes(keyword.toLowerCase())
    )) {
      return topic;
    }
  }
  
  return 'general';
}

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

function generateDetailedRecommendations(performance, improvement, topicAnalysis) {
  const recommendations = [];
  
  // Performance-based recommendations
  if (performance.percentage < 50) {
    recommendations.push({
      type: 'study',
      message: 'Consider reviewing the lecture material again to strengthen your understanding of key concepts.',
      priority: 'high'
    });
  } else if (performance.percentage < 75) {
    recommendations.push({
      type: 'practice',
      message: 'Good progress! Try taking the quiz again to improve your score.',
      priority: 'medium'
    });
  } else {
    recommendations.push({
      type: 'achievement',
      message: 'Excellent performance! You have a strong grasp of the material.',
      priority: 'low'
    });
  }

  // Topic-specific recommendations
  Object.entries(topicAnalysis).forEach(([topic, analysis]) => {
    if (analysis.mastery_level < 60) {
      recommendations.push({
        type: 'topic_review',
        topic: topic,
        message: `Review ${topic} concepts, especially: ${analysis.weak_points.join(', ')}`,
        priority: 'high',
        weak_points: analysis.weak_points,
        resources: generateTopicResources(topic)
      });
    }
  });

  // Improvement-based recommendations
  if (improvement.scoreImprovement > 0) {
    recommendations.push({
      type: 'progress',
      message: `Great improvement! You've increased your score by ${Math.round(improvement.scoreImprovement)}% compared to your previous best.`,
      priority: 'low'
    });
  } else if (improvement.attemptsCount > 1) {
    recommendations.push({
      type: 'strategy',
      message: 'Try different study techniques or focus on specific topics to improve your score.',
      priority: 'medium'
    });
  }

  // Time management recommendations
  const avgTimePerQuestion = performance.timeSpent / performance.totalQuestions;
  if (avgTimePerQuestion < 30) {
    recommendations.push({
      type: 'pacing',
      message: 'Take more time to carefully analyze each question. Quality over speed!',
      priority: 'medium',
      suggested_time: '45-60 seconds per question'
    });
  } else if (avgTimePerQuestion > 180) {
    recommendations.push({
      type: 'time_management',
      message: 'Work on time management. Try to spend no more than 2 minutes per question.',
      priority: 'medium',
      suggested_time: '90-120 seconds per question'
    });
  }

  return recommendations.sort((a, b) => 
    priorityOrder[a.priority] - priorityOrder[b.priority]
  );
}

function generateCustomMessage(performance, improvement) {
  let message = '';
  
  if (performance.percentage >= 90) {
    message = 'Outstanding performance! ';
  } else if (performance.percentage >= 75) {
    message = 'Great job! ';
  } else if (performance.percentage >= 60) {
    message = 'Good effort! ';
  } else {
    message = 'Keep practicing! ';
  }

  if (improvement.scoreImprovement > 0) {
    message += `You've improved by ${Math.round(improvement.scoreImprovement)}% from your previous best. `;
  }

  message += `You answered ${performance.correctAnswers} out of ${performance.totalQuestions} questions correctly.`;
  
  return message;
}

function generateTopicResources(topic) {
  const resourceMap = {
    'algorithm': [
      { type: 'video', title: 'Algorithm Basics', url: 'https://example.com/algo-basics' },
      { type: 'practice', title: 'Algorithm Exercises', url: 'https://example.com/algo-practice' }
    ],
    'data structure': [
      { type: 'tutorial', title: 'Data Structure Fundamentals', url: 'https://example.com/ds-basics' },
      { type: 'visualization', title: 'Interactive DS Visualizer', url: 'https://example.com/ds-visual' }
    ]
    // Add more topics and resources
  };

  return resourceMap[topic] || [];
}

const priorityOrder = {
  'high': 1,
  'medium': 2,
  'low': 3
};

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
    Object.entries(trend.topics).forEach(([topic, analysis]) => {
      if (!topicImprovements.has(topic)) {
        topicImprovements.set(topic, []);
      }
      topicImprovements.get(topic).push(analysis.mastery_level);
    });
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
  Object.entries(topicMastery).forEach(([topic, data]) => {
    const masteryLevel = (data.correct / data.total) * 100;
    
    if (masteryLevel < 60) {
      recommendations.push({
        type: 'topic_focus',
        topic: topic,
        message: `Focus on improving your understanding of ${topic}. Current mastery: ${Math.round(masteryLevel)}%`,
        priority: 'high',
        suggested_resources: generateTopicResources(topic)
      });
    }
  });

  // Improvement-based recommendations
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

  // Key concepts focus
  if (keyConcepts.length > 0) {
    recommendations.push({
      type: 'concepts',
      message: 'Review these key concepts from the lecture:',
      concepts: keyConcepts.slice(0, 5),
      priority: 'medium'
    });
  }

  return recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

/**
 * Fetch quiz attempts by user with detailed performance data
 */
export const getQuizAttempts = async (req, res) => {
  try {
    const quizId = req.params.quizId;
    const userId = req.user.id;

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
        ...attempt,
        attempt_data: attemptData,
        performance_summary: attemptData.performance ? {
          score: attemptData.performance.percentage,
          attempted: attemptData.performance.attemptedQuestions,
          total: attemptData.performance.totalQuestions,
          completion_rate: attemptData.performance.completionRate,
          accuracy_rate: attemptData.performance.accuracyRate
        } : null
      };
    });

    res.json(enhancedAttempts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch quiz attempts' });
  }
};

/**
 * Get comprehensive quiz performance report for a user
 */
export const getQuizPerformanceReport = async (req, res) => {
  try {
    const { lectureId } = req.params;
    
    // Check if user is authenticated
    if (!req.user) {
      console.error('[Performance Report] No authenticated user found');
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'You must be logged in to view quiz performance'
      });
    }

    const userId = req.user.userId; // Changed from req.user.id to req.user.userId to match JWT payload
    console.log(`[Performance Report] Generating report for lecture ${lectureId}, user ${userId}`);

    // Validate input parameters
    if (!lectureId) {
      console.error('[Performance Report] Missing lectureId parameter');
      return res.status(400).json({ error: 'Lecture ID is required' });
    }

    if (!userId) {
      console.error('[Performance Report] Missing userId in request');
      return res.status(400).json({ error: 'User authentication required' });
    }

    // Get all quiz attempts for the lecture
    console.log('[Performance Report] Fetching quiz attempts from database...');
    const attempts = await pool.query(`
      SELECT 
        qa.id, qa.quiz_id, qa.score, qa.attempt_data, qa.attempted_at,
        q.difficulty, q.lang, q.items_json
      FROM quiz_attempts qa
      JOIN quizzes q ON qa.quiz_id = q.id
      WHERE q.lecture_id = $1 AND qa.user_id = $2
      ORDER BY qa.attempted_at DESC
    `, [lectureId, userId]);

    if (attempts.rows.length === 0) {
      return res.json({
        message: 'No quiz attempts found for this lecture',
        attempts: [],
        summary: null
      });
    }

    console.log(`[Performance Report] Processing ${attempts.rows.length} attempts...`);
    
    // Process attempts and calculate summary statistics
    const processedAttempts = attempts.rows.map(attempt => {
      let attemptData = {};
      try {
        if (!attempt.attempt_data) {
          console.warn(`[Performance Report] Missing attempt_data for attempt ${attempt.id}`);
          return null;
        }

        attemptData = typeof attempt.attempt_data === 'string' 
          ? JSON.parse(attempt.attempt_data) 
          : attempt.attempt_data;

        if (!attemptData) {
          console.warn(`[Performance Report] Empty attempt_data for attempt ${attempt.id}`);
          return null;
        }

        return {
          id: attempt.id,
          quiz_id: attempt.quiz_id,
          score: attempt.score || 0,
          attempted_at: attempt.attempted_at,
          difficulty: attempt.difficulty,
          language: attempt.lang,
          performance: attemptData.performance || {
            percentage: attempt.score || 0,
            attemptedQuestions: 0,
            totalQuestions: 0,
            correctAnswers: 0
          },
          partial_submission: attemptData.partial_submission || false,
          time_taken: attemptData.time_taken || 0
        };
      } catch (e) {
        console.error(`[Performance Report] Error processing attempt ${attempt.id}:`, e);
        return null;
      }
    }).filter(attempt => attempt !== null);

    // Calculate summary statistics
    console.log('[Performance Report] Calculating summary statistics...');

    if (processedAttempts.length === 0) {
      return res.json({
        message: 'No valid quiz attempts found for this lecture',
        summary: {
          totalAttempts: 0,
          completedAttempts: 0,
          partialAttempts: 0,
          bestScore: 0,
          averageScore: 0,
          improvement: 0,
          lastAttemptDate: null,
          recommendedActions: []
        },
        attempts: [],
        bestAttempt: null
      });
    }

    const bestAttempt = processedAttempts.reduce((best, current) => 
      (!best || (current.score > best.score)) ? current : best
    , null);

    const averageScore = processedAttempts.reduce((sum, attempt) => 
      sum + (attempt.score || 0), 0) / processedAttempts.length;

    const totalAttempts = processedAttempts.length;
    const completedAttempts = processedAttempts.filter(a => !a.partial_submission).length;

    // Calculate average time per question
    const avgTimePerQuestion = processedAttempts.reduce((sum, attempt) => {
      const questionCount = attempt.performance?.totalQuestions || 0;
      const timeTaken = attempt.time_taken || 0;
      return questionCount > 0 ? sum + (timeTaken / questionCount) : sum;
    }, 0) / totalAttempts;

    const summary = {
      totalAttempts,
      completedAttempts,
      partialAttempts: totalAttempts - completedAttempts,
      bestScore: bestAttempt?.score || 0,
      averageScore: Math.round(averageScore * 100) / 100,
      improvement: totalAttempts > 1 ? 
        (processedAttempts[0].score || 0) - (processedAttempts[processedAttempts.length - 1].score || 0) : 0,
      lastAttemptDate: processedAttempts[0].attempted_at,
      avgTimePerQuestion: Math.round(avgTimePerQuestion),
      recommendedActions: generateLearningRecommendations(processedAttempts)
    };

    const response = {
      summary,
      attempts: processedAttempts.map(attempt => ({
        id: attempt.id,
        quiz_id: attempt.quiz_id,
        score: attempt.score,
        attempted_at: attempt.attempted_at,
        difficulty: attempt.difficulty,
        language: attempt.language,
        performance: {
          score: attempt.score,
          attempted: attempt.performance?.attemptedQuestions || 0,
          total: attempt.performance?.totalQuestions || 0,
          correct: attempt.performance?.correctAnswers || 0,
          time_taken: attempt.time_taken || 0,
          partial: attempt.partial_submission
        }
      })),
      bestAttempt: bestAttempt ? {
        id: bestAttempt.id,
        score: bestAttempt.score,
        performance: bestAttempt.performance,
        attempted_at: bestAttempt.attempted_at
      } : null
    };

    // Get lecture content and performance data
    const [lectureData, quizAttempts] = await Promise.all([
      // Get lecture content and metadata
      pool.query(`
        SELECT l.*, array_agg(tc.content ORDER BY tc.chunk_order) as transcript_chunks
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
      return res.status(404).json({ error: 'Lecture not found' });
    }

    const lecture = lectureData.rows[0];
    const attempts = quizAttempts.rows;
    
    // Extract key concepts from lecture content
    const transcriptText = lecture.transcript_chunks?.join(' ') || '';
    const keyConcepts = extractKeyConcepts(transcriptText);

    // Analyze performance trends
    const performanceTrends = attempts.map(attempt => {
      const attemptData = JSON.parse(attempt.attempt_data);
      return {
        date: attempt.attempted_at,
        score: attempt.score,
        time_taken: attemptData.time_taken,
        topics: analyzeQuestionsByTopic(
          JSON.parse(attempt.items_json).questions,
          attemptData.answers
        )
      };
    });

    // Calculate mastery levels by topic
    const topicMastery = {};
    performanceTrends.forEach(attempt => {
      Object.entries(attempt.topics).forEach(([topic, analysis]) => {
        if (!topicMastery[topic]) {
          topicMastery[topic] = {
            attempts: 0,
            correct: 0,
            total: 0
          };
        }
        topicMastery[topic].attempts++;
        topicMastery[topic].correct += analysis.correct;
        topicMastery[topic].total += analysis.total;
      });
    });

    // Calculate improvement metrics
    const improvementMetrics = calculateImprovementMetrics(performanceTrends);

    const enhancedReport = {
      lecture: {
        id: lecture.id,
        title: lecture.title,
        key_concepts: keyConcepts,
        topic_coverage: Object.keys(topicMastery)
      },
      performance_summary: {
        attempts_count: attempts.length,
        best_score: Math.max(...attempts.map(a => a.score)),
        average_score: attempts.reduce((sum, a) => sum + a.score, 0) / attempts.length,
        improvement_trend: improvementMetrics,
        latest_attempt: attempts[0] ? {
          score: attempts[0].score,
          date: attempts[0].attempted_at,
          performance: JSON.parse(attempts[0].attempt_data).performance
        } : null
      },
      topic_mastery: Object.entries(topicMastery).map(([topic, data]) => ({
        topic,
        mastery_level: (data.correct / data.total) * 100,
        attempts: data.attempts,
        accuracy: (data.correct / data.total) * 100
      })),
      performance_history: performanceTrends.map(trend => ({
        date: trend.date,
        score: trend.score,
        time_taken: trend.time_taken,
        topic_breakdown: Object.entries(trend.topics).map(([topic, data]) => ({
          topic,
          accuracy: (data.correct / data.total) * 100,
          questions_count: data.total
        }))
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
    res.status(500).json({ 
      error: 'Failed to generate performance report',
      details: err.message
    });
  }
};

/**
 * Generate learning recommendations based on quiz history
 */
function generateLearningRecommendations(attempts) {
  const recommendations = [];
  
  if (attempts.length === 0) return recommendations;

  const latestAttempt = attempts[0];
  const hasImprovement = attempts.length > 1 && 
    latestAttempt.score > attempts[attempts.length - 1].score;

  // Performance-based recommendations
  if (latestAttempt.score < 60) {
    recommendations.push({
      type: 'study_material',
      message: 'Your quiz scores suggest you may benefit from reviewing the lecture content more thoroughly.',
      priority: 'high',
      action: 'Review lecture materials and take notes on key concepts'
    });
  }

  // Improvement tracking
  if (hasImprovement) {
    recommendations.push({
      type: 'progress',
      message: 'Great job! Your scores are improving. Keep practicing to maintain this momentum.',
      priority: 'medium',
      action: 'Continue regular practice and review'
    });
  } else if (attempts.length > 2) {
    recommendations.push({
      type: 'strategy',
      message: 'Consider changing your study approach or seeking additional help to improve your performance.',
      priority: 'medium',
      action: 'Try different study methods or discuss with instructor'
    });
  }

  // Completion rate
  const partialAttempts = attempts.filter(a => a.partial_submission).length;
  if (partialAttempts > attempts.length * 0.5) {
    recommendations.push({
      type: 'completion',
      message: 'You often leave questions unanswered. Try to attempt all questions even if unsure.',
      priority: 'medium',
      action: 'Practice time management and attempt all questions'
    });
  }

  return recommendations;
}

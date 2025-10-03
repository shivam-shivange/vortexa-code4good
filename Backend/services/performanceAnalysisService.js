import pool from '../utils/db.js';

/**
 * Analyze questions by topic
 */
export const analyzeQuestionsByTopic = async (quizId) => {
    try {
        const result = await pool.query(`
            SELECT 
                q.topic,
                COUNT(*) as total_questions,
                SUM(CASE WHEN qa.is_correct THEN 1 ELSE 0 END) as correct_answers
            FROM questions q
            LEFT JOIN quiz_attempts qa ON q.id = qa.question_id
            WHERE qa.quiz_id = $1
            GROUP BY q.topic
        `, [quizId]);
        
        return result.rows;
    } catch (error) {
        console.error('Error in analyzeQuestionsByTopic:', error);
        throw error;
    }
};

/**
 * Extract key concepts from user's performance
 */
export const extractKeyConcepts = async (userId, timeframe = '30 days') => {
    try {
        const result = await pool.query(`
            SELECT 
                q.key_concepts,
                COUNT(*) as encounter_count,
                AVG(CASE WHEN qa.is_correct THEN 1 ELSE 0 END) as mastery_level
            FROM questions q
            JOIN quiz_attempts qa ON q.id = qa.question_id
            WHERE qa.user_id = $1
            AND qa.attempted_at >= NOW() - INTERVAL '$2'
            GROUP BY q.key_concepts
        `, [userId, timeframe]);
        
        return result.rows;
    } catch (error) {
        console.error('Error in extractKeyConcepts:', error);
        throw error;
    }
};

/**
 * Calculate improvement metrics
 */
export const calculateImprovementMetrics = async (userId, currentQuizId) => {
    try {
        const result = await pool.query(`
            WITH current_performance AS (
                SELECT AVG(CASE WHEN is_correct THEN 1 ELSE 0 END) as current_score
                FROM quiz_attempts
                WHERE user_id = $1 AND quiz_id = $2
            ),
            historical_performance AS (
                SELECT AVG(CASE WHEN is_correct THEN 1 ELSE 0 END) as historical_score
                FROM quiz_attempts
                WHERE user_id = $1 AND quiz_id != $2
                AND attempted_at >= NOW() - INTERVAL '30 days'
            )
            SELECT 
                cp.current_score,
                hp.historical_score,
                (cp.current_score - hp.historical_score) as improvement
            FROM current_performance cp
            CROSS JOIN historical_performance hp
        `, [userId, currentQuizId]);
        
        return result.rows[0];
    } catch (error) {
        console.error('Error in calculateImprovementMetrics:', error);
        throw error;
    }
};

/**
 * Generate comprehensive recommendations
 */
export const generateComprehensiveRecommendations = async (userId) => {
    try {
        // Get weak topics
        const weakTopics = await pool.query(`
            SELECT 
                q.topic,
                AVG(CASE WHEN qa.is_correct THEN 1 ELSE 0 END) as success_rate
            FROM questions q
            JOIN quiz_attempts qa ON q.id = qa.question_id
            WHERE qa.user_id = $1
            GROUP BY q.topic
            HAVING AVG(CASE WHEN qa.is_correct THEN 1 ELSE 0 END) < 0.7
            ORDER BY success_rate ASC
        `, [userId]);

        // Get challenging concepts
        const challengingConcepts = await pool.query(`
            SELECT 
                q.key_concepts,
                COUNT(*) as attempt_count,
                AVG(CASE WHEN qa.is_correct THEN 1 ELSE 0 END) as success_rate
            FROM questions q
            JOIN quiz_attempts qa ON q.id = qa.question_id
            WHERE qa.user_id = $1
            GROUP BY q.key_concepts
            HAVING AVG(CASE WHEN qa.is_correct THEN 1 ELSE 0 END) < 0.7
            ORDER BY success_rate ASC
        `, [userId]);

        return {
            weakTopics: weakTopics.rows,
            challengingConcepts: challengingConcepts.rows,
            recommendations: [
                ...weakTopics.rows.map(topic => `Focus on strengthening your understanding of ${topic.topic}`),
                ...challengingConcepts.rows.map(concept => `Review the concept: ${concept.key_concepts}`)
            ]
        };
    } catch (error) {
        console.error('Error in generateComprehensiveRecommendations:', error);
        throw error;
    }
};

/**
 * Get detailed performance analysis for a user
 */
export const getUserPerformanceAnalysis = async (userId) => {
    try {
        // Get quiz attempts and performance
        const quizData = await pool.query(`
            SELECT 
                q.lecture_id,
                q.items_json->'topics' as topics,
                qa.score,
                qa.attempt_data,
                l.title as lecture_title
            FROM quiz_attempts qa
            JOIN quizzes q ON qa.quiz_id = q.id
            JOIN lectures l ON q.lecture_id = l.id
            WHERE qa.user_id = $1
            ORDER BY qa.attempted_at DESC
        `, [userId]);

        // Get viewing statistics
        const viewingStats = await pool.query(`
            SELECT 
                lecture_id,
                COUNT(*) as view_count,
                SUM(CAST(details->>'time_spent' as INTEGER)) as total_time_spent
            FROM events
            WHERE user_id = $1 AND event_type = 'lecture.viewed'
            GROUP BY lecture_id
        `, [userId]);

        // Analyze strengths and weaknesses
        const topicPerformance = analyzeTopicPerformance(quizData.rows);
        const viewingPatterns = analyzeViewingPatterns(viewingStats.rows);
        const learningProgress = calculateLearningProgress(quizData.rows, viewingStats.rows);

        return {
            overallProgress: learningProgress,
            topicAnalysis: {
                strengths: topicPerformance.strengths,
                weaknesses: topicPerformance.weaknesses,
                recommendations: generateRecommendations(topicPerformance)
            },
            viewingAnalysis: viewingPatterns,
            recentActivity: {
                lastQuizAttempt: quizData.rows[0],
                recentlyViewedLectures: viewingStats.rows.slice(0, 5)
            }
        };
    } catch (error) {
        console.error('Error analyzing user performance:', error);
        throw error;
    }
};

/**
 * Analyze performance by topic
 */
const analyzeTopicPerformance = (quizAttempts) => {
    const topicScores = {};
    const topicAttempts = {};

    quizAttempts.forEach(attempt => {
        const topics = attempt.topics || [];
        const score = attempt.score;

        topics.forEach(topic => {
            if (!topicScores[topic]) {
                topicScores[topic] = 0;
                topicAttempts[topic] = 0;
            }
            topicScores[topic] += score;
            topicAttempts[topic]++;
        });
    });

    // Calculate average scores per topic
    const averageScores = Object.keys(topicScores).map(topic => ({
        topic,
        averageScore: topicScores[topic] / topicAttempts[topic],
        attempts: topicAttempts[topic]
    }));

    // Sort by average score
    averageScores.sort((a, b) => b.averageScore - a.averageScore);

    return {
        strengths: averageScores.filter(topic => topic.averageScore >= 0.7),
        weaknesses: averageScores.filter(topic => topic.averageScore < 0.7)
    };
};

/**
 * Analyze viewing patterns
 */
const analyzeViewingPatterns = (viewingStats) => {
    return viewingStats.map(stat => ({
        lectureId: stat.lecture_id,
        engagementScore: calculateEngagementScore(stat.view_count, stat.total_time_spent),
        viewCount: stat.view_count,
        averageViewDuration: Math.round(stat.total_time_spent / stat.view_count)
    }));
};

/**
 * Calculate engagement score
 */
const calculateEngagementScore = (viewCount, timeSpent) => {
    // Simple engagement score calculation
    // Normalize view count and time spent to 0-1 range
    const normalizedViews = Math.min(viewCount / 10, 1);
    const normalizedTime = Math.min(timeSpent / (3600 * 2), 1); // Cap at 2 hours
    
    return (normalizedViews + normalizedTime) / 2;
};

/**
 * Calculate overall learning progress
 */
const calculateLearningProgress = (quizAttempts, viewingStats) => {
    const totalQuizzes = quizAttempts.length;
    const uniqueLectures = new Set(viewingStats.map(stat => stat.lecture_id)).size;
    const averageScore = quizAttempts.reduce((sum, attempt) => sum + attempt.score, 0) / totalQuizzes;

    return {
        quizzesTaken: totalQuizzes,
        lecturesWatched: uniqueLectures,
        averageScore: averageScore,
        progressPercentage: Math.round((averageScore * 100 + (uniqueLectures / 10) * 100) / 2)
    };
};

/**
 * Generate personalized recommendations
 */
const generateRecommendations = (topicPerformance) => {
    const recommendations = [];

    // Recommend focusing on weak topics
    topicPerformance.weaknesses.forEach(topic => {
        recommendations.push({
            type: 'improvement',
            topic: topic.topic,
            message: `Consider reviewing materials related to ${topic.topic}. Your current average score is ${Math.round(topic.averageScore * 100)}%.`
        });
    });

    // Recommend advanced content for strong topics
    topicPerformance.strengths.forEach(topic => {
        recommendations.push({
            type: 'advancement',
            topic: topic.topic,
            message: `You're doing well in ${topic.topic}! Consider exploring advanced content in this area.`
        });
    });

    return recommendations;
};
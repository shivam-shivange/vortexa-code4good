// Helper functions for quiz performance and analysis
const generateCustomMessage = (performance, improvement) => {
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
};

const extractTopicFromQuestion = (question) => {
  const topics = {
    'algorithm': ['complexity', 'sorting', 'searching', 'optimization'],
    'data structure': ['array', 'linked list', 'tree', 'graph', 'hash'],
    'database': ['SQL', 'query', 'table', 'index', 'join'],
    'networking': ['protocol', 'TCP', 'IP', 'HTTP', 'request'],
    'security': ['encryption', 'authentication', 'authorization', 'token']
  };
  
  for (const [topic, keywords] of Object.entries(topics)) {
    if (keywords.some(keyword => question.toLowerCase().includes(keyword.toLowerCase()))) {
      return topic;
    }
  }
  
  return 'general';
};

const analyzeQuestionsByTopic = (questions, answers) => {
  const topicAnalysis = {};
  
  questions.forEach((question, index) => {
    const topic = extractTopicFromQuestion(question.question);
    
    if (!topicAnalysis[topic]) {
      topicAnalysis[topic] = {
        total: 0,
        correct: 0,
        incorrect: 0,
        questions: [],
        weak_points: []
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
    
    topicAnalysis[topic].mastery_level = 
      (topicAnalysis[topic].correct / topicAnalysis[topic].total) * 100;
      
    if (!isCorrect) {
      topicAnalysis[topic].weak_points.push(question.question);
    }
  });
  
  return topicAnalysis;
};

const generateLearningRecommendations = (attempts) => {
  const recommendations = [];
  
  if (attempts.length === 0) return recommendations;

  const latestAttempt = attempts[0];
  const hasImprovement = attempts.length > 1 && 
    latestAttempt.score > attempts[attempts.length - 1].score;

  if (latestAttempt.score < 60) {
    recommendations.push({
      type: 'study',
      priority: 'high',
      message: 'Review the core concepts more thoroughly before attempting again.',
      resources: ['lecture_review', 'practice_exercises']
    });
  }

  if (hasImprovement) {
    recommendations.push({
      type: 'encouragement',
      priority: 'medium',
      message: 'Great progress! Keep practicing to maintain this improvement.',
      resources: ['advanced_exercises']
    });
  }

  return recommendations;
};

const priorityOrder = {
  'high': 1,
  'medium': 2,
  'low': 3
};

export { 
  generateCustomMessage, 
  analyzeQuestionsByTopic,
  extractTopicFromQuestion, 
  generateLearningRecommendations,
  priorityOrder 
};
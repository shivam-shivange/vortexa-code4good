import pool from '../utils/db.js';
import geminiService from './geminiService.js';

/**
 * Normalizes language codes to ISO 639-1 format
 */
const normalizeLanguage = (lang) => {
  const langMap = {
    'english': 'en',
    'en': 'en',
    'eng': 'en',
    'hindi': 'hi',
    'hi': 'hi',
    'hin': 'hi',
    'marathi': 'mr',
    'mr': 'mr',
    'mar': 'mr'
  };
  return langMap[lang.toLowerCase()] || 'en';
};

export const generateQuiz = async (lectureId, lang='en', difficulty='medium', numQuestions=10) => {
  try {
    // Normalize language code
    const normalizedLang = normalizeLanguage(lang);
    
    // Get lecture content from summaries and transcripts
    console.log(`Generating quiz for lecture ID: ${lectureId}`);
    
    const summary = (await pool.query('SELECT * FROM summaries WHERE lecture_id=$1 AND summary_type=$2', [lectureId,'session'])).rows[0];
    // Get concatenated transcript from chunks
    const transcriptChunks = await pool.query(
      'SELECT text FROM transcript_chunks WHERE lecture_id=$1 ORDER BY start_ts',
      [lectureId]
    );
    
    // Combine all chunks into one transcript
    const transcriptText = transcriptChunks.rows.map(chunk => chunk.text).join(' ');
    
    console.log('Found summary:', !!summary, 'Found transcript chunks:', transcriptChunks.rows.length);
    
    let content = '';
    if (summary?.content_md) {
      content += summary.content_md + '\n\n';
    }
    if (transcriptText) {
      content += transcriptText;
    }
    
    if (!content.trim()) {
      console.error('No content found for quiz generation. Summary and transcript chunks are missing.');
      throw new Error('No content available for quiz generation. Please ensure the lecture has been processed successfully.');
    }

    // Generate quiz using Gemini with strict MCQ-only requirements
    const quizResult = await geminiService.generateQuiz(content, {
      difficulty,
      language: lang,
      numQuestions,
      questionTypes: ['mcq'], // Only MCQ questions
      includeExplanations: true
    });

    if (!quizResult.success || !quizResult.quiz?.questions) {
      throw new Error('Failed to generate quiz from Gemini');
    }

    // Filter and validate questions to ensure only MCQ format
    const mcqQuestions = quizResult.quiz.questions
      .filter(q => q.type === 'mcq' && q.options && Array.isArray(q.options) && q.options.length >= 4)
      .map((q, index) => ({
        id: index + 1,
        question: q.question,
        options: q.options.slice(0, 4), // Ensure exactly 4 options
        correct: typeof q.correct_answer === 'string' ? 
          q.options.indexOf(q.correct_answer) : 
          (typeof q.correct_answer === 'number' ? q.correct_answer : 0),
        explanation: q.explanation || 'No explanation provided',
        timestamp: index * 60 // estimated timestamp
      }))
      .filter(q => q.correct >= 0 && q.correct < 4); // Ensure valid correct answer index

    if (mcqQuestions.length === 0) {
      throw new Error('No valid MCQ questions generated');
    }

    const quizItems = { questions: mcqQuestions };

    // Store the quiz in database
    const result = await pool.query(
      'INSERT INTO quizzes(lecture_id, lang, difficulty, items_json, gemini_model, generated_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
      [lectureId, normalizedLang, difficulty, JSON.stringify(quizItems), 'gemini-1.5-flash', new Date()]
    );

    return {
      success: true,
      quizId: result.rows[0].id,
      questionsGenerated: mcqQuestions.length,
      questions: mcqQuestions
    };

  } catch (error) {
    console.error('Quiz generation failed:', error);
    throw new Error(`Quiz generation failed: ${error.message}`);
  }
};

export const calculateQuizScore = (questions, userAnswers) => {
  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    return { score: 0, totalQuestions: 0, correctAnswers: 0, percentage: 0 };
  }

  let correctAnswers = 0;
  const totalQuestions = questions.length;
  const attemptedQuestions = Object.keys(userAnswers || {}).length;

  // Calculate score based on attempted questions
  questions.forEach((question, index) => {
    const userAnswer = userAnswers?.[index];
    if (userAnswer !== undefined && userAnswer === question.correct) {
      correctAnswers++;
    }
  });

  const percentage = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;

  return {
    score: correctAnswers,
    totalQuestions,
    attemptedQuestions,
    correctAnswers,
    percentage: Math.round(percentage * 100) / 100,
    unattemptedQuestions: totalQuestions - attemptedQuestions
  };
};

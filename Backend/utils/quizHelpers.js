// Helper functions for quiz generation

/**
 * Extract key topics from transcript text
 */
export const extractTopics = (text) => {
    // Simple topic extraction (replace with more sophisticated NLP in production)
    const topics = new Set();
    const sentences = text.split(/[.!?]+/);
    
    sentences.forEach(sentence => {
        // Look for noun phrases and key terms
        const words = sentence.trim().split(' ');
        for (let i = 0; i < words.length - 1; i++) {
            if (words[i].length > 3) {  // Simple filter for meaningful words
                topics.add(words[i].toLowerCase());
            }
        }
    });

    return Array.from(topics);
};

/**
 * Generate questions based on topics and difficulty
 */
export const generateQuestionsForTopics = (topics, difficulty) => {
    const questions = [];
    const difficultyFactors = {
        'easy': { optionCount: 3, distractorComplexity: 'simple' },
        'medium': { optionCount: 4, distractorComplexity: 'moderate' },
        'hard': { optionCount: 4, distractorComplexity: 'complex' }
    };

    // Generate 2-3 questions per topic
    topics.slice(0, 5).forEach(topic => {
        const questionCount = Math.floor(Math.random() * 2) + 2; // 2-3 questions
        
        for (let i = 0; i < questionCount; i++) {
            const question = generateQuestionForTopic(topic, difficultyFactors[difficulty]);
            questions.push({
                ...question,
                topic: topic,
                difficulty: difficulty
            });
        }
    });

    return questions.slice(0, 10); // Limit to 10 questions
};

/**
 * Generate a single question for a topic
 */
const generateQuestionForTopic = (topic, factors) => {
    const questionTypes = [
        'What is the primary purpose of',
        'Which best describes',
        'How does',
        'What is the relationship between',
        'Which example demonstrates'
    ];

    const question = `${questionTypes[Math.floor(Math.random() * questionTypes.length)]} ${topic}?`;
    const options = generateOptions(factors.optionCount);
    const correct = Math.floor(Math.random() * factors.optionCount);

    return {
        question,
        options,
        correct,
        explanation: `This question tests your understanding of ${topic}.`
    };
};

/**
 * Generate options for a question
 */
const generateOptions = (count) => {
    const baseOptions = [
        'It represents the fundamental concept',
        'It provides a structural framework',
        'It enables systematic processing',
        'It facilitates dynamic interaction'
    ];

    return baseOptions.slice(0, count).map((opt, i) => 
        `${opt} of the ${i === 0 ? 'main' : 'related'} components`
    );
};
import { calculateQuizScore } from './services/quizService.js';

// Test the quiz scoring system
console.log('Testing Quiz Scoring System...\n');

// Sample quiz questions (MCQ format)
const sampleQuestions = [
  {
    id: 1,
    question: "What is the capital of France?",
    options: ["London", "Paris", "Berlin", "Madrid"],
    correct: 1,
    explanation: "Paris is the capital and largest city of France."
  },
  {
    id: 2,
    question: "Which programming language is known for its simplicity?",
    options: ["C++", "Java", "Python", "Assembly"],
    correct: 2,
    explanation: "Python is known for its simple and readable syntax."
  },
  {
    id: 3,
    question: "What does HTML stand for?",
    options: ["Hyper Text Markup Language", "High Tech Modern Language", "Home Tool Markup Language", "Hyperlink and Text Markup Language"],
    correct: 0,
    explanation: "HTML stands for Hyper Text Markup Language."
  },
  {
    id: 4,
    question: "Which planet is closest to the Sun?",
    options: ["Venus", "Earth", "Mercury", "Mars"],
    correct: 2,
    explanation: "Mercury is the closest planet to the Sun."
  },
  {
    id: 5,
    question: "What is 2 + 2?",
    options: ["3", "4", "5", "6"],
    correct: 1,
    explanation: "2 + 2 equals 4."
  }
];

// Test Case 1: All questions answered correctly
console.log('Test Case 1: All questions answered correctly');
const answers1 = { 0: 1, 1: 2, 2: 0, 3: 2, 4: 1 };
const result1 = calculateQuizScore(sampleQuestions, answers1);
console.log('Result:', result1);
console.log('Expected: 100% score, 5/5 correct\n');

// Test Case 2: Partial answers (some correct, some wrong)
console.log('Test Case 2: Partial answers (some correct, some wrong)');
const answers2 = { 0: 1, 1: 0, 2: 0, 3: 1, 4: 1 };
const result2 = calculateQuizScore(sampleQuestions, answers2);
console.log('Result:', result2);
console.log('Expected: 60% score, 3/5 correct\n');

// Test Case 3: Incomplete submission (not all questions answered)
console.log('Test Case 3: Incomplete submission (not all questions answered)');
const answers3 = { 0: 1, 2: 0, 4: 1 };
const result3 = calculateQuizScore(sampleQuestions, answers3);
console.log('Result:', result3);
console.log('Expected: 60% score, 3/5 correct, 3/5 attempted, 2 unanswered\n');

// Test Case 4: No answers provided
console.log('Test Case 4: No answers provided');
const answers4 = {};
const result4 = calculateQuizScore(sampleQuestions, answers4);
console.log('Result:', result4);
console.log('Expected: 0% score, 0/5 correct, 0/5 attempted, 5 unanswered\n');

// Test Case 5: Empty questions array
console.log('Test Case 5: Empty questions array');
const result5 = calculateQuizScore([], answers1);
console.log('Result:', result5);
console.log('Expected: 0% score, 0 total questions\n');

console.log('Quiz scoring system tests completed!');

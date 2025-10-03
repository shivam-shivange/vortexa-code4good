// Lectures Management Module
class LecturesManager {
    constructor() {
        this.lectures = [];
        this.currentLecture = null;
        this.currentPage = 1;
        this.pageSize = CONFIG.PAGINATION.DEFAULT_PAGE_SIZE;
        this.totalLectures = 0;
        this.filters = {};
        this.sortBy = 'recent';
        this.searchQuery = '';
        this.currentQuiz = null;
        this.quizStartTime = null;
        
        this.init();
    }

    // Initialize lectures manager
    init() {
        this.setupEventListeners();
        this.restoreQuizState();
    }

    // Restore quiz state from localStorage
    restoreQuizState() {
        try {
            const savedQuiz = localStorage.getItem('currentQuiz');
            const savedStartTime = localStorage.getItem('quizStartTime');
            
            if (savedQuiz && savedStartTime) {
                this.currentQuiz = JSON.parse(savedQuiz);
                this.quizStartTime = parseInt(savedStartTime);
                
                // Only restore if we're on the quiz tab
                const quizContainer = Utils.$('#quiz-container');
                if (quizContainer && this.currentLecture) {
                    this.displayQuiz(this.currentQuiz);
                }
            }
        } catch (error) {
            CONFIG.logError('Failed to restore quiz state:', error);
            // Clear potentially corrupted data
            localStorage.removeItem('currentQuiz');
            localStorage.removeItem('quizStartTime');
        }
    }

    // Setup event listeners
    setupEventListeners() {
        // Search input
        const searchInput = Utils.$('#search-lectures');
        if (searchInput) {
            const debouncedSearch = Utils.debounce(this.handleSearch.bind(this), CONFIG.UI.DEBOUNCE_DELAY);
            Utils.on(searchInput, 'input', debouncedSearch);
        }

        // Sort dropdown
        const sortSelect = Utils.$('#sort-lectures');
        if (sortSelect) {
            Utils.on(sortSelect, 'change', this.handleSort.bind(this));
        }

        // Lecture modal tabs
        const lectureTabs = Utils.$$('.lecture-tabs .tab-btn');
        lectureTabs.forEach(tab => {
            Utils.on(tab, 'click', this.handleTabSwitch.bind(this));
        });

        // Generate summary button
        Utils.on('#generate-summary-btn', 'click', this.generateSummary.bind(this));

        // Generate quiz button
        Utils.on('#generate-quiz-btn', 'click', this.generateQuiz.bind(this));

        // View performance report button
        Utils.on('#view-performance-btn', 'click', this.viewPerformanceReport.bind(this));
    }

    // Load lectures from API
    async loadLectures(refresh = false) {
        try {
            if (!Auth.isUserAuthenticated()) {
                this.showEmptyState();
                return;
            }

            if (refresh) {
                this.currentPage = 1;
            }

            const params = {
                page: this.currentPage,
                limit: this.pageSize,
                sort: this.sortBy,
                ...this.filters
            };

            if (this.searchQuery) {
                params.search = this.searchQuery;
            }

            const response = await API.getLectures(params);
            
            if (refresh) {
                this.lectures = response.lectures || [];
            } else {
                this.lectures = [...this.lectures, ...(response.lectures || [])];
            }
            
            this.totalLectures = response.total || 0;
            this.renderLectures();
            this.updateStats();

        } catch (error) {
            CONFIG.logError('Failed to load lectures:', error);
            UI.showToast('error', 'Load Failed', error.message);
            this.showEmptyState();
        }
    }

    // Render lectures grid
    renderLectures() {
        const lecturesGrid = Utils.$('#lectures-grid');
        const emptyState = Utils.$('#lectures-empty');
        
        if (!lecturesGrid) return;

        if (this.lectures.length === 0) {
            this.showEmptyState();
            return;
        }

        // Hide empty state
        if (emptyState) {
            emptyState.style.display = 'none';
        }

        // Clear existing content if this is a refresh
        if (this.currentPage === 1) {
            lecturesGrid.innerHTML = '';
        }

        // Render lecture cards
        this.lectures.forEach(lecture => {
            if (!lecturesGrid.querySelector(`[data-lecture-id="${lecture.id}"]`)) {
                const lectureCard = this.createLectureCard(lecture);
                lecturesGrid.appendChild(lectureCard);
            }
        });

        lecturesGrid.style.display = 'grid';
    }

    // Create lecture card element
    createLectureCard(lecture) {
        const card = Utils.createElement('div', {
            className: 'lecture-card',
            'data-lecture-id': lecture.id
        });

        const thumbnail = lecture.thumbnail;
        const status = lecture.processing_status || 'ready';
        const statusClass = `status-${status}`;
        const statusText = status.charAt(0).toUpperCase() + status.slice(1);

        card.innerHTML = `
            <div class="lecture-thumbnail">
                ${thumbnail ? 
                    `<img src="${thumbnail}" alt="${lecture.title}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">` : 
                    ''
                }
                <div class="placeholder-video ${thumbnail ? 'hidden' : ''}" style="${thumbnail ? 'display: none;' : 'display: flex;'}">
                    <i class="fas fa-video" style="margin-right: 8px;"></i>
                    Video
                </div>
                <div class="lecture-status ${statusClass}">${statusText}</div>
            </div>
            <div class="lecture-info">
                <h3 class="lecture-title">${Utils.truncateText(lecture.title, 60)}</h3>
                <p class="lecture-description">${Utils.truncateText(lecture.description || 'No description available', 100)}</p>
                <div class="lecture-meta">
                    <span class="lecture-date">${Utils.formatRelativeTime(lecture.created_at || lecture.createdAt || lecture.upload_date || lecture.date)}</span>
                    <span class="lecture-duration">${lecture.duration ? Utils.formatDuration(lecture.duration) : 'Processing...'}</span>
                </div>
            </div>
        `;

        // Add click event to open lecture
        Utils.on(card, 'click', () => {
            this.openLecture(lecture.id);
        });

        return card;
    }

    // Show empty state
    showEmptyState() {
        const lecturesGrid = Utils.$('#lectures-grid');
        const emptyState = Utils.$('#lectures-empty');
        
        if (lecturesGrid) {
            lecturesGrid.style.display = 'none';
        }
        
        if (emptyState) {
            emptyState.style.display = 'block';
        }
    }

    // Handle search
    handleSearch(event) {
        this.searchQuery = event.target.value.trim();
        this.loadLectures(true);
    }

    // Handle sort
    handleSort(event) {
        this.sortBy = event.target.value;
        this.loadLectures(true);
    }

    // Open lecture in modal
    async openLecture(lectureId) {
        try {
            const response = await API.getLectureById(lectureId);
            
            CONFIG.log('API Response for lecture:', response);
            
            // Handle different response structures
            const lecture = response.lecture || response;
            
            if (!lecture || !lecture.id) {
                throw new Error('Invalid lecture data received from API');
            }
            
            this.currentLecture = lecture;
            
            CONFIG.log('Current lecture set to:', this.currentLecture);
            
            // Update modal content
            this.updateLectureModal(lecture);
            
            // Open modal
            UI.openModal('lecture-modal');
            
            // Switch to info tab
            this.switchLectureTab('info');
            
        } catch (error) {
            CONFIG.logError('Failed to load lecture:', error);
            UI.showToast('error', 'Load Failed', error.message);
        }
    }

    // Update lecture modal content
    updateLectureModal(lecture) {
        // Update title
        const titleElement = Utils.$('#lecture-modal-title');
        if (titleElement) {
            titleElement.textContent = lecture.title;
        }

        // Update video
        const videoElement = Utils.$('#lecture-video');
        if (videoElement && lecture.video_url) {
            videoElement.src = lecture.video_url;
        }

        // Update info content
        const descriptionElement = Utils.$('#lecture-description-text');
        if (descriptionElement) {
            descriptionElement.textContent = lecture.description || 'No description available.';
        }

        const dateElement = Utils.$('#lecture-date');
        if (dateElement) {
            // Try different possible date field names from the API
            const dateValue = lecture.created_at || lecture.createdAt || lecture.upload_date || lecture.date;
            dateElement.textContent = Utils.formatDate(dateValue);
        }

        const durationElement = Utils.$('#lecture-duration');
        if (durationElement) {
            durationElement.textContent = lecture.duration ? 
                Utils.formatDuration(lecture.duration) : 'Processing...';
        }

        const viewsElement = Utils.$('#lecture-views');
        if (viewsElement) {
            viewsElement.textContent = `${lecture.views || 0} views`;
        }
    }

    // Handle tab switching in lecture modal
    handleTabSwitch(event) {
        const tabName = event.target.getAttribute('data-tab');
        this.switchLectureTab(tabName);
    }

    // Switch lecture modal tab
    switchLectureTab(tabName) {
        // Update tab buttons
        const tabButtons = Utils.$$('.lecture-tabs .tab-btn');
        tabButtons.forEach(btn => {
            Utils.removeClass(btn, 'active');
            if (btn.getAttribute('data-tab') === tabName) {
                Utils.addClass(btn, 'active');
            }
        });

        // Update tab content
        const tabContents = Utils.$$('.lecture-tab-content .tab-content');
        tabContents.forEach(content => {
            Utils.removeClass(content, 'active');
            if (content.id === `${tabName}-content`) {
                Utils.addClass(content, 'active');
            }
        });
    }

    // Generate summary
    async generateSummary() {
        if (!this.currentLecture) {
            UI.showToast('error', 'No Lecture Selected', 'Please select a lecture first.');
            return;
        }

        if (!this.currentLecture.id) {
            UI.showToast('error', 'Invalid Lecture', 'Lecture ID is missing.');
            return;
        }

        try {
            const generateBtn = Utils.$('#generate-summary-btn');
            this.setButtonLoading(generateBtn, true);

            const summaryContainer = Utils.$('#summary-container');
            if (summaryContainer) {
                summaryContainer.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Generating summary...</div>';
            }

            CONFIG.log('Generating summary for lecture ID:', this.currentLecture.id);

            const response = await API.getLectureSummary(this.currentLecture.id, {
                language: 'en',
                style: 'detailed'
            });

            this.displaySummary(response.summary);
            this.switchLectureTab('summary');

        } catch (error) {
            CONFIG.logError('Failed to generate summary:', error);
            UI.showToast('error', 'Generation Failed', error.message);
            
            const summaryContainer = Utils.$('#summary-container');
            if (summaryContainer) {
                summaryContainer.innerHTML = `
                    <div class="error-state">
                        <i class="fas fa-exclamation-triangle"></i>
                        <h4>Failed to generate summary</h4>
                        <p>${error.message}</p>
                        <button class="btn btn-primary" onclick="Lectures.generateSummary()">Try Again</button>
                    </div>
                `;
            }
        } finally {
            const generateBtn = Utils.$('#generate-summary-btn');
            this.setButtonLoading(generateBtn, false);
        }
    }

    // Display summary content
    displaySummary(summaryData) {
        const summaryContainer = Utils.$('#summary-container');
        if (!summaryContainer || !summaryData) return;

        CONFIG.log('Displaying summary data:', summaryData);

        // Handle different response structures
        const summary = summaryData.summary || summaryData;
        
        let content = '';
        if (typeof summary === 'string') {
            content = summary;
        } else if (summary.content_md) {
            content = summary.content_md;
        } else if (summary.content) {
            content = summary.content;
        } else if (summary.text) {
            content = summary.text;
        } else {
            content = 'No summary content available';
        }

        // Convert markdown to HTML if needed (basic conversion)
        content = content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');

        if (!content.startsWith('<p>')) {
            content = '<p>' + content + '</p>';
        }

        summaryContainer.innerHTML = `
            <div class="summary-content">
                <h4>Summary</h4>
                <div class="summary-text">${content}</div>
                ${summary.key_points ? `
                    <h4>Key Points</h4>
                    <ul>
                        ${summary.key_points.map(point => `<li>${point}</li>`).join('')}
                    </ul>
                ` : ''}
                ${summaryData.cached ? '<p class="summary-info"><em>This summary was cached</em></p>' : ''}
            </div>
        `;
    }

    // Generate quiz
    async generateQuiz() {
        if (!this.currentLecture) {
            UI.showToast('error', 'No Lecture Selected', 'Please select a lecture first.');
            return;
        }

        if (!this.currentLecture.id) {
            UI.showToast('error', 'Invalid Lecture', 'Lecture ID is missing.');
            return;
        }

        try {
            const generateBtn = Utils.$('#generate-quiz-btn');
            this.setButtonLoading(generateBtn, true);

            const quizContainer = Utils.$('#quiz-container');
            if (quizContainer) {
                quizContainer.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Generating quiz...</div>';
            }

            CONFIG.log('Generating quiz for lecture ID:', this.currentLecture.id);

            const response = await API.getLectureQuiz(this.currentLecture.id, {
                difficulty: 'medium',
                question_count: 5
            });

            CONFIG.log('Quiz generation response:', response);

            // Handle different response structures - the backend returns { quiz: {...} }
            const quiz = response.quiz || response;
            
            // Enhanced validation for quiz data
            if (!quiz) {
                throw new Error('No quiz data received from server');
            }

            if (!quiz.id) {
                CONFIG.logError('Quiz response missing ID:', quiz);
                throw new Error('Quiz ID is missing from server response');
            }

            // Store quiz data and start time with proper structure
            this.currentQuiz = {
                id: quiz.id,
                lecture_id: this.currentLecture.id,
                questions: quiz.items_json?.questions || quiz.questions || [],
                lang: quiz.lang || 'en',
                difficulty: quiz.difficulty || 'medium'
            };
            this.quizStartTime = Date.now();

            // Store quiz data in localStorage for persistence
            localStorage.setItem('currentQuiz', JSON.stringify(this.currentQuiz));
            localStorage.setItem('quizStartTime', this.quizStartTime.toString());

            this.displayQuiz(this.currentQuiz);
            this.switchLectureTab('quiz');

        } catch (error) {
            CONFIG.logError('Failed to generate quiz:', error);
            UI.showToast('error', 'Generation Failed', error.message);
            
            const quizContainer = Utils.$('#quiz-container');
            if (quizContainer) {
                quizContainer.innerHTML = `
                    <div class="error-state">
                        <i class="fas fa-exclamation-triangle"></i>
                        <h4>Failed to generate quiz</h4>
                        <p>${error.message}</p>
                        <button class="btn btn-primary" onclick="Lectures.generateQuiz()">Try Again</button>
                    </div>
                `;
            }
        } finally {
            const generateBtn = Utils.$('#generate-quiz-btn');
            this.setButtonLoading(generateBtn, false);
        }
    }

    // Display quiz content
    displayQuiz(quizData) {
        const quizContainer = Utils.$('#quiz-container');
        if (!quizContainer || !quizData) return;

        CONFIG.log('Displaying quiz data:', quizData);

        // Handle different response structures
        const quiz = quizData.quiz || quizData;
        
        // Parse questions if they're stored as JSON string
        let questions = [];
        
        CONFIG.log('Raw quiz data structure:', quiz);
        
        if (quiz.items_json) {
            CONFIG.log('Found items_json:', typeof quiz.items_json, quiz.items_json);
            
            if (typeof quiz.items_json === 'string') {
                try {
                    const parsed = JSON.parse(quiz.items_json);
                    questions = parsed.questions || parsed;
                } catch (e) {
                    CONFIG.logError('Failed to parse quiz items_json string:', e);
                    CONFIG.logError('Raw items_json content:', quiz.items_json);
                    questions = [];
                }
            } else if (typeof quiz.items_json === 'object') {
                // Already parsed object
                questions = quiz.items_json.questions || quiz.items_json;
            }
        } else if (quiz.questions_json) {
            try {
                questions = JSON.parse(quiz.questions_json);
            } catch (e) {
                CONFIG.logError('Failed to parse quiz questions_json:', e);
                questions = [];
            }
        } else if (quiz.questions) {
            questions = quiz.questions;
        } else if (Array.isArray(quiz)) {
            questions = quiz;
        }
        
        CONFIG.log('Parsed questions:', questions);

        if (!questions || questions.length === 0) {
            quizContainer.innerHTML = `
                <div class="error-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h4>No quiz questions available</h4>
                    <p>Unable to load quiz questions. Please try generating again.</p>
                </div>
            `;
            return;
        }

        let quizHTML = '<div class="quiz-content">';
        
        questions.forEach((question, index) => {
            quizHTML += `
                <div class="quiz-question" data-question-index="${index}">
                    <div class="question-header">
                        <span class="question-number">Question ${index + 1}</span>
                    </div>
                    <div class="question-text">${question.question}</div>
                    <div class="question-options">
                        ${(question.options || []).map((option, optionIndex) => `
                            <div class="option-item" data-option-index="${optionIndex}">
                                <span class="option-letter">${String.fromCharCode(65 + optionIndex)}</span>
                                <span class="option-text">${option}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });

        quizHTML += `
            <div class="quiz-actions">
                <div class="quiz-progress">Question 1 of ${questions.length}</div>
                <button class="btn btn-primary" onclick="Lectures.submitQuiz()">Submit Quiz</button>
            </div>
        </div>`;

        quizContainer.innerHTML = quizHTML;

        // Add click handlers for options
        const options = quizContainer.querySelectorAll('.option-item');
        options.forEach(option => {
            Utils.on(option, 'click', this.handleQuizOptionClick.bind(this));
        });
    }

    // Handle quiz option click
    handleQuizOptionClick(event) {
        const optionItem = event.currentTarget;
        const questionDiv = optionItem.closest('.quiz-question');
        
        // Remove selection from other options in the same question
        const otherOptions = questionDiv.querySelectorAll('.option-item');
        otherOptions.forEach(opt => Utils.removeClass(opt, 'selected'));
        
        // Select clicked option
        Utils.addClass(optionItem, 'selected');
    }

    // Submit quiz
    async submitQuiz() {
        try {
            const selectedAnswers = {};
            const questions = Utils.$$('.quiz-question');
            let totalQuestions = questions.length;
            let answeredQuestions = 0;
            
            questions.forEach((question, index) => {
                const selectedOption = question.querySelector('.option-item.selected');
                if (selectedOption) {
                    selectedAnswers[index] = parseInt(selectedOption.getAttribute('data-option-index'));
                    answeredQuestions++;
                }
                // Don't set null for unanswered questions - just leave them undefined
            });

            // Allow partial submissions with confirmation
            if (answeredQuestions < totalQuestions) {
                const unansweredCount = totalQuestions - answeredQuestions;
                const confirmMessage = answeredQuestions === 0 
                    ? `You haven't answered any questions. Are you sure you want to submit?`
                    : `You have ${unansweredCount} unanswered question(s). Do you want to submit anyway?`;
                
                if (!confirm(confirmMessage)) {
                    return;
                }
            }

            // Show loading state
            const submitBtn = Utils.$('#quiz-container .btn-primary');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
            }

            // Validate we have the required data
            if (!this.currentQuiz || !this.currentQuiz.id) {
                throw new Error('No quiz ID available. Please generate a quiz first.');
            }

            if (!this.currentLecture || !this.currentLecture.id) {
                throw new Error('No lecture selected. Please select a lecture first.');
            }

            // Try to get quiz data from memory or localStorage
            if (!this.currentQuiz) {
                const savedQuiz = localStorage.getItem('currentQuiz');
                if (savedQuiz) {
                    try {
                        this.currentQuiz = JSON.parse(savedQuiz);
                    } catch (e) {
                        CONFIG.logError('Failed to parse saved quiz:', e);
                    }
                }
            }

            // Validate quiz data before submission
            if (!this.currentQuiz || !this.currentQuiz.id) {
                UI.showToast('error', 'Quiz Error', 'No active quiz found. Please generate a new quiz first.');
                return;
            }

            const quizSubmission = {
                quiz_id: this.currentQuiz.id,
                lecture_id: this.currentLecture.id,
                answers: selectedAnswers,
                time_taken: Math.floor((Date.now() - (this.quizStartTime || Date.now())) / 1000)  // in seconds
            };

            CONFIG.log('Current quiz object:', this.currentQuiz);
            CONFIG.log('Current lecture object:', this.currentLecture);
            CONFIG.log('Submitting quiz with data:', quizSubmission);

            const response = await API.submitQuizAttempt(quizSubmission);
            
            CONFIG.log('Quiz submission response:', response);
            
            // Handle enhanced response with performance data
            if (response.performance || response.attempt) {
                const performance = response.performance || {};
                const percentage = Math.round((performance.percentage || 0));
                
                // Show appropriate message based on completion
                const message = response.message || `Your score: ${percentage}%`;
                UI.showToast('success', 'Quiz Submitted', message);
                
                // Update the quiz container with enhanced results
                this.displayEnhancedQuizResults(response);
            } else {
                throw new Error('Invalid response from server');
            }

        } catch (error) {
            CONFIG.logError('Failed to submit quiz:', error);
            UI.showToast('error', 'Submission Failed', error.message);
            
            // Restore submit button
            const submitBtn = Utils.$('#quiz-container .btn-primary');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Submit Quiz';
            }
        }
    }

    // Update dashboard stats
    updateStats() {
        const totalLecturesElement = Utils.$('#total-lectures');
        if (totalLecturesElement) {
            totalLecturesElement.textContent = this.totalLectures;
        }

        // Update profile stats as well
        const profileLecturesElement = Utils.$('#profile-lectures');
        if (profileLecturesElement) {
            profileLecturesElement.textContent = this.totalLectures;
        }
    }

    // Display quiz results
    displayQuizResults(results) {
        const quizContainer = Utils.$('#quiz-container');
        if (!quizContainer) return;

        const percentage = Math.round(results.score * 100);
        const answers = results.attempt_data?.answers || [];
        const questions = this.currentQuiz.items_json.questions;

        let resultsHTML = `
            <div class="quiz-results">
                <div class="results-header">
                    <h3>Quiz Results</h3>
                    <div class="score-display">Score: ${percentage}%</div>
                </div>
                <div class="results-details">
        `;

        questions.forEach((question, index) => {
            const userAnswer = answers[index];
            const isCorrect = userAnswer === question.correct;
            
            resultsHTML += `
                <div class="question-result ${isCorrect ? 'correct' : 'incorrect'}">
                    <div class="question-text">
                        <span class="question-number">Q${index + 1}:</span> 
                        ${question.question}
                    </div>
                    <div class="answer-details">
                        <div class="user-answer">
                            Your answer: ${question.options[userAnswer] || 'Not answered'}
                        </div>
                        <div class="correct-answer">
                            Correct answer: ${question.options[question.correct]}
                        </div>
                    </div>
                    ${question.explanation ? `
                        <div class="explanation">
                            <strong>Explanation:</strong> ${question.explanation}
                        </div>
                    ` : ''}
                </div>
            `;
        });

        resultsHTML += `
                </div>
                <div class="results-actions">
                    <button class="btn btn-primary" onclick="Lectures.generateQuiz()">Try Again</button>
                    <button class="btn btn-secondary" onclick="Lectures.viewAllAttempts()">View All Attempts</button>
                </div>
            </div>
        `;

        quizContainer.innerHTML = resultsHTML;
    }

    // Display enhanced quiz results with detailed performance analysis
    displayEnhancedQuizResults(response) {
        const quizContainer = Utils.$('#quiz-container');
        if (!quizContainer || !response) return;

        CONFIG.log('Displaying enhanced quiz results:', response);

        const performance = response.performance || {};
        const attempt = response.attempt || {};
        const detailedResults = performance.detailedResults || [];
        const recommendations = performance.recommendations || [];

        // Clear quiz state from localStorage since it's completed
        localStorage.removeItem('currentQuiz');
        localStorage.removeItem('quizStartTime');

        let resultsHTML = `
            <div class="quiz-results enhanced">
                <div class="results-header">
                    <div class="score-circle">
                        <div class="score-value">${Math.round(performance.percentage || 0)}%</div>
                        <div class="score-label">Score</div>
                    </div>
                    <div class="performance-summary">
                        <h3>Quiz Completed!</h3>
                        <div class="performance-stats">
                            <div class="stat-item">
                                <span class="stat-value">${performance.correctAnswers || 0}</span>
                                <span class="stat-label">Correct</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-value">${performance.attemptedQuestions || 0}</span>
                                <span class="stat-label">Attempted</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-value">${performance.totalQuestions || 0}</span>
                                <span class="stat-label">Total</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-value">${Math.round(performance.accuracyRate || 0)}%</span>
                                <span class="stat-label">Accuracy</span>
                            </div>
                        </div>
                    </div>
                </div>

                ${performance.completionRate < 100 ? `
                    <div class="completion-notice">
                        <i class="fas fa-info-circle"></i>
                        <span>You completed ${Math.round(performance.completionRate)}% of the quiz (${performance.attemptedQuestions}/${performance.totalQuestions} questions)</span>
                    </div>
                ` : ''}

                <div class="results-details">
                    <h4>Question Review</h4>
                    <div class="questions-review">
        `;

        detailedResults.forEach((result, index) => {
            const statusClass = result.isCorrect ? 'correct' : (result.isAttempted ? 'incorrect' : 'unattempted');
            const statusIcon = result.isCorrect ? 'fa-check-circle' : (result.isAttempted ? 'fa-times-circle' : 'fa-circle');
            
            resultsHTML += `
                <div class="question-result ${statusClass}">
                    <div class="question-header">
                        <span class="question-number">
                            <i class="fas ${statusIcon}"></i>
                            Question ${index + 1}
                        </span>
                        ${result.timeSpent ? `<span class="time-spent">${Math.round(result.timeSpent)}s</span>` : ''}
                    </div>
                    <div class="question-text">${result.question}</div>
                    <div class="answer-details">
                        <div class="user-answer ${result.isAttempted ? '' : 'not-attempted'}">
                            <strong>Your answer:</strong> ${result.userAnswer || 'Not answered'}
                        </div>
                        <div class="correct-answer">
                            <strong>Correct answer:</strong> ${result.correctAnswer}
                        </div>
                    </div>
                    ${result.explanation ? `
                        <div class="explanation">
                            <i class="fas fa-lightbulb"></i>
                            <div class="explanation-text">${result.explanation}</div>
                        </div>
                    ` : ''}
                </div>
            `;
        });

        resultsHTML += `
                    </div>
                </div>

                ${recommendations.length > 0 ? `
                    <div class="recommendations">
                        <h4>Recommendations</h4>
                        <div class="recommendations-list">
                            ${recommendations.map(rec => `
                                <div class="recommendation-item ${rec.priority}">
                                    <i class="fas ${rec.type === 'study' ? 'fa-book' : rec.type === 'practice' ? 'fa-repeat' : 'fa-trophy'}"></i>
                                    <div class="recommendation-content">
                                        <div class="recommendation-message">${rec.message}</div>
                                        <div class="recommendation-type">${rec.type.charAt(0).toUpperCase() + rec.type.slice(1)}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                <div class="results-actions">
                    <button class="btn btn-primary" onclick="Lectures.generateQuiz()">
                        <i class="fas fa-redo"></i> Try Again
                    </button>
                    <button class="btn btn-secondary" onclick="Lectures.viewPerformanceReport()">
                        <i class="fas fa-chart-line"></i> View Performance Report
                    </button>
                    <button class="btn btn-outline" onclick="Lectures.viewAllAttempts()">
                        <i class="fas fa-history"></i> View All Attempts
                    </button>
                </div>
            </div>
        `;

        quizContainer.innerHTML = resultsHTML;
    }

    // Delete lecture
    async deleteLecture(lectureId) {
        if (!confirm('Are you sure you want to delete this lecture? This action cannot be undone.')) {
            return;
        }

        try {
            await API.deleteLecture(lectureId);
            
            // Remove from local array
            this.lectures = this.lectures.filter(lecture => lecture.id !== lectureId);
            this.totalLectures--;
            
            // Re-render
            this.renderLectures();
            this.updateStats();
            
            UI.showToast('success', 'Deleted', 'Lecture deleted successfully');
            
        } catch (error) {
            CONFIG.logError('Failed to delete lecture:', error);
            UI.showToast('error', 'Delete Failed', error.message);
        }
    }

    // View all quiz attempts
    async viewAllAttempts() {
        try {
            const attempts = await API.getQuizAttempts(this.currentQuiz.id);
            
            const quizContainer = Utils.$('#quiz-container');
            if (!quizContainer) return;

            let attemptsHTML = `
                <div class="quiz-attempts">
                    <h3>Your Quiz Attempts</h3>
                    <div class="attempts-list">
            `;

            if (attempts.length === 0) {
                attemptsHTML += `
                    <div class="no-attempts">
                        <p>You haven't attempted this quiz yet.</p>
                        <button class="btn btn-primary" onclick="Lectures.generateQuiz()">Take Quiz</button>
                    </div>
                `;
            } else {
                attempts.forEach((attempt, index) => {
                    const score = Math.round(attempt.score);
                    const date = new Date(attempt.attempted_at).toLocaleDateString();
                    const time = new Date(attempt.attempted_at).toLocaleTimeString();
                    const performance = attempt.performance_summary || {};
                    
                    attemptsHTML += `
                        <div class="attempt-item">
                            <div class="attempt-header">
                                <span class="attempt-number">Attempt ${index + 1}</span>
                                <span class="attempt-date">${date} ${time}</span>
                            </div>
                            <div class="attempt-details">
                                <div class="attempt-score">Score: ${score}%</div>
                                <div class="attempt-stats">
                                    <span>Attempted: ${performance.attempted || 0}/${performance.total || 0}</span>
                                    <span>Accuracy: ${Math.round(performance.accuracy_rate || 0)}%</span>
                                </div>
                                <div class="attempt-time">Time taken: ${attempt.attempt_data?.time_taken || 0} seconds</div>
                            </div>
                        </div>
                    `;
                });

                attemptsHTML += `
                    <div class="attempts-actions">
                        <button class="btn btn-primary" onclick="Lectures.generateQuiz()">Take Quiz Again</button>
                        <button class="btn btn-secondary" onclick="Lectures.viewPerformanceReport()">View Performance Report</button>
                    </div>
                `;
            }

            attemptsHTML += `
                    </div>
                </div>
            `;

            quizContainer.innerHTML = attemptsHTML;

        } catch (error) {
            CONFIG.logError('Failed to load quiz attempts:', error);
            UI.showToast('error', 'Load Failed', error.message);
        }
    }

    // View performance report
    async viewPerformanceReport() {
        try {
            if (!this.currentLecture || !this.currentLecture.id) {
                UI.showToast('error', 'No Lecture Selected', 'Please select a lecture first.');
                return;
            }

            // Switch to performance tab
            this.switchToTab('performance');

            const performanceContainer = Utils.$('#performance-container');
            if (performanceContainer) {
                performanceContainer.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Loading performance report...</div>';
            }

            const report = await API.getQuizPerformanceReport(this.currentLecture.id);
            
            CONFIG.log('Performance report:', report);

            this.displayPerformanceReport(report);

        } catch (error) {
            CONFIG.logError('Failed to load performance report:', error);
            UI.showToast('error', 'Load Failed', error.message);
            
            const performanceContainer = Utils.$('#performance-container');
            if (performanceContainer) {
                performanceContainer.innerHTML = `
                    <div class="error-state">
                        <i class="fas fa-exclamation-triangle"></i>
                        <h4>Failed to load performance report</h4>
                        <p>${error.message}</p>
                        <button class="btn btn-primary" onclick="Lectures.viewPerformanceReport()">Try Again</button>
                    </div>
                `;
            }
        }
    }

    // Switch to a specific tab
    switchToTab(tabName) {
        // Remove active class from all tabs and content
        const allTabs = Utils.$$('.lecture-tabs .tab-btn');
        const allContent = Utils.$$('.tab-content');
        
        allTabs.forEach(tab => tab.classList.remove('active'));
        allContent.forEach(content => content.classList.remove('active'));
        
        // Add active class to selected tab and content
        const selectedTab = Utils.$(`[data-tab="${tabName}"]`);
        const selectedContent = Utils.$(`#${tabName}-content`);
        
        if (selectedTab) selectedTab.classList.add('active');
        if (selectedContent) selectedContent.classList.add('active');
    }

    // Display performance report
    displayPerformanceReport(report) {
        const performanceContainer = Utils.$('#performance-container');
        if (!performanceContainer || !report) return;

        CONFIG.log('Displaying performance report with data:', report);

        // Map backend data structure correctly
        const performanceSummary = report.performance_summary || {};
        const performanceHistory = report.performance_history || [];
        const topicMastery = report.topic_mastery || [];
        const recommendations = report.recommendations || [];
        const lecture = report.lecture || {};

        // Calculate improvement trend
        const improvementTrend = performanceSummary.improvement_trend || {};
        const overallImprovement = improvementTrend.overall_improvement || 0;

        let reportHTML = `
            <div class="performance-report">
                <div class="report-header">
                    <div class="lecture-info">
                        <h3>Performance Report</h3>
                        <p class="lecture-title">${lecture.title || 'Unknown Lecture'}</p>
                    </div>
                    <div class="report-summary">
                        <div class="summary-stats">
                            <div class="stat-card">
                                <div class="stat-value">${performanceSummary.attempts_count || 0}</div>
                                <div class="stat-label">Total Attempts</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">${Math.round(performanceSummary.best_score || 0)}%</div>
                                <div class="stat-label">Best Score</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">${Math.round(performanceSummary.average_score || 0)}%</div>
                                <div class="stat-label">Average Score</div>
                            </div>
                            <div class="stat-card ${overallImprovement >= 0 ? 'positive' : 'negative'}">
                                <div class="stat-value">${overallImprovement >= 0 ? '+' : ''}${Math.round(overallImprovement)}%</div>
                                <div class="stat-label">Improvement</div>
                            </div>
                        </div>
                    </div>
                </div>

                ${performanceHistory.length > 0 ? `
                    <div class="attempts-timeline">
                        <h4>Quiz Attempt History</h4>
                        <div class="timeline">
                            ${performanceHistory.map((attempt, index) => `
                                <div class="timeline-item">
                                    <div class="timeline-marker"></div>
                                    <div class="timeline-content">
                                        <div class="attempt-info">
                                            <span class="attempt-number">Attempt ${performanceHistory.length - index}</span>
                                            <span class="attempt-score">${Math.round(attempt.score || 0)}%</span>
                                        </div>
                                        <div class="attempt-details">
                                            <div class="attempt-date">${new Date(attempt.date).toLocaleDateString()}</div>
                                            <div class="attempt-time">Time taken: ${Math.round(attempt.time_taken || 0)} seconds</div>
                                            ${attempt.topic_breakdown && attempt.topic_breakdown.length > 0 ? `
                                                <div class="topic-breakdown">
                                                    ${attempt.topic_breakdown.map(topic => `
                                                        <span class="topic-tag">${topic.topic}: ${Math.round(topic.accuracy)}%</span>
                                                    `).join('')}
                                                </div>
                                            ` : ''}
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : `
                    <div class="no-attempts">
                        <i class="fas fa-chart-line"></i>
                        <h4>No Quiz Attempts Yet</h4>
                        <p>Take your first quiz to start tracking your performance!</p>
                        <button class="btn btn-primary" onclick="Lectures.switchToTab('quiz'); Lectures.generateQuiz();">
                            <i class="fas fa-play"></i> Take Quiz Now
                        </button>
                    </div>
                `}

                ${topicMastery.length > 0 ? `
                    <div class="topic-mastery">
                        <h4>Topic Mastery Analysis</h4>
                        <div class="mastery-grid">
                            ${topicMastery.map(topic => `
                                <div class="mastery-item">
                                    <div class="mastery-header">
                                        <span class="topic-name">${topic.topic}</span>
                                        <span class="mastery-score ${topic.mastery_level >= 80 ? 'excellent' : topic.mastery_level >= 60 ? 'good' : 'needs-improvement'}">${Math.round(topic.mastery_level)}%</span>
                                    </div>
                                    <div class="mastery-bar">
                                        <div class="mastery-progress" style="width: ${topic.mastery_level}%"></div>
                                    </div>
                                    <div class="mastery-stats">
                                        <span>${topic.attempts} attempts</span>
                                        <span>${topic.total_questions} questions</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                ${recommendations.length > 0 ? `
                    <div class="recommendations">
                        <h4>Areas for Improvement</h4>
                        <div class="recommendations-list">
                            ${recommendations.map(rec => `
                                <div class="recommendation-item ${rec.priority || 'medium'}">
                                    <i class="fas ${rec.type === 'topic_focus' ? 'fa-bullseye' : rec.type === 'study_material' ? 'fa-book' : rec.type === 'practice' ? 'fa-dumbbell' : 'fa-lightbulb'}"></i>
                                    <div class="recommendation-content">
                                        <div class="recommendation-message">${rec.message}</div>
                                        ${rec.topic ? `<div class="recommendation-topic">Focus area: ${rec.topic}</div>` : ''}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                <div class="report-actions">
                    <button class="btn btn-primary" onclick="Lectures.switchToTab('quiz'); Lectures.generateQuiz();">
                        <i class="fas fa-redo"></i> Take Quiz Again
                    </button>
                    <button class="btn btn-secondary" onclick="Lectures.switchToTab('quiz'); Lectures.viewAllAttempts();">
                        <i class="fas fa-history"></i> View All Attempts
                    </button>
                </div>
            </div>
        `;

        performanceContainer.innerHTML = reportHTML;
    }

    // Set button loading state
    setButtonLoading(button, isLoading) {
        if (!button) return;
        
        if (isLoading) {
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        } else {
            button.disabled = false;
            // Restore original content based on button ID
            if (button.id === 'generate-summary-btn') {
                button.innerHTML = '<i class="fas fa-file-alt"></i> Summary';
            } else if (button.id === 'generate-quiz-btn') {
                button.innerHTML = '<i class="fas fa-question-circle"></i> Quiz';
            }
        }
    }

    // Get lectures for dashboard
    getLectures() {
        return this.lectures;
    }

    // Get current lecture
    getCurrentLecture() {
        return this.currentLecture;
    }

    // Refresh lectures
    refresh() {
        this.loadLectures(true);
    }
}

// Create global lectures manager instance
const Lectures = new LecturesManager();

// Export lectures manager
window.Lectures = Lectures;

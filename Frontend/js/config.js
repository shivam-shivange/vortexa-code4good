// Application Configuration
const CONFIG = {
    // API Configuration
    API_BASE_URL: 'http://localhost:5000/api',
    
    // API Endpoints
    ENDPOINTS: {
        AUTH: {
            LOGIN: '/auth/login',
            SIGNUP: '/auth/signup',
            REFRESH: '/auth/refresh'
        },
        LECTURES: {
            BASE: '/lectures',
            UPLOAD: '/lectures/upload',
            GET_BY_ID: (id) => `/lectures/${id}`,
            SUMMARY: (id) => `/lectures/${id}/summary`,
            QUIZ: (id) => `/lectures/${id}/quiz`,
            STATUS: (id) => `/lectures/${id}/status`,
            REPROCESS: (id) => `/lectures/${id}/reprocess`,
            DELETE: (id) => `/lectures/${id}`
        },
        SUMMARIES: '/summaries',
        QUIZZES: {
            BASE: '/quizzes',
            GENERATE: (id) => `/quizzes/${id}/generate`,
            SUBMIT: '/quizzes/submit',
            GET_ATTEMPTS: (quizId) => `/quizzes/${quizId}/attempts`,
            GET_PERFORMANCE: (lectureId) => `/quizzes/performance/${lectureId}`
        },
        REPORTS: '/reports',
        HEALTH: '/health'
    },
    
    // File Upload Configuration
    UPLOAD: {
        MAX_VIDEO_SIZE: 500 * 1024 * 1024, // 500MB
        MAX_PPT_SIZE: 100 * 1024 * 1024,   // 100MB
        ALLOWED_VIDEO_TYPES: ['video/mp4', 'video/avi', 'video/mov', 'video/quicktime'],
        ALLOWED_PPT_TYPES: [
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'application/pdf'
        ],
        CHUNK_SIZE: 1024 * 1024 // 1MB chunks for large file uploads
    },
    
    // UI Configuration
    UI: {
        TOAST_DURATION: 5000,
        LOADING_DELAY: 300,
        ANIMATION_DURATION: 300,
        DEBOUNCE_DELAY: 500,
        PLACEHOLDER_IMAGES: {
            VIDEO: '/images/video-placeholder.png',
            AVATAR_SMALL: '/images/avatar-40.png',
            AVATAR_MEDIUM: '/images/avatar-120.png'
        }
    },
    
    // Pagination
    PAGINATION: {
        DEFAULT_PAGE_SIZE: 12,
        MAX_PAGE_SIZE: 50
    },
    
    // Local Storage Keys
    STORAGE_KEYS: {
        AUTH_TOKEN: 'learningapp_auth_token',
        USER_DATA: 'learningapp_user_data',
        THEME: 'learningapp_theme',
        LANGUAGE: 'learningapp_language',
        REMEMBER_ME: 'learningapp_remember_me'
    },
    
    // Default Values
    DEFAULTS: {
        LANGUAGE: 'en',
        THEME: 'light',
        SUMMARY_STYLE: 'detailed',
        QUIZ_DIFFICULTY: 'medium'
    },
    
    // Error Messages
    ERRORS: {
        NETWORK: 'Network error. Please check your connection.',
        UNAUTHORIZED: 'Please log in to continue.',
        FORBIDDEN: 'You do not have permission to perform this action.',
        NOT_FOUND: 'The requested resource was not found.',
        SERVER_ERROR: 'Server error. Please try again later.',
        VALIDATION: 'Please check your input and try again.',
        FILE_TOO_LARGE: 'File size exceeds the maximum limit.',
        INVALID_FILE_TYPE: 'Invalid file type. Please select a supported file.',
        UPLOAD_FAILED: 'Upload failed. Please try again.'
    },
    
    // Success Messages
    SUCCESS: {
        LOGIN: 'Welcome back! You have been logged in successfully.',
        SIGNUP: 'Account created successfully! Please log in.',
        LOGOUT: 'You have been logged out successfully.',
        UPLOAD: 'Lecture uploaded successfully!',
        DELETE: 'Lecture deleted successfully.',
        PROFILE_UPDATE: 'Profile updated successfully.',
        PASSWORD_CHANGE: 'Password changed successfully.'
    },
    
    // Processing Status
    PROCESSING_STATUS: {
        PENDING: 'pending',
        PROCESSING: 'processing',
        COMPLETED: 'completed',
        ERROR: 'error'
    },
    
    // Quiz Configuration
    QUIZ: {
        DIFFICULTIES: ['easy', 'medium', 'hard'],
        QUESTION_TYPES: ['multiple_choice', 'true_false', 'short_answer'],
        DEFAULT_QUESTION_COUNT: 10,
        MAX_QUESTION_COUNT: 50
    },
    
    // Summary Configuration
    SUMMARY: {
        STYLES: ['brief', 'detailed', 'bullet_points'],
        LANGUAGES: ['en', 'es', 'fr', 'de'],
        MAX_LENGTH: 5000
    },
    
    // Development Configuration
    DEV: {
        ENABLE_LOGGING: true,
        MOCK_API: false,
        DEBUG_MODE: false
    }
};

// Environment-specific configuration
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    CONFIG.DEV.ENABLE_LOGGING = true;
    CONFIG.DEV.DEBUG_MODE = true;
} else {
    // Production configuration
    CONFIG.API_BASE_URL = 'https://your-production-api.com/api';
    CONFIG.DEV.ENABLE_LOGGING = false;
    CONFIG.DEV.DEBUG_MODE = false;
}

// Utility function to get full API URL
CONFIG.getApiUrl = (endpoint) => {
    return CONFIG.API_BASE_URL + endpoint;
};

// Utility function to check if development mode
CONFIG.isDevelopment = () => {
    return CONFIG.DEV.DEBUG_MODE;
};

// Utility function to log (only in development)
CONFIG.log = (...args) => {
    if (CONFIG.DEV.ENABLE_LOGGING) {
        console.log('[LearningApp]', ...args);
    }
};

// Utility function to log errors
CONFIG.logError = (...args) => {
    console.error('[LearningApp Error]', ...args);
};

// Export configuration
window.CONFIG = CONFIG;

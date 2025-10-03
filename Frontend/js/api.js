// API Service Module
class ApiService {
    constructor() {
        this.baseURL = CONFIG.API_BASE_URL;
        this.defaultHeaders = {
            'Content-Type': 'application/json'
        };
    }

    // Get authentication token
    getAuthToken() {
        return Utils.storage.get(CONFIG.STORAGE_KEYS.AUTH_TOKEN);
    }

    // Set authentication token
    setAuthToken(token) {
        Utils.storage.set(CONFIG.STORAGE_KEYS.AUTH_TOKEN, token);
    }

    // Remove authentication token
    removeAuthToken() {
        Utils.storage.remove(CONFIG.STORAGE_KEYS.AUTH_TOKEN);
    }

    // Get headers with authentication
    getHeaders(includeAuth = true, customHeaders = {}) {
        const headers = { ...this.defaultHeaders, ...customHeaders };
        
        if (includeAuth) {
            const token = this.getAuthToken();
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
        }
        
        return headers;
    }

    // Generic request method
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const config = {
            method: 'GET',
            headers: this.getHeaders(options.includeAuth !== false, options.headers),
            ...options
        };

        // Remove custom options that shouldn't be passed to fetch
        delete config.includeAuth;

        try {
            CONFIG.log(`Making ${config.method} request to:`, url);
            
            const response = await fetch(url, config);
            
            // Handle different response types
            let data;
            const contentType = response.headers.get('content-type');
            
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }

            if (!response.ok) {
                throw new Error(data.message || data.error || `HTTP ${response.status}`);
            }

            CONFIG.log('Request successful:', data);
            return data;
        } catch (error) {
            CONFIG.logError('API request failed:', error);
            throw this.handleError(error);
        }
    }

    // Handle API errors
    handleError(error) {
        if (error.message.includes('Failed to fetch')) {
            return new Error(CONFIG.ERRORS.NETWORK);
        }
        
        if (error.message.includes('401')) {
            this.removeAuthToken();
            return new Error(CONFIG.ERRORS.UNAUTHORIZED);
        }
        
        if (error.message.includes('403')) {
            return new Error(CONFIG.ERRORS.FORBIDDEN);
        }
        
        if (error.message.includes('404')) {
            return new Error(CONFIG.ERRORS.NOT_FOUND);
        }
        
        if (error.message.includes('500')) {
            return new Error(CONFIG.ERRORS.SERVER_ERROR);
        }
        
        return error;
    }

    // Authentication methods
    async login(credentials) {
        const response = await this.request(CONFIG.ENDPOINTS.AUTH.LOGIN, {
            method: 'POST',
            body: JSON.stringify(credentials),
            includeAuth: false
        });
        
        if (response.token) {
            this.setAuthToken(response.token);
            Utils.storage.set(CONFIG.STORAGE_KEYS.USER_DATA, response.user);
        }
        
        return response;
    }

    async signup(userData) {
        const response = await this.request(CONFIG.ENDPOINTS.AUTH.SIGNUP, {
            method: 'POST',
            body: JSON.stringify(userData),
            includeAuth: false
        });
        
        return response;
    }

    async logout() {
        this.removeAuthToken();
        Utils.storage.remove(CONFIG.STORAGE_KEYS.USER_DATA);
        Utils.storage.remove(CONFIG.STORAGE_KEYS.REMEMBER_ME);
    }

    // Lecture methods
    async getLectures(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const endpoint = queryString ? `${CONFIG.ENDPOINTS.LECTURES.BASE}?${queryString}` : CONFIG.ENDPOINTS.LECTURES.BASE;
        
        return await this.request(endpoint);
    }

    async getLectureById(id) {
        return await this.request(CONFIG.ENDPOINTS.LECTURES.GET_BY_ID(id));
    }

    async uploadLecture(formData, onProgress = null) {
        const url = `${this.baseURL}${CONFIG.ENDPOINTS.LECTURES.UPLOAD}`;
        
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            
            // Set up progress tracking
            if (onProgress) {
                xhr.upload.addEventListener('progress', (event) => {
                    if (event.lengthComputable) {
                        const percentComplete = (event.loaded / event.total) * 100;
                        onProgress(percentComplete);
                    }
                });
            }
            
            // Set up response handling
            xhr.addEventListener('load', () => {
                try {
                    const response = JSON.parse(xhr.responseText);
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve(response);
                    } else {
                        reject(new Error(response.message || response.error || `HTTP ${xhr.status}`));
                    }
                } catch (error) {
                    reject(new Error('Invalid response format'));
                }
            });
            
            xhr.addEventListener('error', () => {
                reject(new Error(CONFIG.ERRORS.NETWORK));
            });
            
            // Open request first
            xhr.open('POST', url);
            
            // Set headers after opening
            const token = this.getAuthToken();
            if (token) {
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            }
            xhr.send(formData);
        });
    }

    async getLectureSummary(id, params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const endpoint = queryString ? 
            `${CONFIG.ENDPOINTS.LECTURES.SUMMARY(id)}?${queryString}` : 
            CONFIG.ENDPOINTS.LECTURES.SUMMARY(id);
        
        return await this.request(endpoint);
    }

    async getLectureQuiz(id, params = {}) {
        // Use POST method to generate quiz via quiz controller
        return await this.request(CONFIG.ENDPOINTS.QUIZZES.GENERATE(id), {
            method: 'POST',
            body: JSON.stringify(params)
        });
    }

    async submitQuizAttempt(quizData) {
        return await this.request(CONFIG.ENDPOINTS.QUIZZES.SUBMIT, {
            method: 'POST',
            body: JSON.stringify(quizData)
        });
    }

    async getQuizAttempts(quizId) {
        return await this.request(CONFIG.ENDPOINTS.QUIZZES.GET_ATTEMPTS(quizId));
    }

    async getQuizPerformanceReport(lectureId) {
        return await this.request(CONFIG.ENDPOINTS.QUIZZES.GET_PERFORMANCE(lectureId));
    }

    async getProcessingStatus(id) {
        return await this.request(CONFIG.ENDPOINTS.LECTURES.STATUS(id));
    }

    async reprocessLecture(id, options = {}) {
        return await this.request(CONFIG.ENDPOINTS.LECTURES.REPROCESS(id), {
            method: 'POST',
            body: JSON.stringify(options)
        });
    }

    async deleteLecture(id) {
        return await this.request(CONFIG.ENDPOINTS.LECTURES.DELETE(id), {
            method: 'DELETE'
        });
    }

    // Health check
    async getHealthStatus() {
        return await this.request('/health', { includeAuth: false });
    }

    // File validation methods
    validateVideoFile(file) {
        const errors = [];
        
        if (!CONFIG.UPLOAD.ALLOWED_VIDEO_TYPES.includes(file.type)) {
            errors.push('Invalid video file type. Please select MP4, AVI, or MOV files.');
        }
        
        if (file.size > CONFIG.UPLOAD.MAX_VIDEO_SIZE) {
            errors.push(`Video file is too large. Maximum size is ${Utils.formatFileSize(CONFIG.UPLOAD.MAX_VIDEO_SIZE)}.`);
        }
        
        return errors;
    }

    validatePresentationFile(file) {
        const errors = [];
        
        if (!CONFIG.UPLOAD.ALLOWED_PPT_TYPES.includes(file.type)) {
            errors.push('Invalid presentation file type. Please select PPT, PPTX, or PDF files.');
        }
        
        if (file.size > CONFIG.UPLOAD.MAX_PPT_SIZE) {
            errors.push(`Presentation file is too large. Maximum size is ${Utils.formatFileSize(CONFIG.UPLOAD.MAX_PPT_SIZE)}.`);
        }
        
        return errors;
    }

    // Utility methods for file handling
    createFormDataForUpload(lectureData, videoFile, pptFile = null) {
        const formData = new FormData();
        
        // Add lecture metadata
        if (lectureData.title) {
            formData.append('title', lectureData.title);
        }
        
        if (lectureData.description) {
            formData.append('description', lectureData.description);
        }
        
        // Add files
        formData.append('video', videoFile);
        
        if (pptFile) {
            formData.append('ppt', pptFile);
        }
        
        return formData;
    }

    // Batch operations
    async batchDeleteLectures(lectureIds) {
        const promises = lectureIds.map(id => this.deleteLecture(id));
        return await Promise.allSettled(promises);
    }

    // Search and filtering
    async searchLectures(query, filters = {}) {
        const params = {
            search: query,
            ...filters
        };
        
        return await this.getLectures(params);
    }

    // Statistics and reports
    async getUserStats() {
        return await this.request('/reports/user-stats');
    }

    async getLectureAnalytics(id) {
        return await this.request(`/reports/lecture/${id}/analytics`);
    }
}

// Create global API instance
const API = new ApiService();

// Export API service
window.API = API;

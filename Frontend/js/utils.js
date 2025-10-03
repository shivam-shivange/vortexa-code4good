// Utility Functions

// DOM Utilities
const Utils = {
    // Element selection
    $(selector) {
        return document.querySelector(selector);
    },
    
    $$(selector) {
        return document.querySelectorAll(selector);
    },
    
    // Element creation
    createElement(tag, attributes = {}, textContent = '') {
        const element = document.createElement(tag);
        
        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'className') {
                element.className = value;
            } else if (key === 'innerHTML') {
                element.innerHTML = value;
            } else {
                element.setAttribute(key, value);
            }
        });
        
        if (textContent) {
            element.textContent = textContent;
        }
        
        return element;
    },
    
    // Event handling
    on(element, event, handler, options = {}) {
        if (typeof element === 'string') {
            element = this.$(element);
        }
        if (element) {
            element.addEventListener(event, handler, options);
        }
    },
    
    off(element, event, handler) {
        if (typeof element === 'string') {
            element = this.$(element);
        }
        if (element) {
            element.removeEventListener(event, handler);
        }
    },
    
    // Class manipulation
    addClass(element, className) {
        if (typeof element === 'string') {
            element = this.$(element);
        }
        if (element) {
            element.classList.add(className);
        }
    },
    
    removeClass(element, className) {
        if (typeof element === 'string') {
            element = this.$(element);
        }
        if (element) {
            element.classList.remove(className);
        }
    },
    
    toggleClass(element, className) {
        if (typeof element === 'string') {
            element = this.$(element);
        }
        if (element) {
            element.classList.toggle(className);
        }
    },
    
    hasClass(element, className) {
        if (typeof element === 'string') {
            element = this.$(element);
        }
        return element ? element.classList.contains(className) : false;
    },
    
    // Animation utilities
    fadeIn(element, duration = 300) {
        if (typeof element === 'string') {
            element = this.$(element);
        }
        if (!element) return;
        
        element.style.opacity = '0';
        element.style.display = 'block';
        
        const start = performance.now();
        const animate = (currentTime) => {
            const elapsed = currentTime - start;
            const progress = Math.min(elapsed / duration, 1);
            
            element.style.opacity = progress;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    },
    
    fadeOut(element, duration = 300) {
        if (typeof element === 'string') {
            element = this.$(element);
        }
        if (!element) return;
        
        const start = performance.now();
        const initialOpacity = parseFloat(getComputedStyle(element).opacity) || 1;
        
        const animate = (currentTime) => {
            const elapsed = currentTime - start;
            const progress = Math.min(elapsed / duration, 1);
            
            element.style.opacity = initialOpacity * (1 - progress);
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                element.style.display = 'none';
            }
        };
        
        requestAnimationFrame(animate);
    },
    
    // Form utilities
    getFormData(form) {
        if (typeof form === 'string') {
            form = this.$(form);
        }
        if (!form) return {};
        
        const formData = new FormData(form);
        const data = {};
        
        for (let [key, value] of formData.entries()) {
            if (data[key]) {
                if (Array.isArray(data[key])) {
                    data[key].push(value);
                } else {
                    data[key] = [data[key], value];
                }
            } else {
                data[key] = value;
            }
        }
        
        return data;
    },
    
    setFormData(form, data) {
        if (typeof form === 'string') {
            form = this.$(form);
        }
        if (!form || !data) return;
        
        Object.entries(data).forEach(([key, value]) => {
            const field = form.querySelector(`[name="${key}"]`);
            if (field) {
                if (field.type === 'checkbox' || field.type === 'radio') {
                    field.checked = value;
                } else {
                    field.value = value;
                }
            }
        });
    },
    
    validateForm(form, rules = {}) {
        if (typeof form === 'string') {
            form = this.$(form);
        }
        if (!form) return { isValid: false, errors: {} };
        
        const errors = {};
        let isValid = true;
        
        Object.entries(rules).forEach(([fieldName, fieldRules]) => {
            const field = form.querySelector(`[name="${fieldName}"]`);
            if (!field) return;
            
            const value = field.value.trim();
            const fieldErrors = [];
            
            // Required validation
            if (fieldRules.required && !value) {
                fieldErrors.push('This field is required');
            }
            
            // Min length validation
            if (fieldRules.minLength && value.length < fieldRules.minLength) {
                fieldErrors.push(`Minimum length is ${fieldRules.minLength} characters`);
            }
            
            // Max length validation
            if (fieldRules.maxLength && value.length > fieldRules.maxLength) {
                fieldErrors.push(`Maximum length is ${fieldRules.maxLength} characters`);
            }
            
            // Email validation
            if (fieldRules.email && value && !this.isValidEmail(value)) {
                fieldErrors.push('Please enter a valid email address');
            }
            
            // Custom validation
            if (fieldRules.custom && typeof fieldRules.custom === 'function') {
                const customError = fieldRules.custom(value, form);
                if (customError) {
                    fieldErrors.push(customError);
                }
            }
            
            if (fieldErrors.length > 0) {
                errors[fieldName] = fieldErrors;
                isValid = false;
            }
        });
        
        return { isValid, errors };
    },
    
    // String utilities
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },
    
    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    },
    
    formatDate(date, options = {}) {
        if (!date) {
            return 'Unknown date';
        }
        
        if (typeof date === 'string') {
            date = new Date(date);
        }
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
            return 'Invalid date';
        }
        
        const defaultOptions = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        
        return date.toLocaleDateString('en-US', { ...defaultOptions, ...options });
    },
    
    formatRelativeTime(date) {
        if (!date) {
            return 'Unknown time';
        }
        
        if (typeof date === 'string') {
            date = new Date(date);
        }
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
            return 'Invalid time';
        }
        
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);
        
        if (diffInSeconds < 60) return 'Just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
        if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;
        
        return this.formatDate(date, { year: 'numeric', month: 'short', day: 'numeric' });
    },
    
    truncateText(text, maxLength = 100) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength).trim() + '...';
    },
    
    slugify(text) {
        return text
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/[\s_-]+/g, '-')
            .replace(/^-+|-+$/g, '');
    },
    
    // Validation utilities
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    },
    
    isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    },
    
    // Array utilities
    unique(array) {
        return [...new Set(array)];
    },
    
    groupBy(array, key) {
        return array.reduce((groups, item) => {
            const group = item[key];
            if (!groups[group]) {
                groups[group] = [];
            }
            groups[group].push(item);
            return groups;
        }, {});
    },
    
    sortBy(array, key, direction = 'asc') {
        return array.sort((a, b) => {
            const aVal = a[key];
            const bVal = b[key];
            
            if (direction === 'desc') {
                return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
            }
            return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        });
    },
    
    // Object utilities
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },
    
    isEmpty(obj) {
        return Object.keys(obj).length === 0;
    },
    
    // Local storage utilities
    storage: {
        get(key, defaultValue = null) {
            try {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : defaultValue;
            } catch (error) {
                CONFIG.logError('Error reading from localStorage:', error);
                return defaultValue;
            }
        },
        
        set(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (error) {
                CONFIG.logError('Error writing to localStorage:', error);
                return false;
            }
        },
        
        remove(key) {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (error) {
                CONFIG.logError('Error removing from localStorage:', error);
                return false;
            }
        },
        
        clear() {
            try {
                localStorage.clear();
                return true;
            } catch (error) {
                CONFIG.logError('Error clearing localStorage:', error);
                return false;
            }
        }
    },
    
    // Debounce utility
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    // Throttle utility
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },
    
    // Random utilities
    generateId() {
        return Math.random().toString(36).substr(2, 9);
    },
    
    randomColor() {
        return '#' + Math.floor(Math.random()*16777215).toString(16);
    },
    
    // File utilities
    getFileExtension(filename) {
        return filename.slice((filename.lastIndexOf(".") - 1 >>> 0) + 2);
    },
    
    isImageFile(file) {
        return file.type.startsWith('image/');
    },
    
    isVideoFile(file) {
        return file.type.startsWith('video/');
    },
    
    // URL utilities
    getUrlParams() {
        return new URLSearchParams(window.location.search);
    },
    
    setUrlParam(key, value) {
        const url = new URL(window.location);
        url.searchParams.set(key, value);
        window.history.pushState({}, '', url);
    },
    
    removeUrlParam(key) {
        const url = new URL(window.location);
        url.searchParams.delete(key);
        window.history.pushState({}, '', url);
    },
    
    // Device detection
    isMobile() {
        return window.innerWidth <= 768;
    },
    
    isTablet() {
        return window.innerWidth > 768 && window.innerWidth <= 1024;
    },
    
    isDesktop() {
        return window.innerWidth > 1024;
    },
    
    // Network utilities
    isOnline() {
        return navigator.onLine;
    },
    
    // Copy to clipboard
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {
            CONFIG.logError('Failed to copy to clipboard:', error);
            return false;
        }
    }
};

// Export utilities
window.Utils = Utils;

// UI Management Module
class UIManager {
    constructor() {
        this.currentSection = 'home';
        this.activeModals = [];
        this.toasts = [];
        this.toastCounter = 0;
        
        this.init();
    }

    // Initialize UI manager
    init() {
        this.setupEventListeners();
        this.setupNavigation();
        this.hideLoadingScreen();
    }

    // Setup event listeners
    setupEventListeners() {
        // Navigation links
        const navLinks = Utils.$$('.nav-link');
        navLinks.forEach(link => {
            Utils.on(link, 'click', this.handleNavigation.bind(this));
        });

        // Mobile navigation toggle
        const navToggle = Utils.$('#nav-toggle');
        const navMenu = Utils.$('#nav-menu');
        
        if (navToggle && navMenu) {
            Utils.on(navToggle, 'click', () => {
                Utils.toggleClass(navToggle, 'active');
                Utils.toggleClass(navMenu, 'active');
            });
        }

        // Close mobile menu when clicking outside
        Utils.on(document, 'click', (e) => {
            if (navMenu && !navToggle.contains(e.target) && !navMenu.contains(e.target)) {
                Utils.removeClass(navToggle, 'active');
                Utils.removeClass(navMenu, 'active');
            }
        });

        // Modal close buttons
        const modalCloses = Utils.$$('.modal-close');
        modalCloses.forEach(closeBtn => {
            Utils.on(closeBtn, 'click', (e) => {
                const modal = closeBtn.closest('.modal');
                if (modal) {
                    this.closeModal(modal.id);
                }
            });
        });

        // Close modal when clicking outside
        Utils.on(document, 'click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeModal(e.target.id);
            }
        });

        // Escape key to close modals
        Utils.on(document, 'keydown', (e) => {
            if (e.key === 'Escape' && this.activeModals.length > 0) {
                const topModal = this.activeModals[this.activeModals.length - 1];
                this.closeModal(topModal);
            }
        });

        // Profile tabs
        const profileTabs = Utils.$$('.profile-tabs .tab-btn');
        profileTabs.forEach(tab => {
            Utils.on(tab, 'click', this.handleProfileTabSwitch.bind(this));
        });

        // Learn more button
        Utils.on('#learn-more-btn', 'click', () => {
            this.scrollToSection('.features');
        });

        // Window resize handler for responsive adjustments
        Utils.on(window, 'resize', Utils.throttle(() => {
            this.handleResize();
        }, 250));
    }

    // Setup navigation
    setupNavigation() {
        // Get initial section from URL hash
        const hash = window.location.hash.substring(1);
        if (hash && Utils.$(`#${hash}`)) {
            this.showSection(hash);
        } else {
            this.showSection('home');
        }

        // Handle browser back/forward
        Utils.on(window, 'popstate', () => {
            const hash = window.location.hash.substring(1) || 'home';
            this.showSection(hash, false);
        });
    }

    // Hide loading screen
    hideLoadingScreen() {
        setTimeout(() => {
            const loadingScreen = Utils.$('#loading-screen');
            if (loadingScreen) {
                Utils.addClass(loadingScreen, 'hidden');
                setTimeout(() => {
                    loadingScreen.style.display = 'none';
                }, CONFIG.UI.ANIMATION_DURATION);
            }
        }, CONFIG.UI.LOADING_DELAY);
    }

    // Handle navigation
    handleNavigation(e) {
        e.preventDefault();
        const link = e.currentTarget;
        const href = link.getAttribute('href');
        
        if (href && href.startsWith('#')) {
            const sectionName = href.substring(1);
            this.showSection(sectionName);
        }
    }

    // Show section
    showSection(sectionName, updateHistory = true) {
        // Check authentication for protected sections
        const protectedSections = ['dashboard', 'upload', 'profile'];
        if (protectedSections.includes(sectionName) && !Auth.isUserAuthenticated()) {
            this.openModal('login-modal');
            return;
        }

        // Hide all sections
        const sections = Utils.$$('.section');
        sections.forEach(section => {
            Utils.removeClass(section, 'active');
        });

        // Show target section
        const targetSection = Utils.$(`#${sectionName}`);
        if (targetSection) {
            Utils.addClass(targetSection, 'active');
            this.currentSection = sectionName;

            // Update navigation
            this.updateNavigation(sectionName);

            // Update URL
            if (updateHistory) {
                window.history.pushState({}, '', `#${sectionName}`);
            }

            // Load section-specific data
            this.loadSectionData(sectionName);

            // Scroll to top
            window.scrollTo(0, 0);
        }
    }

    // Update navigation active state
    updateNavigation(sectionName) {
        const navLinks = Utils.$$('.nav-link');
        navLinks.forEach(link => {
            Utils.removeClass(link, 'active');
            const href = link.getAttribute('href');
            if (href === `#${sectionName}`) {
                Utils.addClass(link, 'active');
            }
        });
    }

    // Load section-specific data
    loadSectionData(sectionName) {
        switch (sectionName) {
            case 'dashboard':
                if (Lectures) {
                    Lectures.loadLectures(true);
                }
                break;
            case 'upload':
                if (window.Upload) {
                    window.Upload.resetUploadState();
                }
                break;
            case 'profile':
                this.loadProfileData();
                break;
        }
    }

    // Load profile data
    loadProfileData() {
        const user = Auth.getCurrentUser();
        if (!user) return;

        // Update profile information
        const profileName = Utils.$('#profile-name');
        const profileEmail = Utils.$('#profile-email');
        const settingsName = Utils.$('#settings-name');
        const settingsEmail = Utils.$('#settings-email');

        if (profileName) profileName.textContent = user.name || 'User';
        if (profileEmail) profileEmail.textContent = user.email || '';
        if (settingsName) settingsName.value = user.name || '';
        if (settingsEmail) settingsEmail.value = user.email || '';

        // Load user statistics (mock data for now)
        this.updateProfileStats({
            lectures: Lectures ? Lectures.getLectures().length : 0,
            quizzes: 0,
            time: '0h'
        });
    }

    // Update profile statistics
    updateProfileStats(stats) {
        const profileLectures = Utils.$('#profile-lectures');
        const profileQuizzes = Utils.$('#profile-quizzes');
        const profileTime = Utils.$('#profile-time');

        if (profileLectures) profileLectures.textContent = stats.lectures;
        if (profileQuizzes) profileQuizzes.textContent = stats.quizzes;
        if (profileTime) profileTime.textContent = stats.time;
    }

    // Handle profile tab switching
    handleProfileTabSwitch(e) {
        const tabName = e.target.getAttribute('data-tab');
        this.switchProfileTab(tabName);
    }

    // Switch profile tab
    switchProfileTab(tabName) {
        // Update tab buttons
        const tabButtons = Utils.$$('.profile-tabs .tab-btn');
        tabButtons.forEach(btn => {
            Utils.removeClass(btn, 'active');
            if (btn.getAttribute('data-tab') === tabName) {
                Utils.addClass(btn, 'active');
            }
        });

        // Update tab content
        const tabContents = Utils.$$('.profile-content .tab-content');
        tabContents.forEach(content => {
            Utils.removeClass(content, 'active');
            if (content.id === `${tabName}-tab`) {
                Utils.addClass(content, 'active');
            }
        });
    }

    // Open modal
    openModal(modalId) {
        const modal = Utils.$(`#${modalId}`);
        if (!modal) return;

        Utils.addClass(modal, 'active');
        this.activeModals.push(modalId);

        // Prevent body scroll
        document.body.style.overflow = 'hidden';

        // Focus management
        const firstFocusable = modal.querySelector('input, button, textarea, select');
        if (firstFocusable) {
            setTimeout(() => firstFocusable.focus(), 100);
        }
    }

    // Close modal
    closeModal(modalId) {
        const modal = Utils.$(`#${modalId}`);
        if (!modal) return;

        Utils.removeClass(modal, 'active');
        
        // Remove from active modals
        const index = this.activeModals.indexOf(modalId);
        if (index > -1) {
            this.activeModals.splice(index, 1);
        }

        // Restore body scroll if no modals are open
        if (this.activeModals.length === 0) {
            document.body.style.overflow = '';
        }

        // Clear form data if it's an auth modal
        if (modalId === 'login-modal' || modalId === 'signup-modal') {
            const form = modal.querySelector('form');
            if (form) {
                form.reset();
                this.clearFormErrors(form);
            }
        }
    }

    // Switch between modals
    switchModal(fromModalId, toModalId) {
        this.closeModal(fromModalId);
        setTimeout(() => {
            this.openModal(toModalId);
        }, 150);
    }

    // Show toast notification
    showToast(type = 'info', title = '', message = '', duration = CONFIG.UI.TOAST_DURATION) {
        const toastId = `toast-${++this.toastCounter}`;
        
        const toast = Utils.createElement('div', {
            className: `toast ${type}`,
            id: toastId
        });

        const iconMap = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };

        toast.innerHTML = `
            <i class="toast-icon ${iconMap[type] || iconMap.info}"></i>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close">
                <i class="fas fa-times"></i>
            </button>
        `;

        // Add close functionality
        const closeBtn = toast.querySelector('.toast-close');
        Utils.on(closeBtn, 'click', () => {
            this.hideToast(toastId);
        });

        // Add to container
        const container = Utils.$('#toast-container');
        if (container) {
            container.appendChild(toast);
        }

        // Show toast
        setTimeout(() => {
            Utils.addClass(toast, 'show');
        }, 100);

        // Auto hide
        setTimeout(() => {
            this.hideToast(toastId);
        }, duration);

        // Add to toasts array
        this.toasts.push({ id: toastId, element: toast });
    }

    // Hide toast
    hideToast(toastId) {
        const toast = Utils.$(`#${toastId}`);
        if (!toast) return;

        Utils.removeClass(toast, 'show');
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
            
            // Remove from toasts array
            this.toasts = this.toasts.filter(t => t.id !== toastId);
        }, CONFIG.UI.ANIMATION_DURATION);
    }

    // Clear form errors
    clearFormErrors(form) {
        if (!form) return;

        const errorElements = form.querySelectorAll('.form-error');
        errorElements.forEach(el => el.remove());
        
        const inputElements = form.querySelectorAll('.form-input, .form-textarea, .form-select');
        inputElements.forEach(el => Utils.removeClass(el, 'error'));
    }

    // Scroll to section
    scrollToSection(selector) {
        const element = Utils.$(selector);
        if (element) {
            element.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }

    // Handle window resize
    handleResize() {
        // Close mobile menu on desktop
        if (Utils.isDesktop()) {
            const navToggle = Utils.$('#nav-toggle');
            const navMenu = Utils.$('#nav-menu');
            
            if (navToggle && navMenu) {
                Utils.removeClass(navToggle, 'active');
                Utils.removeClass(navMenu, 'active');
            }
        }

        // Adjust modal sizes if needed
        this.adjustModalSizes();
    }

    // Adjust modal sizes for different screen sizes
    adjustModalSizes() {
        const activeModal = this.activeModals[this.activeModals.length - 1];
        if (!activeModal) return;

        const modal = Utils.$(`#${activeModal}`);
        if (!modal) return;

        // Add mobile-specific adjustments here if needed
    }

    // Show loading state
    showLoading(element, text = 'Loading...') {
        if (typeof element === 'string') {
            element = Utils.$(element);
        }
        if (!element) return;

        const loadingHTML = `
            <div class="loading-state">
                <i class="fas fa-spinner fa-spin"></i>
                <span>${text}</span>
            </div>
        `;

        element.innerHTML = loadingHTML;
    }

    // Show error state
    showError(element, title = 'Error', message = 'Something went wrong', retryCallback = null) {
        if (typeof element === 'string') {
            element = Utils.$(element);
        }
        if (!element) return;

        let errorHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h4>${title}</h4>
                <p>${message}</p>
        `;

        if (retryCallback) {
            const retryId = `retry-${Utils.generateId()}`;
            errorHTML += `<button class="btn btn-primary" id="${retryId}">Try Again</button>`;
        }

        errorHTML += '</div>';
        element.innerHTML = errorHTML;

        if (retryCallback) {
            const retryBtn = Utils.$(`#${retryId}`);
            if (retryBtn) {
                Utils.on(retryBtn, 'click', retryCallback);
            }
        }
    }

    // Get current section
    getCurrentSection() {
        return this.currentSection;
    }

    // Check if mobile
    isMobile() {
        return Utils.isMobile();
    }

    // Update page title
    updatePageTitle(title) {
        document.title = title ? `${title} - LearningApp` : 'LearningApp - Smart Video Learning Platform';
    }

    // Add keyboard shortcuts
    addKeyboardShortcuts() {
        Utils.on(document, 'keydown', (e) => {
            // Ctrl/Cmd + K for search
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                const searchInput = Utils.$('#search-lectures');
                if (searchInput && this.currentSection === 'dashboard') {
                    searchInput.focus();
                }
            }

            // Ctrl/Cmd + U for upload
            if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
                e.preventDefault();
                if (Auth.isUserAuthenticated()) {
                    this.showSection('upload');
                }
            }
        });
    }
}

// Global functions for HTML onclick handlers
window.showSection = function(sectionName) {
    if (window.UI) {
        window.UI.showSection(sectionName);
    }
};

window.openModal = function(modalId) {
    if (window.UI) {
        window.UI.openModal(modalId);
    }
};

window.closeModal = function(modalId) {
    if (window.UI) {
        window.UI.closeModal(modalId);
    }
};

window.switchModal = function(fromModalId, toModalId) {
    if (window.UI) {
        window.UI.switchModal(fromModalId, toModalId);
    }
};

// Create global UI manager instance
const UI = new UIManager();

// Export UI manager
window.UI = UI;

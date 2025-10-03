// Main Application Entry Point
class LearningApp {
    constructor() {
        this.version = '1.0.0';
        this.isInitialized = false;
        this.modules = {};
        
        this.init();
    }

    // Initialize the application
    async init() {
        try {
            CONFIG.log('Initializing LearningApp v' + this.version);
            
            // Wait for DOM to be ready
            if (document.readyState === 'loading') {
                await new Promise(resolve => {
                    document.addEventListener('DOMContentLoaded', resolve);
                });
            }

            // Initialize modules in order
            await this.initializeModules();
            
            // Setup global error handling
            this.setupErrorHandling();
            
            // Setup performance monitoring
            this.setupPerformanceMonitoring();
            
            // Setup offline detection
            this.setupOfflineDetection();
            
            // Setup keyboard shortcuts
            this.setupKeyboardShortcuts();
            
            // Check for updates
            this.checkForUpdates();
            
            this.isInitialized = true;
            CONFIG.log('LearningApp initialized successfully');
            
            // Dispatch ready event
            this.dispatchEvent('app:ready');
            
        } catch (error) {
            CONFIG.logError('Failed to initialize LearningApp:', error);
            this.handleInitializationError(error);
        }
    }

    // Initialize all modules
    async initializeModules() {
        const initOrder = [
            { name: 'UI', instance: UI, required: true },
            { name: 'Auth', instance: Auth, required: true },
            { name: 'API', instance: API, required: true },
            { name: 'Lectures', instance: Lectures, required: false },
            { name: 'Upload', instance: Upload, required: false }
        ];

        for (const module of initOrder) {
            try {
                CONFIG.log(`Initializing ${module.name} module...`);
                
                if (module.instance && typeof module.instance.init === 'function') {
                    await module.instance.init();
                }
                
                this.modules[module.name.toLowerCase()] = module.instance;
                CONFIG.log(`${module.name} module initialized`);
                
            } catch (error) {
                CONFIG.logError(`Failed to initialize ${module.name} module:`, error);
                
                if (module.required) {
                    throw new Error(`Required module ${module.name} failed to initialize: ${error.message}`);
                }
            }
        }
    }

    // Setup global error handling
    setupErrorHandling() {
        // Handle uncaught JavaScript errors
        window.addEventListener('error', (event) => {
            CONFIG.logError('Uncaught error:', {
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                error: event.error
            });
            
            this.handleGlobalError(event.error || new Error(event.message));
        });

        // Handle unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            CONFIG.logError('Unhandled promise rejection:', event.reason);
            this.handleGlobalError(event.reason);
            event.preventDefault(); // Prevent console error
        });

        // Handle API errors globally
        this.setupAPIErrorHandling();
    }

    // Setup API error handling
    setupAPIErrorHandling() {
        // Override fetch to add global error handling
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            try {
                const response = await originalFetch(...args);
                
                // Log API calls in development
                if (CONFIG.isDevelopment()) {
                    CONFIG.log('API Call:', args[0], response.status);
                }
                
                return response;
            } catch (error) {
                CONFIG.logError('Fetch error:', error);
                throw error;
            }
        };
    }

    // Setup performance monitoring
    setupPerformanceMonitoring() {
        // Monitor page load performance
        window.addEventListener('load', () => {
            setTimeout(() => {
                const perfData = performance.getEntriesByType('navigation')[0];
                if (perfData) {
                    CONFIG.log('Page Load Performance:', {
                        loadTime: perfData.loadEventEnd - perfData.loadEventStart,
                        domContentLoaded: perfData.domContentLoadedEventEnd - perfData.domContentLoadedEventStart,
                        totalTime: perfData.loadEventEnd - perfData.fetchStart
                    });
                }
            }, 0);
        });

        // Monitor resource loading
        if (CONFIG.isDevelopment()) {
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (entry.duration > 1000) { // Log slow resources
                        CONFIG.log('Slow resource:', entry.name, `${entry.duration}ms`);
                    }
                }
            });
            observer.observe({ entryTypes: ['resource'] });
        }
    }

    // Setup offline detection
    setupOfflineDetection() {
        const updateOnlineStatus = () => {
            if (navigator.onLine) {
                CONFIG.log('Application is online');
                this.handleOnline();
            } else {
                CONFIG.log('Application is offline');
                this.handleOffline();
            }
        };

        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        
        // Initial check
        updateOnlineStatus();
    }

    // Handle online state
    handleOnline() {
        // Remove offline indicator if exists
        const offlineIndicator = Utils.$('#offline-indicator');
        if (offlineIndicator) {
            offlineIndicator.remove();
        }

        // Retry failed requests
        this.retryFailedRequests();
        
        // Dispatch online event
        this.dispatchEvent('app:online');
    }

    // Handle offline state
    handleOffline() {
        // Show offline indicator
        this.showOfflineIndicator();
        
        // Dispatch offline event
        this.dispatchEvent('app:offline');
    }

    // Show offline indicator
    showOfflineIndicator() {
        if (Utils.$('#offline-indicator')) return; // Already shown

        const indicator = Utils.createElement('div', {
            id: 'offline-indicator',
            className: 'offline-indicator'
        });

        indicator.innerHTML = `
            <i class="fas fa-wifi"></i>
            <span>You are currently offline</span>
        `;

        document.body.appendChild(indicator);

        // Style the indicator
        Object.assign(indicator.style, {
            position: 'fixed',
            top: '70px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#f59e0b',
            color: 'white',
            padding: '10px 20px',
            borderRadius: '5px',
            zIndex: '9999',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
        });
    }

    // Setup keyboard shortcuts
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Global shortcuts
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case '/':
                        e.preventDefault();
                        this.showKeyboardShortcuts();
                        break;
                    case 'h':
                        e.preventDefault();
                        UI.showSection('home');
                        break;
                    case 'd':
                        e.preventDefault();
                        if (Auth.isUserAuthenticated()) {
                            UI.showSection('dashboard');
                        }
                        break;
                }
            }

            // Escape key actions
            if (e.key === 'Escape') {
                // Close any open dropdowns
                const dropdowns = Utils.$$('.dropdown-menu.active');
                dropdowns.forEach(dropdown => {
                    Utils.removeClass(dropdown, 'active');
                });
            }
        });
    }

    // Show keyboard shortcuts help
    showKeyboardShortcuts() {
        const shortcuts = [
            { keys: 'Ctrl/Cmd + H', action: 'Go to Home' },
            { keys: 'Ctrl/Cmd + D', action: 'Go to Dashboard' },
            { keys: 'Ctrl/Cmd + U', action: 'Go to Upload' },
            { keys: 'Ctrl/Cmd + K', action: 'Focus Search' },
            { keys: 'Ctrl/Cmd + /', action: 'Show Shortcuts' },
            { keys: 'Escape', action: 'Close Modal/Dropdown' }
        ];

        let shortcutsHTML = '<div class="shortcuts-help"><h3>Keyboard Shortcuts</h3><ul>';
        shortcuts.forEach(shortcut => {
            shortcutsHTML += `<li><kbd>${shortcut.keys}</kbd> - ${shortcut.action}</li>`;
        });
        shortcutsHTML += '</ul></div>';

        UI.showToast('info', 'Keyboard Shortcuts', shortcutsHTML, 10000);
    }

    // Check for application updates
    checkForUpdates() {
        // In a real application, this would check for new versions
        // For now, just log that we're checking
        CONFIG.log('Checking for updates...');
        
        // Simulate update check
        setTimeout(() => {
            CONFIG.log('Application is up to date');
        }, 1000);
    }

    // Retry failed requests
    retryFailedRequests() {
        // In a real application, you would maintain a queue of failed requests
        // and retry them when coming back online
        CONFIG.log('Retrying failed requests...');
    }

    // Handle global errors
    handleGlobalError(error) {
        // Don't show error toasts for network errors when offline
        if (!navigator.onLine && error.message.includes('fetch')) {
            return;
        }

        // Show user-friendly error message
        const errorMessage = this.getUserFriendlyErrorMessage(error);
        UI.showToast('error', 'Something went wrong', errorMessage);
    }

    // Get user-friendly error message
    getUserFriendlyErrorMessage(error) {
        if (error.message.includes('fetch') || error.message.includes('network')) {
            return 'Please check your internet connection and try again.';
        }
        
        if (error.message.includes('401') || error.message.includes('unauthorized')) {
            return 'Please log in to continue.';
        }
        
        if (error.message.includes('403') || error.message.includes('forbidden')) {
            return 'You do not have permission to perform this action.';
        }
        
        if (error.message.includes('404') || error.message.includes('not found')) {
            return 'The requested resource was not found.';
        }
        
        if (error.message.includes('500') || error.message.includes('server')) {
            return 'Server error. Please try again later.';
        }
        
        return 'An unexpected error occurred. Please try again.';
    }

    // Handle initialization error
    handleInitializationError(error) {
        // Show critical error message
        const errorHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: #f3f4f6;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            ">
                <div style="
                    background: white;
                    padding: 2rem;
                    border-radius: 8px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    text-align: center;
                    max-width: 400px;
                ">
                    <h2 style="color: #ef4444; margin-bottom: 1rem;">
                        <i class="fas fa-exclamation-triangle"></i>
                        Application Error
                    </h2>
                    <p style="color: #6b7280; margin-bottom: 1.5rem;">
                        Failed to initialize the application. Please refresh the page and try again.
                    </p>
                    <button onclick="window.location.reload()" style="
                        background: #6366f1;
                        color: white;
                        border: none;
                        padding: 0.5rem 1rem;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 0.875rem;
                    ">
                        Refresh Page
                    </button>
                </div>
            </div>
        `;
        
        document.body.innerHTML = errorHTML;
    }

    // Dispatch custom events
    dispatchEvent(eventName, detail = {}) {
        const event = new CustomEvent(eventName, { detail });
        window.dispatchEvent(event);
        CONFIG.log('Event dispatched:', eventName, detail);
    }

    // Get application info
    getInfo() {
        return {
            version: this.version,
            isInitialized: this.isInitialized,
            modules: Object.keys(this.modules),
            isOnline: navigator.onLine,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
        };
    }

    // Restart application
    restart() {
        CONFIG.log('Restarting application...');
        window.location.reload();
    }

    // Clean up resources
    cleanup() {
        CONFIG.log('Cleaning up application resources...');
        
        // Clear intervals and timeouts
        // Remove event listeners
        // Clean up modules
        
        this.isInitialized = false;
    }
}

// Initialize the application
const app = new LearningApp();

// Export app instance globally
window.App = app;

// Development helpers
if (CONFIG.isDevelopment()) {
    window.DEBUG = {
        config: CONFIG,
        utils: Utils,
        api: API,
        auth: Auth,
        ui: UI,
        lectures: Lectures,
        upload: Upload,
        app: app
    };
    
    CONFIG.log('Debug helpers available in window.DEBUG');
}

// Service Worker registration (for future PWA features)
if ('serviceWorker' in navigator && !CONFIG.isDevelopment()) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                CONFIG.log('Service Worker registered:', registration);
            })
            .catch(error => {
                CONFIG.log('Service Worker registration failed:', error);
            });
    });
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LearningApp;
}

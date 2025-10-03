// Authentication Module
class AuthManager {
    constructor() {
        this.currentUser = null;
        this.isAuthenticated = false;
        this.init();
    }

    // Initialize authentication
    init() {
        this.checkAuthStatus();
        this.setupEventListeners();
    }

    // Check if user is authenticated
    checkAuthStatus() {
        const token = Utils.storage.get(CONFIG.STORAGE_KEYS.AUTH_TOKEN);
        const userData = Utils.storage.get(CONFIG.STORAGE_KEYS.USER_DATA);
        
        if (token && userData) {
            this.currentUser = userData;
            this.isAuthenticated = true;
            this.updateUI(true);
        } else {
            this.updateUI(false);
        }
    }

    // Setup event listeners
    setupEventListeners() {
        // Login form
        const loginForm = Utils.$('#login-form');
        if (loginForm) {
            Utils.on(loginForm, 'submit', this.handleLogin.bind(this));
        }

        // Signup form
        const signupForm = Utils.$('#signup-form');
        if (signupForm) {
            Utils.on(signupForm, 'submit', this.handleSignup.bind(this));
        }

        // Login button
        Utils.on('#login-btn', 'click', () => {
            UI.openModal('login-modal');
        });

        // Signup button
        Utils.on('#signup-btn', 'click', () => {
            UI.openModal('signup-modal');
        });

        // Logout button
        Utils.on('#logout-btn', 'click', this.handleLogout.bind(this));

        // Get started button (for non-authenticated users)
        Utils.on('#get-started-btn', 'click', () => {
            if (this.isAuthenticated) {
                UI.showSection('dashboard');
            } else {
                UI.openModal('signup-modal');
            }
        });

        // User avatar click (toggle dropdown)
        Utils.on('#user-avatar', 'click', (e) => {
            e.stopPropagation();
            const dropdown = Utils.$('#dropdown-menu');
            Utils.toggleClass(dropdown, 'active');
        });

        // Close dropdown when clicking outside
        Utils.on(document, 'click', () => {
            const dropdown = Utils.$('#dropdown-menu');
            Utils.removeClass(dropdown, 'active');
        });
    }

    // Handle login form submission
    async handleLogin(event) {
        event.preventDefault();
        
        const form = event.target;
        const submitBtn = form.querySelector('button[type="submit"]');
        const formData = Utils.getFormData(form);
        
        // Validate form
        const validation = Utils.validateForm(form, {
            email: { required: true, email: true },
            password: { required: true, minLength: 6 }
        });

        if (!validation.isValid) {
            this.displayFormErrors(form, validation.errors);
            return;
        }

        try {
            // Show loading state
            this.setButtonLoading(submitBtn, true);
            
            // Attempt login
            const response = await API.login({
                email: formData.email,
                password: formData.password
            });

            // Store user data
            this.currentUser = response.user;
            this.isAuthenticated = true;

            // Handle "Remember Me"
            const rememberMe = form.querySelector('#remember-me').checked;
            if (rememberMe) {
                Utils.storage.set(CONFIG.STORAGE_KEYS.REMEMBER_ME, true);
            }

            // Update UI
            this.updateUI(true);
            UI.closeModal('login-modal');
            UI.showToast('success', 'Welcome back!', CONFIG.SUCCESS.LOGIN);
            
            // Redirect to dashboard
            UI.showSection('dashboard');
            
        } catch (error) {
            CONFIG.logError('Login failed:', error);
            UI.showToast('error', 'Login Failed', error.message);
        } finally {
            this.setButtonLoading(submitBtn, false);
        }
    }

    // Handle signup form submission
    async handleSignup(event) {
        event.preventDefault();
        
        const form = event.target;
        const submitBtn = form.querySelector('button[type="submit"]');
        const formData = Utils.getFormData(form);
        
        // Validate form
        const validation = Utils.validateForm(form, {
            name: { required: true, minLength: 2 },
            email: { required: true, email: true },
            password: { required: true, minLength: 6 },
            confirmPassword: { 
                required: true,
                custom: (value) => {
                    if (value !== formData.password) {
                        return 'Passwords do not match';
                    }
                    return null;
                }
            }
        });

        if (!validation.isValid) {
            this.displayFormErrors(form, validation.errors);
            return;
        }

        // Check terms agreement
        const agreeTerms = form.querySelector('#agree-terms').checked;
        if (!agreeTerms) {
            UI.showToast('error', 'Terms Required', 'Please agree to the Terms of Service');
            return;
        }

        try {
            // Show loading state
            this.setButtonLoading(submitBtn, true);
            
            // Attempt signup
            await API.signup({
                name: formData.name,
                email: formData.email,
                password: formData.password
            });

            // Show success message and switch to login
            UI.showToast('success', 'Account Created', CONFIG.SUCCESS.SIGNUP);
            UI.closeModal('signup-modal');
            
            // Pre-fill login form
            const loginForm = Utils.$('#login-form');
            if (loginForm) {
                Utils.setFormData(loginForm, { email: formData.email });
            }
            
            UI.openModal('login-modal');
            
        } catch (error) {
            CONFIG.logError('Signup failed:', error);
            UI.showToast('error', 'Signup Failed', error.message);
        } finally {
            this.setButtonLoading(submitBtn, false);
        }
    }

    // Handle logout
    async handleLogout() {
        try {
            await API.logout();
            
            this.currentUser = null;
            this.isAuthenticated = false;
            
            this.updateUI(false);
            UI.showToast('success', 'Logged Out', CONFIG.SUCCESS.LOGOUT);
            UI.showSection('home');
            
        } catch (error) {
            CONFIG.logError('Logout failed:', error);
            UI.showToast('error', 'Logout Failed', error.message);
        }
    }

    // Update UI based on authentication status
    updateUI(isAuthenticated) {
        const loginBtn = Utils.$('#login-btn');
        const signupBtn = Utils.$('#signup-btn');
        const userMenu = Utils.$('#user-menu');
        const navLinks = Utils.$$('.nav-link');

        if (isAuthenticated && this.currentUser) {
            // Hide login/signup buttons
            if (loginBtn) loginBtn.style.display = 'none';
            if (signupBtn) signupBtn.style.display = 'none';
            
            // Show user menu
            if (userMenu) {
                userMenu.style.display = 'block';
                
                // Update user avatar and info
                const userAvatar = Utils.$('#user-avatar');
                const profileName = Utils.$('#profile-name');
                const profileEmail = Utils.$('#profile-email');
                
                if (userAvatar && this.currentUser.avatar) {
                    userAvatar.src = this.currentUser.avatar;
                }
                
                if (profileName) {
                    profileName.textContent = this.currentUser.name || 'User';
                }
                
                if (profileEmail) {
                    profileEmail.textContent = this.currentUser.email || '';
                }
            }
            
            // Show authenticated nav links
            navLinks.forEach(link => {
                const href = link.getAttribute('href');
                if (href === '#dashboard' || href === '#upload' || href === '#profile') {
                    link.style.display = 'block';
                }
            });
            
        } else {
            // Show login/signup buttons
            if (loginBtn) loginBtn.style.display = 'inline-flex';
            if (signupBtn) signupBtn.style.display = 'inline-flex';
            
            // Hide user menu
            if (userMenu) userMenu.style.display = 'none';
            
            // Hide authenticated nav links
            navLinks.forEach(link => {
                const href = link.getAttribute('href');
                if (href === '#dashboard' || href === '#upload' || href === '#profile') {
                    link.style.display = 'none';
                }
            });
        }
    }

    // Display form validation errors
    displayFormErrors(form, errors) {
        // Clear previous errors
        const errorElements = form.querySelectorAll('.form-error');
        errorElements.forEach(el => el.remove());
        
        const inputElements = form.querySelectorAll('.form-input, .form-textarea, .form-select');
        inputElements.forEach(el => Utils.removeClass(el, 'error'));

        // Display new errors
        Object.entries(errors).forEach(([fieldName, fieldErrors]) => {
            const field = form.querySelector(`[name="${fieldName}"]`);
            if (field) {
                Utils.addClass(field, 'error');
                
                const errorElement = Utils.createElement('div', {
                    className: 'form-error'
                }, fieldErrors[0]);
                
                field.parentNode.appendChild(errorElement);
            }
        });
    }

    // Set button loading state
    setButtonLoading(button, isLoading) {
        const btnText = button.querySelector('.btn-text') || button;
        const btnSpinner = button.querySelector('.btn-spinner');
        
        if (isLoading) {
            button.disabled = true;
            if (btnSpinner) btnSpinner.style.display = 'inline-block';
            if (btnText !== button) btnText.style.display = 'none';
        } else {
            button.disabled = false;
            if (btnSpinner) btnSpinner.style.display = 'none';
            if (btnText !== button) btnText.style.display = 'inline-block';
        }
    }

    // Get current user
    getCurrentUser() {
        return this.currentUser;
    }

    // Check if user is authenticated
    isUserAuthenticated() {
        return this.isAuthenticated;
    }

    // Require authentication (redirect to login if not authenticated)
    requireAuth() {
        if (!this.isAuthenticated) {
            UI.openModal('login-modal');
            return false;
        }
        return true;
    }

    // Update user profile
    async updateProfile(profileData) {
        try {
            // This would typically make an API call to update the profile
            // For now, we'll just update the local storage
            const updatedUser = { ...this.currentUser, ...profileData };
            
            Utils.storage.set(CONFIG.STORAGE_KEYS.USER_DATA, updatedUser);
            this.currentUser = updatedUser;
            
            this.updateUI(true);
            UI.showToast('success', 'Profile Updated', CONFIG.SUCCESS.PROFILE_UPDATE);
            
            return updatedUser;
        } catch (error) {
            CONFIG.logError('Profile update failed:', error);
            UI.showToast('error', 'Update Failed', error.message);
            throw error;
        }
    }

    // Change password
    async changePassword(currentPassword, newPassword) {
        try {
            // This would typically make an API call to change the password
            // For now, we'll just show a success message
            UI.showToast('success', 'Password Changed', CONFIG.SUCCESS.PASSWORD_CHANGE);
        } catch (error) {
            CONFIG.logError('Password change failed:', error);
            UI.showToast('error', 'Password Change Failed', error.message);
            throw error;
        }
    }
}

// Create global auth manager instance
const Auth = new AuthManager();

// Export auth manager
window.Auth = Auth;

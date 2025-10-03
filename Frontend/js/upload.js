// Upload Module
class UploadManager {
    constructor() {
        this.selectedVideoFile = null;
        this.selectedPptFile = null;
        this.isUploading = false;
        this.uploadProgress = 0;
        
        CONFIG.log('UploadManager initialized');
        this.init();
    }

    // Initialize upload manager
    init() {
        this.setupEventListeners();
        this.setupDragAndDrop();
        this.resetUploadState();
    }

    // Reset upload state (public method)
    resetUploadState() {
        CONFIG.log('Resetting upload state');
        this.isUploading = false;
        this.uploadProgress = 0;
        this.setSubmitButtonState(false);
        this.hideUploadProgress();
    }

    // Setup event listeners
    setupEventListeners() {
        // Upload form submission
        const uploadForm = Utils.$('#lecture-upload-form');
        if (uploadForm) {
            Utils.on(uploadForm, 'submit', this.handleFormSubmit.bind(this));
        }

        // File input changes
        const videoInput = Utils.$('#video-file');
        if (videoInput) {
            Utils.on(videoInput, 'change', (e) => this.handleFileSelect(e, 'video'));
        }

        const pptInput = Utils.$('#ppt-file');
        if (pptInput) {
            Utils.on(pptInput, 'change', (e) => this.handleFileSelect(e, 'ppt'));
        }

        // Upload area clicks
        const videoUploadArea = Utils.$('#video-upload-area');
        if (videoUploadArea) {
            Utils.on(videoUploadArea, 'click', (e) => {
                // Don't trigger if clicking on the remove button or file input itself
                if (e.target.closest('.remove-file') || e.target.type === 'file') {
                    return;
                }
                if (!this.isUploading) {
                    CONFIG.log('Video upload area clicked, opening file dialog');
                    videoInput.click();
                }
            });
        }

        const pptUploadArea = Utils.$('#ppt-upload-area');
        if (pptUploadArea) {
            Utils.on(pptUploadArea, 'click', (e) => {
                // Don't trigger if clicking on the remove button or file input itself
                if (e.target.closest('.remove-file') || e.target.type === 'file') {
                    return;
                }
                if (!this.isUploading) {
                    CONFIG.log('PPT upload area clicked, opening file dialog');
                    pptInput.click();
                }
            });
        }
    }

    // Setup drag and drop functionality
    setupDragAndDrop() {
        const uploadAreas = [
            { element: Utils.$('#video-upload-area'), type: 'video' },
            { element: Utils.$('#ppt-upload-area'), type: 'ppt' }
        ];

        uploadAreas.forEach(({ element, type }) => {
            if (!element) return;

            // Prevent default drag behaviors
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                Utils.on(element, eventName, this.preventDefaults);
            });

            // Highlight drop area when item is dragged over it
            ['dragenter', 'dragover'].forEach(eventName => {
                Utils.on(element, eventName, () => {
                    if (!this.isUploading) {
                        Utils.addClass(element, 'dragover');
                    }
                });
            });

            ['dragleave', 'drop'].forEach(eventName => {
                Utils.on(element, eventName, () => {
                    Utils.removeClass(element, 'dragover');
                });
            });

            // Handle dropped files
            Utils.on(element, 'drop', (e) => {
                if (!this.isUploading) {
                    this.handleDrop(e, type);
                }
            });
        });
    }

    // Prevent default drag behaviors
    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Handle file drop
    handleDrop(e, fileType) {
        const dt = e.dataTransfer;
        const files = dt.files;

        if (files.length > 0) {
            this.processFile(files[0], fileType);
        }
    }

    // Handle file input selection
    handleFileSelect(e, fileType) {
        const files = e.target.files;
        CONFIG.log(`File selected for ${fileType}:`, files.length > 0 ? files[0].name : 'No file');
        if (files.length > 0) {
            this.processFile(files[0], fileType);
        }
    }

    // Process selected file
    processFile(file, fileType) {
        let errors = [];

        if (fileType === 'video') {
            errors = API.validateVideoFile(file);
            if (errors.length === 0) {
                this.selectedVideoFile = file;
                this.displayFilePreview(file, 'video');
            }
        } else if (fileType === 'ppt') {
            errors = API.validatePresentationFile(file);
            if (errors.length === 0) {
                this.selectedPptFile = file;
                this.displayFilePreview(file, 'ppt');
            }
        }

        if (errors.length > 0) {
            UI.showToast('error', 'Invalid File', errors.join(' '));
        }
    }

    // Display file preview
    displayFilePreview(file, fileType) {
        CONFIG.log(`Displaying preview for ${fileType} file:`, file.name);
        const uploadArea = Utils.$(`#${fileType}-upload-area`);
        const placeholder = uploadArea.querySelector('.upload-placeholder');
        const preview = uploadArea.querySelector('.file-preview');

        CONFIG.log('Upload area elements found:', {
            uploadArea: !!uploadArea,
            placeholder: !!placeholder,
            preview: !!preview
        });

        if (placeholder) {
            placeholder.style.display = 'none';
            CONFIG.log('Placeholder hidden');
        }
        if (preview) {
            preview.style.display = 'flex';
            CONFIG.log('Preview shown');
            
            const fileName = preview.querySelector('.file-name');
            const fileSize = preview.querySelector('.file-size');
            
            if (fileName) fileName.textContent = file.name;
            if (fileSize) fileSize.textContent = Utils.formatFileSize(file.size);
        }
    }

    // Remove file
    removeFile(fileType) {
        if (fileType === 'video') {
            this.selectedVideoFile = null;
            const videoInput = Utils.$('#video-file');
            if (videoInput) videoInput.value = '';
        } else if (fileType === 'ppt') {
            this.selectedPptFile = null;
            const pptInput = Utils.$('#ppt-file');
            if (pptInput) pptInput.value = '';
        }

        const uploadArea = Utils.$(`#${fileType}-upload-area`);
        const placeholder = uploadArea.querySelector('.upload-placeholder');
        const preview = uploadArea.querySelector('.file-preview');

        if (placeholder) placeholder.style.display = 'block';
        if (preview) preview.style.display = 'none';
    }

    // Handle form submission
    async handleFormSubmit(e) {
        e.preventDefault();

        if (!Auth.requireAuth()) {
            return;
        }

        if (this.isUploading) {
            CONFIG.logError('Upload already in progress. Current state:', {
                isUploading: this.isUploading,
                selectedVideoFile: !!this.selectedVideoFile,
                selectedPptFile: !!this.selectedPptFile
            });
            return;
        }

        // Validate form
        const form = e.target;
        const formData = Utils.getFormData(form);

        const validation = Utils.validateForm(form, {
            title: { required: true, minLength: 3, maxLength: 100 }
        });

        if (!validation.isValid) {
            this.displayFormErrors(form, validation.errors);
            return;
        }

        if (!this.selectedVideoFile) {
            UI.showToast('error', 'Video Required', 'Please select a video file to upload.');
            return;
        }

        try {
            CONFIG.log('Starting upload process');
            this.isUploading = true;
            this.setSubmitButtonState(true);
            this.showUploadProgress();

            // Create form data for upload
            const uploadFormData = API.createFormDataForUpload(
                {
                    title: formData.title,
                    description: formData.description
                },
                this.selectedVideoFile,
                this.selectedPptFile
            );

            // Upload with progress tracking
            const response = await API.uploadLecture(uploadFormData, (progress) => {
                this.updateUploadProgress(progress);
            });

            // Upload successful
            this.hideUploadProgress();
            this.resetForm();
            UI.showToast('success', 'Upload Successful', CONFIG.SUCCESS.UPLOAD);

            // Refresh lectures if on dashboard
            if (Lectures) {
                Lectures.refresh();
            }

            // Switch to dashboard
            UI.showSection('dashboard');

        } catch (error) {
            CONFIG.logError('Upload failed:', error);
            this.hideUploadProgress();
            UI.showToast('error', 'Upload Failed', error.message);
        } finally {
            CONFIG.log('Upload process finished, resetting state');
            this.isUploading = false;
            this.setSubmitButtonState(false);
        }
    }

    // Show upload progress
    showUploadProgress() {
        const uploadForm = Utils.$('#lecture-upload-form');
        const uploadProgress = Utils.$('#upload-progress');

        if (uploadForm) uploadForm.style.display = 'none';
        if (uploadProgress) uploadProgress.style.display = 'block';

        this.updateUploadProgress(0);
    }

    // Update upload progress
    updateUploadProgress(progress) {
        this.uploadProgress = progress;

        const progressFill = Utils.$('#progress-fill');
        const progressPercentage = Utils.$('.progress-percentage');
        const progressStatus = Utils.$('#progress-status');

        if (progressFill) {
            progressFill.style.width = `${progress}%`;
        }

        if (progressPercentage) {
            progressPercentage.textContent = `${Math.round(progress)}%`;
        }

        if (progressStatus) {
            if (progress < 100) {
                progressStatus.textContent = 'Uploading files...';
            } else {
                progressStatus.textContent = 'Processing video... This may take a few minutes.';
            }
        }
    }

    // Hide upload progress
    hideUploadProgress() {
        const uploadForm = Utils.$('#lecture-upload-form');
        const uploadProgress = Utils.$('#upload-progress');

        if (uploadForm) uploadForm.style.display = 'block';
        if (uploadProgress) uploadProgress.style.display = 'none';
    }

    // Set submit button state
    setSubmitButtonState(isLoading) {
        const submitBtn = Utils.$('#upload-submit-btn');
        if (!submitBtn) return;

        const btnText = submitBtn.querySelector('.btn-text');
        const btnSpinner = submitBtn.querySelector('.btn-spinner');

        if (isLoading) {
            submitBtn.disabled = true;
            if (btnText) btnText.style.display = 'none';
            if (btnSpinner) btnSpinner.style.display = 'inline-block';
        } else {
            submitBtn.disabled = false;
            if (btnText) btnText.style.display = 'inline-block';
            if (btnSpinner) btnSpinner.style.display = 'none';
        }
    }

    // Reset upload form
    resetForm() {
        const form = Utils.$('#lecture-upload-form');
        if (form) {
            form.reset();
        }

        // Clear file selections
        this.selectedVideoFile = null;
        this.selectedPptFile = null;

        // Reset file previews
        this.resetFilePreview('video');
        this.resetFilePreview('ppt');

        // Clear any form errors
        this.clearFormErrors(form);

        // Reset button state
        this.setSubmitButtonState(false);
        
        // Reset upload state
        this.isUploading = false;
    }

    // Reset file preview
    resetFilePreview(fileType) {
        const uploadArea = Utils.$(`#${fileType}-upload-area`);
        const placeholder = uploadArea.querySelector('.upload-placeholder');
        const preview = uploadArea.querySelector('.file-preview');

        if (placeholder) placeholder.style.display = 'block';
        if (preview) preview.style.display = 'none';
    }

    // Display form validation errors
    displayFormErrors(form, errors) {
        // Clear previous errors
        this.clearFormErrors(form);

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

    // Clear form errors
    clearFormErrors(form) {
        if (!form) return;

        const errorElements = form.querySelectorAll('.form-error');
        errorElements.forEach(el => el.remove());
        
        const inputElements = form.querySelectorAll('.form-input, .form-textarea');
        inputElements.forEach(el => Utils.removeClass(el, 'error'));
    }

    // Check upload requirements
    checkUploadRequirements() {
        const requirements = {
            authenticated: Auth.isUserAuthenticated(),
            hasVideo: !!this.selectedVideoFile,
            validVideo: this.selectedVideoFile ? API.validateVideoFile(this.selectedVideoFile).length === 0 : false,
            validPpt: this.selectedPptFile ? API.validatePresentationFile(this.selectedPptFile).length === 0 : true
        };

        return requirements;
    }

    // Get upload status
    getUploadStatus() {
        return {
            isUploading: this.isUploading,
            progress: this.uploadProgress,
            selectedFiles: {
                video: this.selectedVideoFile ? {
                    name: this.selectedVideoFile.name,
                    size: this.selectedVideoFile.size,
                    type: this.selectedVideoFile.type
                } : null,
                ppt: this.selectedPptFile ? {
                    name: this.selectedPptFile.name,
                    size: this.selectedPptFile.size,
                    type: this.selectedPptFile.type
                } : null
            }
        };
    }

    // Estimate upload time (rough calculation)
    estimateUploadTime() {
        if (!this.selectedVideoFile) return null;

        // Rough estimation: 1MB per second for average connection
        const fileSizeInMB = this.selectedVideoFile.size / (1024 * 1024);
        const estimatedSeconds = fileSizeInMB;
        
        return Utils.formatDuration(estimatedSeconds);
    }

    // Cancel upload (if supported)
    cancelUpload() {
        if (this.isUploading) {
            // In a real implementation, you would cancel the XMLHttpRequest
            this.isUploading = false;
            this.hideUploadProgress();
            UI.showToast('info', 'Upload Cancelled', 'The upload has been cancelled.');
        }
    }
}

// Global function to remove files (called from HTML)
window.removeFile = function(fileType) {
    if (window.Upload) {
        window.Upload.removeFile(fileType);
    }
};

// Global function to reset upload form (called from HTML)
window.resetUploadForm = function() {
    if (window.Upload) {
        window.Upload.resetForm();
    }
};

// Global function to reset upload state
window.resetUploadState = function() {
    if (window.Upload) {
        window.Upload.resetUploadState();
    }
};

// Create global upload manager instance
const Upload = new UploadManager();

// Export upload manager
window.Upload = Upload;

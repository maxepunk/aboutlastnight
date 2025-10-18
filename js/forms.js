/**
 * forms.js - Form submission and localStorage recovery for About Last Night
 *
 * Contains: FormRecovery API, RetryManager, form submission logic
 * Dependencies: utils.js (for tracking field population)
 * Contracts: localstorage-recovery-api.yaml, google-apps-script-form-submission.yaml
 */

// IMPORTANT: Google Script Web App URL
// Replace this with your actual Google Apps Script Web App URL
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzZ7Xep091AvDFGPADN6CzRCHJUgD0-rPEcBFsuDWEtDTNUiFJGQ_cWIlEwX8gZm8Nk2g/exec';

// ═══════════════════════════════════════════════════════
// FORM RECOVERY API (localStorage)
// ═══════════════════════════════════════════════════════

const FormRecovery = {
    storageKey: 'aln_form_recovery',
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds

    /**
     * Save form data to localStorage with expiry
     * @param {Object} formData - Form data object {email, fullName?, photoConsent?}
     * @returns {boolean} True if save successful, false if localStorage unavailable/quota exceeded
     */
    save(formData) {
        const data = {
            value: formData,
            timestamp: Date.now(),
            expiry: Date.now() + this.ttl
        };

        try {
            localStorage.setItem(this.storageKey, JSON.stringify(data));
            return true;
        } catch (e) {
            // Handle QuotaExceededError (Safari private mode) or SecurityError
            console.warn('Failed to save form data to localStorage:', e.name);
            return false;
        }
    },

    /**
     * Load form data from localStorage if not expired
     * @returns {Object|null} Data object {value, timestamp, expiry} or null if not found/expired
     */
    load() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (!stored) return null;

            const data = JSON.parse(stored);

            // Check if expired
            if (Date.now() > data.expiry) {
                this.clear();
                return null;
            }

            return data;
        } catch (e) {
            console.warn('Failed to load form data from localStorage:', e.name);
            return null;
        }
    },

    /**
     * Remove saved form data from localStorage
     */
    clear() {
        try {
            localStorage.removeItem(this.storageKey);
        } catch (e) {
            console.warn('Failed to clear localStorage:', e.name);
        }
    },

    /**
     * Get age of saved data in minutes
     * @returns {number|null} Minutes since data was saved, or null if no data
     */
    getAge() {
        const data = this.load();
        if (!data) return null;

        const ageInMilliseconds = Date.now() - data.timestamp;
        return Math.floor(ageInMilliseconds / 60000); // Convert to minutes
    }
};

// ═══════════════════════════════════════════════════════
// RETRY MANAGER (Exponential Backoff)
// ═══════════════════════════════════════════════════════

const RetryManager = {
    maxRetries: 3,
    baseDelay: 100, // Base delay in milliseconds

    /**
     * Sleep for specified milliseconds
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise} Promise that resolves after delay
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Calculate exponential backoff delay with jitter
     * @param {number} retryCount - Current retry attempt (0-indexed)
     * @returns {number} Delay in milliseconds
     */
    getDelay(retryCount) {
        // Exponential: 2^retryCount * baseDelay
        const exponentialDelay = Math.pow(2, retryCount) * this.baseDelay;
        // Add random jitter (0-100ms)
        const jitter = Math.random() * 100;
        return exponentialDelay + jitter;
    },

    /**
     * Determine if error is retryable
     * @param {Response|Error} error - Fetch response or error object
     * @returns {boolean} True if should retry
     */
    isRetryable(error) {
        // Network errors (no response)
        if (error instanceof TypeError) return true;

        // HTTP errors
        if (error.status) {
            // Retryable: 408 (Timeout), 429 (Rate Limit), 500-599 (Server Errors)
            if (error.status === 408 || error.status === 429) return true;
            if (error.status >= 500 && error.status < 600) return true;
        }

        return false;
    },

    /**
     * Fetch with exponential backoff retry
     * @param {string} url - URL to fetch
     * @param {Object} options - Fetch options
     * @returns {Promise<Response>} Fetch response
     * @throws {Error} After all retries exhausted
     */
    async fetchWithRetry(url, options) {
        let lastError;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const response = await fetch(url, options);

                // Success or non-retryable error
                if (response.ok || !this.isRetryable(response)) {
                    return response;
                }

                // Retryable HTTP error
                lastError = response;

            } catch (error) {
                // Network error
                lastError = error;

                if (!this.isRetryable(error)) {
                    throw error; // Non-retryable, throw immediately
                }
            }

            // If we have retries left, wait before next attempt
            if (attempt < this.maxRetries) {
                const delay = this.getDelay(attempt);
                console.log(`Retry attempt ${attempt + 1}/${this.maxRetries} after ${Math.round(delay)}ms...`);
                await this.sleep(delay);
            }
        }

        // All retries exhausted
        throw new Error(`Failed after ${this.maxRetries + 1} attempts: ${lastError.message || lastError.status}`);
    }
};

// ═══════════════════════════════════════════════════════
// FORM SUBMISSION HANDLER
// ═══════════════════════════════════════════════════════

/**
 * Handle form submission with retry and localStorage recovery
 * @param {Event} e - Form submit event
 */
async function handleFormSubmit(e) {
    e.preventDefault();

    const form = e.target;
    const button = form.querySelector('.recover-button');
    const originalText = button.textContent;
    const formMessage = document.getElementById('form-message');

    // Collect form data
    const formData = new FormData(form);
    const dataObject = {};
    for (let [key, value] of formData.entries()) {
        dataObject[key] = value;
    }

    // Visual feedback
    button.textContent = 'DECRYPTING...';
    button.disabled = true;
    button.style.opacity = '0.7';

    try {
        // Submit with retry mechanism
        const response = await RetryManager.fetchWithRetry(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors', // Required for Google Apps Script
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams(formData)
        });

        // Success state (we assume success with no-cors)
        FormRecovery.clear(); // Clear any saved data on success
        button.textContent = 'MEMORIES UNLOCKED';
        button.style.background = '#00ff00';
        button.style.borderColor = '#00ff00';
        if (formMessage) {
            formMessage.style.display = 'block';
        }

        // Reset form after delay
        setTimeout(() => {
            form.reset();
            button.textContent = originalText;
            button.disabled = false;
            button.style.background = '';
            button.style.borderColor = '';
            button.style.opacity = '1';
            if (formMessage) {
                formMessage.style.display = 'none';
            }
        }, 5000);

    } catch (error) {
        console.error('Form submission failed after retries:', error);

        // Save form data for recovery
        const saved = FormRecovery.save(dataObject);

        // Show error state
        button.textContent = saved ? 'DATA SAVED - TRY AGAIN' : 'ERROR - TRY AGAIN';
        button.style.background = '#ff0000';
        button.disabled = false;
        button.style.opacity = '1';

        setTimeout(() => {
            button.textContent = originalText;
            button.style.background = '';
        }, 3000);
    }
}

// ═══════════════════════════════════════════════════════
// RECOVERY PROMPT UI
// ═══════════════════════════════════════════════════════

/**
 * Show recovery prompt if saved data exists
 */
function checkForRecoveryData() {
    const savedData = FormRecovery.load();

    if (!savedData) return;

    const age = FormRecovery.getAge();
    const ageText = age < 60 ? `${age} minutes` : age < 1440 ? `${Math.floor(age / 60)} hours` : `${Math.floor(age / 1440)} days`;

    // Create recovery prompt
    const prompt = document.createElement('div');
    prompt.id = 'recovery-prompt';
    prompt.className = 'recovery-prompt';
    prompt.innerHTML = `
        <div class="recovery-content">
            <p class="recovery-message">
                ℹ️ We found unsaved form data from ${ageText} ago
            </p>
            <div class="recovery-buttons">
                <button id="restore-btn" class="recovery-btn recovery-btn-primary">Restore Data</button>
                <button id="dismiss-btn" class="recovery-btn recovery-btn-secondary">Dismiss</button>
            </div>
        </div>
    `;

    // Insert at top of page
    document.body.insertBefore(prompt, document.body.firstChild);

    // Restore button handler
    document.getElementById('restore-btn').addEventListener('click', () => {
        const form = document.getElementById('interestForm');
        if (form) {
            // Restore email field
            const emailField = form.querySelector('input[name="email"]');
            if (emailField && savedData.value.email) {
                emailField.value = savedData.value.email;
            }

            // Restore other fields if they exist
            if (savedData.value.fullName) {
                const nameField = form.querySelector('input[name="fullName"]');
                if (nameField) nameField.value = savedData.value.fullName;
            }

            if (savedData.value.photoConsent !== undefined) {
                const consentField = form.querySelector('input[name="photoConsent"]');
                if (consentField) consentField.checked = savedData.value.photoConsent;
            }
        }

        prompt.remove();
    });

    // Dismiss button handler
    document.getElementById('dismiss-btn').addEventListener('click', () => {
        FormRecovery.clear();
        prompt.remove();
    });
}

// ═══════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    // Check for recovery data on page load
    checkForRecoveryData();

    // Attach form submit handler
    const form = document.getElementById('interestForm');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }
});

// ═══════════════════════════════════════════════════════
// EXPORTS (for potential future use)
// ═══════════════════════════════════════════════════════

window.FormRecovery = FormRecovery;
window.RetryManager = RetryManager;

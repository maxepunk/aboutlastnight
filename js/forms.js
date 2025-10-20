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
// PLAYTEST FORM SUBMISSION HANDLER
// ═══════════════════════════════════════════════════════

/**
 * Handle playtest form submission with date validation
 * @param {Event} e - Form submit event
 */
async function handlePlaytestFormSubmit(e) {
    e.preventDefault();

    const form = e.target;
    const button = form.querySelector('.submit-button');
    const originalText = button.textContent;
    const successMessage = document.getElementById('successMessage');
    const errorMessage = document.getElementById('errorMessage');

    // Hide messages
    if (successMessage) successMessage.classList.remove('show');
    if (errorMessage) errorMessage.classList.remove('show');

    // Validate date selection (CRITICAL - must select a date)
    const selectedDate = document.querySelector('input[name="playtestDate"]:checked');
    if (!selectedDate) {
        if (errorMessage) {
            errorMessage.textContent = '⚠ Please select a playtest date before submitting';
            errorMessage.classList.add('show');
            setTimeout(() => errorMessage.classList.remove('show'), 3000);
        }
        return; // Block submission
    }

    // Collect form data
    const formData = new FormData(form);
    const dataObject = {};
    for (let [key, value] of formData.entries()) {
        dataObject[key] = value;
    }

    // Normalize photo consent checkbox: checked = "Yes", unchecked = "No"
    const photoConsentCheckbox = form.querySelector('input[name="photoConsent"]');
    if (photoConsentCheckbox?.checked) {
        dataObject.photoConsent = 'Yes';
        formData.set('photoConsent', 'Yes');
    } else {
        dataObject.photoConsent = 'No';
        formData.set('photoConsent', 'No');
    }

    // Save to localStorage BEFORE submission attempt (for recovery on failure)
    FormRecovery.save(dataObject);

    // Visual feedback
    button.textContent = 'PROCESSING...';
    button.disabled = true;

    try {
        // Submit to playtest Google Apps Script endpoint
        const PLAYTEST_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbypIVyTqnposIYclTgLiYv3xxXkQSRXcTH7hXF3lAC6RbKSDNHOckOrE7VhO1MbGMRbQA/exec';

        const response = await RetryManager.fetchWithRetry(PLAYTEST_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams(formData),
            redirect: 'follow' // Explicitly follow Google Apps Script redirects
        });

        // Check for successful response
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Server returned error:', response.status, errorText);
            throw new Error(`Server error: ${response.status}`);
        }

        const result = await response.json();

        if (result.result === 'success') {
            // Clear localStorage on confirmed success
            FormRecovery.clear();

            // IMMEDIATELY update capacity from POST response (no race condition!)
            const selectedDateValue = document.querySelector('input[name="playtestDate"]:checked')?.value;

            if (selectedDateValue && window.PlaytestInteractions?.dateCapacities) {
                // Update in-memory capacity data with fresh data from backend
                window.PlaytestInteractions.dateCapacities[selectedDateValue] = {
                    ...window.PlaytestInteractions.dateCapacities[selectedDateValue],
                    date: selectedDateValue,
                    spots_taken: result.spots_taken,
                    spots_remaining: result.spots_remaining,
                    has_minimum: result.has_minimum,
                    is_full: result.spots_remaining === 0,
                    spots_total: result.spots_total,
                    minimum_players: result.minimum_players
                };

                // Update spot counter UI immediately
                window.PlaytestInteractions.updateSpotCounter(selectedDateValue);

                // Update capacity badge for this date
                const capacityElement = document.querySelector(`[data-date="${selectedDateValue}"]`);
                if (capacityElement) {
                    if (result.spots_remaining > 0) {
                        capacityElement.textContent = `${result.spots_remaining} spots left`;
                    } else {
                        capacityElement.textContent = 'Full - Waitlist available';
                    }
                }
            }

            // Update success message based on status (confirmed vs waitlist)
            const successMsg = result.status === 'Confirmed'
                ? `✓ SPOT ${result.spot_number} CONFIRMED • CHECK YOUR EMAIL`
                : `⏳ WAITLIST POSITION ${result.spot_number - result.spots_total} • CHECK YOUR EMAIL`;

            if (successMessage) {
                successMessage.textContent = successMsg;
                successMessage.classList.add('show');
            }

            // Reset form immediately (user can submit again)
            form.reset();
            button.textContent = originalText;
            button.disabled = false;

            // Hide success message after delay
            setTimeout(() => {
                if (successMessage) successMessage.classList.remove('show');
            }, 5000);

        } else {
            throw new Error(result.error || 'Submission failed');
        }

    } catch (error) {
        console.error('Playtest form submission failed:', error);

        // Determine error type for better user feedback
        let errorMsg = 'ERROR';
        if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
            errorMsg = 'NETWORK ERROR';
        } else if (error.message.includes('timeout') || error.message.includes('Timeout')) {
            errorMsg = 'REQUEST TIMEOUT';
        } else if (error.message.includes('JSON')) {
            errorMsg = 'SERVER ERROR';
        }

        // Data is already saved to localStorage (we saved it before submission)
        if (errorMessage) {
            errorMessage.textContent = `${errorMsg} • DATA SAVED • TRY AGAIN`;
            errorMessage.classList.add('show');
        }

        button.textContent = originalText;
        button.disabled = false;

        setTimeout(() => {
            if (errorMessage) errorMessage.classList.remove('show');
        }, 5000);
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
        // Try interest form first
        const interestForm = document.getElementById('interestForm');
        if (interestForm) {
            // Restore email field
            const emailField = interestForm.querySelector('input[name="email"]');
            if (emailField && savedData.value.email) {
                emailField.value = savedData.value.email;
            }

            // Restore other fields if they exist
            if (savedData.value.fullName) {
                const nameField = interestForm.querySelector('input[name="fullName"]');
                if (nameField) nameField.value = savedData.value.fullName;
            }

            if (savedData.value.photoConsent !== undefined) {
                const consentField = interestForm.querySelector('input[name="photoConsent"]');
                if (consentField) consentField.checked = savedData.value.photoConsent;
            }
        }

        // Try playtest form
        const playtestForm = document.getElementById('playtestForm');
        if (playtestForm) {
            // Restore name field
            if (savedData.value.name) {
                const nameField = playtestForm.querySelector('input[name="name"]');
                if (nameField) nameField.value = savedData.value.name;
            }

            // Restore email field
            if (savedData.value.email) {
                const emailField = playtestForm.querySelector('input[name="email"]');
                if (emailField) emailField.value = savedData.value.email;
            }

            // Restore date selection (radio button)
            if (savedData.value.playtestDate) {
                const dateRadio = playtestForm.querySelector(`input[name="playtestDate"][value="${savedData.value.playtestDate}"]`);
                if (dateRadio) dateRadio.checked = true;
            }

            // Restore photo consent
            if (savedData.value.photoConsent !== undefined) {
                const consentField = playtestForm.querySelector('input[name="photoConsent"]');
                if (consentField) consentField.checked = savedData.value.photoConsent === 'Yes';
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

    // Attach form submit handlers
    const interestForm = document.getElementById('interestForm');
    if (interestForm) {
        interestForm.addEventListener('submit', handleFormSubmit);
    }

    // Attach playtest form handler
    const playtestForm = document.getElementById('playtestForm');
    if (playtestForm) {
        playtestForm.addEventListener('submit', handlePlaytestFormSubmit);
    }
});

// ═══════════════════════════════════════════════════════
// EXPORTS (for potential future use)
// ═══════════════════════════════════════════════════════

window.FormRecovery = FormRecovery;
window.RetryManager = RetryManager;

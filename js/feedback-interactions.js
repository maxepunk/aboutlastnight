/**
 * Feedback Form Interactions
 * Handles URL parameter parsing, form submission, and user feedback
 *
 * URL Parameter Support:
 * - ?date=MMDD pre-selects the session date dropdown
 * - Example: feedback.html?date=1123 selects "November 23"
 */

// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════

/**
 * Google Apps Script endpoint for feedback submissions
 * IMPORTANT: Update this URL when deploying new versions of the backend
 *
 * To deploy:
 * 1. Copy FEEDBACK_GOOGLE_SCRIPT.js to Google Apps Script
 * 2. Deploy → Manage deployments → New deployment
 * 3. Set: Web app → Execute as: Me → Anyone can access
 * 4. Copy the web app URL here
 */
const FEEDBACK_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxQB_Xh2jRL8L8mGVNdR0ol7q0e1YYbyduv17FLErxl-E91ZYDqihoZTdcwfRkJvpLL/exec';

// ═══════════════════════════════════════════════════════════
// URL PARAMETER HANDLING
// ═══════════════════════════════════════════════════════════

/**
 * Convert MMDD format to YYYY-MM-DD for date input
 * Assumes current show run year (2025) for Nov-Dec, handles year boundary
 *
 * @param {string} mmdd - Date in MMDD format (e.g., "1123" for November 23)
 * @returns {string} Date in YYYY-MM-DD format (e.g., "2025-11-23")
 */
function mmddToISO(mmdd) {
    if (!mmdd || mmdd.length !== 4) return '';

    const month = mmdd.substring(0, 2);
    const day = mmdd.substring(2, 4);

    // Show run is Nov 2025 - Dec 2025, so use 2025
    // Adjust if your show dates span multiple years
    const year = '2025';

    return `${year}-${month}-${day}`;
}

/**
 * Convert YYYY-MM-DD to MMDD format for submission/storage
 *
 * @param {string} isoDate - Date in YYYY-MM-DD format
 * @returns {string} Date in MMDD format
 */
function isoToMMDD(isoDate) {
    if (!isoDate) return '';

    // Input: "2025-11-23" → Output: "1123"
    const parts = isoDate.split('-');
    if (parts.length !== 3) return '';

    return parts[1] + parts[2];
}

/**
 * Parse URL parameters and pre-fill session date if provided
 */
function initializeDateFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const dateParam = urlParams.get('date');

    if (dateParam) {
        const sessionInput = document.getElementById('sessionDate');
        if (sessionInput) {
            const isoDate = mmddToISO(dateParam);
            if (isoDate) {
                sessionInput.value = isoDate;
                console.log(`Pre-filled session date: ${dateParam} → ${isoDate}`);
            } else {
                console.warn(`Invalid date parameter: "${dateParam}"`);
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════
// FORM SUBMISSION
// ═══════════════════════════════════════════════════════════

/**
 * Handle form submission
 */
async function handleFormSubmit(event) {
    event.preventDefault();

    const form = event.target;
    const submitButton = document.getElementById('submitButton');
    const successMessage = document.getElementById('successMessage');
    const errorMessage = document.getElementById('errorMessage');

    // Disable button during submission
    submitButton.disabled = true;
    submitButton.textContent = 'Sending...';

    // Hide any previous messages
    successMessage.classList.remove('show');
    errorMessage.classList.remove('show');

    // Collect form data
    const formData = new FormData(form);

    // Convert date from YYYY-MM-DD (input) to MMDD (storage format)
    const rawDate = formData.get('sessionDate') || '';
    const sessionDate = isoToMMDD(rawDate);

    const data = {
        sessionDate: sessionDate,
        sessionDateFull: rawDate, // Also store full date for clarity in spreadsheet
        // Scale questions (1-10)
        understoodGameplay: formData.get('understoodGameplay') || '',
        puzzleQuality: formData.get('puzzleQuality') || '',
        characterInterest: formData.get('characterInterest') || '',
        storySatisfaction: formData.get('storySatisfaction') || '',
        // Open-ended questions
        whatWorked: formData.get('whatWorked') || '',
        improvements: formData.get('improvements') || '',
        describeToFriend: formData.get('describeToFriend') || '',
        // Contact info
        email: formData.get('email') || '',
        discoverSource: formData.get('discoverSource') || '',
        // Metadata
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        referrer: document.referrer || ''
    };

    try {
        // Check if endpoint is configured
        if (FEEDBACK_ENDPOINT === 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE') {
            console.warn('Feedback endpoint not configured. Simulating success for development.');
            // Simulate success for development
            await new Promise(resolve => setTimeout(resolve, 1000));
            showSuccess(form, submitButton, successMessage);
            return;
        }

        // Submit to Google Apps Script
        const response = await fetch(FEEDBACK_ENDPOINT, {
            method: 'POST',
            mode: 'no-cors', // Required for Google Apps Script
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams(data).toString()
        });

        // Google Apps Script returns opaque response with no-cors
        // We assume success if no error was thrown
        showSuccess(form, submitButton, successMessage);

    } catch (error) {
        console.error('Feedback submission error:', error);
        showError(submitButton, errorMessage);
    }
}

/**
 * Show success state
 */
function showSuccess(form, submitButton, successMessage) {
    // Hide form fields
    const formGroups = form.querySelectorAll('.form-group');
    formGroups.forEach(group => {
        group.style.display = 'none';
    });

    // Hide submit button
    submitButton.style.display = 'none';

    // Show success message
    successMessage.classList.add('show');

    // Scroll to success message
    successMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * Show error state
 */
function showError(submitButton, errorMessage) {
    submitButton.disabled = false;
    submitButton.textContent = 'Send it';
    errorMessage.classList.add('show');
}

// ═══════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════

/**
 * Initialize feedback form functionality
 */
function initializeFeedbackForm() {
    // Pre-select date from URL parameter
    initializeDateFromURL();

    // Attach form submit handler
    const form = document.getElementById('feedbackForm');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }

    console.log('Feedback form initialized');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeFeedbackForm);
} else {
    initializeFeedbackForm();
}

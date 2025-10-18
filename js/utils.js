/**
 * utils.js - Utility functions and analytics for About Last Night landing page
 *
 * Contains: Helper functions, analytics, tracking, device detection
 * Dependencies: None (vanilla JavaScript)
 */

// ═══════════════════════════════════════════════════════
// DEVICE DETECTION
// ═══════════════════════════════════════════════════════

/**
 * Detects if user is on a mobile device
 * @returns {boolean} True if mobile device
 */
function isMobileDevice() {
    return /Mobile|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Gets device type string for analytics
 * @returns {string} 'Mobile' or 'Desktop'
 */
function getDeviceType() {
    return isMobileDevice() ? 'Mobile' : 'Desktop';
}

// ═══════════════════════════════════════════════════════
// URL PARAMETER UTILITIES
// ═══════════════════════════════════════════════════════

/**
 * Gets UTM parameters from URL for tracking
 * @returns {Object} UTM parameters object
 */
function getUTMParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    return {
        utm_source: urlParams.get('utm_source') || 'direct',
        utm_medium: urlParams.get('utm_medium') || '',
        utm_campaign: urlParams.get('utm_campaign') || '',
        utm_term: urlParams.get('utm_term') || '',
        utm_content: urlParams.get('utm_content') || ''
    };
}

/**
 * Gets referrer information
 * @returns {string} Referrer URL or empty string
 */
function getReferrer() {
    return document.referrer || '';
}

// ═══════════════════════════════════════════════════════
// FORM FIELD POPULATION
// ═══════════════════════════════════════════════════════

/**
 * Populates hidden tracking fields in forms
 * Call this on page load to track user acquisition data
 */
function populateHiddenTrackingFields() {
    // Get UTM parameters
    const utm = getUTMParameters();

    // Populate utm_source field
    const utmSourceField = document.getElementById('utm_source');
    if (utmSourceField) {
        utmSourceField.value = utm.utm_source;
    }

    // Populate referrer field
    const referrerField = document.getElementById('referrer');
    if (referrerField) {
        referrerField.value = getReferrer();
    }

    // Populate device type field
    const deviceTypeField = document.getElementById('device_type');
    if (deviceTypeField) {
        deviceTypeField.value = getDeviceType();
    }
}

// ═══════════════════════════════════════════════════════
// CONSOLE LOGGING (Development Helper)
// ═══════════════════════════════════════════════════════

/**
 * Logs tracking data to console for development/debugging
 * Only logs in development (when not on production domain)
 */
function logTrackingData() {
    const isProduction = window.location.hostname === 'aboutlastnightgame.com';

    if (!isProduction) {
        console.log('📊 Tracking Data:', {
            utm: getUTMParameters(),
            referrer: getReferrer(),
            device: getDeviceType(),
            timestamp: new Date().toISOString()
        });
    }
}

// ═══════════════════════════════════════════════════════
// BROWSER FEATURE DETECTION
// ═══════════════════════════════════════════════════════

/**
 * Checks if localStorage is available
 * @returns {boolean} True if localStorage is supported and available
 */
function isLocalStorageAvailable() {
    try {
        const test = '__test__';
        localStorage.setItem(test, test);
        localStorage.removeItem(test);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Checks if user prefers reduced motion
 * @returns {boolean} True if user prefers reduced motion
 */
function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ═══════════════════════════════════════════════════════
// DATE/TIME UTILITIES
// ═══════════════════════════════════════════════════════

/**
 * Formats timestamp for display
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Formatted date string
 */
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Gets time elapsed since a timestamp
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Human-readable time difference (e.g., "5 minutes ago")
 */
function getTimeElapsed(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
}

// ═══════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════

// Populate tracking fields on page load
document.addEventListener('DOMContentLoaded', function() {
    populateHiddenTrackingFields();
    logTrackingData();
});

// ═══════════════════════════════════════════════════════
// EXPORTS (for potential future modularization)
// ═══════════════════════════════════════════════════════

// Make utilities available globally for other scripts if needed
window.ALNUtils = {
    isMobileDevice,
    getDeviceType,
    getUTMParameters,
    getReferrer,
    isLocalStorageAvailable,
    prefersReducedMotion,
    formatTimestamp,
    getTimeElapsed,
    populateHiddenTrackingFields
};

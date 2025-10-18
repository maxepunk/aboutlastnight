/**
 * playtest-interactions.js - Playtest-specific UI behavior for About Last Night
 *
 * Contains: Spot counter updates, date selection handling, capacity fetching for multi-date playtest system
 * Dependencies: None (standalone module)
 * Architecture: Date-agnostic - backend dynamically discovers dates from database
 */

// Google Apps Script endpoint for playtest signups
// This endpoint handles both GET (capacity data) and POST (form submissions)
const PLAYTEST_GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbypIVyTqnposIYclTgLiYv3xxXkQSRXcTH7hXF3lAC6RbKSDNHOckOrE7VhO1MbGMRbQA/exec';

// Date capacity storage - populated by fetchAllCapacities()
// Structure: { "2025-09-21 16:00": { displayText, spots_total, spots_taken, spots_remaining, minimum_players, has_minimum, is_full }, ... }
let dateCapacities = {};

// Cache last known good data for graceful degradation
let lastKnownGoodData = null;

// Track user's manual date selection to preserve it across capacity refreshes
// null = no selection (show next available), string = user selected a specific date
let userSelectedDate = null;

/**
 * Check if a date string (format "YYYY-MM-DD HH:MM") is in the past
 * Client-side version of backend isPastPlaytestDate()
 *
 * @param {string} dateString - Date in format "YYYY-MM-DD HH:MM"
 * @returns {boolean} - True if date is in the past
 */
function isDateStringPast(dateString) {
    try {
        const parts = dateString.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
        if (!parts) return false;

        const [, year, month, day, hour, minute] = parts;
        const playtestDate = new Date(year, month - 1, day, hour, minute);

        return playtestDate < new Date();
    } catch (error) {
        return false; // Safe default
    }
}

// ═══════════════════════════════════════════════════════
// SPOT COUNTER UPDATES
// ═══════════════════════════════════════════════════════

/**
 * Find the next available playtest date (not past, with spots remaining)
 * Skips past dates and full dates, returns first date with availability
 * If all dates are past or full, returns the earliest non-past date for waitlist
 *
 * @returns {string|null} - Date string or null if no dates available
 */
function findNextAvailableDate() {
    const sortedDates = Object.keys(dateCapacities).sort();

    // First pass: find next non-past date with spots remaining
    for (const dateString of sortedDates) {
        const dateInfo = dateCapacities[dateString];
        if (!dateInfo.is_past_date && dateInfo.spots_remaining > 0) {
            return dateString;
        }
    }

    // Second pass: if all available dates are full, return first non-past date (for waitlist)
    for (const dateString of sortedDates) {
        const dateInfo = dateCapacities[dateString];
        if (!dateInfo.is_past_date) {
            return dateString;
        }
    }

    // All dates are in the past
    return null;
}

/**
 * Update event details section with date/time from capacity data
 * Parses displayText field (e.g., "November 4 at 6:30 PM") to extract date and time
 *
 * @param {string} dateString - ISO date string (e.g., "2025-11-04 18:30")
 */
function updateEventDetails(dateString) {
    const dateInfo = dateCapacities[dateString];
    if (!dateInfo) return;

    const eventDate = document.getElementById('eventDate');
    const eventTime = document.getElementById('eventTime');

    if (!eventDate || !eventTime) return;

    // Backend provides displayText like "November 4 at 6:30 PM"
    // Parse it to extract date and time portions
    const displayText = dateInfo.displayText;
    const atIndex = displayText.indexOf(' at ');

    if (atIndex !== -1) {
        const datePart = displayText.substring(0, atIndex); // "November 4"
        const timePart = displayText.substring(atIndex + 4); // "6:30 PM"

        eventDate.textContent = datePart;
        eventTime.textContent = timePart;
    } else {
        // Fallback: show full display text in date field
        eventDate.textContent = displayText;
        eventTime.textContent = 'See Below';
    }
}

/**
 * Update spot counter display for the currently selected date
 * Handles different capacity states: below minimum, available, warning-low, warning-critical, full
 *
 * @param {string} selectedDate - ISO date string of selected playtest (e.g., "2025-09-21 16:00")
 */
function updateSpotCounter(selectedDate) {
    const data = dateCapacities[selectedDate];
    if (!data) {
        console.warn(`No capacity data found for date: ${selectedDate}`);
        return;
    }

    const counter = document.getElementById('spotCounter');
    const spotsNumber = document.getElementById('spotsNumber');
    const spotsText = document.getElementById('spotsText');

    if (!counter || !spotsNumber || !spotsText) {
        console.error('Spot counter elements not found in DOM');
        return;
    }

    // Remove all state classes
    counter.classList.remove('warning-low', 'warning-critical', 'full');

    if (!data.has_minimum) {
        // Show minimum players progress (e.g., "3/5 MINIMUM PLAYERS REQUIRED")
        spotsNumber.textContent = `${data.spots_taken}/${data.minimum_players}`;
        spotsText.textContent = 'MINIMUM PLAYERS REQUIRED';

        // Add visual feedback for progress toward minimum
        if (data.spots_taken >= 3) {
            counter.classList.add('warning-low');
        }
    } else {
        // Show spots remaining (e.g., "12 SPOTS REMAINING")
        spotsNumber.textContent = data.spots_remaining;
        spotsText.textContent = 'SPOTS REMAINING';

        // Apply visual state classes based on capacity
        if (data.spots_remaining === 0) {
            counter.classList.add('full');
            spotsText.textContent = 'PLAYTEST FULL';
        } else if (data.spots_remaining <= 3) {
            counter.classList.add('warning-critical');
        } else if (data.spots_remaining <= 5) {
            counter.classList.add('warning-low');
        }
    }
}

// ═══════════════════════════════════════════════════════
// CAPACITY FETCHING
// ═══════════════════════════════════════════════════════

/**
 * Fetch capacity data for all playtest dates from backend
 * Backend dynamically discovers dates from database (no hardcoded date list)
 * Updates dateCapacities object and refreshes UI displays
 *
 * @returns {Promise<void>}
 */
async function fetchAllCapacities() {
    try {
        const response = await fetch(PLAYTEST_GOOGLE_SCRIPT_URL);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.dates || !Array.isArray(data.dates)) {
            console.warn('Invalid capacity data structure:', data);
            return;
        }

        // Cache successful response for graceful degradation on future errors
        lastKnownGoodData = data;

        // Store capacities by date value for O(1) lookup
        data.dates.forEach(dateInfo => {
            dateCapacities[dateInfo.date] = dateInfo;

            // Find the radio input and capacity display for this date
            const radioInput = document.querySelector(`input[name="playtestDate"][value="${dateInfo.date}"]`);
            const capacityElement = document.querySelector(`[data-date="${dateInfo.date}"]`);

            if (radioInput && capacityElement) {
                // Update capacity display and handle disabled state
                let statusText;

                if (dateInfo.is_past_date) {
                    // Date has passed - disable it
                    statusText = 'Date passed';
                    radioInput.disabled = true;
                    radioInput.closest('.date-option')?.classList.add('disabled');
                } else if (dateInfo.spots_remaining > 0) {
                    // Spots available
                    statusText = `${dateInfo.spots_remaining} spots left`;
                    radioInput.disabled = false;
                    radioInput.closest('.date-option')?.classList.remove('disabled');
                } else {
                    // Full but not past - waitlist available
                    statusText = 'Full - Waitlist available';
                    radioInput.disabled = false;
                    radioInput.closest('.date-option')?.classList.remove('disabled');
                }

                capacityElement.textContent = statusText;
            }
        });

        // Handle dates in frontend that don't exist in backend yet (no signups yet)
        // Initialize them with default capacity (20 spots, 0 taken)
        // Need to check if dates are past even if they have no signups yet
        const allCapacityElements = document.querySelectorAll('[data-date]');
        allCapacityElements.forEach(el => {
            const dateValue = el.getAttribute('data-date');
            if (!dateCapacities[dateValue]) {
                // This date hasn't been submitted yet - show default capacity
                // Check if date is in the past (parse date string)
                const isPast = isDateStringPast(dateValue);

                dateCapacities[dateValue] = {
                    date: dateValue,
                    displayText: dateValue,
                    spots_total: 20,
                    spots_taken: 0,
                    spots_remaining: 20,
                    minimum_players: 5,
                    has_minimum: false,
                    is_full: false,
                    is_past_date: isPast
                };

                // Update UI for dates with no signups yet
                const radioInput = document.querySelector(`input[name="playtestDate"][value="${dateValue}"]`);
                if (isPast && radioInput) {
                    el.textContent = 'Date passed';
                    radioInput.disabled = true;
                    radioInput.closest('.date-option')?.classList.add('disabled');
                } else {
                    el.textContent = '20 spots available';
                }
            }
        });

        // Update spot counter: respect user selection or show next available
        let dateToDisplay = null;

        if (userSelectedDate && dateCapacities[userSelectedDate]) {
            // User has manually selected a date - respect their choice
            dateToDisplay = userSelectedDate;
        } else {
            // No user selection or selection is invalid (e.g., date removed) - show next available
            dateToDisplay = findNextAvailableDate();
            userSelectedDate = null; // Clear invalid selection
        }

        if (dateToDisplay) {
            updateSpotCounter(dateToDisplay);
            updateEventDetails(dateToDisplay);

            // On initial page load, auto-select the next available date radio button
            if (!userSelectedDate) {
                const radioToSelect = document.querySelector(`input[name="playtestDate"][value="${dateToDisplay}"]`);
                if (radioToSelect && !radioToSelect.disabled) {
                    radioToSelect.checked = true;
                }
            }
        } else {
            // No dates available (all past)
            const counter = document.getElementById('spotCounter');
            const spotsNumber = document.getElementById('spotsNumber');
            const spotsText = document.getElementById('spotsText');
            if (counter && spotsNumber && spotsText) {
                spotsNumber.textContent = '0';
                spotsText.textContent = 'NO UPCOMING PLAYTESTS';
                counter.classList.add('full');
            }
        }

    } catch (error) {
        console.error('Failed to fetch capacity data:', error);

        // Attempt to use last known good data (cached from previous successful fetch)
        if (lastKnownGoodData && lastKnownGoodData.dates) {
            console.log('Using cached capacity data from previous fetch');

            // Restore from cache
            lastKnownGoodData.dates.forEach(dateInfo => {
                dateCapacities[dateInfo.date] = dateInfo;

                const capacityElement = document.querySelector(`[data-date="${dateInfo.date}"]`);
                if (capacityElement) {
                    capacityElement.textContent = `${dateInfo.spots_remaining} spots (cached)`;
                }
            });
        } else {
            // No cached data available - show fallback message
            console.warn('No cached data available, showing fallback');

            const capacityElements = document.querySelectorAll('.date-capacity');
            capacityElements.forEach(el => {
                el.textContent = 'Capacity unavailable';
                el.style.color = 'rgba(255, 200, 0, 0.8)'; // Yellow warning color
            });
        }

        // Graceful degradation - don't block user from continuing to form
        // Form can still be submitted, backend will handle capacity checks
    }
}

// ═══════════════════════════════════════════════════════
// DATE SELECTION HANDLER
// ═══════════════════════════════════════════════════════

/**
 * Handle date radio button change event
 * Updates spot counter display when user selects a different date
 * Tracks user's selection to preserve it across automatic capacity refreshes
 */
function handleDateSelection() {
    const radioButtons = document.querySelectorAll('input[name="playtestDate"]');

    radioButtons.forEach(radio => {
        radio.addEventListener('change', (e) => {
            // Track that user manually selected a date
            userSelectedDate = e.target.value;

            // Update spot counter AND event details to show selected date's data
            updateSpotCounter(e.target.value);
            updateEventDetails(e.target.value);
        });
    });
}

// ═══════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════

/**
 * Initialize playtest interactions on DOM ready
 * - Fetch initial capacity data for all dates
 * - Setup date selection change listeners
 * - Start 30-second refresh interval for capacity updates
 */
document.addEventListener('DOMContentLoaded', () => {
    // Fetch initial capacity data
    fetchAllCapacities();

    // Setup date selection listeners
    handleDateSelection();

    // Refresh capacity every 30 seconds to show live updates
    setInterval(fetchAllCapacities, 30000);
});

// Export for potential use by other modules (if needed)
if (typeof window !== 'undefined') {
    window.PlaytestInteractions = {
        updateSpotCounter,
        fetchAllCapacities,
        dateCapacities
    };
}

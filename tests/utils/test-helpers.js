/**
 * Shared test utilities and selectors for About Last Night tests
 *
 * This module provides:
 * - Page selectors for consistent element targeting
 * - Helper functions for common test operations
 * - Assertions for form validation
 * - Wait utilities for async operations
 */

/**
 * Selectors for index.html (main landing page)
 */
const INDEX_SELECTORS = {
  // Off the Couch booking widget
  bookingWidget: '#otcContainer iframe',

  // Navigation and CTAs
  heroTitle: '.hero h1',
  bookingBar: '#booking-bar',
  ctaButtons: '.cta-primary',

  // FAQ section
  faqSection: '.faq-section',
  faqItems: '.faq-item',
  faqQuestions: '.faq-question',

  // Comment markers (for content editor navigation)
  heroSection: '.hero',
  narrativeSection: '#narrative',
  footer: '.footer',
};

/**
 * Selectors for playtest.html
 */
const PLAYTEST_SELECTORS = {
  // Form elements
  form: '#playtestForm',
  dateRadios: 'input[name="playtestDate"]',
  nameInput: '#name',
  emailInput: '#email',
  photoConsentCheckbox: '#photoConsent',
  submitButton: '#submitButton',

  // Messages
  successMessage: '#successMessage',
  errorMessage: '#errorMessage',

  // Spot counter
  spotCounter: '#spotCounter',
  spotsNumber: '#spotsNumber',
  spotsText: '#spotsText',

  // Date capacity badges
  dateCapacityBadges: '.date-capacity',
  dateOptions: '.date-option',
};

/**
 * Wait for an element to be visible
 */
async function waitForVisible(page, selector, timeout = 5000) {
  await page.waitForSelector(selector, { state: 'visible', timeout });
}

/**
 * Wait for an element to be hidden
 */
async function waitForHidden(page, selector, timeout = 5000) {
  await page.waitForSelector(selector, { state: 'hidden', timeout });
}

/**
 * Fill playtest form with test data
 */
async function fillPlaytestForm(page, data = {}) {
  const defaultData = {
    date: '2025-11-04 18:30',
    name: 'Test User',
    email: 'test@example.com',
    photoConsent: true,
  };

  const formData = { ...defaultData, ...data };

  // Select date (if not already selected)
  await page.click(`input[name="playtestDate"][value="${formData.date}"]`);

  // Fill name
  await page.fill(PLAYTEST_SELECTORS.nameInput, formData.name);

  // Fill email
  await page.fill(PLAYTEST_SELECTORS.emailInput, formData.email);

  // Check photo consent if requested
  if (formData.photoConsent) {
    const isChecked = await page.isChecked(PLAYTEST_SELECTORS.photoConsentCheckbox);
    if (!isChecked) {
      await page.check(PLAYTEST_SELECTORS.photoConsentCheckbox);
    }
  }
}

/**
 * Submit playtest form
 */
async function submitPlaytestForm(page) {
  await page.click(PLAYTEST_SELECTORS.submitButton);
}

/**
 * Wait for form submission success
 */
async function waitForSubmitSuccess(page, timeout = 5000) {
  await waitForVisible(page, PLAYTEST_SELECTORS.successMessage, timeout);
}

/**
 * Wait for form submission error
 */
async function waitForSubmitError(page, timeout = 5000) {
  await waitForVisible(page, PLAYTEST_SELECTORS.errorMessage, timeout);
}

/**
 * Get spot counter value
 */
async function getSpotCounter(page) {
  const text = await page.textContent(PLAYTEST_SELECTORS.spotsNumber);
  return text;
}

/**
 * Get capacity for a specific date
 */
async function getDateCapacity(page, date) {
  const badge = await page.locator(`.date-capacity[data-date="${date}"]`);
  const text = await badge.textContent();
  return text.trim();
}

/**
 * Check if date is disabled
 */
async function isDateDisabled(page, date) {
  const radio = await page.locator(`input[name="playtestDate"][value="${date}"]`);
  return await radio.isDisabled();
}

/**
 * Wait for network idle (useful after page load)
 */
async function waitForNetworkIdle(page, timeout = 5000) {
  await page.waitForLoadState('networkidle', { timeout });
}

/**
 * Check if element exists
 */
async function elementExists(page, selector) {
  const count = await page.locator(selector).count();
  return count > 0;
}

/**
 * Get all console errors
 */
async function getConsoleErrors(page) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  return errors;
}

/**
 * Check for broken images
 */
async function checkBrokenImages(page) {
  const images = await page.locator('img').all();
  const brokenImages = [];

  for (const img of images) {
    const src = await img.getAttribute('src');
    const naturalWidth = await img.evaluate(el => el.naturalWidth);

    if (naturalWidth === 0) {
      brokenImages.push(src);
    }
  }

  return brokenImages;
}

/**
 * Verify comment markers are intact
 * Content editors use these to navigate the HTML
 */
async function verifyCommentMarkers(page) {
  const htmlContent = await page.content();

  const requiredMarkers = [
    'EDITABLE CONTENT:',
    'SAFE TO EDIT:',
    'FIND WITH:',
    'END CONTENT SECTION:',
  ];

  const missingMarkers = [];
  for (const marker of requiredMarkers) {
    if (!htmlContent.includes(marker)) {
      missingMarkers.push(marker);
    }
  }

  return missingMarkers;
}

/**
 * Take screenshot with timestamp
 */
async function takeTimestampedScreenshot(page, name) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = `/tmp/screenshot-${name}-${timestamp}.png`;
  await page.screenshot({ path, fullPage: true });
  return path;
}

module.exports = {
  INDEX_SELECTORS,
  PLAYTEST_SELECTORS,
  waitForVisible,
  waitForHidden,
  fillPlaytestForm,
  submitPlaytestForm,
  waitForSubmitSuccess,
  waitForSubmitError,
  getSpotCounter,
  getDateCapacity,
  isDateDisabled,
  waitForNetworkIdle,
  elementExists,
  getConsoleErrors,
  checkBrokenImages,
  verifyCommentMarkers,
  takeTimestampedScreenshot,
};

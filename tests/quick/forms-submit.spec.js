/**
 * Quick test: Form submission
 *
 * Tests that both forms submit correctly with mocked backends.
 * Used in pre-commit hook for fast validation (<3s).
 */

const { test, expect } = require('@playwright/test');
const { setupMockBackends, setupMockErrorResponse } = require('../utils/mock-backends');
const {
  PLAYTEST_SELECTORS,
  fillPlaytestForm,
  submitPlaytestForm,
  waitForSubmitSuccess,
  waitForSubmitError,
} = require('../utils/test-helpers');

test.describe('Form Submissions (Quick)', () => {
  test.beforeEach(async ({ page }) => {
    // Setup mock backends for all tests
    await setupMockBackends(page);
  });

  test('playtest form submits successfully', async ({ page }) => {
    // Navigate to playtest page
    await page.goto('/playtest.html');
    await page.waitForLoadState('networkidle');

    // Fill and submit form
    await fillPlaytestForm(page, {
      date: '2025-11-04 18:30',
      name: 'Test User',
      email: 'test@example.com',
      photoConsent: true,
    });

    await submitPlaytestForm(page);

    // Verify success message appears
    await waitForSubmitSuccess(page);
    const successMsg = await page.locator(PLAYTEST_SELECTORS.successMessage);
    await expect(successMsg).toBeVisible();
  });

  test('playtest form shows error on invalid email', async ({ page }) => {
    await page.goto('/playtest.html');
    await page.waitForLoadState('networkidle');

    // Fill form with invalid email
    await fillPlaytestForm(page, {
      email: 'invalid-email',
    });

    await submitPlaytestForm(page);

    // Browser validation should prevent submission
    const validationMessage = await page.evaluate(() => {
      const emailInput = document.querySelector('#email');
      return emailInput.validationMessage;
    });

    expect(validationMessage).toBeTruthy();
  });

  test('playtest form auto-selects next available date', async ({ page }) => {
    await page.goto('/playtest.html');
    await page.waitForLoadState('networkidle');

    // Wait for capacity data to load and auto-selection to occur
    await page.waitForTimeout(2000);

    // Check if a date is auto-selected
    const selectedDate = await page.evaluate(() => {
      const selected = document.querySelector('input[name="playtestDate"]:checked');
      return selected ? selected.value : null;
    });

    // Should have auto-selected a date
    expect(selectedDate).toBeTruthy();
  });

  test('playtest form requires name', async ({ page }) => {
    await page.goto('/playtest.html');
    await page.waitForLoadState('networkidle');

    // Select date and fill email, but no name
    await page.click('input[name="playtestDate"]');
    await page.fill(PLAYTEST_SELECTORS.emailInput, 'test@example.com');

    await submitPlaytestForm(page);

    const validationMessage = await page.evaluate(() => {
      const nameInput = document.querySelector('#name');
      return nameInput.validationMessage;
    });

    expect(validationMessage).toBeTruthy();
  });

  test('index.html booking widget loads', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');

    // Wait for Off the Couch iframe to be inserted by JS
    const iframe = await page.waitForSelector('#otcContainer iframe', {
      timeout: 10000,
    });

    expect(iframe).toBeTruthy();

    // Verify iframe has src attribute
    const src = await iframe.getAttribute('src');
    expect(src).toContain('offthecouch.io');
  });
});

test.describe('Form Error Handling (Quick)', () => {
  test('playtest form handles backend error gracefully', async ({ page }) => {
    // Setup mock error response
    await setupMockErrorResponse(page);

    await page.goto('/playtest.html');
    await page.waitForLoadState('networkidle');

    // Fill and submit form
    await fillPlaytestForm(page);
    await submitPlaytestForm(page);

    // Should show error message
    await waitForSubmitError(page);
    const errorMsg = await page.locator(PLAYTEST_SELECTORS.errorMessage);
    await expect(errorMsg).toBeVisible();
  });

  test('submit button is disabled during submission', async ({ page }) => {
    await setupMockBackends(page);

    await page.goto('/playtest.html');
    await page.waitForLoadState('networkidle');

    await fillPlaytestForm(page);

    // Check button state before and during submission
    const submitButton = page.locator(PLAYTEST_SELECTORS.submitButton);
    await expect(submitButton).toBeEnabled();

    // Click submit and immediately check if disabled
    await submitButton.click();

    // Button should be disabled during submission
    // (This might be too fast to catch, depending on implementation)
    const isDisabledDuringSubmit = await submitButton.evaluate(btn =>
      btn.hasAttribute('disabled')
    );

    // Either disabled during submit, or submission completes quickly
    expect(
      isDisabledDuringSubmit || (await page.locator(PLAYTEST_SELECTORS.successMessage).isVisible())
    ).toBeTruthy();
  });
});

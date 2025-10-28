/**
 * Quick test: Critical elements existence
 *
 * Verifies that essential page elements exist and JavaScript loads without errors.
 * Catches structural breakage from content edits.
 * Used in pre-commit hook for fast validation (<2s).
 */

const { test, expect } = require('@playwright/test');
const {
  INDEX_SELECTORS,
  PLAYTEST_SELECTORS,
  elementExists,
  verifyCommentMarkers,
} = require('../utils/test-helpers');

test.describe('Index.html Critical Elements', () => {
  test('hero section exists and is visible', async ({ page }) => {
    await page.goto('/index.html');
    // Don't wait for networkidle - page has external iframe that never settles
    await page.waitForLoadState('domcontentloaded');

    const hero = page.locator(INDEX_SELECTORS.heroSection);
    await expect(hero).toBeVisible();

    // Hero title should be present
    const heroTitle = page.locator(INDEX_SELECTORS.heroTitle);
    await expect(heroTitle).toBeVisible();
  });

  test('booking widget container exists', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');

    // Check that the Off the Couch container exists
    const container = page.locator('#otcContainer');
    await expect(container).toBeVisible();
  });

  test('CTA buttons exist', async ({ page }) => {
    await page.goto('/index.html');

    const ctaButtons = page.locator(INDEX_SELECTORS.ctaButtons);
    const count = await ctaButtons.count();
    expect(count).toBeGreaterThan(0);
  });

  test('FAQ section exists', async ({ page }) => {
    await page.goto('/index.html');

    const faqSection = page.locator(INDEX_SELECTORS.faqSection);
    await expect(faqSection).toBeVisible();

    // Should have multiple FAQ items
    const faqItems = page.locator(INDEX_SELECTORS.faqItems);
    const count = await faqItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test('JavaScript files load without errors', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');
    // Give JS time to execute
    await page.waitForTimeout(1000);

    // Check for no JavaScript errors
    expect(consoleErrors).toHaveLength(0);
  });

  test('comment markers are intact', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');

    const missingMarkers = await verifyCommentMarkers(page);
    expect(missingMarkers).toHaveLength(0);
  });

  test('footer exists', async ({ page }) => {
    await page.goto('/index.html');

    const footer = page.locator(INDEX_SELECTORS.footer);
    await expect(footer).toBeVisible();
  });
});

test.describe('Playtest.html Critical Elements', () => {
  test('form exists and is visible', async ({ page }) => {
    await page.goto('/playtest.html');

    const form = page.locator(PLAYTEST_SELECTORS.form);
    await expect(form).toBeVisible();
  });

  test('all required form fields exist', async ({ page }) => {
    await page.goto('/playtest.html');

    // Date selection
    const dateRadios = page.locator(PLAYTEST_SELECTORS.dateRadios);
    expect(await dateRadios.count()).toBeGreaterThan(0);

    // Name input
    const nameInput = page.locator(PLAYTEST_SELECTORS.nameInput);
    await expect(nameInput).toBeVisible();

    // Email input
    const emailInput = page.locator(PLAYTEST_SELECTORS.emailInput);
    await expect(emailInput).toBeVisible();

    // Photo consent checkbox
    const photoConsent = page.locator(PLAYTEST_SELECTORS.photoConsentCheckbox);
    await expect(photoConsent).toBeVisible();

    // Submit button
    const submitButton = page.locator(PLAYTEST_SELECTORS.submitButton);
    await expect(submitButton).toBeVisible();
  });

  test('spot counter exists', async ({ page }) => {
    await page.goto('/playtest.html');

    const spotCounter = page.locator(PLAYTEST_SELECTORS.spotCounter);
    await expect(spotCounter).toBeVisible();
  });

  test('success and error message elements exist', async ({ page }) => {
    await page.goto('/playtest.html');

    // Check that message elements exist (hidden initially)
    const successExists = await elementExists(page, PLAYTEST_SELECTORS.successMessage);
    const errorExists = await elementExists(page, PLAYTEST_SELECTORS.errorMessage);

    expect(successExists).toBe(true);
    expect(errorExists).toBe(true);
  });

  test('JavaScript files load without errors', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/playtest.html');
    await page.waitForLoadState('domcontentloaded');
    // Give JS and capacity fetch time to execute
    await page.waitForTimeout(2000);

    // Check for no JavaScript errors
    expect(consoleErrors).toHaveLength(0);
  });

  test('form fields have correct names', async ({ page }) => {
    await page.goto('/playtest.html');

    // Verify form field names match what JavaScript expects
    const nameInput = await page.locator(PLAYTEST_SELECTORS.nameInput).getAttribute('name');
    expect(nameInput).toBe('name');

    const emailInput = await page.locator(PLAYTEST_SELECTORS.emailInput).getAttribute('name');
    expect(emailInput).toBe('email');

    const dateRadio = await page.locator(PLAYTEST_SELECTORS.dateRadios).first().getAttribute('name');
    expect(dateRadio).toBe('playtestDate');
  });
});

test.describe('CSS and Assets', () => {
  test('index.html has no broken images', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');
    // Wait for images to load
    await page.waitForTimeout(2000);

    // Check for images
    const images = await page.locator('img').all();

    for (const img of images) {
      const src = await img.getAttribute('src');
      const naturalWidth = await img.evaluate(el => el.naturalWidth);

      // If image has src, it should load (naturalWidth > 0)
      if (src && !src.startsWith('data:')) {
        expect(naturalWidth).toBeGreaterThan(0);
      }
    }
  });

  test('CSS files load successfully', async ({ page }) => {
    await page.goto('/index.html');

    // Check that stylesheets loaded
    const stylesheets = await page.evaluate(() => {
      return Array.from(document.styleSheets).map(sheet => {
        try {
          return { href: sheet.href, rules: sheet.cssRules.length };
        } catch (e) {
          return { href: sheet.href, error: e.message };
        }
      });
    });

    // All stylesheets should have rules (not errors)
    for (const sheet of stylesheets) {
      if (sheet.href && sheet.href.includes('/css/')) {
        expect(sheet.rules).toBeGreaterThan(0);
      }
    }
  });
});

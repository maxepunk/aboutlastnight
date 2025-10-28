// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Playwright configuration for About Last Night test suite
 * Supports two modes: quick (pre-commit) and comprehensive (pre-deployment)
 */

// Determine test mode from environment variable
const testMode = process.env.TEST_MODE || 'quick';
const isQuickMode = testMode === 'quick';

module.exports = defineConfig({
  // Test directory based on mode
  testDir: isQuickMode ? './quick' : './comprehensive',

  // Maximum time one test can run
  timeout: isQuickMode ? 15000 : 30000,

  // Test execution settings
  fullyParallel: true,
  forbidOnly: !!process.env.CI,

  // Retries: fail fast in pre-commit, allow retries in comprehensive
  retries: isQuickMode ? 0 : 2,

  // Number of parallel workers
  workers: isQuickMode ? 3 : 2,

  // Reporter configuration
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }]
  ],

  // Shared settings for all projects
  use: {
    // Base URL for testing
    baseURL: process.env.BASE_URL || 'http://localhost:8000',

    // Collect trace on failure for debugging
    trace: isQuickMode ? 'off' : 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video recording
    video: isQuickMode ? 'off' : 'retain-on-failure',

    // Action timeout
    actionTimeout: isQuickMode ? 10000 : 15000,
  },

  // Browser projects
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Headless for quick mode, visible for comprehensive (easier debugging)
        headless: isQuickMode ? true : false,
      },
    },
  ],

  // Web server configuration (for local testing)
  webServer: process.env.USE_LOCAL_SERVER === 'true' ? {
    command: 'python3 -m http.server 8000',
    port: 8000,
    timeout: 10000,
    reuseExistingServer: !process.env.CI,
    cwd: '..',  // Run from project root
  } : undefined,
});

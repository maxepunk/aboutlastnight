#!/usr/bin/env node

/**
 * Unified test runner for About Last Night test suite
 *
 * Usage:
 *   node run-tests.js --mode=quick              # Quick tests (pre-commit)
 *   node run-tests.js --mode=comprehensive      # Full test suite
 *   node run-tests.js --mode=quick --watch      # Watch mode
 *
 * Environment variables:
 *   TEST_MODE=quick|comprehensive
 *   BASE_URL=http://localhost:8000 or https://aboutlastnightgame.com
 *   USE_LOCAL_SERVER=true|false (auto-start Python server)
 *   MOCK_BACKENDS=true|false (mock Google Apps Script responses)
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Parse command line arguments
const args = process.argv.slice(2);
const mode = args.find(arg => arg.startsWith('--mode='))?.split('=')[1] || 'quick';
const watch = args.includes('--watch');

// Validate mode
if (!['quick', 'comprehensive'].includes(mode)) {
  console.error('❌ Invalid mode. Use --mode=quick or --mode=comprehensive');
  process.exit(1);
}

// Set environment variables based on mode
const env = {
  ...process.env,
  TEST_MODE: mode,
};

// Quick mode defaults
if (mode === 'quick') {
  env.USE_LOCAL_SERVER = env.USE_LOCAL_SERVER || 'true';
  env.BASE_URL = env.BASE_URL || 'http://localhost:8000';
  env.MOCK_BACKENDS = env.MOCK_BACKENDS || 'true';
}

// Comprehensive mode defaults
if (mode === 'comprehensive') {
  env.USE_LOCAL_SERVER = env.USE_LOCAL_SERVER || 'false';
  env.BASE_URL = env.BASE_URL || 'https://aboutlastnightgame.com';
  env.MOCK_BACKENDS = env.MOCK_BACKENDS || 'false';
}

// Load .env file if exists
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value && !env[key]) {
      env[key] = value.trim();
    }
  });
}

// Print configuration
console.log(`\n🧪 Running ${mode} tests`);
console.log(`   Base URL: ${env.BASE_URL}`);
console.log(`   Local server: ${env.USE_LOCAL_SERVER === 'true' ? 'Yes' : 'No'}`);
console.log(`   Mock backends: ${env.MOCK_BACKENDS === 'true' ? 'Yes' : 'No'}`);
console.log('');

// Build Playwright command
const playwrightArgs = ['playwright', 'test'];
if (watch) playwrightArgs.push('--watch');

// Run Playwright tests
const playwright = spawn('npx', playwrightArgs, {
  cwd: __dirname,
  env,
  stdio: 'inherit',
});

playwright.on('close', (code) => {
  if (code === 0) {
    console.log(`\n✅ ${mode} tests passed`);
  } else {
    console.error(`\n❌ ${mode} tests failed`);
  }
  process.exit(code);
});

playwright.on('error', (err) => {
  console.error('❌ Failed to start test runner:', err);
  process.exit(1);
});

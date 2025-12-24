module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js', '**/*.test.js'],
  // Mock ESM-only SDK module to avoid Jest parsing issues
  moduleNameMapper: {
    '^@anthropic-ai/claude-agent-sdk$': '<rootDir>/__tests__/mocks/anthropic-sdk.mock.js'
  },
  collectCoverageFrom: [
    'lib/**/*.js',
    '!lib/**/*.test.js',
    '!lib/__tests__/**'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  verbose: true,
  testTimeout: 10000
};

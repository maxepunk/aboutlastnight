module.exports = {
  testEnvironment: 'node',
  // Runs before any test module loads: points CHECKPOINT_DB_PATH at a temp file so no
  // suite that requires server.js opens the production data/checkpoints.sqlite.
  setupFiles: ['<rootDir>/__tests__/setup/checkpoint-db-path.js'],
  testMatch: ['**/__tests__/**/*.test.js', '**/*.test.js'],
  // The desktop app makes worktrees under .claude/worktrees/, each a whole copy of the
  // repository with its own tests at another commit; a run here reads only this tree.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.claude/worktrees/'],
  modulePathIgnorePatterns: ['<rootDir>/.claude/worktrees/'],
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

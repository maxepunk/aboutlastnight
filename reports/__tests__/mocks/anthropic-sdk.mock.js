/**
 * Jest Mock for @anthropic-ai/claude-agent-sdk
 *
 * This mock exists because the real SDK uses ESM syntax (.mjs)
 * which Jest cannot parse in CommonJS mode.
 *
 * The actual SDK functionality is tested via integration tests
 * that don't run through Jest (e.g., manual testing with real API).
 *
 * For unit tests, nodes use dependency injection:
 *   config.configurable.sdkClient = createMockSdkClient(...)
 */

/**
 * Mock async generator for query results
 */
async function* mockQueryGenerator(options) {
  // Simulate SDK returning a result message
  yield {
    type: 'result',
    subtype: 'success',
    result: JSON.stringify({ success: true }),
    structured_output: options.options?.outputFormat?.schema ? {} : undefined
  };
}

/**
 * Mock query function that returns an async iterable
 */
function query(options) {
  return mockQueryGenerator(options);
}

module.exports = {
  query
};

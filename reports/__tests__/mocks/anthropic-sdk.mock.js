/**
 * Jest Mock for @anthropic-ai/claude-agent-sdk
 *
 * The real SDK is ESM (.mjs) which Jest cannot parse in CommonJS mode.
 * For unit tests that need to control SDK responses, use setMockQuery()
 * to install a custom async-iterator implementation for one test.
 *
 * For workflow node tests that just need a simulated client, prefer
 * dependency injection via config.configurable.sdkClient.
 */

let customQueryImpl = null;

function setMockQuery(fn) { customQueryImpl = fn; }
function clearMockQuery() { customQueryImpl = null; }

async function* defaultMockQueryGenerator(options) {
  yield {
    type: 'result',
    subtype: 'success',
    result: JSON.stringify({ success: true }),
    structured_output: options.options?.outputFormat?.schema ? {} : undefined
  };
}

function query(options) {
  if (customQueryImpl) return customQueryImpl(options);
  return defaultMockQueryGenerator(options);
}

module.exports = { query, setMockQuery, clearMockQuery };

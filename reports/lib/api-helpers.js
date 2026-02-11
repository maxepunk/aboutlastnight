/**
 * API Helpers - Shared utilities extracted from server.js
 *
 * DRY extraction of 3 patterns duplicated across server.js endpoints:
 * - buildRollbackState: Builds state object for rollback operations (4 instances)
 * - createGraphAndConfig: Creates graph + config for write endpoints (4 instances)
 * - sendErrorResponse: Sanitized 500 error responses (13 instances)
 *
 * Phase 2: API Surface Separation
 */

const { createReportGraphWithCheckpointer } = require('./workflow/graph');
const { ROLLBACK_CLEARS, ROLLBACK_COUNTER_RESETS, PHASES } = require('./workflow/state');

/**
 * Build state object for rolling back to a checkpoint.
 * Clears all fields from the rollback point forward and resets revision counters.
 *
 * @param {string} [rollbackPoint='input-review'] - Valid rollback point name
 * @returns {object} State object with cleared fields and reset counters
 */
function buildRollbackState(rollbackPoint = 'input-review') {
  if (!ROLLBACK_CLEARS[rollbackPoint]) {
    throw new Error(`Invalid rollback point: '${rollbackPoint}'`);
  }
  const state = {};
  ROLLBACK_CLEARS[rollbackPoint].forEach(field => { state[field] = null; });
  Object.assign(state, ROLLBACK_COUNTER_RESETS[rollbackPoint]);
  state.currentPhase = null;
  return state;
}

/**
 * Create a LangGraph instance and config object for write endpoints.
 *
 * NOTE: promptBuilder is intentionally NOT injected via config.
 * AI nodes create per-theme PromptBuilder instances from state.theme,
 * ensuring detective sessions get detective prompts (not the shared journalist one).
 * The shared promptBuilder in server.js is only used for startup validation.
 *
 * @param {string} sessionId - Session identifier
 * @param {string} [theme='journalist'] - Report theme
 * @param {object} options - Shared server instances
 * @param {object} options.checkpointer - MemorySaver checkpointer
 * @returns {{ graph: object, config: object }} Graph instance and execution config
 */
function createGraphAndConfig(sessionId, theme = 'journalist', { checkpointer }) {
  const graph = createReportGraphWithCheckpointer(checkpointer);
  const config = {
    configurable: {
      sessionId,
      theme,
      thread_id: sessionId
    }
  };
  return { graph, config };
}

/**
 * Send a sanitized 500 error response. Logs full error details server-side
 * but only returns generic error message to the client.
 *
 * @param {object} res - Express response object
 * @param {string|null} sessionId - Session ID (null for non-session errors)
 * @param {Error} error - The caught error
 * @param {string} context - Human-readable context for logging (e.g., 'POST /api/session/1221/start')
 */
function sendErrorResponse(res, sessionId, error, context) {
  console.error(`[${new Date().toISOString()}] ${context}:`, error);
  const response = { error: 'Internal server error' };
  if (sessionId) {
    response.sessionId = sessionId;
    response.currentPhase = PHASES.ERROR;
    response.details = `${context}. Check server logs.`;
  }
  res.status(500).json(response);
}

module.exports = { buildRollbackState, createGraphAndConfig, sendErrorResponse };

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

const path = require('path');
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
  // Fields using append reducers need [] (not null) to clear — see appendSingleReducer/appendReducer
  const appendReducerFields = new Set(['evaluationHistory', 'errors']);
  ROLLBACK_CLEARS[rollbackPoint].forEach(field => {
    state[field] = appendReducerFields.has(field) ? [] : null;
  });
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

/**
 * Resolve `requestedPath` and verify it stays within `baseDir`.
 * Throws if the path escapes the permitted directory (../, absolute
 * elsewhere, or a sibling-prefix bypass like `data-evil`).
 *
 * NOTE (SEC-A-2): does NOT resolve symlinks (no fs.realpathSync), so a symlink
 * placed inside baseDir that points outside would pass. Safe here because this
 * is a single-tenant console where data/ holds only server-created session dirs
 * and is never attacker-writable. If data/ could ever accept untrusted writes,
 * add an fs.realpathSync.native re-check on `resolved` before returning (guard
 * ENOENT for not-yet-created write targets).
 *
 * @param {string} baseDir - Absolute directory the result must live under
 * @param {string} requestedPath - Caller-supplied (untrusted) path
 * @returns {string} The resolved absolute path, guaranteed within baseDir
 */
function confineToBase(baseDir, requestedPath) {
  if (!requestedPath) {
    throw new Error('Missing path');
  }
  const root = path.resolve(baseDir);
  const resolved = path.resolve(root, requestedPath);
  // Append the platform separator so `/data` does not match `/data-evil`.
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    throw new Error(`Path is outside the permitted directory: ${requestedPath}`);
  }
  return resolved;
}

module.exports = { buildRollbackState, createGraphAndConfig, sendErrorResponse, confineToBase };

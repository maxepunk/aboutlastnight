/**
 * LLM Module - Public API
 *
 * Applies tracing wrapper to SDK client and exports public interface.
 * Single import point for all LLM functionality.
 *
 * @module llm
 *
 * @example
 * const { sdkQuery, createProgressLogger } = require('./llm');
 * await sdkQuery({
 *   prompt: '...',
 *   onProgress: createProgressLogger('myNode', sessionId)
 * });
 */

const {
  sdkQueryImpl,
  query,
  getModelTimeout,
  isClaudeAvailable: isClaudeAvailableImpl,
  createSemaphore,
  MODEL_TIMEOUTS
} = require('./client');

const {
  createTracedSdkQuery,
  createProgressFromTrace
} = require('../observability');

// Apply LangSmith tracing to SDK query
// createTracedSdkQuery returns a no-op passthrough if tracing disabled
const sdkQuery = createTracedSdkQuery(sdkQueryImpl);

/**
 * Create a reusable progress logger for SDK calls
 *
 * Formats SDK progress messages with emoji indicators and content previews.
 * Unified logging to console + SSE emission from single source (DRY).
 *
 * @param {string} context - Log prefix (e.g., 'analyzePhotos', 'analyzeArcs')
 * @param {string} [sessionId] - Session ID for SSE streaming (optional)
 * @returns {Function} Progress callback for sdkQuery onProgress option
 */
const createProgressLogger = createProgressFromTrace;

/**
 * Check if Claude Agent SDK is available
 * Uses the traced sdkQuery for the health check.
 *
 * @returns {Promise<boolean>}
 */
async function isClaudeAvailable() {
  return isClaudeAvailableImpl(sdkQuery);
}

module.exports = {
  sdkQuery,
  query,
  getModelTimeout,
  isClaudeAvailable,
  createSemaphore,
  createProgressLogger,
  MODEL_TIMEOUTS
};

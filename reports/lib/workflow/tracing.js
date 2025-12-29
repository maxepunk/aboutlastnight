/**
 * LangSmith Tracing Utilities
 *
 * Provides wrappers for tracing LangGraph nodes and SDK calls.
 * All traces go to the project specified by LANGSMITH_PROJECT env var.
 *
 * Usage:
 *   const { traceNode, traceLLMCall } = require('./tracing');
 *   module.exports = { myNode: traceNode(myNode, 'myNode') };
 */

const { traceable } = require('langsmith/traceable');

/**
 * Check if LangSmith tracing is enabled
 * @returns {boolean}
 */
function isTracingEnabled() {
  return process.env.LANGSMITH_TRACING === 'true' && !!process.env.LANGSMITH_API_KEY;
}

/**
 * Extract relevant state snapshot for trace metadata
 * Avoids logging entire evidenceBundle (can be 100KB+)
 *
 * @param {Object} state - LangGraph state
 * @param {string[]} additionalFields - Extra fields to include
 * @returns {Object} State snapshot for metadata
 */
function extractStateSnapshot(state, additionalFields = []) {
  const snapshot = {
    sessionId: state.sessionId,
    currentPhase: state.currentPhase,
    theme: state.theme,
    awaitingApproval: state.awaitingApproval,
    approvalType: state.approvalType,
    // Revision counts
    arcRevisionCount: state.arcRevisionCount || 0,
    outlineRevisionCount: state.outlineRevisionCount || 0,
    articleRevisionCount: state.articleRevisionCount || 0,
    // Counts (not full data)
    rosterSize: state.sessionConfig?.roster?.length || 0,
    tokenCount: state.memoryTokens?.length || 0,
    paperEvidenceCount: state.paperEvidence?.length || 0,
    arcCount: state.narrativeArcs?.length || 0,
    errorCount: state.errors?.length || 0
  };

  // Add any additional fields requested
  for (const field of additionalFields) {
    if (state[field] !== undefined) {
      const value = state[field];
      // For arrays/objects, just include length/keys
      if (Array.isArray(value)) {
        snapshot[`${field}Count`] = value.length;
      } else if (typeof value === 'object' && value !== null) {
        snapshot[`${field}Keys`] = Object.keys(value);
      } else {
        snapshot[field] = value;
      }
    }
  }

  return snapshot;
}

/**
 * Wrap a LangGraph node function with LangSmith tracing
 *
 * @param {Function} nodeFn - Async node function (state, config) => partialState
 * @param {string} name - Node name for traces
 * @param {Object} options - Additional options
 * @param {string[]} options.stateFields - Extra state fields to capture
 * @returns {Function} Traced node function
 */
function traceNode(nodeFn, name, options = {}) {
  if (!isTracingEnabled()) {
    return nodeFn; // Pass through if tracing disabled
  }

  const { stateFields = [] } = options;

  return traceable(
    async function(state, config) {
      return await nodeFn(state, config);
    },
    {
      name,
      run_type: 'chain',
      metadata: (state) => ({
        node: name,
        ...extractStateSnapshot(state, stateFields)
      })
    }
  );
}

/**
 * Wrap an LLM call function with LangSmith tracing
 * Used for sdkQuery wrapper
 *
 * @param {Function} llmFn - Async LLM function
 * @param {string} name - Call name for traces
 * @returns {Function} Traced LLM function
 */
function traceLLMCall(llmFn, name = 'claude-sdk-query') {
  if (!isTracingEnabled()) {
    return llmFn;
  }

  return traceable(
    llmFn,
    {
      name,
      run_type: 'llm',
      metadata: (options) => ({
        model: options.model || 'sonnet',
        label: options.label,
        hasSchema: !!options.jsonSchema,
        hasAgents: !!options.agents,
        timeoutMs: options.timeoutMs
      })
    }
  );
}

/**
 * Create a traced version of a batch processing function
 * Used for parallel SDK calls (photo analysis, evidence preprocessing)
 *
 * @param {Function} batchFn - Async batch function
 * @param {string} name - Batch operation name
 * @returns {Function} Traced batch function
 */
function traceBatch(batchFn, name) {
  if (!isTracingEnabled()) {
    return batchFn;
  }

  return traceable(
    batchFn,
    {
      name,
      run_type: 'chain',
      metadata: (items) => ({
        batchSize: Array.isArray(items) ? items.length : 'unknown'
      })
    }
  );
}

module.exports = {
  isTracingEnabled,
  extractStateSnapshot,
  traceNode,
  traceLLMCall,
  traceBatch
};

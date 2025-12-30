/**
 * Node Tracer
 *
 * Wraps LangGraph nodes with LangSmith tracing.
 * Single Responsibility: Node-level tracing only.
 *
 * @module observability/node-tracer
 */

const { traceable } = require('langsmith/traceable');
const { isTracingEnabled } = require('./config');
const { extractStateSnapshot } = require('./state-snapshot');

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
    async function tracedNode(state, config) {
      return await nodeFn(state, config);
    },
    {
      // FIX: Ensure name is always defined
      name: name || 'unnamed-node',
      run_type: 'chain',
      // CRITICAL FIX: Filter inputs to prevent sending 50MB+ state objects to LangSmith
      // Without this, traceable captures ALL function arguments (entire state)
      // LangSmith limit is 26MB per field
      // The errors were: "field size 54148295 exceeds maximum allowed size of 26214400 bytes"
      process_inputs: (state) => ({
        // Only send the lightweight snapshot, not the full state
        stateSnapshot: extractStateSnapshot(state, stateFields)
      }),
      metadata: (state) => ({
        node: name,
        ...extractStateSnapshot(state, stateFields)
      })
    }
  );
}

module.exports = { traceNode };

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

  // CRITICAL FIX: Ensure name is ALWAYS a valid non-empty string
  // This prevents LangSmith "name is required" errors
  const safeName = (name && typeof name === 'string' && name.trim())
    ? name.trim()
    : 'unnamed-node';

  return traceable(
    async function tracedNode(state, config) {
      return await nodeFn(state, config);
    },
    {
      // Use the pre-validated safe name (not a function that could fail)
      name: safeName,
      run_type: 'chain',

      // CRITICAL FIX: Filter inputs to prevent sending 50MB+ state objects to LangSmith
      // Without this, traceable captures ALL function arguments (entire state)
      // LangSmith limit is 26MB per field
      process_inputs: (state) => {
        try {
          const snapshot = extractStateSnapshot(state, stateFields);
          return { stateSnapshot: snapshot };
        } catch (err) {
          // If extraction fails, return minimal info
          return {
            stateSnapshot: { error: 'Failed to extract snapshot', message: err.message }
          };
        }
      },

      // Metadata also uses snapshot to avoid large objects
      metadata: (state) => {
        try {
          return {
            node: safeName,
            ...extractStateSnapshot(state, stateFields)
          };
        } catch (err) {
          return { node: safeName, error: 'Failed to extract metadata' };
        }
      }
    }
  );
}

module.exports = { traceNode };

/**
 * LLM Tracer - Full visibility into Claude Agent SDK calls
 *
 * Instead of wrapping the function externally (which only sees options),
 * this instruments the actual SDK call to capture full prompt/response content
 * for LangSmith visibility.
 *
 * This provides:
 * - Actual prompt content in trace inputs
 * - Actual response content in trace outputs
 * - Token usage and costs
 * - Model and configuration details
 *
 * @module observability/llm-tracer
 */

const { traceable } = require('langsmith/traceable');
const { isTracingEnabled, getProject } = require('./config');

/**
 * Truncate text for trace metadata (prevent massive traces)
 *
 * @param {string|Object} text - Text or object to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string|null} Truncated text
 */
function truncate(text, maxLength = 2000) {
  if (!text) return null;
  if (typeof text !== 'string') {
    try {
      text = JSON.stringify(text);
    } catch {
      return '[Unable to serialize]';
    }
  }
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + `... [+${text.length - maxLength} chars]`;
}

/**
 * Create a traced SDK query function with full prompt/response visibility
 *
 * Unlike the old traceLLMCall which wrapped externally, this captures:
 * - Full prompt content (truncated for safety)
 * - Full response content
 * - Schema information
 * - Model details
 *
 * @param {Function} sdkQueryFn - The raw SDK query implementation
 * @returns {Function} Traced SDK query function
 */
function createTracedSdkQuery(sdkQueryFn) {
  if (!isTracingEnabled()) {
    return sdkQueryFn;
  }

  return traceable(
    async function tracedSdkQuery(options) {
      const { prompt, systemPrompt, model, label, jsonSchema } = options;
      const startTime = Date.now();

      try {
        // Call the underlying SDK query
        const result = await sdkQueryFn(options);

        // Return result (traceable captures it automatically)
        return result;
      } catch (error) {
        // Error is automatically captured by traceable
        throw error;
      }
    },
    {
      // FIX: Use optional chaining to prevent undefined
      name: (opts) => `claude-${opts?.label || opts?.model || 'query'}`,
      run_type: 'llm',
      // Capture inputs for trace
      process_inputs: (opts) => ({
        prompt: truncate(opts?.prompt, 10000),
        systemPrompt: truncate(opts?.systemPrompt, 2000),
        model: opts?.model || 'sonnet',
        label: opts?.label,
        hasSchema: !!opts?.jsonSchema,
        schemaName: opts?.jsonSchema?.title || opts?.jsonSchema?.$id
      }),
      // Capture metadata
      metadata: (opts) => ({
        model: opts?.model || 'sonnet',
        hasAgents: !!opts?.agents,
        agentNames: opts?.agents ? Object.keys(opts.agents) : [],
        disableTools: opts?.disableTools,
        timeout: opts?.timeoutMs,
        project: getProject()
      })
    }
  );
}

/**
 * Legacy traceLLMCall wrapper for backwards compatibility
 *
 * This maintains the same signature as the old tracing.js traceLLMCall
 * but with enhanced visibility.
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
      // FIX: Ensure name is always defined
      name: name || 'claude-sdk-query',
      run_type: 'llm',
      // FIX: Use process_inputs instead of inputs, with truncation
      process_inputs: (options) => ({
        prompt: truncate(options?.prompt, 10000),
        systemPrompt: truncate(options?.systemPrompt, 2000),
        model: options?.model || 'sonnet',
        label: options?.label,
        hasSchema: !!options?.jsonSchema
      }),
      metadata: (options) => ({
        model: options?.model || 'sonnet',
        label: options?.label,
        hasSchema: !!options?.jsonSchema,
        hasAgents: !!options?.agents,
        timeoutMs: options?.timeoutMs
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
      // FIX: Ensure name is always defined
      name: name || 'batch-operation',
      run_type: 'chain',
      // FIX: Use process_inputs to avoid capturing large arrays
      process_inputs: (items) => ({
        batchSize: Array.isArray(items) ? items.length : 'unknown',
        itemType: Array.isArray(items) && items[0] ? typeof items[0] : 'unknown'
      }),
      metadata: (items) => ({
        batchSize: Array.isArray(items) ? items.length : 'unknown'
      })
    }
  );
}

module.exports = {
  createTracedSdkQuery,
  traceLLMCall,
  traceBatch,
  truncate
};

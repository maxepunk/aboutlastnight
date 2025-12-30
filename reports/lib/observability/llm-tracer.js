/**
 * LLM Tracer - Full visibility into Claude Agent SDK calls
 *
 * CRITICAL FIX: Uses STATIC names instead of dynamic functions.
 *
 * The issue was that traceable's `name` function is called during trace
 * initialization, potentially BEFORE the wrapped function receives its arguments.
 * This caused "name is required" errors when the name function couldn't
 * extract label/model from undefined opts.
 *
 * Solution: Use static names and put dynamic context in metadata instead.
 *
 * @module observability/llm-tracer
 */

const { traceable } = require('langsmith/traceable');
const { isTracingEnabled, getProject } = require('./config');

/**
 * Truncate text for trace metadata
 * Aggressive truncation to stay well under LangSmith's 26MB limit
 *
 * @param {string|Object} text - Text or object to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string|null} Truncated text
 */
function truncate(text, maxLength = 2000) {
  if (text === null || text === undefined) return null;
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
 * Safely extract options from potentially malformed input
 *
 * @param {*} opts - Options (could be anything)
 * @returns {Object} Safe options object
 */
function safeOptions(opts) {
  if (opts === null || opts === undefined) return {};
  if (typeof opts !== 'object' || Array.isArray(opts)) return {};
  return opts;
}

/**
 * Create a traced SDK query function with full prompt/response visibility
 *
 * Uses STATIC name to avoid "name is required" errors.
 * Dynamic context (label, model) is captured in metadata instead.
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
      const result = await sdkQueryFn(options);
      return result;
    },
    {
      // CRITICAL FIX: Use STATIC name to avoid timing issues
      // The label and model are captured in metadata for context
      name: 'claude-sdk-query',
      run_type: 'llm',

      // Filter inputs to prevent massive traces
      // LangSmith limit is 26MB per field
      process_inputs: (opts) => {
        const safe = safeOptions(opts);
        return {
          prompt: truncate(safe.prompt, 4000),
          systemPrompt: truncate(safe.systemPrompt, 1000),
          model: safe.model || 'sonnet',
          label: safe.label || null,
          hasSchema: !!safe.jsonSchema,
          schemaName: safe.jsonSchema?.title || safe.jsonSchema?.$id || null
        };
      },

      // Capture dynamic context in metadata
      metadata: (opts) => {
        const safe = safeOptions(opts);
        return {
          // Dynamic identifiers that would have been in name
          label: safe.label || null,
          model: safe.model || 'sonnet',
          // Additional context
          hasAgents: !!safe.agents,
          agentNames: safe.agents ? Object.keys(safe.agents) : [],
          disableTools: safe.disableTools || false,
          timeout: safe.timeoutMs || null,
          project: getProject()
        };
      }
    }
  );
}

/**
 * Legacy traceLLMCall wrapper for backwards compatibility
 *
 * @param {Function} llmFn - Async LLM function
 * @param {string} name - Call name for traces
 * @returns {Function} Traced LLM function
 */
function traceLLMCall(llmFn, name = 'claude-sdk-query') {
  if (!isTracingEnabled()) {
    return llmFn;
  }

  // Validate name is a non-empty string
  const safeName = (typeof name === 'string' && name.trim())
    ? name.trim()
    : 'claude-sdk-query';

  return traceable(
    llmFn,
    {
      // Static name (validated above)
      name: safeName,
      run_type: 'llm',
      process_inputs: (opts) => {
        const safe = safeOptions(opts);
        return {
          prompt: truncate(safe.prompt, 4000),
          systemPrompt: truncate(safe.systemPrompt, 1000),
          model: safe.model || 'sonnet',
          label: safe.label || null,
          hasSchema: !!safe.jsonSchema
        };
      },
      metadata: (opts) => {
        const safe = safeOptions(opts);
        return {
          model: safe.model || 'sonnet',
          label: safe.label || null,
          hasSchema: !!safe.jsonSchema,
          hasAgents: !!safe.agents,
          timeoutMs: safe.timeoutMs || null
        };
      }
    }
  );
}

/**
 * Create a traced version of a batch processing function
 *
 * @param {Function} batchFn - Async batch function
 * @param {string} name - Batch operation name
 * @returns {Function} Traced batch function
 */
function traceBatch(batchFn, name) {
  if (!isTracingEnabled()) {
    return batchFn;
  }

  // Validate name
  const safeName = (typeof name === 'string' && name.trim())
    ? name.trim()
    : 'batch-operation';

  return traceable(
    batchFn,
    {
      name: safeName,
      run_type: 'chain',
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
  truncate,
  safeOptions
};

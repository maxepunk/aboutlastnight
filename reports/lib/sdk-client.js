/**
 * SDK Client - Claude Agent SDK wrapper for LangGraph nodes
 *
 * Replaces claude-client.js subprocess wrapper.
 * Provides unified interface for all AI calls in the workflow.
 *
 * Key differences from subprocess approach:
 * - Direct SDK calls (no spawn/stdin/parsing)
 * - Native structured output (no JSON extraction from code fences)
 * - Built-in retry and error handling
 * - Subagent support for parallel execution (Commit 8.8)
 * - AbortController timeout support (Commit 8.9)
 * - Progress streaming via onProgress callback (Commit 8.9)
 *
 * @module sdk-client
 */

const { query } = require('@anthropic-ai/claude-agent-sdk');

// Increase max listeners to support 8 concurrent SDK calls
// Each SDK call adds exit listeners for subprocess cleanup
process.setMaxListeners(20);

/**
 * Default timeouts per model (in milliseconds)
 */
const MODEL_TIMEOUTS = {
  opus: 10 * 60 * 1000,    // 10 minutes
  sonnet: 5 * 60 * 1000,   // 5 minutes
  haiku: 2 * 60 * 1000     // 2 minutes
};

/**
 * SDK wrapper for LangGraph nodes with timeout and progress streaming
 *
 * @param {Object} options - Query options
 * @param {string} options.prompt - User prompt
 * @param {string} [options.systemPrompt] - System prompt
 * @param {string} [options.model='sonnet'] - Model: 'haiku', 'sonnet', 'opus'
 * @param {Object} [options.jsonSchema] - JSON schema for structured output
 * @param {string[]} [options.allowedTools=[]] - Tools the SDK can use (e.g., ['Read', 'Task'])
 * @param {Object} [options.agents] - Custom agent definitions for Task tool invocation
 *   Each agent: { description: string, prompt: string, tools?: string[], model?: string }
 * @param {string} [options.workingDirectory] - Working directory for file operations (required for agents to find files)
 * @param {number} [options.timeoutMs] - Timeout in ms (defaults to model timeout)
 * @param {Function} [options.onProgress] - Callback for intermediate messages: (msg) => void
 * @param {string} [options.label] - Label for progress logging
 * @returns {Promise<Object|string>} - Parsed result (object if schema, string otherwise)
 * @throws {Error} - If SDK returns error, timeout, or no result
 */
async function sdkQuery({
  prompt,
  systemPrompt,
  model = 'sonnet',
  jsonSchema,
  allowedTools = [],
  agents,
  workingDirectory,
  timeoutMs,
  onProgress,
  label
}) {
  const effectiveTimeout = timeoutMs || MODEL_TIMEOUTS[model] || MODEL_TIMEOUTS.sonnet;
  const abortController = new AbortController();
  const startTime = Date.now();
  const progressLabel = label || prompt.slice(0, 25).replace(/\n/g, ' ');

  // Set up timeout
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, effectiveTimeout);

  const options = {
    model,
    systemPrompt,
    allowedTools,
    permissionMode: 'bypassPermissions',
    abortController
  };

  // Set working directory for file operations (required for agents to find reference files)
  // Defaults to reports/ directory where .claude/skills/ lives
  if (workingDirectory) {
    options.workingDirectory = workingDirectory;
  } else {
    // Default to the reports directory (parent of lib/)
    options.workingDirectory = require('path').resolve(__dirname, '..');
  }

  // Add custom agent definitions for Task tool invocation
  if (agents && Object.keys(agents).length > 0) {
    options.agents = agents;
  }

  // Add structured output format if schema provided
  if (jsonSchema) {
    options.outputFormat = {
      type: 'json_schema',
      schema: jsonSchema
    };
  }

  try {
    let messageCount = 0;

    for await (const msg of query({ prompt, options })) {
      messageCount++;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      // Stream progress for intermediate messages
      if (onProgress) {
        onProgress({
          type: msg.type,
          subtype: msg.subtype,
          elapsed,
          messageCount,
          label: progressLabel,
          // Include relevant details based on message type
          ...(msg.type === 'tool_call' && { toolName: msg.tool_name }),
          ...(msg.type === 'error' && { error: msg.error })
        });
      }

      // Handle successful result
      if (msg.type === 'result' && msg.subtype === 'success') {
        clearTimeout(timeoutId);
        return jsonSchema ? msg.structured_output : msg.result;
      }

      // Handle error results
      if (msg.type === 'result' && msg.subtype && msg.subtype.includes('error')) {
        clearTimeout(timeoutId);
        const errorDetails = msg.errors?.join(', ') || 'Unknown error';
        throw new Error(`SDK ${msg.subtype}: ${errorDetails}`);
      }

      // Handle other result types (e.g., cancelled, interrupted)
      if (msg.type === 'result') {
        clearTimeout(timeoutId);
        throw new Error(`SDK unexpected result: ${msg.subtype || 'unknown'}`);
      }

      // Other message types (assistant, tool_call, tool_result, system) are
      // intermediate messages - continue iterating until we get a result
    }

    clearTimeout(timeoutId);
    throw new Error('SDK: No result received from query');

  } catch (error) {
    clearTimeout(timeoutId);

    // Check if it was an abort/timeout
    if (error.name === 'AbortError' || abortController.signal.aborted) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      throw new Error(`SDK timeout after ${elapsed}s (limit: ${effectiveTimeout / 1000}s) - ${progressLabel}`);
    }

    throw error;
  }
}

/**
 * Get model timeout for compatibility with existing code
 *
 * @param {string} model - Model name
 * @returns {number} - Timeout in milliseconds
 */
function getModelTimeout(model) {
  return MODEL_TIMEOUTS[model] || MODEL_TIMEOUTS.sonnet;
}

/**
 * Create a semaphore for limiting concurrency
 *
 * Use this to prevent spawning too many parallel SDK calls,
 * which can cause resource exhaustion or rate limiting.
 *
 * @param {number} limit - Maximum concurrent operations
 * @returns {Function} - Async function wrapper: (fn) => Promise
 *
 * @example
 * const semaphore = createSemaphore(3);  // Max 3 concurrent
 * const results = await Promise.all(
 *   items.map(item => semaphore(() => processItem(item)))
 * );
 */
function createSemaphore(limit) {
  let running = 0;
  const queue = [];

  return async function withSemaphore(fn) {
    // Wait if at limit
    if (running >= limit) {
      await new Promise(resolve => queue.push(resolve));
    }

    running++;
    try {
      return await fn();
    } finally {
      running--;
      // Release next in queue
      if (queue.length > 0) {
        const next = queue.shift();
        next();
      }
    }
  };
}

/**
 * Check if Claude Agent SDK is available
 * Used at server startup to verify SDK is installed and accessible.
 *
 * Performs a minimal SDK query to verify:
 * - SDK package is installed
 * - API key is configured
 * - Network connectivity to Anthropic API
 *
 * @returns {Promise<boolean>}
 */
async function isClaudeAvailable() {
  try {
    // Minimal SDK query to verify availability
    await sdkQuery({
      prompt: 'Respond with exactly: ok',
      model: 'haiku',
      systemPrompt: 'You are a health check. Respond with exactly one word: ok'
    });
    return true;
  } catch (error) {
    console.error('[SDK Health Check] Failed:', error.message);
    return false;
  }
}

module.exports = {
  sdkQuery,
  query,  // Export raw SDK query for subagent use (Commit 8.8)
  getModelTimeout,
  isClaudeAvailable,
  createSemaphore,  // Concurrency limiter (Commit 8.9)
  MODEL_TIMEOUTS    // Expose for custom timeout logic
};

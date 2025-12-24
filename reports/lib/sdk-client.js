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
 *
 * @module sdk-client
 */

const { query } = require('@anthropic-ai/claude-agent-sdk');

/**
 * Simple SDK wrapper for LangGraph nodes
 * Handles the async iterator -> result pattern
 *
 * @param {Object} options - Query options
 * @param {string} options.prompt - User prompt
 * @param {string} [options.systemPrompt] - System prompt
 * @param {string} [options.model='sonnet'] - Model: 'haiku', 'sonnet', 'opus'
 * @param {Object} [options.jsonSchema] - JSON schema for structured output
 * @param {string[]} [options.allowedTools=[]] - Tools the SDK can use (e.g., ['Read'] for images)
 * @returns {Promise<Object|string>} - Parsed result (object if schema, string otherwise)
 * @throws {Error} - If SDK returns error or no result
 */
async function sdkQuery({ prompt, systemPrompt, model = 'sonnet', jsonSchema, allowedTools = [] }) {
  const options = {
    model,
    systemPrompt,
    allowedTools,
    permissionMode: 'bypassPermissions'
  };

  // Add structured output format if schema provided
  if (jsonSchema) {
    options.outputFormat = {
      type: 'json_schema',
      schema: jsonSchema
    };
  }

  for await (const msg of query({ prompt, options })) {
    // Handle successful result
    if (msg.type === 'result' && msg.subtype === 'success') {
      // Return structured output if schema was used, otherwise raw result
      return jsonSchema ? msg.structured_output : msg.result;
    }

    // Handle error results
    if (msg.type === 'result' && msg.subtype && msg.subtype.includes('error')) {
      const errorDetails = msg.errors?.join(', ') || 'Unknown error';
      throw new Error(`SDK ${msg.subtype}: ${errorDetails}`);
    }

    // Handle other result types (e.g., cancelled, interrupted)
    if (msg.type === 'result') {
      throw new Error(`SDK unexpected result: ${msg.subtype || 'unknown'}`);
    }

    // Other message types (assistant, tool_call, tool_result, system) are
    // intermediate messages - continue iterating until we get a result
  }

  throw new Error('SDK: No result received from query');
}

/**
 * Get model timeout for compatibility with existing code
 * SDK handles timeouts internally, but exposed for test mocks
 *
 * @param {string} model - Model name
 * @returns {number} - Timeout in milliseconds
 */
function getModelTimeout(model) {
  const timeouts = {
    opus: 10 * 60 * 1000,    // 10 minutes
    sonnet: 5 * 60 * 1000,   // 5 minutes
    haiku: 2 * 60 * 1000     // 2 minutes
  };
  return timeouts[model] || timeouts.sonnet;
}

/**
 * Check if Claude CLI is available
 * Used at server startup to verify Claude is installed and accessible.
 *
 * @returns {Promise<boolean>}
 */
async function isClaudeAvailable() {
  const { spawn } = require('child_process');

  return new Promise((resolve) => {
    const claude = spawn('claude', ['--version'], { windowsHide: true });

    claude.on('close', (code) => {
      resolve(code === 0);
    });

    claude.on('error', () => {
      resolve(false);
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      claude.kill();
      resolve(false);
    }, 5000);
  });
}

module.exports = {
  sdkQuery,
  query,  // Export raw SDK query for subagent use (Commit 8.8)
  getModelTimeout,
  isClaudeAvailable
};

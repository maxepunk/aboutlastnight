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
        // SDK message structure: content is nested in msg.message.content
        // See: node_modules/@anthropic-ai/claude-agent-sdk/entrypoints/agentSdkTypes.d.ts
        const messageContent = msg.message?.content;

        let contentPreview;
        let toolUseBlock;  // For tool_use blocks in assistant messages

        if (msg.type === 'assistant' && Array.isArray(messageContent)) {
          // Find text blocks for preview
          const textBlock = messageContent.find(b => b.type === 'text');
          if (textBlock?.text) {
            contentPreview = textBlock.text.slice(0, 150);
          }
          // Find tool_use blocks (these are the "tool calls")
          toolUseBlock = messageContent.find(b => b.type === 'tool_use');
        } else if (msg.type === 'user' && msg.tool_use_result) {
          // User messages with tool results
          if (typeof msg.tool_use_result === 'string') {
            contentPreview = msg.tool_use_result.slice(0, 100);
          } else {
            try {
              contentPreview = JSON.stringify(msg.tool_use_result).slice(0, 100);
            } catch {
              contentPreview = '[Unable to serialize tool result]';
            }
          }
        }

        onProgress({
          type: msg.type,
          subtype: msg.subtype,
          elapsed,
          messageCount,
          label: progressLabel,
          // Tool progress messages have tool_name directly
          ...(msg.type === 'tool_progress' && {
            toolName: msg.tool_name,
            elapsedSeconds: msg.elapsed_time_seconds
          }),
          // Tool use blocks from assistant messages
          ...(toolUseBlock && {
            toolName: toolUseBlock.name,
            toolInput: toolUseBlock.input
          }),
          ...(msg.type === 'error' && { error: msg.error }),
          ...(contentPreview && { contentPreview })
        });
      }

      // SDK-proper: Handle error message type explicitly (per SDK docs)
      // These are non-fatal errors during execution - log but continue
      if (msg.type === 'error') {
        const errorMsg = msg.error?.message || msg.error || 'unknown error';
        const errorType = msg.error?.type || 'unknown';
        console.error(`[${progressLabel}] SDK error (${errorType}): ${errorMsg}`);
        // Don't throw - let the loop continue to get the result
        // Fatal errors will come as 'result' type with error subtype
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
 * Create a reusable progress logger for SDK calls
 *
 * Formats SDK progress messages with emoji indicators and content previews.
 * Use this in any node that calls sdkQuery with onProgress.
 *
 * SDK message types (from agentSdkTypes.d.ts):
 * - assistant: Claude's response with text and/or tool_use blocks
 * - user: User messages or tool results
 * - system: Init, status, hooks
 * - tool_progress: Progress updates during tool execution
 * - result: Final result
 *
 * @param {string} context - Log prefix (e.g., 'analyzePhotos', 'analyzeArcs')
 * @returns {Function} Progress callback for sdkQuery onProgress option
 *
 * @example
 * const { sdkQuery, createProgressLogger } = require('./sdk-client');
 * await sdkQuery({
 *   prompt: '...',
 *   onProgress: createProgressLogger('myNode')
 * });
 */
function createProgressLogger(context) {
  return (msg) => {
    let logLine = `[${context}] [${msg.elapsed}s]`;

    switch (msg.type) {
      case 'assistant':
        // Check for tool use first (tool calls are in assistant messages)
        if (msg.toolName) {
          logLine += ` 🔧 ${msg.toolName}`;
          if (msg.toolInput) {
            // Show subagent type for Task calls
            if (msg.toolName === 'Task' && msg.toolInput.subagent_type) {
              logLine += ` → ${msg.toolInput.subagent_type}`;
            } else if (msg.toolInput.file_path) {
              logLine += `: ${msg.toolInput.file_path}`;
            } else if (msg.toolInput.command) {
              logLine += `: ${msg.toolInput.command.slice(0, 50)}`;
            }
          }
        } else if (msg.contentPreview) {
          const preview = msg.contentPreview.replace(/\n/g, ' ').trim();
          logLine += ` 💭 ${preview}${msg.contentPreview.length >= 150 ? '...' : ''}`;
        } else {
          logLine += ' 💭 (thinking)';
        }
        break;

      case 'user':
        // User messages often contain tool results
        if (msg.contentPreview) {
          const preview = msg.contentPreview.replace(/\n/g, ' ').slice(0, 80);
          logLine += ` ✓ result: ${preview}...`;
        } else {
          logLine += ' 📥 (tool result)';
        }
        break;

      case 'tool_progress':
        logLine += ` ⏳ ${msg.toolName} (${msg.elapsedSeconds?.toFixed(1) || '?'}s)`;
        break;

      case 'system':
        logLine += ` ⚙️ ${msg.subtype || 'system'}`;
        break;

      case 'error':
        logLine += ` ❌ ${msg.error?.message || msg.error || 'error'}`;
        break;

      case 'result':
        // Final result - usually don't need to log, but handle gracefully
        logLine += ` ✅ ${msg.subtype || 'complete'}`;
        break;

      default:
        logLine += ` ${msg.type}`;
    }

    console.log(logLine);
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
  createSemaphore,       // Concurrency limiter (Commit 8.9)
  createProgressLogger,  // Reusable progress logger (Commit 8.11)
  MODEL_TIMEOUTS         // Expose for custom timeout logic
};

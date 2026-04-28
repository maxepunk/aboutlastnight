/**
 * LLM Client - Raw Claude Agent SDK wrapper
 *
 * Clean SDK interface without tracing (tracing applied in index.js).
 * Single Responsibility: SDK communication only.
 *
 * Key features:
 * - Direct SDK calls with async iterator pattern
 * - Native structured output via JSON schemas
 * - AbortController timeout support
 * - Progress streaming via onProgress callback
 * - Subagent support for parallel execution
 *
 * @module llm/client
 */

const { query } = require('@anthropic-ai/claude-agent-sdk');
const { extractStructuredOutput, StructuredOutputExtractionError } = require('./structured-output-extractor');

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
 * Resolve shorthand model names to explicit model IDs.
 * The Agent SDK's shorthand resolution lags behind latest releases
 * (e.g., 'sonnet' resolves to 4.5 instead of 4.6). Using explicit IDs
 * guarantees we run on the intended model version.
 */
const MODEL_IDS = {
  opus: 'claude-opus-4-7',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5'
};

/**
 * Per-model effort defaults. Passed explicitly per query so the SDK
 * doesn't fall through the legacy server-pushed taskIntensityOverride
 * resolution chain (which returns null client_data for accounts on
 * Opus 4.7's adaptive-thinking + new effort semantics).
 *
 * Per Anthropic's effort docs (https://platform.claude.com/docs/en/build-with-claude/effort):
 *   - Haiku 4.5: effort not supported (omit)
 *   - Sonnet 4.6: 'high' for intelligence-sensitive workloads
 *   - Opus 4.7: 'xhigh' is the recommended starting point for coding/agentic work
 */
const EFFORT_LEVELS = {
  opus: 'xhigh',
  sonnet: 'high'
  // haiku omitted — Haiku 4.5 doesn't support the effort parameter
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
 * @param {boolean} [options.disableTools=false] - If true, disables ALL built-in tools for pure structured output.
 * @param {Object} [options.agents] - Custom agent definitions for Task tool invocation
 * @param {string} [options.cwd] - Current working directory for file operations
 * @param {('low'|'medium'|'high'|'xhigh'|'max')} [options.effort] - Override the per-model effort default
 * @param {number} [options.timeoutMs] - Timeout in ms (defaults to model timeout)
 * @param {Function} [options.onProgress] - Callback for intermediate messages: (msg) => void
 * @param {string} [options.label] - Label for progress logging
 * @returns {Promise<Object|string>} - Parsed result (object if schema, string otherwise)
 * @throws {Error} - If SDK returns error, timeout, or no result
 */
async function sdkQueryImpl({
  prompt,
  systemPrompt,
  model = 'sonnet',
  jsonSchema,
  allowedTools = [],
  agents,
  cwd,
  effort,
  timeoutMs,
  onProgress,
  label,
  disableTools = false,
  loadProjectSettings = true
}) {
  const resolvedModel = MODEL_IDS[model] || model;
  const effectiveTimeout = timeoutMs || MODEL_TIMEOUTS[model] || MODEL_TIMEOUTS.sonnet;
  const abortController = new AbortController();
  const startTime = Date.now();
  const progressLabel = label || prompt.slice(0, 25).replace(/\n/g, ' ');

  // Set up timeout
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, effectiveTimeout);

  const options = {
    model: resolvedModel,
    systemPrompt,
    allowedTools,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,  // Required pair for bypassPermissions in SDK 0.2.x
    abortController
  };

  // Control 2: scope filesystem-loaded skills/settings per call.
  // Default true preserves SDK behavior (loads .claude/skills/ from cwd).
  // Pass false on utility calls (photo, normalization) to avoid auto-loading
  // unrelated skill prompts that pollute system context.
  if (loadProjectSettings === false) {
    options.settingSources = [];
  }

  // Enable 1M context window for Opus and Sonnet (beta)
  // Haiku doesn't support 1M
  if (model !== 'haiku') {
    options.betas = ['context-1m-2025-08-07'];
  }

  // Pass effort explicitly so the SDK doesn't traverse the legacy
  // server-pushed taskIntensityOverride chain (which returns null
  // client_data for accounts using Opus 4.7's adaptive-thinking semantics).
  const effectiveEffort = effort || EFFORT_LEVELS[model];
  if (effectiveEffort) {
    options.effort = effectiveEffort;
  }

  // Set working directory for file operations
  if (cwd) {
    options.cwd = cwd;
  } else {
    // Default to the reports directory (parent of lib/)
    options.cwd = require('path').resolve(__dirname, '../..');
  }

  // Add custom agent definitions for Task tool invocation
  if (agents && Object.keys(agents).length > 0) {
    options.agents = agents;
  }

  // Disable ALL built-in tools for pure structured output
  if (disableTools) {
    options.tools = [];
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

    // Emit llm_start event with FULL prompt (no truncation)
    if (onProgress) {
      onProgress({
        type: 'llm_start',
        model,
        label: progressLabel,
        prompt,
        systemPrompt,
        jsonSchema,
        elapsed: 0
      });
    }

    for await (const msg of query({ prompt, options })) {
      messageCount++;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      // Log context window on session init (verify 1M beta is active)
      if (msg.type === 'system' && msg.subtype === 'init' && msg.model_usage) {
        const ctxWindow = Object.values(msg.model_usage)?.[0]?.contextWindow;
        if (ctxWindow) {
          console.log(`[${progressLabel}] Context window: ${(ctxWindow / 1000).toFixed(0)}K tokens (model: ${model})`);
        }
      }

      // Stream progress for intermediate messages
      if (onProgress) {
        const messageContent = msg.message?.content;

        let contentPreview;
        let toolUseBlock;

        if (msg.type === 'assistant' && Array.isArray(messageContent)) {
          // Find text blocks for preview
          const textBlock = messageContent.find(b => b.type === 'text');
          if (textBlock?.text) {
            contentPreview = textBlock.text.slice(0, 150);
          }
          // Find tool_use blocks
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

      // Handle error message type (non-fatal)
      if (msg.type === 'error') {
        const errorMsg = msg.error?.message || msg.error || 'unknown error';
        const errorType = msg.error?.type || 'unknown';
        console.error(`[${progressLabel}] SDK error (${errorType}): ${errorMsg}`);
      }

      // Handle successful result
      if (msg.type === 'result' && msg.subtype === 'success') {
        clearTimeout(timeoutId);

        let finalResult;
        if (jsonSchema) {
          // Control 1: SDK contract enforcement.
          // Per SDK bug #277, subtype='success' can arrive without structured_output.
          // The extractor falls back to parsing JSON from msg.result text.
          finalResult = extractStructuredOutput({
            structuredOutput: msg.structured_output,
            resultText: msg.result,
            schema: jsonSchema,
            label: progressLabel,
            model: resolvedModel
          });
        } else {
          finalResult = msg.result;
        }

        // Emit llm_complete event with FULL response (no truncation)
        if (onProgress) {
          onProgress({
            type: 'llm_complete',
            elapsed: (Date.now() - startTime) / 1000,
            result: finalResult,
            jsonSchema
          });
        }

        return finalResult;
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
    }

    clearTimeout(timeoutId);
    throw new Error('SDK: No result received from query');

  } catch (error) {
    clearTimeout(timeoutId);

    // Preserve structured-output extraction errors as-is (they carry diagnostics)
    if (error instanceof StructuredOutputExtractionError) {
      throw error;
    }

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
 * @param {number} limit - Maximum concurrent operations
 * @returns {Function} - Async function wrapper: (fn) => Promise
 *
 * @example
 * const semaphore = createSemaphore(3);
 * const results = await Promise.all(
 *   items.map(item => semaphore(() => processItem(item)))
 * );
 */
function createSemaphore(limit) {
  let running = 0;
  const queue = [];

  return async function withSemaphore(fn) {
    if (running >= limit) {
      await new Promise(resolve => queue.push(resolve));
    }

    running++;
    try {
      return await fn();
    } finally {
      running--;
      if (queue.length > 0) {
        const next = queue.shift();
        next();
      }
    }
  };
}

/**
 * Check if Claude Agent SDK is available
 *
 * @param {Function} sdkQuery - The traced sdkQuery function
 * @returns {Promise<boolean>}
 */
async function isClaudeAvailable(sdkQuery) {
  try {
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
  sdkQueryImpl,
  query,  // Export raw SDK query for subagent use
  getModelTimeout,
  isClaudeAvailable,
  createSemaphore,
  MODEL_TIMEOUTS
};

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
 * Idle (stall) window in milliseconds — the maximum time we tolerate with NO
 * streamed activity from the SDK before aborting. This is NOT a total-duration
 * cap: a healthy long call (Opus thinking for 20 min while emitting deltas) never
 * trips it because the timer is re-armed on every streamed message (see resetIdle
 * below). Only genuine silence — a hung subprocess, a stuck upstream — fires it.
 *
 * Generous by design; tune only DOWN, only from data. duration_api_ms on every
 * llm_complete event is the data source.
 *
 * Kept named MODEL_TIMEOUTS and exported for backward compatibility (getModelTimeout,
 * llm/index.js re-export), but the semantics are now idle-between-events.
 */
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const MODEL_TIMEOUTS = {
  opus: IDLE_TIMEOUT_MS,
  sonnet: IDLE_TIMEOUT_MS,
  haiku: IDLE_TIMEOUT_MS
};

/**
 * Per-call RUNAWAY backstop (USD), passed to the SDK as maxBudgetUsd. We run on a
 * Claude subscription (rate-limited, NOT metered per-token), so this dollar figure
 * is NOT a cost target — the SDK derives it from token usage × list pricing, so it
 * functions as a token-VOLUME circuit breaker. Set deliberately HIGH so it never
 * fires on legitimate work (even a big Opus arc-analysis with extended thinking) —
 * it only aborts a pathological runaway (stuck retry loop / infinite tool loop)
 * before it burns the rate-limit quota unattended. Lower these only if you switch
 * to metered API billing and want a real cost ceiling.
 *
 * NOTE: this is a PER-CALL ceiling, not aggregate. LangGraph's node retryPolicy
 * (Task P3.1) re-runs a failed node up to `maxAttempts` times, each a FRESH SDK call
 * with its own budget — so N retries can cost up to N× this ceiling. The TRC-2
 * de-layering (one retry layer, ≤3 attempts) keeps that bound predictable.
 */
const MODEL_BUDGETS = {
  opus: 100.0,
  sonnet: 50.0,
  haiku: 10.0
};

/**
 * Resolve shorthand model names to explicit model IDs.
 * The Agent SDK's shorthand resolution lags behind latest releases
 * (e.g., 'sonnet' resolves to 4.5 instead of 4.6). Using explicit IDs
 * guarantees we run on the intended model version.
 */
const MODEL_IDS = {
  opus: 'claude-opus-4-8',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5'
};

/**
 * Per-model effort defaults. Passed explicitly per query so the SDK
 * doesn't fall through the legacy server-pushed taskIntensityOverride
 * resolution chain (which returns null client_data for accounts on
 * Opus 4.8's adaptive-thinking + new effort semantics).
 *
 * Per Anthropic's effort docs (https://platform.claude.com/docs/en/build-with-claude/effort):
 *   - Haiku 4.5: effort not supported (omit)
 *   - Sonnet 4.6: 'high' for intelligence-sensitive workloads
 *   - Opus 4.8: 'xhigh' is the recommended starting point for coding/agentic work
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
 * @param {boolean} [options.loadProjectSettings=true] - Controls filesystem-settings scope:
 *   - true  → settingSources: ['project']  (loads project .claude/skills/ and project CLAUDE.md)
 *   - false → settingSources: []           (no filesystem settings; pure SDK isolation)
 *   We never load user/local sources — Phase 1A audit found those contribute ~86K tokens of
 *   irrelevant context (superpowers meta-skill, MEMORY.md, MCP instructions) and correlate
 *   with channel-skip failures on large structured-output calls.
 * @param {Object} [options.agents] - Custom agent definitions for Task tool invocation
 * @param {string} [options.cwd] - Current working directory for file operations
 * @param {('low'|'medium'|'high'|'xhigh'|'max')} [options.effort] - Override the per-model effort default
 * @param {number} [options.timeoutMs] - Idle/stall window in ms — aborts only if NO streamed message arrives within this window (NOT a total-duration cap). Defaults to the per-model idle value (15 min).
 * @param {number} [options.maxBudgetUsd] - Per-call spend ceiling override (defaults to per-model MODEL_BUDGETS)
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
  maxBudgetUsd,
  onProgress,
  label,
  disableTools = false,
  loadProjectSettings = true
}) {
  const resolvedModel = MODEL_IDS[model] || model;
  const idleTimeoutMs = timeoutMs || MODEL_TIMEOUTS[model] || MODEL_TIMEOUTS.sonnet;
  const abortController = new AbortController();
  const startTime = Date.now();
  const progressLabel = label || prompt.slice(0, 25).replace(/\n/g, ' ');

  // Idle (stall) timer: abort only after idleTimeoutMs of NO streamed activity.
  // resetIdle() is called once before the loop and again on EVERY message inside
  // it, so a healthy long-running call that keeps streaming never aborts — only a
  // genuinely silent/hung call does. Replaces the old total-duration cap.
  let lastActivityAt = Date.now();
  let idleAbortedAt = null;
  let timeoutId = null;
  const resetIdle = () => {
    lastActivityAt = Date.now();
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      idleAbortedAt = Date.now();
      abortController.abort();
    }, idleTimeoutMs);
  };
  resetIdle();

  const options = {
    model: resolvedModel,
    systemPrompt,
    allowedTools,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,  // Required pair for bypassPermissions in SDK 0.2.x
    abortController,
    // Stream token-level deltas so the operator sees thinking/writing live and the
    // idle timer is fed by real activity (SDK 0.2.119: SDKPartialAssistantMessage).
    includePartialMessages: true
  };

  // Per-call cost ceiling. Explicit param wins; else the per-model default.
  options.maxBudgetUsd = maxBudgetUsd ?? MODEL_BUDGETS[model] ?? MODEL_BUDGETS.sonnet;

  // Control 2: scope filesystem-loaded skills/settings per call.
  //
  // SDK default (settingSources omitted) loads user + project + local. A probe of
  // a real article-generation call found user-level autoload alone contributes
  // ~86K tokens of context our SDK calls don't use (superpowers meta-skill, user
  // MEMORY.md, MCP server instructions, two CLAUDE.md files). Trimming to project
  // scope is pure context hygiene — removes irrelevant priming without losing
  // anything the pipeline actually depends on.
  //
  // Mapping:
  //   loadProjectSettings: false → settingSources: []          (no filesystem context)
  //   loadProjectSettings: true  → settingSources: ['project'] (project skill + project CLAUDE.md only)
  //
  // Note on channel skip: this does NOT prevent the structured-output channel skip
  // we see on generateContentBundle. That's caused by a known SDK bug (#277) in
  // constrained decoding for complex schemas — see CLAUDE.md "Channel skip".
  if (loadProjectSettings === false) {
    options.settingSources = [];
  } else {
    options.settingSources = ['project'];
  }

  // Enable 1M context window for Opus and Sonnet (beta)
  // Haiku doesn't support 1M
  if (model !== 'haiku') {
    options.betas = ['context-1m-2025-08-07'];
  }

  // Pass effort explicitly so the SDK doesn't traverse the legacy
  // server-pushed taskIntensityOverride chain (which returns null
  // client_data for accounts using Opus 4.8's adaptive-thinking semantics).
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
    let deltaCharCount = 0;   // running streamed-char total for the token-count cue
    let ttftMs = null;        // time-to-first-token (first non-empty delta)

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
      resetIdle();  // any message = activity → re-arm the stall timer
      messageCount++;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      // Token-level partial streaming (includePartialMessages). Feed the idle timer
      // (resetIdle already ran above) and forward a coalesce-able llm_delta to the
      // progress channel. phase is derived from the raw stream event type.
      if (msg.type === 'stream_event' && onProgress) {
        const ev = msg.event || {};
        let phase = null;
        let deltaText = '';
        if (ev.type === 'message_start') {
          phase = 'preparing';
        } else if (ev.type === 'content_block_delta') {
          const d = ev.delta || {};
          if (d.type === 'thinking_delta') { phase = 'thinking'; deltaText = d.thinking || ''; }
          else if (d.type === 'text_delta') { phase = 'writing'; deltaText = d.text || ''; }
        }
        if (phase) {
          deltaCharCount += deltaText.length;
          // TTFT = first non-empty delta of ANY kind (thinking counts) — the live feed should
          // register activity the moment the model starts producing, not only at first text.
          if (deltaText.length > 0 && ttftMs === null) {
            ttftMs = Date.now() - startTime;
          }
          onProgress({
            type: 'llm_delta',
            phase,
            deltaText,
            // Rough char/4 token estimate — a liveness cue, not billing. The server
            // coalescer (P5) is the throttle; we emit one event per stream_event.
            tokenCount: Math.ceil(deltaCharCount / 4),
            ttftMs,
            elapsed: parseFloat(elapsed)
          });
        }
        continue;  // partials are not assistant/result messages; skip the rest of the loop body
      }

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
          // Surface assistant-message errors (max_output_tokens, rate_limit, etc.) so
          // the progress channel can distinguish them from the truncated text response.
          ...(msg.type === 'assistant' && msg.error && { assistantError: msg.error }),
          // Pass rate_limit_info (status, utilization, type) through so the formatter
          // can render meaningful diagnostics rather than the bare event name.
          ...(msg.type === 'rate_limit_event' && { rateLimitInfo: msg.rate_limit_info }),
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

        // Capture SDK diagnostics BEFORE attempting extraction so failures get
        // the same envelope as successes. Otherwise extraction throws bury the
        // single most useful signal (stop_reason, usage, terminal_reason, etc.)
        // exactly when we need them.
        const sdkDiagnostics = {
          stopReason: msg.stop_reason ?? null,
          durationApiMs: msg.duration_api_ms ?? null,
          numTurns: msg.num_turns ?? null,
          usage: msg.usage ?? null,
          apiErrorStatus: msg.api_error_status ?? null,
          terminalReason: msg.terminal_reason ?? null,
          structuredOutputPresent: msg.structured_output !== undefined && msg.structured_output !== null,
          resultTextLength: typeof msg.result === 'string' ? msg.result.length : 0
        };

        let finalResult;
        let outputChannel = null;
        let extractionError = null;
        if (jsonSchema) {
          // Control 1: SDK contract enforcement.
          // Per SDK bug #277, subtype='success' can arrive without structured_output.
          // The extractor falls back to parsing JSON from msg.result text and reports
          // which channel produced the value via the `channel` field.
          try {
            const extracted = extractStructuredOutput({
              structuredOutput: msg.structured_output,
              resultText: msg.result,
              schema: jsonSchema,
              label: progressLabel,
              model: resolvedModel
            });
            finalResult = extracted.value;
            outputChannel = extracted.channel;
          } catch (err) {
            extractionError = err;
          }
        } else {
          finalResult = msg.result;
        }

        // Emit diagnostics for BOTH success and extraction-failure paths.
        // llm_complete on success; llm_error on extraction failure. Same envelope.
        if (onProgress) {
          if (extractionError) {
            onProgress({
              type: 'llm_error',
              elapsed: (Date.now() - startTime) / 1000,
              error: extractionError.message,
              errorName: extractionError.name,
              schemaErrors: extractionError.schemaErrors || null,
              jsonSchema,
              ...sdkDiagnostics
            });
          } else {
            onProgress({
              type: 'llm_complete',
              elapsed: (Date.now() - startTime) / 1000,
              result: finalResult,
              jsonSchema,
              channel: outputChannel,
              ...sdkDiagnostics
            });
          }
        }

        if (extractionError) throw extractionError;
        return finalResult;
      }

      // Cost ceiling tripped — explicit, non-transient. isTransientError matches
      // `error_max_budget_usd` in the subtype/message and returns false; the operator
      // must decide, we never auto-retry spend.
      // MUST precede the generic subtype.includes('error') branch (error_max_budget_usd also matches it).
      if (msg.type === 'result' && msg.subtype === 'error_max_budget_usd') {
        clearTimeout(timeoutId);
        const spent = typeof msg.total_cost_usd === 'number' ? msg.total_cost_usd.toFixed(2) : '?';
        const budgetErr = new Error(
          `SDK error_max_budget_usd: per-call budget exceeded ` +
          `($${spent} spent, limit $${Number(options.maxBudgetUsd).toFixed(2)}) - ${progressLabel}`
        );
        budgetErr.sdkSubtype = msg.subtype;
        budgetErr.sdkErrors = msg.errors || [];
        throw budgetErr;
      }

      // Handle error results (generic) — KEEP Task 2.1's enrichment so a sustained
      // upstream overload (error_during_execution / overloaded_error) stays auto-retryable.
      if (msg.type === 'result' && msg.subtype && msg.subtype.includes('error')) {
        clearTimeout(timeoutId);
        const errorDetails = msg.errors?.join(', ') || 'Unknown error';
        const sdkErr = new Error(`SDK ${msg.subtype}: ${errorDetails}`);
        sdkErr.sdkSubtype = msg.subtype;     // e.g. 'error_during_execution', 'error_max_budget_usd'
        sdkErr.sdkErrors = msg.errors || []; // e.g. ['overloaded_error']
        throw sdkErr;
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

    // Our own enriched SDK errors (budget overrun / generic error-result) were thrown from the
    // stream loop, NOT by the idle abort — preserve them so a concurrent abort can't reclassify
    // a PERMANENT budget error as a retryable timeout (the cost ceiling must never auto-retry).
    if (error && error.sdkSubtype) throw error;

    // Check if it was an idle/stall abort. Message must still start with
    // "SDK timeout after" so isSdkTimeoutError (and thus isTransientError) keeps
    // classifying it as transient — the wording past that is diagnostic.
    if (error.name === 'AbortError' || abortController.signal.aborted) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      // Measure idle from the abort instant (captured in the timer callback), not
      // from the catch block which runs after iterator teardown — otherwise a real
      // stall reads e.g. "idle 900.1s (idle limit: 900s)", slightly self-contradictory.
      const idleSec = (((idleAbortedAt ?? Date.now()) - lastActivityAt) / 1000).toFixed(1);
      throw new Error(
        `SDK timeout after ${elapsed}s idle ${idleSec}s with no streamed activity ` +
        `(idle limit: ${idleTimeoutMs / 1000}s) - ${progressLabel}`
      );
    }

    throw error;
  }
}

/**
 * Detect whether an error came from this module's idle/stall abort path. The
 * thrown message format is:
 *   `SDK timeout after <elapsed>s idle <idleSec>s with no streamed activity (idle limit: <limit>s) - <label>`
 * (built in the abort branch of sdkQueryImpl's catch). Callers wrapping
 * sdkQueryImpl with retry-on-timeout logic should use this rather than ad-hoc
 * substring matches that drift apart across call sites.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
function isSdkTimeoutError(err) {
  return Boolean(err && typeof err.message === 'string' && /SDK timeout after/.test(err.message));
}

/**
 * Get the model's idle (stall) window for compatibility with existing code.
 *
 * NOTE: the returned value is now an IDLE-window duration (15 min) — the max time
 * tolerated with NO streamed activity before aborting — NOT a total-duration cap.
 * A healthy long call that keeps streaming runs well past this. Callers must not
 * treat it as a hard end-to-end SLA.
 *
 * @param {string} model - Model name
 * @returns {number} - Idle window in milliseconds
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
  isSdkTimeoutError,
  createSemaphore,
  MODEL_TIMEOUTS,
  MODEL_BUDGETS,
  MODEL_IDS
};

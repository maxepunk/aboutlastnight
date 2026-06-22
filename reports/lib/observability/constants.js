/**
 * Observability Constants
 *
 * Single source of truth for SDK message types and SSE event types.
 * Eliminates magic strings across the codebase.
 */

// SDK message types (from Claude Agent SDK async iterator)
const SDK_MESSAGE_TYPES = {
  ASSISTANT: 'assistant',
  USER: 'user',
  TOOL_PROGRESS: 'tool_progress',
  TOOL_RESULT: 'tool_result',
  SYSTEM: 'system',
  ERROR: 'error',
  RESULT: 'result',
  RATE_LIMIT_EVENT: 'rate_limit_event'
};

// Channel that produced a structured-output result (see lib/llm/structured-output-extractor.js).
// 'structured_output' = SDK populated msg.structured_output (model invoked StructuredOutput tool).
// 'text_fallback'     = msg.structured_output absent/invalid; JSON parsed from result text.
// Captured on llm_complete events so we can detect SDK bug #277 firings in the wild.
const STRUCTURED_OUTPUT_CHANNELS = {
  STRUCTURED_OUTPUT: 'structured_output',
  TEXT_FALLBACK: 'text_fallback'
};

// SSE event types emitted to clients
const SSE_EVENT_TYPES = {
  CONNECTED: 'connected',      // SSE connection established
  PROGRESS: 'progress',        // Standard progress update
  LLM_START: 'llm_start',      // LLM call starting (full prompt)
  LLM_DELTA: 'llm_delta',      // Token-level partial-message delta (phase/ttft/tokenCount); coalesced server-side (P5)
  LLM_COMPLETE: 'llm_complete', // LLM call complete (full response)
  LLM_ERROR: 'llm_error',      // LLM call returned success but extraction failed (carries same diagnostics as llm_complete)
  COMPLETE: 'complete',        // Workflow complete or checkpoint reached
  ERROR: 'error'               // Error occurred
};

module.exports = {
  SDK_MESSAGE_TYPES,
  SSE_EVENT_TYPES,
  STRUCTURED_OUTPUT_CHANNELS
};

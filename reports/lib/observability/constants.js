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
  RESULT: 'result'
};

// SSE event types emitted to clients
const SSE_EVENT_TYPES = {
  CONNECTED: 'connected',      // SSE connection established
  PROGRESS: 'progress',        // Standard progress update
  LLM_START: 'llm_start',      // LLM call starting (full prompt)
  LLM_COMPLETE: 'llm_complete', // LLM call complete (full response)
  COMPLETE: 'complete',        // Workflow complete or checkpoint reached
  ERROR: 'error'               // Error occurred
};

module.exports = {
  SDK_MESSAGE_TYPES,
  SSE_EVENT_TYPES
};

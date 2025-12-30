/**
 * Progress Bridge
 *
 * Emits SSE progress events from SDK messages.
 * Single source of truth for progress - unifies console logging and SSE emission.
 * DRY principle: Progress events derived from single source.
 *
 * @module observability/progress-bridge
 */

const { progressEmitter } = require('./progress-emitter');
const { isProgressEnabled } = require('./config');
const { SSE_EVENT_TYPES } = require('./constants');
const { formatProgressMessage } = require('./message-formatter');

const PROGRESS_ICONS = {
  system: '\u2699\uFE0F',      // gear
  assistant: '\uD83D\uDCAD',   // thought bubble
  user: '\u2713',              // checkmark
  tool_progress: '\u23F3',     // hourglass
  result: '\u2705',            // white check mark
  error: '\u274C',             // cross mark
  llm_start: '\uD83D\uDE80',   // rocket
  llm_complete: '\u2705'       // checkmark
};

/**
 * Format a progress event into display components
 *
 * Extracts icon, short text, and detail text from SDK messages.
 *
 * @param {Object} msg - SDK progress message
 * @returns {Object} - { icon, shortText, detailText } for formatting
 */
function formatProgressEvent(msg) {
  switch (msg.type) {
    case 'llm_start':
      return {
        icon: PROGRESS_ICONS.llm_start,
        shortText: `Starting ${msg.label || 'LLM call'}...`,
        detailText: `Model: ${msg.model}`
      };

    case 'llm_complete':
      return {
        icon: PROGRESS_ICONS.llm_complete,
        shortText: `Completed ${msg.label || 'LLM call'}`,
        detailText: `${msg.elapsed?.toFixed(1) || '?'}s`
      };

    case 'assistant':
      if (msg.toolName) {
        let detail = '';
        if (msg.toolInput?.subagent_type) {
          detail = msg.toolInput.subagent_type;
        } else if (msg.toolInput?.file_path) {
          detail = msg.toolInput.file_path;
        } else if (msg.toolInput?.command) {
          detail = msg.toolInput.command;
        }
        return { icon: '\uD83D\uDD27', shortText: msg.toolName, detailText: detail };
      }
      const preview = msg.contentPreview?.replace(/\n/g, ' ').trim() || '';
      return {
        icon: PROGRESS_ICONS.assistant,
        shortText: preview.slice(0, 100) || 'Thinking...',
        detailText: preview
      };

    case 'user':
      return {
        icon: PROGRESS_ICONS.user,
        shortText: 'Processing result...',
        detailText: msg.contentPreview?.replace(/\n/g, ' ') || ''
      };

    case 'tool_progress':
      return {
        icon: PROGRESS_ICONS.tool_progress,
        shortText: `${msg.toolName} running...`,
        detailText: `${msg.elapsedSeconds?.toFixed(1) || '?'}s`
      };

    case 'system':
      return {
        icon: PROGRESS_ICONS.system,
        shortText: msg.subtype || 'Initializing...',
        detailText: ''
      };

    case 'error':
      return {
        icon: PROGRESS_ICONS.error,
        shortText: msg.error?.message || 'Error occurred',
        detailText: ''
      };

    case 'result':
      return {
        icon: PROGRESS_ICONS.result,
        shortText: 'Complete',
        detailText: msg.subtype || ''
      };

    default:
      return { icon: '', shortText: msg.type, detailText: '' };
  }
}

/**
 * Create a progress callback from trace events
 *
 * Unified progress logging - both console and SSE from single source.
 * Emits llm_start and llm_complete events with FULL prompt/response (no truncation).
 *
 * @param {string} context - Log prefix (e.g., 'generateOutline')
 * @param {string} [sessionId] - Session ID for SSE streaming (optional)
 * @returns {Function} Progress callback for SDK
 */
function createProgressFromTrace(context, sessionId = null) {
  if (!isProgressEnabled()) {
    return () => {}; // No-op
  }

  return (msg) => {
    const timestamp = new Date().toISOString();

    // LLM lifecycle events - FULL visibility (no truncation)
    if (msg.type === 'llm_start') {
      const logLine = `[${context}] [${msg.elapsed || 0}s] ${PROGRESS_ICONS.llm_start} Starting ${msg.label || 'LLM call'} (${msg.model})`;
      console.log(logLine);

      if (sessionId) {
        progressEmitter.emitProgress(sessionId, {
          type: SSE_EVENT_TYPES.LLM_START,
          timestamp,
          context,
          model: msg.model,
          label: msg.label,
          prompt: {
            system: msg.systemPrompt || '',
            user: msg.prompt || '',
            schema: msg.jsonSchema || null
          }
        });
      }
      return;
    }

    if (msg.type === 'llm_complete') {
      const responseStr = JSON.stringify(msg.result);
      const logLine = `[${context}] [${msg.elapsed?.toFixed(1) || '?'}s] ${PROGRESS_ICONS.llm_complete} Completed (${responseStr.length} chars)`;
      console.log(logLine);

      if (sessionId) {
        progressEmitter.emitProgress(sessionId, {
          type: SSE_EVENT_TYPES.LLM_COMPLETE,
          timestamp,
          context,
          elapsed: msg.elapsed,
          response: {
            full: msg.result,
            length: responseStr.length,
            structured: !!msg.jsonSchema
          }
        });
      }
      return;
    }

    // Standard progress events
    const { icon, shortText, detailText } = formatProgressEvent(msg);

    // Build log line with full detail
    let logLine = `[${context}] [${msg.elapsed}s] ${icon} ${shortText}`;
    if (detailText && msg.type === 'assistant' && msg.toolName) {
      logLine += msg.toolInput?.subagent_type ? ` \u2192 ${detailText}` : `: ${detailText}`;
    } else if (detailText && msg.type === 'user') {
      logLine += `: ${detailText}...`;
    } else if (detailText && msg.type === 'tool_progress') {
      logLine = `[${context}] [${msg.elapsed}s] ${icon} ${msg.toolName} (${detailText})`;
    }

    // Build short display message for SSE
    const displayMessage = `${icon} ${shortText}`;

    // Always log to console (server-side visibility)
    console.log(logLine);

    // Emit to SSE if sessionId provided
    if (sessionId) {
      progressEmitter.emitProgress(sessionId, {
        type: SSE_EVENT_TYPES.PROGRESS,
        timestamp,
        context,
        sdkType: msg.type,
        subtype: msg.subtype,
        elapsed: msg.elapsed,
        message: displayMessage,
        ...(msg.toolName && { toolName: msg.toolName })
      });
    }
  };
}

module.exports = {
  createProgressFromTrace,
  formatProgressEvent,
  PROGRESS_ICONS
};

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
const { SSE_EVENT_TYPES, STRUCTURED_OUTPUT_CHANNELS } = require('./constants');

const PROGRESS_ICONS = {
  system: '\u2699\uFE0F',          // gear
  assistant: '\uD83D\uDCAD',       // thought bubble
  user: '\u2713',                  // checkmark
  tool_progress: '\u23F3',         // hourglass
  result: '\u2705',                // white check mark
  error: '\u274C',                 // cross mark
  llm_start: '\uD83D\uDE80',       // rocket
  llm_complete: '\u2705',          // checkmark
  rate_limit_event: '\u23F1\uFE0F' // stopwatch
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

    case 'llm_complete': {
      // Build a single-line diagnostic suffix from the SDK fields client.js now surfaces.
      // These tell us at a glance: how long the API actually took, what channel produced
      // the result (structured_output vs text fallback), why the model stopped, and token usage.
      const parts = [`${msg.elapsed?.toFixed(1) || '?'}s`];
      if (msg.durationApiMs != null) parts.push(`api=${(msg.durationApiMs / 1000).toFixed(1)}s`);
      if (msg.channel === STRUCTURED_OUTPUT_CHANNELS.TEXT_FALLBACK) parts.push('channel=text-fallback');
      if (msg.stopReason && msg.stopReason !== 'end_turn') parts.push(`stop=${msg.stopReason}`);
      if (msg.usage?.output_tokens != null) parts.push(`out=${msg.usage.output_tokens}`);
      return {
        icon: PROGRESS_ICONS.llm_complete,
        shortText: `Completed ${msg.label || 'LLM call'}`,
        detailText: parts.join(' ')
      };
    }

    case 'rate_limit_event': {
      const info = msg.rateLimitInfo || {};
      const segs = [info.status || 'unknown'];
      if (info.utilization != null) segs.push(`util=${(info.utilization * 100).toFixed(0)}%`);
      if (info.rateLimitType) segs.push(info.rateLimitType);
      return {
        icon: PROGRESS_ICONS.rate_limit_event,
        shortText: 'rate limit',
        detailText: segs.join(' ')
      };
    }

    case 'assistant': {
      // Surface assistant-level errors (max_output_tokens, rate_limit, server_error...)
      // before falling through to tool-use / text-preview formatting.
      if (msg.assistantError) {
        return {
          icon: PROGRESS_ICONS.error,
          shortText: `assistant error: ${msg.assistantError}`,
          detailText: ''
        };
      }
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
    }

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
      const responseStr = msg.result === undefined || msg.result === null
        ? '<empty>'
        : JSON.stringify(msg.result);
      const charCount = responseStr === '<empty>' ? 0 : responseStr.length;
      // Reuse formatProgressEvent's diagnostic suffix (channel, stop reason, api time, tokens)
      // so console + SSE see the same fields and we have one place to extend.
      const { detailText } = formatProgressEvent(msg);
      const logLine = `[${context}] [${detailText}] ${PROGRESS_ICONS.llm_complete} Completed (${charCount} chars)`;
      console.log(logLine);

      if (sessionId) {
        progressEmitter.emitProgress(sessionId, {
          type: SSE_EVENT_TYPES.LLM_COMPLETE,
          timestamp,
          context,
          elapsed: msg.elapsed,
          response: {
            full: msg.result,
            length: charCount,
            structured: !!msg.jsonSchema
          },
          // SDK-supplied diagnostics — same fields client.js placed on the event.
          // Frontends that don't consume these can ignore them; preserved on SSE
          // so future debugging can reconstruct any call without server-side state.
          diagnostics: {
            channel: msg.channel ?? null,
            stopReason: msg.stopReason ?? null,
            durationApiMs: msg.durationApiMs ?? null,
            numTurns: msg.numTurns ?? null,
            usage: msg.usage ?? null,
            apiErrorStatus: msg.apiErrorStatus ?? null,
            terminalReason: msg.terminalReason ?? null
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

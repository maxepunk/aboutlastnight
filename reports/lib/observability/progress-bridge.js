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

// ── llm_delta coalescing (P5) ─────────────────────────────────────────────
// The SDK fires a stream_event per token; forwarding each as its own SSE frame
// is a firehose. We buffer per (sessionId, context) and flush on whichever
// comes first: a 250ms timer, 50 tokens SINCE THE LAST FLUSH, a phase change, or
// the terminating llm_complete/llm_error. Flush emits ONE coalesced llm_delta whose
// deltaText is everything accumulated since the previous flush (the client APPENDS
// each frame's deltaText) and whose tokenCount/ttftMs are the latest cumulative values.
//
// ⚠️ CORRECTED 2026-06-22 (P5.1 opus code-review BLOCKER): the upstream tokenCount
// (client.js: Math.ceil(deltaCharCount/4)) is CUMULATIVE across the whole call, not
// per-delta. The original draft thresholded on `buf.tokenCount >= 50` and DELETED the
// buffer on every flush — so once cumulative tokens passed 50, every subsequent delta
// re-tripped the threshold and flushed, collapsing the coalescer into a per-token
// firehose (~1951 frames for a 2000-token call instead of ~40). Fix: threshold on
// tokens SINCE THE LAST FLUSH via a `flushedAtTokens` baseline, and RESET the buffer
// in place on a non-terminal flush (delete only on the terminal { final: true } flush)
// so the baseline survives. The emitted `tokenCount` stays cumulative (the client and
// the tests expect cumulative).
const DELTA_FLUSH_MS = 250;
const DELTA_FLUSH_TOKENS = 50;
const deltaBuffers = new Map(); // key: `${sessionId}::${context}` -> { phase, text, tokenCount, flushedAtTokens, ttftMs, elapsed, timer }

function deltaKey(sessionId, context) {
  return `${sessionId}::${context}`;
}

// A non-terminal flush (timer / 50-token-since-last-flush / phase change) RESETS the
// buffer in place and advances flushedAtTokens, so the next 50-token window is measured
// from here. A terminal flush (llm_complete/llm_error) passes { final: true } to delete
// the buffer outright. Pass options ONLY from the terminal branches.
function flushDeltaBuffer(sessionId, context, { final = false } = {}) {
  const key = deltaKey(sessionId, context);
  const buf = deltaBuffers.get(key);
  if (!buf) return;
  if (buf.timer) { clearTimeout(buf.timer); buf.timer = null; }
  if (buf.text.length === 0) {
    // Nothing new since the last flush (empty 'preparing' message_start, or a terminal
    // flush right after a threshold flush). Drop on a terminal flush; otherwise leave the
    // already-reset buffer in place for continued accumulation under the same baseline.
    if (final) deltaBuffers.delete(key);
    return;
  }
  progressEmitter.emitProgress(sessionId, {
    type: SSE_EVENT_TYPES.LLM_DELTA,
    timestamp: new Date().toISOString(),
    context,
    phase: buf.phase,
    deltaText: buf.text,
    tokenCount: buf.tokenCount,
    ttftMs: buf.ttftMs ?? null,
    elapsed: buf.elapsed ?? null
  });
  if (final) {
    deltaBuffers.delete(key);
  } else {
    buf.text = '';
    buf.flushedAtTokens = buf.tokenCount; // baseline for the next since-last-flush window
  }
}

function pushDelta(sessionId, context, msg) {
  if (!sessionId) return; // console-only logger: no SSE coalescing
  const key = deltaKey(sessionId, context);
  let buf = deltaBuffers.get(key);
  // A phase change flushes the prior phase so phases never interleave in one frame.
  // The non-terminal flush RESETS the buffer (does not delete it), so re-fetch and
  // re-key it to the new phase rather than recreating (which would reset the baseline).
  if (buf && buf.phase !== msg.phase) {
    flushDeltaBuffer(sessionId, context);
    buf = deltaBuffers.get(key);
    if (buf) buf.phase = msg.phase;
  }
  if (!buf) {
    buf = { phase: msg.phase, text: '', tokenCount: 0, flushedAtTokens: 0, ttftMs: msg.ttftMs ?? null, elapsed: null, timer: null };
    deltaBuffers.set(key, buf);
  }
  buf.text += msg.deltaText || '';
  buf.tokenCount = msg.tokenCount ?? buf.tokenCount;
  if (buf.ttftMs == null && msg.ttftMs != null) buf.ttftMs = msg.ttftMs;
  buf.elapsed = msg.elapsed ?? buf.elapsed;
  // Threshold on tokens SINCE THE LAST FLUSH (cumulative upstream count minus the
  // baseline) — NOT the raw cumulative, which would flush on every delta past 50.
  if (buf.tokenCount - buf.flushedAtTokens >= DELTA_FLUSH_TOKENS) {
    flushDeltaBuffer(sessionId, context);
    return;
  }
  if (!buf.timer) {
    buf.timer = setTimeout(() => flushDeltaBuffer(sessionId, context), DELTA_FLUSH_MS);
  }
}

// Test-only: clear all coalescing buffers + pending flush timers. Buffers are
// reset-in-place on non-terminal flushes (deleted only on terminal llm_complete/
// llm_error), so a delta-only unit test that never sends a terminal event leaves
// module-scoped residue that would bleed across tests. Mirrors the repo's
// _resetOutcomeStore (session-outcome.js) / _resetLocks (session-locks.js) convention.
function _resetDeltaBuffers() {
  for (const buf of deltaBuffers.values()) {
    if (buf.timer) clearTimeout(buf.timer);
  }
  deltaBuffers.clear();
}

const PROGRESS_ICONS = {
  system: '\u2699\uFE0F',          // gear
  assistant: '\uD83D\uDCAD',       // thought bubble
  user: '\u2713',                  // checkmark
  tool_progress: '\u23F3',         // hourglass
  result: '\u2705',                // white check mark
  error: '\u274C',                 // cross mark
  llm_start: '\uD83D\uDE80',       // rocket
  llm_complete: '\u2705',          // checkmark
  rate_limit_event: '\u23F1\uFE0F', // stopwatch (legacy; unused after this change)
  quota_ok: '\uD83D\uDCCA',   // bar chart U+1F4CA \u2014 benign quota telemetry
  warn: '\u26A0\uFE0F',       // warning sign U+26A0
  blocked: '\u26D4',          // no entry U+26D4 \u2014 hard throttle / rejected
  retry: '\uD83D\uDD04',      // counterclockwise arrows U+1F504 \u2014 api retry
  notification: '\uD83D\uDD14' // bell U+1F514
};

/**
 * Format a rate-limit `resetsAt` epoch into a human "resets in Xm" string.
 * Accepts seconds- or millis-epoch (heuristic: > 1e12 ⇒ already millis).
 * @param {number|undefined} resetsAt - epoch from SDKRateLimitInfo.resetsAt
 * @param {number} [now] - millis-epoch reference (injectable for tests)
 * @returns {string} e.g. 'resets in 42m', or '' when resetsAt is absent
 */
function formatResetsIn(resetsAt, now = Date.now()) {
  if (resetsAt == null) return '';
  // Heuristic: if resetsAt is already in the same order of magnitude as now (millis),
  // use as-is; otherwise treat as seconds and convert to millis.
  // Threshold: resetsAt > now/2 means it's already millis-epoch.
  const ms = resetsAt > now / 2 ? resetsAt : resetsAt * 1000;
  const mins = Math.max(0, Math.round((ms - now) / 60000));
  return `resets in ${mins}m`;
}

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
      const status = info.status || 'unknown';
      const which = info.rateLimitType || '';
      const util = info.utilization != null ? `${Math.round(info.utilization * 100)}%` : '';
      const scope = [which, util].filter(Boolean).join(' ');
      // 'allowed' is benign telemetry the SDK emits on ~every call — keep it quiet.
      if (status === 'allowed') {
        return {
          icon: PROGRESS_ICONS.quota_ok,
          shortText: `quota ok${scope ? ' · ' + scope : ''}`,
          detailText: status
        };
      }
      // 'allowed_warning' | 'rejected' — actionable; put everything in shortText
      // (only shortText reaches the console).
      const isRejected = status === 'rejected';
      const resets = formatResetsIn(info.resetsAt);
      const segs = [isRejected ? 'RATE LIMITED' : 'quota warning', scope, resets].filter(Boolean);
      return {
        icon: isRejected ? PROGRESS_ICONS.blocked : PROGRESS_ICONS.warn,
        shortText: segs.join(' · '),
        detailText: `status=${status}`
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

    case 'system': {
      switch (msg.subtype) {
        case 'api_retry': {
          const r = msg.retry || {};
          const segs = [];
          if (r.attempt != null) segs.push(`retry ${r.attempt}${r.maxRetries != null ? '/' + r.maxRetries : ''}`);
          if (r.reason) segs.push(r.errorStatus != null ? `${r.reason} (HTTP ${r.errorStatus})` : r.reason);
          if (r.delayMs != null) segs.push(`backoff ${Math.round(r.delayMs / 1000)}s`);
          return { icon: PROGRESS_ICONS.retry, shortText: segs.join(' · ') || 'api retry', detailText: '' };
        }
        default:
          return { icon: PROGRESS_ICONS.system, shortText: msg.subtype || 'Initializing...', detailText: '' };
      }
    }

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

    if (msg.type === 'llm_delta') {
      // Coalesced into ≤250ms / ≤50-token SSE frames; not logged per-token (firehose).
      pushDelta(sessionId, context, msg);
      return;
    }

    if (msg.type === 'llm_complete') {
      if (sessionId) flushDeltaBuffer(sessionId, context, { final: true });   // drain trailing partials before completion
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
            terminalReason: msg.terminalReason ?? null,
            structuredOutputPresent: msg.structuredOutputPresent ?? null,
            resultTextLength: msg.resultTextLength ?? null
          }
        });
      }
      return;
    }

    if (msg.type === 'llm_error') {
      if (sessionId) flushDeltaBuffer(sessionId, context, { final: true });   // drain trailing partials before the error
      // Same diagnostic envelope as llm_complete, plus the error context.
      // This is the data we lost on the 050926 and 050826 failures.
      const apiSec = msg.durationApiMs != null ? `api=${(msg.durationApiMs / 1000).toFixed(1)}s` : '';
      const stop = msg.stopReason ? `stop=${msg.stopReason}` : '';
      const sop = `structuredOutputPresent=${msg.structuredOutputPresent}`;
      const textLen = `resultTextLength=${msg.resultTextLength}`;
      const tokens = msg.usage?.output_tokens != null ? `out=${msg.usage.output_tokens}` : '';
      const summary = [apiSec, stop, sop, textLen, tokens].filter(Boolean).join(' ');
      console.log(`[${context}] [${msg.elapsed?.toFixed(1) || '?'}s ${summary}] ${PROGRESS_ICONS.error} Extraction failed: ${msg.error}`);

      if (sessionId) {
        progressEmitter.emitProgress(sessionId, {
          type: SSE_EVENT_TYPES.LLM_ERROR,
          timestamp,
          context,
          elapsed: msg.elapsed,
          error: msg.error,
          errorName: msg.errorName,
          schemaErrors: msg.schemaErrors,
          diagnostics: {
            stopReason: msg.stopReason ?? null,
            durationApiMs: msg.durationApiMs ?? null,
            numTurns: msg.numTurns ?? null,
            usage: msg.usage ?? null,
            apiErrorStatus: msg.apiErrorStatus ?? null,
            terminalReason: msg.terminalReason ?? null,
            structuredOutputPresent: msg.structuredOutputPresent ?? null,
            resultTextLength: msg.resultTextLength ?? null
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
  formatResetsIn,
  PROGRESS_ICONS,
  _resetDeltaBuffers
};

/**
 * llm-stream-logic.js — PURE reducer-transition helpers for the live LLM stream.
 *
 * Dual-export: window.Console.llmStreamLogic (browser; state.js delegates) AND
 * module.exports (node-env Jest). Per reports/CLAUDE.md, console logic is tested
 * ONLY by extracting it into a dual-export module and unit-testing in node-env.
 *
 * Owns the llmActivity lifecycle: preparing → thinking → writing → done|failed,
 * plus the unbounded eventLog (retires state.js's legacy progressMessages.slice(-49)).
 * No React, no window references except the guarded window.Console write.
 */
(function () {
  'use strict';

  let _seq = 0;

  function applyLlmStart(_prev, { label, model, startTime, prompt, systemPrompt }) {
    return {
      label: label || 'Processing',
      model: model || 'unknown',
      startTime: startTime ?? Date.now(),
      phase: 'preparing',
      streamText: '',
      tokenCount: 0,
      ttftMs: null,
      lastEventAt: startTime ?? Date.now(),
      error: null,
      prompt: prompt || null,
      systemPrompt: systemPrompt || null,
      response: null
    };
  }

  function applyLlmDelta(activity, { phase, deltaText, tokenCount, ttftMs, lastEventAt }) {
    const base = activity || applyLlmStart(null, { label: 'Processing', model: 'unknown', startTime: Date.now() });
    return {
      ...base,
      phase: phase || base.phase,
      streamText: base.streamText + (deltaText || ''),
      tokenCount: tokenCount != null ? tokenCount : base.tokenCount,
      ttftMs: base.ttftMs != null ? base.ttftMs : (ttftMs != null ? ttftMs : null),
      lastEventAt: lastEventAt != null ? lastEventAt : Date.now(),
      error: null
    };
  }

  function applyLlmComplete(state, { response, elapsed }) {
    const prev = state.llmActivity;
    return {
      lastLlmActivity: prev
        ? { ...prev, phase: 'done', response: response || null, completedElapsed: elapsed ?? null }
        : state.lastLlmActivity,
      llmActivity: null
    };
  }

  function applyLlmFailure(activity, { error }) {
    const base = activity || applyLlmStart(null, { label: 'Processing', model: 'unknown', startTime: Date.now() });
    return { ...base, phase: 'failed', error: error || 'LLM call failed' };
  }

  function appendEvent(eventLog, entry) {
    // No cap. The macro feed is a proper scrollable log (P5 design); the legacy
    // progressMessages.slice(-49) arbitrary cap is retired here.
    const list = Array.isArray(eventLog) ? eventLog : [];
    return [...list, { seq: _seq++, ts: Date.now(), ...entry }];
  }

  const PHASE_LABELS = {
    preparing: 'Preparing',
    thinking: 'Thinking',
    writing: 'Writing',
    done: 'Done',
    failed: 'Failed'
  };
  const PHASE_ORDER = ['preparing', 'thinking', 'writing', 'done'];

  function describePhase(phase) {
    return {
      key: phase,
      label: PHASE_LABELS[phase] || 'Processing',
      isError: phase === 'failed',
      isDone: phase === 'done'
    };
  }
  function phaseOrder() {
    return PHASE_ORDER.slice();
  }
  function isPhaseReached(currentPhase, candidatePhase) {
    const ci = PHASE_ORDER.indexOf(currentPhase);
    const pi = PHASE_ORDER.indexOf(candidatePhase);
    if (ci === -1 || pi === -1) return false;
    return pi <= ci;
  }

  /**
   * H10: build the event-log line for an SSE `llm_error`.
   *
   * app.js hardcoded "Extraction failed … (channel=text_fallback, …)" for every
   * one of these, so the two failures that actually strand a run — an expired
   * Claude Code token (subtype:success + is_error + HTTP 401) and any other
   * terminal SDK result error — reached the director described as a schema
   * problem. lib/llm/client.js emits llm_error on BOTH paths and names which via
   * `errorName`, so read it. The channel is only reported when the payload has
   * one (the llm_error diagnostics envelope in progress-bridge.js does not carry
   * `channel`; llm_complete does).
   *
   * @param {object|null} data - SSE llm_error payload
   * @returns {string}
   */
  function formatLlmErrorMessage(data) {
    const d = data || {};
    const label = d.errorName === 'StructuredOutputExtractionError'
      ? 'Extraction failed'
      : 'Model call failed';
    const channel = d.diagnostics && d.diagnostics.channel;
    return `${label}: ${d.error || 'unknown'}` + (channel ? ` (channel=${channel})` : '');
  }

  /**
   * H10: build the failure-card message for an SSE `failed` payload.
   *
   * The runner sends a deliberately generic `error` ('Internal server error') and
   * puts the thrown message — which already names the SDK subtype, the HTTP
   * status, the call label and the remedy — on `details`. app.js led with `error`,
   * so the director over the tunnel, who cannot read server logs, got only
   * "Internal server error" with the cause appended after an em dash if at all.
   * Lead with `details`.
   *
   * `errors` is an append-only channel: the LAST entry is the failure that ended
   * the run. app.js read [0], which on a revision loop is an earlier, survived
   * error.
   *
   * @param {object|null} data - SSE failed payload
   * @returns {string}
   */
  function formatFailureMessage(data) {
    const d = data || {};
    const list = Array.isArray(d.errors) ? d.errors : [];
    const last = list.length > 0 ? list[list.length - 1] : null;
    const lastMessage = last && typeof last === 'object' ? last.message : last;
    // String(): nothing guarantees `details` is a string, and a non-string headline
    // made .includes() below throw inside the failure handler — losing the failure.
    const headline = String(d.details || d.error || lastMessage || 'Workflow failed');
    const status = typeof d.apiErrorStatus === 'number' ? `HTTP ${d.apiErrorStatus}` : null;
    return status && !headline.includes(status) ? `${headline} (${status})` : headline;
  }

  /**
   * Run `fn`; if it rejects or throws, close `stream` before rethrowing.
   *
   * api.js opens the progress stream BEFORE it posts (the SSE-before-POST contract),
   * so between those two steps there is an open EventSource that only the caller
   * knows about. When the POST threw — a dropped request, or a tunnel 502/504 whose
   * non-JSON body makes res.json() reject — the throw propagated out of
   * approve/resume/rollback before app.js could track the stream: sseRef.current
   * stayed null, so nothing ever closed it, while it went on dispatching into the
   * SSE handler it was built with. A later 'complete' then drove CHECKPOINT_RECEIVED
   * into a console that had already shown the error.
   *
   * Closing is best-effort: a close() that throws must never replace the real cause.
   *
   * @param {{close: function}|null} stream - the EventSource (or any closeable)
   * @param {function(): (Promise|*)} fn
   * @returns {Promise<*>} fn's value
   */
  async function closeOnThrow(stream, fn) {
    try {
      return await fn();
    } catch (err) {
      if (stream && typeof stream.close === 'function') {
        try { stream.close(); } catch (closeErr) { /* the original error is what matters */ }
      }
      throw err;
    }
  }

  const api = {
    applyLlmStart,
    applyLlmDelta,
    applyLlmComplete,
    applyLlmFailure,
    formatLlmErrorMessage,
    formatFailureMessage,
    closeOnThrow,
    appendEvent,
    describePhase,
    phaseOrder,
    isPhaseReached
  };

  if (typeof window !== 'undefined') {
    window.Console = window.Console || {};
    window.Console.llmStreamLogic = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();

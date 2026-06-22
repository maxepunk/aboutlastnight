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

  const api = {
    applyLlmStart,
    applyLlmDelta,
    applyLlmComplete,
    applyLlmFailure,
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

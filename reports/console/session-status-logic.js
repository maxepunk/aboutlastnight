/**
 * session-status-logic — pure reducer fragments for terminal/error transitions.
 *
 * Dual-export (browser: window.Console.sessionStatusLogic; node: module.exports)
 * so the SET_ERROR contract can be unit-tested in node-env — the console has no
 * React/DOM harness (see reports/CLAUDE.md "Console has NO DOM/React test harness").
 *
 * UX-1: clearing `processing` on SET_ERROR is what stops the spinner when an
 * approve fails with an early 400 (which emits no SSE 'complete'/'failed').
 */
(function (root) {
  'use strict';

  function applySetError(state, message) {
    return { ...state, error: message, processing: false };
  }

  function applyClearError(state) {
    return { ...state, error: null };
  }

  const api = { applySetError, applyClearError };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Console = root.Console || {};
    root.Console.sessionStatusLogic = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);

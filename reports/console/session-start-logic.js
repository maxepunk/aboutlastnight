/**
 * session-start-logic.js — pure, dual-export logic for the Session screen.
 *
 * Browser: registers on window.Console.sessionStartLogic.
 * Node: module.exports (unit-tested in node-env; reports/CLAUDE.md console rule —
 *       no DOM/React harness, so pure logic lives here and the React component
 *       is a thin consumer verified manually).
 *
 * Owns the two decisions SessionStart makes BEFORE anything is spent:
 *
 *   isValidSessionId          — B9/H2 companion: the session ID is the session DATE
 *                               (MMDDYY, plus one digit for a second session that
 *                               day). The emailer builds each player's report link
 *                               from it and data/<id>/ + outputs/report-<id>.html are
 *                               named after it, so a free-form label silently splits
 *                               a session's artifacts. Mirrors server.js
 *                               isAllowedSessionId, whose route rejects the rest.
 *
 *   classifyCheckpointResponse — B9: "Resume" on a COMPLETE thread re-invoked the
 *                               graph from START. Every checkpoint's skip condition
 *                               was already satisfied, so it never paused: Notion
 *                               re-fetch, Haiku vision on every photo, Opus arcs,
 *                               outline, article, and an overwritten published
 *                               report — unattended, from one click on a button that
 *                               does not sound destructive. The old guard only
 *                               rejected a thread with no phase at all.
 */
(function () {
  'use strict';

  // Keep in lockstep with server.js SESSION_ID_PATTERN (console/__tests__/
  // session-start-logic.test.js reads both files and fails if they diverge).
  const SESSION_ID_PATTERN = /^\d{6}\d?$/;

  // The shape the /start route still accepts under ALLOW_NONSTANDARD_SESSION_ID.
  const NONSTANDARD_ID_PATTERN = /^[a-zA-Z0-9-]{1,30}$/;

  /**
   * @param {string} id - the typed session ID
   * @param {boolean} [allowNonstandard] - GET /api/config allowNonstandardSessionId
   * @returns {boolean} whether POST /start would accept this id
   */
  function isValidSessionId(id, allowNonstandard) {
    if (typeof id !== 'string' || id.length === 0) return false;
    if (SESSION_ID_PATTERN.test(id)) return true;
    return allowNonstandard === true && NONSTANDARD_ID_PATTERN.test(id);
  }

  /**
   * Classify a GET /api/session/:id/checkpoint response into the one action the
   * Session screen may take. Order matters:
   *
   *   error / no phase  -> 'not-found'      nothing has ever run under this id
   *   interrupted+payload -> 'at-checkpoint' load the checkpoint screen
   *   inProgress        -> 'in-progress'    a run is going; attach, never POST (H8)
   *   phase 'complete'  -> 'complete'       finished; resuming re-runs it all (B9)
   *   any other phase   -> 'resumable'      stopped mid-pipeline; resume is safe
   *
   * @param {object|null} resp
   * @returns {'not-found'|'at-checkpoint'|'in-progress'|'complete'|'resumable'}
   */
  function classifyCheckpointResponse(resp) {
    if (!resp || resp.error) return 'not-found';
    if (resp.interrupted && resp.checkpoint) return 'at-checkpoint';
    if (resp.inProgress === true) return 'in-progress';
    if (resp.currentPhase === 'complete') return 'complete';
    if (resp.currentPhase) return 'resumable';
    return 'not-found';
  }

  // H3: the order the graph actually interrupts in — the plain addEdge chain from
  // detectWhiteboard onward (lib/workflow/graph.js:539-568). `input-review` fires
  // INSIDE parseRawInput, which the graph reaches from checkpointAwaitContext, so it
  // is FIFTH, not first. It sat first in console/utils.js, which put the stepper out
  // of step with the run for its whole length: it reported the wrong position and
  // PipelineProgress offered the wrong rollback targets. The list lives here rather
  // than in utils.js only because utils.js touches `window` at load and so cannot be
  // required in node-env; utils.js republishes it. Pinned by
  // __tests__/unit/console-checkpoint-order.test.js against graph.js itself.
  const CHECKPOINT_ORDER = [
    'paper-evidence-selection',
    'await-roster',
    'character-ids',
    'await-full-context',
    'input-review',
    'pre-curation',
    'evidence-and-photos',
    'arc-selection',
    'outline',
    'article'
  ];

  const api = {
    isValidSessionId,
    classifyCheckpointResponse,
    SESSION_ID_PATTERN,
    CHECKPOINT_ORDER
  };

  if (typeof window !== 'undefined') {
    window.Console = window.Console || {};
    window.Console.sessionStartLogic = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();

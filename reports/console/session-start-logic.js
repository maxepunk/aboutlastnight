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
 *
 *   startFreshDecision        — C1: "Start Fresh" on an id that already has state
 *                               discarded it without asking, and re-seeded the run
 *                               from a rollback list that kept the old photos,
 *                               roster and parse. Ask first; the route 409s without
 *                               `force: true` either way.
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

  /**
   * What "Start Fresh" may do, given what GET /checkpoint says about the id (C1).
   *
   * Start Fresh POSTed /start unconditionally, and /start seeded its initial state
   * from buildRollbackState('input-review') — a list that deliberately preserves
   * everything upstream of the parse, plus the photo channels. So the most likely
   * action after a mistake (start over on the same session date) silently kept the
   * old photo list, the old roster and the old parse: the run paused once, at
   * input-review, showing them, and the newly typed photosPath was never read.
   *
   * The route refuses an existing thread now (409 unless the body says
   * `force: true`). This is the screen's half of that contract, so the question is
   * asked BEFORE anything is discarded rather than reported as an error after.
   *
   *   'go'          - nothing has ever run under this id; start
   *   'confirm'     - the id has state (paused, stopped, or complete); ask first,
   *                   then re-POST with force:true
   *   'not-allowed' - a run holds the session lock; a start would 409 on it, and
   *                   re-seeding state under a running graph is not a choice worth
   *                   offering
   *
   * @param {object|null} checkpointResponse - GET /api/session/:id/checkpoint body
   * @returns {'go'|'confirm'|'not-allowed'}
   */
  function startFreshDecision(checkpointResponse) {
    switch (classifyCheckpointResponse(checkpointResponse)) {
      case 'not-found': return 'go';
      case 'in-progress': return 'not-allowed';
      default: return 'confirm';
    }
  }

  /**
   * What the attach watchdog should do after re-reading GET /checkpoint.
   *
   * Attaching sets processing:true and rides a stream that may never speak again:
   * progressEmitter fires `complete` ONCE, to whoever is connected at that instant,
   * so a run that ended between the /checkpoint read (or the lock 409) and the
   * handshake leaves the console spinning with no Retry — that button only appears
   * while llmActivity.phase === 'failed'. And `inProgress` is only
   * isSessionLocked(id); lib/api-background-runner.js:58 documents a stuck lock as a
   * real failure mode, so without this the wait can be permanent.
   *
   *   'load-checkpoint' - the run paused; render it (SET_THEME first) and close
   *   'complete'        - it finished unheard; show the completion
   *   'keep-waiting'    - the lock is still held; hold the stream, log once
   *   'stranded'        - nothing running, nothing paused, nothing finished
   *
   * Note the deliberate difference from classifyCheckpointResponse: 'resumable'
   * means "safe to resume" when the director asked for a session, but for a stream
   * we are ALREADY attached to it means the run vanished without a checkpoint.
   *
   * @param {object|null} resp - GET /api/session/:id/checkpoint response
   * @returns {'load-checkpoint'|'complete'|'keep-waiting'|'stranded'}
   */
  function decideAttachFallback(resp) {
    switch (classifyCheckpointResponse(resp)) {
      case 'at-checkpoint': return 'load-checkpoint';
      case 'in-progress': return 'keep-waiting';
      case 'complete': return 'complete';
      default: return 'stranded';
    }
  }

  /**
   * The report links a COMPLETE session should be offered instead of a Resume.
   *
   * Always offers the conventional path. A recorded outcome that names a DIFFERENT
   * file is offered alongside it rather than instead of it: B1 (parseRawInput
   * overwriting the sessionId channel) published session 071126's report as
   * report-0711.html, and the director needs to see that mismatch rather than a 404.
   *
   * buildOutcomeRecord stores `outputPath` (an absolute filesystem path) and not
   * `htmlUrl`, so derive the servable URL from its basename when htmlUrl is absent.
   *
   * @param {string} sessionId
   * @param {object|null} lastOutcome - GET /checkpoint lastOutcome
   * @returns {string[]} servable URLs, conventional path first
   */
  function buildReportLinks(sessionId, lastOutcome) {
    if (typeof sessionId !== 'string' || sessionId.length === 0) return [];
    const links = ['/outputs/report-' + sessionId + '.html'];
    const outcome = lastOutcome || {};
    if (outcome.outcome !== 'complete') return links;

    let recorded = outcome.htmlUrl || null;
    if (!recorded && typeof outcome.outputPath === 'string' && outcome.outputPath) {
      const basename = outcome.outputPath.split(/[\\/]/).pop();
      if (basename) recorded = '/outputs/' + basename;
    }
    if (recorded && links.indexOf(recorded) === -1) links.push(recorded);
    return links;
  }

  /**
   * The `completedResult` for a session that is already finished.
   *
   * Task 2 review finding 3 (ruled): a completed session has NO checkpoint, so
   * neither rollback opener could be reached for it — `GET /checkpoint` returns
   * `checkpoint: null` and both openers require `state.checkpointType`. Yet
   * re-running the article or the outline of a finished session with a note is a
   * real need; the baseline shows sessions republished after edits. Loading the
   * completion view for it (with the stepper above) is what makes the existing
   * RollbackPanel flow reachable.
   *
   * There is no SSE completion payload on this path, so everything CompletionView
   * needs is rebuilt from the response: the recorded outcome (in-memory, so null
   * after a server restart) plus a SERVABLE `htmlUrl` derived from the session id.
   * `sessionId` and `currentPhase` are stamped last so a stale recorded value
   * cannot override them.
   *
   * @param {object|null} checkpointResponse - GET /api/session/:id/checkpoint body
   * @param {string} [fallbackSessionId] - when the response carries no sessionId
   * @returns {object|null}
   */
  function completedResultFrom(checkpointResponse, fallbackSessionId) {
    const resp = checkpointResponse || {};
    const sessionId = resp.sessionId || fallbackSessionId || null;
    if (typeof sessionId !== 'string' || sessionId.length === 0) return null;
    const links = buildReportLinks(sessionId, resp.lastOutcome);
    return {
      ...(resp.lastOutcome || {}),
      sessionId: sessionId,
      currentPhase: 'complete',
      htmlUrl: links[links.length - 1] || null
    };
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
    startFreshDecision,
    decideAttachFallback,
    buildReportLinks,
    completedResultFrom,
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

/**
 * API Helpers - Shared utilities extracted from server.js
 *
 * DRY extraction of 3 patterns duplicated across server.js endpoints:
 * - buildRollbackState: Builds state object for rollback operations (4 instances)
 * - createGraphAndConfig: Creates graph + config for write endpoints (4 instances)
 * - sendErrorResponse: Sanitized 500 error responses (13 instances)
 *
 * Phase 2: API Surface Separation
 */

const path = require('path');
const { createReportGraphWithCheckpointer } = require('./workflow/graph');
const {
  ROLLBACK_CLEARS,
  ROLLBACK_COUNTER_RESETS,
  FRESH_START_CLEARS,
  PHASES,
  STALE_VERDICT_REASONS
} = require('./workflow/state');
const { OLD_SHAPES_WEAVE_CHANNELS } = require('./old-thread');

/**
 * Channels whose reducer needs `[]` (not null) to clear.
 *
 * appendReducer and appendSingleReducer both special-case an empty array as the
 * clear sentinel and IGNORE null, so nulling one of these leaves the old array in
 * place. Shared by buildRollbackState and buildFreshStartState.
 */
const APPEND_REDUCER_FIELDS = new Set(['evaluationHistory', 'errors']);

/** null for a replace channel, [] for an append channel. */
function clearedValueFor(field) {
  return APPEND_REDUCER_FIELDS.has(field) ? [] : null;
}

/**
 * Build state object for rolling back to a checkpoint.
 * Clears all fields from the rollback point forward and resets revision counters.
 *
 * It also INVALIDATES the evaluations the rollback makes stale (I1). `evaluatePhase`
 * skip logic 2 reads the most recent history entry for the phase and returns early
 * when it is `ready: true`, which it is on every real session — and the outline and
 * article rollback points deliberately preserve `evaluationHistory`. So a rollback
 * to `article` regenerated the article and then skipped both the Opus evaluation
 * AND the programmatic fact-check that gates it: the article gate opened with
 * `factCheck: null` beside the previous article's green verdict.
 *
 * @param {string} [rollbackPoint='input-review'] - Valid rollback point name
 * @returns {object} State object with cleared fields and reset counters
 */
function buildRollbackState(rollbackPoint = 'input-review') {
  if (!ROLLBACK_CLEARS[rollbackPoint]) {
    throw new Error(`Invalid rollback point: '${rollbackPoint}'`);
  }
  const state = {};
  ROLLBACK_CLEARS[rollbackPoint].forEach(field => {
    state[field] = clearedValueFor(field);
  });
  Object.assign(state, ROLLBACK_COUNTER_RESETS[rollbackPoint]);
  state.currentPhase = null;

  const stubs = buildEvaluationInvalidationStubs(rollbackPoint);
  if (stubs.length > 0) {
    state.evaluationHistory = stubs;
  }
  return state;
}

/**
 * The channels a rollback can clear: each point's own list (ROLLBACK_CLEARS), and the weave's
 * channels an old-shape thread's rollback to the meeting clears beyond its point's list
 * (lib/old-thread.js OLD_SHAPES_WEAVE_CHANNELS; brief 1G). A seed's other keys are what the
 * rollback writes for the run, never a clear: `currentPhase`, which every seed nulls so the graph
 * routes from the point, and the stashes that pre-fill a stop (`_previousFullContext`,
 * `_previousPhotosPath`).
 */
const ROLLBACK_CLEARABLE = new Set([...Object.values(ROLLBACK_CLEARS).flat(), ...OLD_SHAPES_WEAVE_CHANNELS]);

/**
 * What a rollback's seed actually clears (fix round 3): each channel a rollback can clear that the
 * seed sets to its cleared value (clearedValueFor), in the seed's order. The seed is all the
 * rollback writes into the thread: buildRollbackState's, an old thread's own
 * (oldThreadRollbackState) and the request's overrides. The SSE's `fieldsCleared` lists it, and the
 * stops log reads from it whether the rollback wrote a stop's output again (lib/stops-log.js
 * rewritesStop): an old-shape thread rolled back to the meeting has its weave cleared beyond the
 * point's list, so the fresh meeting it reaches is a new pause, in round 1 again.
 *
 * @param {Object} seed - the rollback's initial state, as server.js invokes the graph with it
 * @returns {string[]}
 */
function rollbackSeedClears(seed) {
  const s = seed && typeof seed === 'object' ? seed : {};
  return Object.keys(s).filter((field) => {
    if (!ROLLBACK_CLEARABLE.has(field)) return false;
    const cleared = clearedValueFor(field);
    return Array.isArray(cleared) ? Array.isArray(s[field]) && s[field].length === 0 : s[field] === null;
  });
}

/**
 * The phases whose evaluations a rollback point invalidates with a stub, where the point
 * keeps the history (buildEvaluationInvalidationStubs). The note pruning reads a table of
 * its own, STOPS_INVALIDATED_BY (brief 4.5): the meeting's point prunes the notes and
 * writes no stub, since it clears the history.
 */
const PHASES_INVALIDATED_BY = {
  // The photo branch (photo late-join) preserves evaluationHistory the way the
  // outline point does — the arc verdict is upstream and still valid — and
  // regenerates the article, so its evaluation is invalidated (R2/M1). Phase 4 (brief
  // 4.6; spec 15): the outline's stubs went with the outline judge.
  photos: ['article'],
  'character-ids': ['article'],
  outline: ['article'],
  article: ['article']
};

/**
 * The stops whose content a rollback point regenerates, for the note pruning (spec
 * 2026-09-19 §5.4; brief 4.5): pruneGateNotes drops each of their rejection notes, and the
 * server's rollback handler prunes at exactly these points. A table of its own, apart from
 * the evaluation stubs (PHASES_INVALIDATED_BY): going back to the story meeting (R9) keeps
 * the meeting's notes and prunes the map's and the article's, and writes no stub, because
 * that point clears the whole history. The points above the meeting clear the notes
 * outright (ROLLBACK_CLEARS).
 */
const STOPS_INVALIDATED_BY = {
  'arc-selection': ['outline', 'article'],
  photos: ['outline', 'article'],
  'character-ids': ['outline', 'article'],
  outline: ['outline', 'article'],
  article: ['article']
};

/**
 * The `ready: false` stubs a rollback to `rollbackPoint` appends (I1).
 *
 * Only the points that REGENERATE evaluated output need them, and only where the
 * point does not already empty the whole history:
 *   - `arc-selection` and everything upstream of it list `evaluationHistory` in
 *     ROLLBACK_CLEARS, so the history is emptied and no phase can skip. No stub,
 *     and none is emitted, so the `[]` clear stands. The meeting's point (brief 4.5)
 *     keeps the weave and its fact-check mark, which the fact check skips by, so the
 *     cleared history costs no call there, and the map and the article are judged again.
 *   - `outline` preserves the history (it may hold useful arc evaluations) and
 *     regenerates the article, so the article is invalidated. (It invalidated the
 *     outline's too, until the outline judge left in phase 4, brief 4.6; appending two
 *     entries in one update is why appendSingleReducer spreads an array.)
 *   - `article` preserves the history and regenerates only the article.
 *
 * The stub is a history entry, not a deletion: the previous verdict stays on the
 * record (the console's RevisionDiff and lastEvaluationFor both read this array),
 * and `source: 'rollback'` says why the phase is being evaluated again.
 *
 * @param {string} rollbackPoint
 * @returns {Array<object>} stub entries, appended via appendSingleReducer
 */
function buildEvaluationInvalidationStubs(rollbackPoint) {
  const timestamp = new Date().toISOString();
  return (PHASES_INVALIDATED_BY[rollbackPoint] || []).map(phase => ({
    phase,
    ready: false,
    reason: STALE_VERDICT_REASONS.ROLLBACK,
    source: 'rollback',
    timestamp
  }));
}

/**
 * The director's gate notes that survive a rollback to `rollbackTo` (spec 2026-09-19 §5.4).
 *
 * A rollback to the story meeting or into the map and article region regenerates content
 * the later notes described, so those notes are dropped; the meeting's notes always
 * survive. Points OUTSIDE STOPS_INVALIDATED_BY are not pruned here — they clear the whole
 * channel through ROLLBACK_CLEARS — so this returns every note unchanged for them,
 * and the rollback handler must check membership before writing (a write of "all
 * notes" would undo the list's clear).
 *
 * @param {Array|null} notes - state.directorGateNotes
 * @param {string} rollbackTo
 * @returns {Array} survivors (a new array)
 */
function pruneGateNotes(notes, rollbackTo) {
  const list = (Array.isArray(notes) ? notes : []).filter((n) => n && typeof n === 'object');
  const invalidated = new Set(STOPS_INVALIDATED_BY[rollbackTo] || []);
  if (invalidated.size === 0) return list.slice();
  // Phase 1 (final review I1): a rejection note at an invalidated stop was about work
  // the rollback throws away, so it goes; an approval note is forward guidance for
  // whatever writer comes next, which is exactly the writer this rollback creates.
  return list.filter((n) => !invalidated.has(n.gate) || n.kind === 'approval');
}

/**
 * Build the state object a FRESH START seeds (C1).
 *
 * Distinct from buildRollbackState by intent: a rollback preserves the work
 * upstream of its point, a fresh start keeps nothing but `theme`, `sessionId` and
 * the new `rawSessionInput` (which the caller supplies). `/start` used to seed
 * `buildRollbackState('input-review')`, so a second start on an existing session
 * id kept the old photo list, roster, raw context and parse, and paused once at
 * input-review showing them. See FRESH_START_CLEARS.
 *
 * Reducer-aware exactly as buildRollbackState is: `[]` for the append channels,
 * null for the rest. The revision counters are nulled rather than zeroed, which
 * every reader tolerates (`state.xRevisionCount || 0`).
 *
 * @returns {object} State object with every non-kept channel cleared
 */
function buildFreshStartState() {
  const state = {};
  FRESH_START_CLEARS.forEach(field => {
    state[field] = clearedValueFor(field);
  });
  return state;
}

/**
 * Create a LangGraph instance and config object for write endpoints.
 *
 * NOTE: promptBuilder is intentionally NOT injected via config.
 * AI nodes create per-theme PromptBuilder instances from state.theme,
 * ensuring detective sessions get detective prompts (not the shared journalist one).
 * The shared promptBuilder in server.js is only used for startup validation.
 *
 * @param {string} sessionId - Session identifier
 * @param {string} [theme='journalist'] - Report theme
 * @param {object} options - Shared server instances
 * @param {object} options.checkpointer - MemorySaver checkpointer
 * @returns {{ graph: object, config: object }} Graph instance and execution config
 */
function createGraphAndConfig(sessionId, theme = 'journalist', { checkpointer }) {
  const graph = createReportGraphWithCheckpointer(checkpointer);
  const config = {
    configurable: {
      sessionId,
      theme,
      thread_id: sessionId
    }
  };
  return { graph, config };
}

/**
 * Send a sanitized 500 error response. Logs full error details server-side
 * but only returns generic error message to the client.
 *
 * @param {object} res - Express response object
 * @param {string|null} sessionId - Session ID (null for non-session errors)
 * @param {Error} error - The caught error
 * @param {string} context - Human-readable context for logging (e.g., 'POST /api/session/1221/start')
 */
function sendErrorResponse(res, sessionId, error, context) {
  console.error(`[${new Date().toISOString()}] ${context}:`, error);
  const response = { error: 'Internal server error' };
  if (sessionId) {
    response.sessionId = sessionId;
    response.currentPhase = PHASES.ERROR;
    response.details = `${context}. Check server logs.`;
  }
  res.status(500).json(response);
}

/**
 * Resolve `requestedPath` and verify it stays within `baseDir`.
 * Throws if the path escapes the permitted directory (../, absolute
 * elsewhere, or a sibling-prefix bypass like `data-evil`).
 *
 * NOTE (SEC-A-2): does NOT resolve symlinks (no fs.realpathSync), so a symlink
 * placed inside baseDir that points outside would pass. Safe here because this
 * is a single-tenant console where data/ holds only server-created session dirs
 * and is never attacker-writable. If data/ could ever accept untrusted writes,
 * add an fs.realpathSync.native re-check on `resolved` before returning (guard
 * ENOENT for not-yet-created write targets).
 *
 * @param {string} baseDir - Absolute directory the result must live under
 * @param {string} requestedPath - Caller-supplied (untrusted) path
 * @returns {string} The resolved absolute path, guaranteed within baseDir
 */
function confineToBase(baseDir, requestedPath) {
  if (!requestedPath) {
    throw new Error('Missing path');
  }
  const root = path.resolve(baseDir);
  const resolved = path.resolve(root, requestedPath);
  // Append the platform separator so `/data` does not match `/data-evil`.
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    throw new Error(`Path is outside the permitted directory: ${requestedPath}`);
  }
  return resolved;
}

/**
 * The director's notes a rollback writes (spec 2026-09-19 §5.4; brief 4.5): at a point
 * that regenerates later stops (STOPS_INVALIDATED_BY), the notes pruneGateNotes keeps; at
 * any other point, nothing. The points above the meeting clear the channel through
 * ROLLBACK_CLEARS, and a write of "all notes" there would undo that clear. The server's
 * rollback handler applies it.
 *
 * @param {string} rollbackTo
 * @param {Array|null|undefined} notes - state.directorGateNotes before the rollback
 * @returns {{directorGateNotes: Object[]}|{}}
 */
function rollbackNotesUpdate(rollbackTo, notes) {
  return Object.prototype.hasOwnProperty.call(STOPS_INVALIDATED_BY, rollbackTo)
    ? { directorGateNotes: pruneGateNotes(notes, rollbackTo) }
    : {};
}

module.exports = {
  buildRollbackState,
  rollbackSeedClears,
  buildFreshStartState,
  createGraphAndConfig,
  sendErrorResponse,
  confineToBase,
  pruneGateNotes,
  rollbackNotesUpdate,
  PHASES_INVALIDATED_BY,
  STOPS_INVALIDATED_BY
};

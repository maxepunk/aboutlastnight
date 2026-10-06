/**
 * The stops log (phase 4, briefs 4.12a and 4.12c; R8; spec section 13): `data/<id>/stops.jsonl`,
 * one JSON line per event, which the next session's readout reads beside the approved weave, map
 * and article and the call log, to count what the pipeline asked of the director: how many times
 * it called them back, and how much they read at each return.
 *
 * Two kinds of line:
 * - a pause, `{at, kind: 'pause', stop, round, words}`, each time a run pauses at a new stop or
 *   at a new round of one. `words` is what the stop shows, counted over its view models' page
 *   (lib/stop-pages.js wordsShown), or null at a stop with no page. A run that arrives where the
 *   log's last line already has the director, the same stop in the same round (a /resume replay,
 *   a rollback that reopens the stop they are at), is no new pause. Two pauses always are:
 *   - the first pause of a fresh start, whose line also carries `fresh: true`, since /start with
 *     `force` appends to the run it replaced and the readout measures the run from that line;
 *   - a pause after a rollback that wrote the stop's output again (rewritesStop): a rollback to
 *     the article writes a new article from the map and starts its rounds over (R9), so the
 *     director returns to a new article in round 1 again, and an old-shape thread's rollback to
 *     the meeting writes the weave fresh (brief 1G), so the director returns to a new meeting.
 * - an action, `{at, kind: 'action', stop, round, action}`, for each action the director takes:
 *   approve, reweave or send back, read from the resume the server builds (actionOf), in the
 *   round the stop was in when they took it.
 * `round` is the stop's round, lib/workflow/state.js stopRoundOf, the round each of the
 * director's notes records as `stopRound`.
 * `at` is kept only to order the lines and to join the call log (llm-log/index.jsonl), never to
 * time the director: the readout reports no time at a stop (spec, Decisions).
 *
 * The server writes it (server.js /start, and lib/api-background-runner.js for /approve, /resume
 * and /rollback, which hands the runner what its seed cleared, lib/api-helpers.js
 * rollbackSeedClears). As the call log does, it
 * writes nothing under Jest until a test sets its root, and it never throws into a run: a line
 * it cannot write is warned once, and a page it cannot count is recorded with no words and
 * warned, since a missing line must never cost the director a stop.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { stopRoundOf } = require('./workflow/state');
const { CHECKPOINT_TYPES } = require('./workflow/checkpoint-helpers');
const { MEETING_ROUNDS } = require('./weave');
const { wordsShown } = require('./stop-pages');

/**
 * The channel that holds what each stop shows of a run's work: the parse, the paper evidence,
 * the preprocessed evidence, the curated bundle, the weave, the photo analyses, the map and the
 * article. The stops that collect the director's input (the roster, the full context, the photo
 * folder) show none.
 */
const STOP_OUTPUTS = Object.freeze({
  [CHECKPOINT_TYPES.INPUT_REVIEW]: 'sessionConfig',
  [CHECKPOINT_TYPES.PAPER_EVIDENCE_SELECTION]: 'paperEvidence',
  [CHECKPOINT_TYPES.PRE_CURATION]: 'preprocessedEvidence',
  [CHECKPOINT_TYPES.EVIDENCE_AND_PHOTOS]: 'evidenceBundle',
  [CHECKPOINT_TYPES.ARC_SELECTION]: 'weave',
  [CHECKPOINT_TYPES.CHARACTER_IDS]: 'photoAnalyses',
  [CHECKPOINT_TYPES.OUTLINE]: 'outline',
  [CHECKPOINT_TYPES.ARTICLE]: 'contentBundle'
});

/**
 * Whether a rollback wrote a stop's output again: the rollback's seed cleared the channel that
 * holds what the stop shows, so the run writes it anew. It reads what the seed actually cleared
 * (lib/api-helpers.js rollbackSeedClears; fix round 3), never the point's list alone: a rollback
 * to the article clears the article; a rollback to the map or the story meeting reopens its stop
 * as the director left it (R9) and clears neither, but an old-shape thread's rollback to the
 * meeting clears its weave beyond the point's list (lib/old-thread.js oldThreadRollbackState), and
 * the meeting it reaches is new.
 *
 * @param {string[]|null} cleared - the channels the rollback's seed cleared, or null for no rollback
 * @param {string} stop - the stop the run paused at
 * @returns {boolean}
 */
function rewritesStop(cleared, stop) {
  if (!Array.isArray(cleared)) return false;
  if (!Object.prototype.hasOwnProperty.call(STOP_OUTPUTS, stop)) return false;
  return cleared.includes(STOP_OUTPUTS[stop]);
}

const DEFAULT_ROOT = path.resolve(__dirname, '..', 'data');

let logRoot = null;
let explicitlyEnabled = false;
let warned = false;

/** Points the log at a root, and enables it under Jest (a test's temp folder). */
function setStopsLogRoot(dir) {
  logRoot = dir;
  explicitlyEnabled = true;
  warned = false;
}

function _resetForTests() {
  logRoot = null;
  explicitlyEnabled = false;
  warned = false;
}

function isEnabled() {
  return !(process.env.JEST_WORKER_ID && !explicitlyEnabled);
}

/** Where a session's log is: `<root>/<id>/stops.jsonl`, the root being the server's data folder. */
function stopsLogPath(sessionId) {
  return path.join(logRoot || DEFAULT_ROOT, String(sessionId), 'stops.jsonl');
}

/**
 * The director's action, from the resume the server built for it (server.js buildResumePayload):
 * the story meeting's round (reweave or send-back), a send-back at any other stop
 * (`approved: false`), or an approve.
 *
 * @param {Object} resume
 * @returns {'approve'|'reweave'|'send-back'}
 */
function actionOf(resume) {
  const r = resume && typeof resume === 'object' ? resume : {};
  if (MEETING_ROUNDS.includes(r.round)) return r.round;
  return r.approved === false ? 'send-back' : 'approve';
}

function warnOnce(err, where) {
  if (warned) return;
  warned = true;
  console.warn(`[stops-log] first write failure at ${where}: ${err && (err.code || err.message)} (later write failures are silent; the log keeps trying)`);
}

/** The log's last line, or null when it has none. */
function lastLine(file) {
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.trim());
  if (lines.length === 0) return null;
  try {
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
}

function append(file, line) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(line)}\n`);
}

/** The words a stop shows, or null when it has no page or its page could not be built (said, not thrown). */
function wordsAt(stop, data, theme) {
  try {
    return wordsShown(stop, data, { theme });
  } catch (err) {
    console.warn(`[stops-log] the words at ${stop} were not counted: ${err.message}`);
    return null;
  }
}

/**
 * A pause: a line when the run paused at a new stop or a new round of one, at the first pause of
 * a fresh start, and after a rollback that wrote the stop's output again.
 *
 * @param {string} sessionId
 * @param {Object} pause
 * @param {string} pause.stop - the stop type the run paused at
 * @param {Object} pause.state - the thread's state values at the pause
 * @param {Object} pause.data - the stop's payload, as the server sends it
 * @param {boolean} [pause.fresh] - true for the first pause of a fresh start, which is always new
 *   and is marked `fresh: true` on its line
 * @param {string[]|null} [pause.rollbackClears] - the channels the rollback's seed cleared, when the
 *   run was a rollback's (rewritesStop decides from them whether it wrote the stop's output again)
 */
function recordPause(sessionId, { stop, state, data, fresh = false, rollbackClears = null }) {
  if (!sessionId || !stop || !isEnabled()) return;
  const file = stopsLogPath(sessionId);
  try {
    const round = stopRoundOf(stop, state);
    const last = fresh || rewritesStop(rollbackClears, stop) ? null : lastLine(file);
    if (last && last.kind === 'pause' && last.stop === stop && last.round === round) return;
    const theme = (state && state.theme) || 'journalist';
    append(file, {
      at: new Date().toISOString(), kind: 'pause', stop, round, words: wordsAt(stop, data, theme),
      ...(fresh && { fresh: true })
    });
  } catch (err) {
    warnOnce(err, file);
  }
}

/**
 * An action: one line for each action the director takes at a stop.
 *
 * @param {string} sessionId
 * @param {Object} action
 * @param {string} action.stop - the stop the director acted at
 * @param {Object} action.state - the thread's state values when they acted
 * @param {Object} action.resume - the resume the server built from their payload
 */
function recordAction(sessionId, { stop, state, resume }) {
  if (!sessionId || !stop || !isEnabled()) return;
  const file = stopsLogPath(sessionId);
  try {
    append(file, { at: new Date().toISOString(), kind: 'action', stop, round: stopRoundOf(stop, state), action: actionOf(resume) });
  } catch (err) {
    warnOnce(err, file);
  }
}

module.exports = {
  stopsLogPath,
  actionOf,
  STOP_OUTPUTS,
  rewritesStop,
  recordPause,
  recordAction,
  setStopsLogRoot,
  _resetForTests
};

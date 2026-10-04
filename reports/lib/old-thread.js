/**
 * Threads from before the story meeting (phase 4, task 4.11; R2; spec section 15).
 *
 * A thread started before phase 4 holds no weave: its arc stage wrote arcs, and its
 * outline stage an outline, in shapes the new stages never read. Replaying such a thread
 * past the arc stop would run the new stages on the old shapes (the map writer skips on
 * an old outline, for one) and spend paid calls the director never asked for. The server
 * refuses it, and tells the director to roll back to the story meeting, which keeps the
 * parse, the curation and the photos and writes the weave fresh.
 *
 * A thread is old when it holds no weave and the old stages took it past the arc writer: it
 * is paused at the meeting's stop or a later one in the console's CHECKPOINT_ORDER, it is
 * complete, or it holds what only a stage past the arc writer writes (PAST_THE_ARC_WRITER):
 * an evaluation, a rework's count, an outline or an article. The last covers a thread at no
 * stop, one that stopped on an error or whose run was killed (fix rounds 1 and 2), wherever
 * the old stages left it:
 * - the old arc stage evaluated its arcs before the arc stop opened, so a thread stopped
 *   anywhere past that stop, from the photo branch on, holds an evaluation;
 * - every rework counted itself before it ran, so a thread that stopped in one holds its
 *   count, the old outline rework's included, though that rework emptied the outline first
 *   and its catch left it empty;
 * - a thread that stopped after the old outline or article was written holds it, and the
 *   map writer and the article writer each skip on any.
 * A resume replayed such a thread from START into a fresh meeting and then ran the new
 * stages on the old stages' work: the map's stop opened on the old outline, or on a fresh
 * map with the old outline stage's note, edits, trace and counts, and the old arc stage's
 * counts spent the fresh weave's check rework.
 *
 * A thread of the new code holds none of them without a weave: the arc writer writes the
 * weave or throws, every evaluation and rework after it runs on the weave, the fresh start,
 * every rollback that clears the weave and an old thread's rollback to the meeting leave
 * none of them, and the stub a rollback writes is no evaluation
 * (lib/__tests__/old-thread.test.js holds this). A thread with no weave that holds none of
 * them is resumed, and its resume writes the weave: a new thread before its weave, an old
 * thread rolled back to the meeting before its weave is written, or an old thread that
 * stopped before its arc stage evaluated anything.
 *
 * server.js applies it: /approve, /resume and every /rollback past the meeting answer 409
 * with OLD_THREAD_MESSAGE, and GET /checkpoint carries the flag, which the console shows
 * before any stop renders (console/checkpoint-view-logic.js oldThreadView).
 */
'use strict';

const { CHECKPOINT_ORDER } = require('../console/session-start-logic');
const { CHECKPOINT_TYPES } = require('./workflow/checkpoint-helpers');
const { PHASES } = require('./workflow/state');
const { isWeave } = require('./weave');

/** What the director is told, on every refusal and in the flag. */
const OLD_THREAD_MESSAGE = 'This session was started before the story meeting. Roll back to the story meeting to continue.';

/** The stop an old thread goes back to: the story meeting (the stop types keep their names, R3). */
const OLD_THREAD_ROLLBACK = CHECKPOINT_TYPES.ARC_SELECTION;

const MEETING_INDEX = CHECKPOINT_ORDER.indexOf(OLD_THREAD_ROLLBACK);

/** The rollback points open to an old thread: the story meeting and every point before it, in the stop order. */
const OLD_THREAD_ROLLBACK_POINTS = Object.freeze(CHECKPOINT_ORDER.slice(0, MEETING_INDEX + 1));

/**
 * The channels only a stage past the arc writer fills: the evaluations, the six rework
 * counts, the outline (the map's channel) and the article. The header says why each old
 * thread past the arc writer holds one, and why a thread of the new code holds none without
 * a weave.
 */
const PAST_THE_ARC_WRITER = Object.freeze([
  'evaluationHistory',
  'arcRevisionCount', 'humanArcRevisionCount',
  'outlineRevisionCount', 'humanOutlineRevisionCount',
  'articleRevisionCount', 'humanArticleRevisionCount',
  'outline', 'contentBundle'
]);

/**
 * Whether an entry in the evaluations is a rollback's stub (lib/api-helpers.js
 * buildRollbackState): it marks a verdict stale and is no evaluation. A rollback past the
 * meeting writes one into any thread, a new thread before its weave included, since the
 * route takes any point for a thread that is not old.
 *
 * @param {*} entry
 * @returns {boolean}
 */
function isRollbackStub(entry) {
  return Boolean(entry) && entry.source === 'rollback';
}

/**
 * Whether the thread holds anything in one of those channels. An empty list, a zero and a
 * missing value hold nothing, and neither does a rollback's stub; any other value counts, as
 * the map writer and the article writer each skip on any.
 *
 * @param {Object} state
 * @param {string} channel - one of PAST_THE_ARC_WRITER
 * @returns {boolean}
 */
function holds(state, channel) {
  const value = channel === 'evaluationHistory' && Array.isArray(state[channel])
    ? state[channel].filter((entry) => !isRollbackStub(entry))
    : state[channel];
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

/**
 * The flag for a thread from before the story meeting, or null for any other thread.
 *
 * @param {Object|undefined} values - the thread's state values
 * @param {string|null} pausedAt - the stop the thread is paused at (its interrupt's type), or null
 * @returns {{message: string, rollbackTo: string, rollbackPoints: string[]}|null}
 */
function oldThreadOf(values, pausedAt) {
  const state = values || {};
  if (isWeave(state.weave)) return null;
  const pastTheArcWriter = state.currentPhase === PHASES.COMPLETE
    || CHECKPOINT_ORDER.indexOf(pausedAt) >= MEETING_INDEX
    || PAST_THE_ARC_WRITER.some((channel) => holds(state, channel));
  if (!pastTheArcWriter) return null;
  return { message: OLD_THREAD_MESSAGE, rollbackTo: OLD_THREAD_ROLLBACK, rollbackPoints: [...OLD_THREAD_ROLLBACK_POINTS] };
}

/**
 * The body of a 409 for an old thread: the message as the error, beside the flag, which
 * tells a client this refusal apart from the session lock's 409.
 *
 * @param {string} sessionId
 * @param {Object} oldThread - oldThreadOf's flag
 * @returns {{sessionId: string, error: string, oldThread: Object}}
 */
function oldThreadRefusal(sessionId, oldThread) {
  return { sessionId, error: oldThread.message, oldThread };
}

/**
 * What a rollback writes on an old thread beyond the point's own list. The story meeting
 * keeps its round counters on a rollback (R9: it reopens as the director left it), but an
 * old thread left no meeting: its arc counters are the old arc stage's, which would spend
 * the fresh weave's check rework and number its first round past one. So they start over,
 * as every point before the meeting already starts them (ROLLBACK_COUNTER_RESETS). With
 * them the thread holds nothing past the arc writer until the weave is written, so a weave
 * writer that fails leaves it resumable.
 *
 * @param {string} rollbackTo
 * @returns {Object}
 */
function oldThreadRollbackState(rollbackTo) {
  return rollbackTo === OLD_THREAD_ROLLBACK ? { arcRevisionCount: 0, humanArcRevisionCount: 0 } : {};
}

module.exports = {
  OLD_THREAD_MESSAGE,
  OLD_THREAD_ROLLBACK,
  OLD_THREAD_ROLLBACK_POINTS,
  PAST_THE_ARC_WRITER,
  oldThreadOf,
  oldThreadRefusal,
  oldThreadRollbackState
};

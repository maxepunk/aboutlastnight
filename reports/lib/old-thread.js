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
 * A thread is old when it holds no weave and its stop is the story meeting's or a later
 * one in the console's CHECKPOINT_ORDER (the stop it is paused at), or it is complete. A
 * thread of the new code reaches none of those without a weave: the arc writer writes it
 * before the meeting opens, and every rollback that clears it reopens a stop before the
 * meeting. A thread at no stop (a run in flight, or one that stopped without a pause) is
 * not judged here.
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
 * The flag for a thread from before the story meeting, or null for any other thread.
 *
 * @param {Object|undefined} values - the thread's state values
 * @param {string|null} pausedAt - the stop the thread is paused at (its interrupt's type), or null
 * @returns {{message: string, rollbackTo: string, rollbackPoints: string[]}|null}
 */
function oldThreadOf(values, pausedAt) {
  const state = values || {};
  if (isWeave(state.weave)) return null;
  const pastTheMeeting = state.currentPhase === PHASES.COMPLETE || CHECKPOINT_ORDER.indexOf(pausedAt) >= MEETING_INDEX;
  if (!pastTheMeeting) return null;
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
 * as every point before the meeting already starts them (ROLLBACK_COUNTER_RESETS).
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
  oldThreadOf,
  oldThreadRefusal,
  oldThreadRollbackState
};

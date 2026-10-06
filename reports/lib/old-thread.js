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
 * stopped in its arc writer, before any check rework or evaluation. One that stopped in the
 * old arc check's rework holds that rework's count, so it is flagged.
 *
 * Phase 4b (brief 1G; spec 2026-10-05 section 10; R9): a thread on phase 4's shapes is old
 * too. The story level changed a thread and a beat: a thread is a name and a line with its
 * evidence, where phase 4's was a claim pinned to one receipt, and a beat is a move, where
 * phase 4's was named by its material. Every new gate refuses the old shapes, and no
 * conversion is offered, so a thread paused on them is sent back to the meeting, where the
 * weave is written fresh. Only the arc writer writes a weave and only the map writer a map,
 * so a thread holding either in the old shape is past the arc writer wherever it sits: at a
 * stop, complete, or at no stop after an error. Its flag carries a message of its own
 * (OLD_SHAPES_MESSAGE). Every rollback point above the meeting clears the weave and the map,
 * so a thread paused before the meeting holds neither and is read as before.
 *
 * Piece 3 (brief 3E; spec 2026-10-06 section 13; R6): a thread on piece 1's shapes is old too.
 * Its weave tells one story, with threads in roles and no angles, where piece 3's pitches two or
 * three angles the director picks among; nothing reads piece 1's weave as one angle. A weave with
 * no angles is old, which covers piece 1's shape and phase 4's, under one message that names
 * neither shape. Its rollback to the meeting clears the weave, and with it the director's pick,
 * which lives on the weave (R1), so the angles are written fresh. The map's shape is unchanged.
 *
 * server.js applies it: /approve, /resume and every /rollback past the meeting answer 409
 * with the flag's message, and GET /checkpoint carries the flag, which the console shows
 * before any stop renders (console/checkpoint-view-logic.js oldThreadView).
 */
'use strict';

const { CHECKPOINT_ORDER } = require('../console/session-start-logic');
const { CHECKPOINT_TYPES } = require('./workflow/checkpoint-helpers');
const { PHASES } = require('./workflow/state');
const { isWeave } = require('./weave');
const { isMapValue } = require('../console/outline-edit-logic');

/** What the director is told, on every refusal and in the flag, for a thread with no weave. */
const OLD_THREAD_MESSAGE = 'This session was started before the story meeting. Roll back to the story meeting to continue.';

/**
 * What the director is told for a thread on an earlier shape of the weave or the map: phase 4's
 * (brief 1G) or piece 1's (brief 3E). One message names neither shape (R6).
 */
const OLD_SHAPES_MESSAGE = "This session's story meeting was written in an earlier form. Roll back to the story meeting to write it again.";

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
 * The weave's channels that the rollback to the meeting keeps (R9: it reopens as the director
 * left it) and an old-shape thread's rollback clears, so the weave writer runs fresh: the
 * weave, which carries the fact check's mark, the writer's last weave the director's changes
 * are read against, the director's edits against it, and the weave checks' last result. The
 * rest goes by the meeting point's own list in the rollback table (lib/workflow/state.js
 * ROLLBACK_CLEARS['arc-selection'], which lib/api-helpers.js buildRollbackState applies): the
 * meeting's approval, round, marks and report, the map and its channels, the article, and
 * the evaluations.
 */
const OLD_SHAPES_WEAVE_CHANNELS = Object.freeze(['weave', '_weaveBaseline', '_weaveHandEdits', '_arcValidation']);

/** The objects in a list, or none. */
function objectsOf(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) : [];
}

/**
 * Whether a weave is in an earlier shape: it has no angles (R6). Piece 3's writer pitches its
 * story as angles, and every weave of piece 3 holds them, the director's version too, since the
 * gate refuses a dropped angle. Piece 1's weave told one story with threads in roles, and phase
 * 4's threads were claims pinned to one receipt; neither has angles. A value that is no weave
 * (lib/weave.js isWeave) is no weave in an earlier shape.
 *
 * @param {*} weave
 * @returns {boolean}
 */
function isOldShapeWeave(weave) {
  return isWeave(weave) && !Array.isArray(weave.angles);
}

/**
 * Whether a map is in phase 4's shape: a beat, in a section or in left out, with no move.
 * Phase 4's beats were named by their material; every beat of the story level has its move,
 * the writer's and the director's alike. A value that is no map (the console's isMapValue,
 * the map's own rule) is no map in the old shape, and so is the outline from before phase 4,
 * which has no sections.
 *
 * @param {*} map
 * @returns {boolean}
 */
function isOldShapeMap(map) {
  if (!isMapValue(map)) return false;
  const beats = [...objectsOf(map.sections).flatMap((section) => objectsOf(section.beats)), ...objectsOf(map.leftOut)];
  return beats.some((beat) => typeof beat.move !== 'string');
}

/**
 * Whether a thread holds its weave, or its map, in an earlier shape.
 *
 * @param {Object} state
 * @returns {boolean}
 */
function holdsOldShapes(state) {
  return isOldShapeWeave(state.weave) || isOldShapeMap(state.outline);
}

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

/** The flag with its message, the rollback to the meeting and the points open to it; each flag a copy. */
function flagOf(message) {
  return { message, rollbackTo: OLD_THREAD_ROLLBACK, rollbackPoints: [...OLD_THREAD_ROLLBACK_POINTS] };
}

/**
 * The flag for a thread from before the story meeting, or for one on an earlier shape (phase
 * 4's or piece 1's), or null for any other thread. A thread with a weave is old only on the old
 * shapes, wherever it sits (briefs 1G and 3E); one with no weave is old once the old stages took
 * it past the arc writer.
 *
 * @param {Object|undefined} values - the thread's state values
 * @param {string|null} pausedAt - the stop the thread is paused at (its interrupt's type), or null
 * @returns {{message: string, rollbackTo: string, rollbackPoints: string[]}|null}
 */
function oldThreadOf(values, pausedAt) {
  const state = values || {};
  if (isWeave(state.weave)) return holdsOldShapes(state) ? flagOf(OLD_SHAPES_MESSAGE) : null;
  const pastTheArcWriter = state.currentPhase === PHASES.COMPLETE
    || CHECKPOINT_ORDER.indexOf(pausedAt) >= MEETING_INDEX
    || PAST_THE_ARC_WRITER.some((channel) => holds(state, channel));
  if (!pastTheArcWriter) return null;
  return flagOf(OLD_THREAD_MESSAGE);
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
 * A thread on an earlier shape (phase 4's or piece 1's) holds a weave the meeting's point would
 * keep, so its rollback also clears the weave's channels (OLD_SHAPES_WEAVE_CHANNELS; briefs 1G
 * and 3E), the director's pick with the weave: the weave writer then writes the angles fresh,
 * and the checks, the fact check and everything after them run on its weave.
 * The director's notes and the photo stops' choices stay, as on any rollback to the meeting.
 * Every point before the meeting clears the weave and the map already, so it adds nothing there.
 *
 * The thread's state is required (fix round 3): without it the rollback cannot tell phase 4's
 * shapes, and would keep an old-shape weave for the new stages to replay on (Review focus 4).
 * So a call without it throws, naming this function, at every point.
 *
 * @param {string} rollbackTo
 * @param {Object} values - the thread's state values, which say whether it holds the old shapes
 * @returns {Object}
 */
function oldThreadRollbackState(rollbackTo, values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    throw new Error(`oldThreadRollbackState needs the thread's state values, to tell whether it holds phase 4's shapes; it was given ${Array.isArray(values) ? 'an array' : values === null ? 'null' : typeof values}.`);
  }
  if (rollbackTo !== OLD_THREAD_ROLLBACK) return {};
  const counters = { arcRevisionCount: 0, humanArcRevisionCount: 0 };
  if (!isWeave(values.weave) || !holdsOldShapes(values)) return counters;
  return { ...counters, ...Object.fromEntries(OLD_SHAPES_WEAVE_CHANNELS.map((channel) => [channel, null])) };
}

module.exports = {
  OLD_THREAD_MESSAGE,
  OLD_SHAPES_MESSAGE,
  OLD_THREAD_ROLLBACK,
  OLD_THREAD_ROLLBACK_POINTS,
  OLD_SHAPES_WEAVE_CHANNELS,
  PAST_THE_ARC_WRITER,
  isOldShapeWeave,
  isOldShapeMap,
  oldThreadOf,
  oldThreadRefusal,
  oldThreadRollbackState
};

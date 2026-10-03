/**
 * The story meeting's plumbing (phase 4, brief 4.5; spec 4.3 and 4.4; R12): the arc stop
 * is the story meeting, where the director settles the weave before anything is planned.
 *
 * - THE DIRECTOR-SIDE SCHEMA (DIRECTOR_WEAVE_SCHEMA): the weave as the director leaves it,
 *   derived in code from the writer's (lib/sdk-client/subagents.js WEAVE_SCHEMA). It adds
 *   what no writer writes, the director's `answer` on a question and `struck: true` on a
 *   connection they struck, and, as the writer's does, lets a thread the director added or
 *   re-roled have no receipt and no reason. The payload gate validates against it, and the
 *   console's validator is held to it; it is never sent to the SDK, so no model writes an
 *   answer or a strike.
 * - THE PAYLOADS (meetingResume, which server.js buildResumePayload calls): approve
 *   carries the weave as the director left it and an optional note; a reweave the same; a
 *   send-back a note, and the weave when the director edited it. Each writes the
 *   director's version (with the fact check's mark of the weave the meeting showed) and
 *   the standing edits against the writer's last weave (lib/hand-edit-diff.js
 *   standingAtMeeting). A reweave and a send-back are the director's round, marked
 *   explicitly (`_meetingRound`), which opens a new round: the report and the marks start
 *   over. The approval itself is the stop's to set (checkpoint-nodes.js
 *   checkpointArcSelection).
 * - WHAT THE STOP SHOWS (meetingCheckpointData, which server.js getCheckpointData sends at
 *   `arc-selection`): the weave, the verdict as the parse holds it, the questions with any
 *   answers, a code check still failing on the weave in hand, the concerns beside their
 *   lines, the marks after a round, the edits a send-back changed, the standing notes, the
 *   round counters, and a round that did not run.
 */
'use strict';

const Ajv = require('ajv');
const { WEAVE_SCHEMA } = require('./sdk-client/subagents');
const {
  STRUCK_KEY, MEETING_ROUNDS, isWeave, weaveForPrompt, weaveKey, factCheckMarkOf, withFactCheckMark,
  weaveIdOf, repeatedIds
} = require('./weave');
const { WEAVE_ANSWER_KEY, weaveQuestionsOf } = require('./writer-questions');
const {
  standingAtMeeting, carriedEdits, concernEditIds, editWhere, weaveMarks, handEditReportOf, weaveEditsBetween
} = require('./hand-edit-diff');

/** The meeting's three actions: approve, and the director's two rounds. */
const MEETING_ACTIONS = Object.freeze(['approve', ...MEETING_ROUNDS]);

/**
 * The weave as the director leaves it at the story meeting (R12): the writer's schema,
 * with the director's answer on a question and the strike on a connection.
 */
const DIRECTOR_WEAVE_SCHEMA = (() => {
  const schema = structuredClone(WEAVE_SCHEMA);
  schema.properties.questions.items.properties[WEAVE_ANSWER_KEY] = {
    type: 'string', description: "The director's answer, word for word"
  };
  schema.properties.connections.items.properties[STRUCK_KEY] = {
    type: 'boolean', description: 'true on a connection the director struck'
  };
  return schema;
})();

const validateDirectorWeave = new Ajv({ allErrors: true, strict: true }).compile(DIRECTOR_WEAVE_SCHEMA);

/** The weave's collections whose elements name themselves by an id. */
const ID_COLLECTIONS = ['threads', 'connections', 'questions'];

/** Words joined as a list is read: "a", "a and b", "a, b and c". */
function listOf(words) {
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words.join('');
}

/**
 * What the director-side schema finds wrong with a weave, as one refusal that says where,
 * or null for a weave it accepts. Past the schema, every thread, connection and question
 * has an id of its own (ruling 3): the edits, the strikes and the answers each find their
 * element by its id, which a schema cannot hold an array of objects to. A repeat is read
 * by the rule the checks and the diff read (lib/weave.js repeatedIds; fix round 1,
 * finding 3), so "t6" and "t6 " are one id here as there. The refusal names who made the
 * repeat (fix round 1, finding 2):
 * - a repeat the weave the meeting showed does not hold is the director's: refused;
 * - a repeat it holds is the writer's, a defect the checks report and a rework fixes. It
 *   passes while the director leaves the elements under it as the meeting showed them, so
 *   every action works, a reweave and a send-back among them, and the meeting offers no id
 *   editing. A change under it is refused, since no edit could find the element changed
 *   by its id (lib/hand-edit-diff.js weaveEditsBetween flags it `repeatedId`).
 * With no weave shown to tell them apart, every repeat counts as the director's.
 *
 * @param {*} weave - the weave as the director left it, without its code-owned keys
 * @param {Object} [options]
 * @param {Object|null} [options.shown] - the weave the meeting showed, without its code-owned keys
 * @returns {string|null}
 */
function directorWeaveProblems(weave, { shown = null } = {}) {
  if (!weave || typeof weave !== 'object' || Array.isArray(weave)) {
    return 'The weave must be an object: the weave as the director left it.';
  }
  if (!validateDirectorWeave(weave)) {
    const errors = (validateDirectorWeave.errors || []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');
    return `The weave as the director left it failed the director-side schema: ${errors}`;
  }
  const shownWeave = isWeave(shown) ? shown : null;
  const theirs = ID_COLLECTIONS.flatMap((collection) => {
    const writers = new Set(shownWeave ? repeatedIds(shownWeave[collection]) : []);
    return repeatedIds(weave[collection]).filter((id) => !writers.has(id)).map((id) => `two ${collection} share the id "${id}"`);
  });
  if (theirs.length > 0) {
    const text = theirs.join('; ');
    return `${text.charAt(0).toUpperCase()}${text.slice(1)}: the director's changes made ${theirs.length > 1 ? 'these repeats' : 'this repeat'}. Give each an id of its own.`;
  }
  const touched = new Set((shownWeave ? weaveEditsBetween(shownWeave, weave) : [])
    .filter((change) => change.repeatedId)
    .map((change) => `two ${change.scope} the id "${weaveIdOf(change.at[1].match)}"`));
  if (touched.size === 0) return null;
  return `The writer gave ${listOf([...touched])}, so the meeting cannot tell which of them the director changed. Leave them as the meeting showed them, and reweave or send back: the rework gives each an id of its own.`;
}

/**
 * One of the meeting's payloads, as the stop's resume and the state it writes (brief 4.5).
 *
 * - `{meeting: 'approve', weave, note?}`: resumes as an approval; a note joins the standing
 *   notes as an approval note.
 * - `{meeting: 'reweave', weave, note?}` and `{meeting: 'send-back', note, weave?}`: the
 *   director's round, marked `_meetingRound`; the note is the round's (`_arcFeedback`) and
 *   joins the standing notes as a rejection note, the kind a rework at its stop acts on.
 *
 * Every action writes the director's version as the weave (so a rework that times out
 * keeps it) and the standing edits against the writer's last weave (`_weaveBaseline`, or
 * the weave the meeting showed when the thread holds none). Code-owned keys the console
 * sends are dropped, and the weave keeps the fact check's mark of the weave the meeting
 * showed: a round's rework writes a weave without it, so the fact check runs again.
 *
 * @param {Object} approvals - the request body
 * @param {Object} currentState - the thread's state at the stop
 * @param {Object} [options]
 * @param {string[]} [options.names] - the roster's names, which a cut or a rewrite records
 * @returns {{resume: Object, stateUpdates: Object, note: {text: string, kind: string}|null, error: string|null}}
 */
function meetingResume(approvals, currentState = {}, { names } = {}) {
  const refuse = (error) => ({ resume: {}, stateUpdates: {}, note: null, error });
  const action = approvals && approvals.meeting;
  if (!MEETING_ACTIONS.includes(action)) {
    return refuse(`The story meeting takes approve, reweave or send-back as its action (got ${JSON.stringify(action)}).`);
  }
  if (approvals.note !== undefined && approvals.note !== null && typeof approvals.note !== 'string') {
    return refuse("The meeting's note must be text.");
  }
  const note = typeof approvals.note === 'string' ? approvals.note.trim() : '';
  if (action === 'send-back' && !note) {
    return refuse('A send-back carries a note: what the writer should rethink.');
  }
  const sent = approvals.weave;
  if (action !== 'send-back' && (sent === undefined || sent === null)) {
    return refuse(`${action === 'approve' ? 'An approve' : 'A reweave'} carries the weave as the director left it.`);
  }
  const shown = weaveForPrompt(currentState.weave);
  const left = weaveForPrompt(sent === undefined || sent === null ? currentState.weave : sent);
  const problems = directorWeaveProblems(left, { shown });
  if (problems) return refuse(problems);

  const mark = factCheckMarkOf(currentState.weave);
  const baseline = isWeave(currentState._weaveBaseline) ? currentState._weaveBaseline : shown;
  const stateUpdates = {
    weave: mark ? withFactCheckMark(left, mark) : left,
    _weaveHandEdits: standingAtMeeting(currentState._weaveHandEdits, baseline, left, { names, shown })
  };
  if (action === 'approve') {
    return { resume: { approved: true }, stateUpdates, note: note ? { text: note, kind: 'approval' } : null, error: null };
  }
  Object.assign(stateUpdates, {
    _meetingRound: action,
    _arcFeedback: note || null,
    _weaveHandEditReport: null,
    _weaveMarks: null
  });
  return {
    resume: { approved: false, round: action, ...(note && { feedback: note }) },
    stateUpdates,
    note: note ? { text: note, kind: 'rejection' } : null,
    error: null
  };
}

/**
 * A code check still failing on the weave the meeting shows (ruling 7): the checks' last
 * result survives every rollback, so its failures show only when its weaveKey names the
 * weave in hand.
 *
 * @param {Object} state
 * @returns {Array<{type: string, message: string}>}
 */
function meetingCheckFailures(state) {
  const check = state && state._arcValidation;
  if (!check || check.passed !== false || !isWeave(state.weave) || check.weaveKey !== weaveKey(state.weave)) return [];
  return Array.isArray(check.failures) ? check.failures : [];
}

/**
 * The concerns about the director's own changes (R11): the code checks' (on the weave in
 * hand) and the fact check's (on its mark), each with the edits it is about and their
 * places, so the meeting shows it beside the line. A concern about an edit the weave no
 * longer carries is not shown.
 *
 * @param {Object} state
 * @returns {Array<{text: string, editIds: string[], places: Array<{id: string, path: string, where: string}>}>}
 */
function meetingConcerns(state) {
  if (!state || !isWeave(state.weave)) return [];
  const edits = new Map(carriedEdits(state._weaveHandEdits, state.weave).map((edit) => [edit.id, edit]));
  const check = state._arcValidation;
  const fromChecks = check && check.weaveKey === weaveKey(state.weave) && Array.isArray(check.concerns) ? check.concerns : [];
  const mark = factCheckMarkOf(state.weave);
  const fromFactCheck = mark && Array.isArray(mark.concerns) ? mark.concerns : [];
  return [...fromChecks, ...fromFactCheck]
    .filter((text) => typeof text === 'string')
    .map((text) => {
      const editIds = concernEditIds(text).filter((id) => edits.has(id));
      const places = editIds.map((id) => ({ id, path: edits.get(id).path, where: editWhere(edits.get(id)) }));
      return { text, editIds, places };
    })
    .filter((concern) => concern.editIds.length > 0);
}

/**
 * The marks after a director's round (brief 4.5): what the round's passes changed in the
 * weave, from the version the director left, with the round.
 *
 * @param {Object} state
 * @returns {{round: string, marks: Array}|null}
 */
function meetingMarksOf(state) {
  const marks = state && state._weaveMarks;
  if (!marks || !isWeave(marks.from) || !isWeave(state.weave)) return null;
  return { round: marks.round, marks: weaveMarks(marks.from, weaveForPrompt(state.weave)) };
}

/**
 * A director's round that did not run (ruling 6): its rework timed out, the weave stayed
 * as the director left it, and the meeting reopened. The round's note comes with it, so
 * the director can send it again.
 *
 * @param {Object} state
 * @returns {{round: string, at: string|null, note: string|null}|null}
 */
function roundDidNotRunOf(state) {
  const timeout = state && state._arcReworkTimeout;
  if (!timeout || !MEETING_ROUNDS.includes(timeout.round)) return null;
  return { round: timeout.round, at: timeout.at || null, note: typeof timeout.note === 'string' ? timeout.note : null };
}

/**
 * The payload the story meeting's stop sends (brief 4.5; server.js getCheckpointData).
 *
 * @param {Object} state
 * @param {Object} options
 * @param {Object} options.evidenceIndex - each exposed document, by the id a receipt names
 * @param {number} options.maxRevisions - the automated budget of a round
 * @returns {Object}
 */
function meetingCheckpointData(state, { evidenceIndex, maxRevisions }) {
  const s = state || {};
  return {
    weave: s.weave || null,
    evidenceIndex,
    // The verdict as the parse holds it: what the console's verdictView and votesView read.
    accusation: (s.sessionConfig && s.sessionConfig.accusation) || null,
    questions: weaveQuestionsOf(s.weave && s.weave.questions),
    checkFailures: meetingCheckFailures(s),
    concerns: meetingConcerns(s),
    marks: meetingMarksOf(s),
    // The edits the round's passes changed, a send-back's with its reasons, and each
    // restore (lib/hand-edit-diff.js reportAfterPass).
    handEditReport: handEditReportOf(s._weaveHandEditReport),
    directorGateNotes: s.directorGateNotes || [],
    revisionCount: s.arcRevisionCount || 0,
    humanRevisionCount: s.humanArcRevisionCount || 0,
    maxRevisions,
    roundDidNotRun: roundDidNotRunOf(s)
  };
}

module.exports = {
  MEETING_ACTIONS,
  DIRECTOR_WEAVE_SCHEMA,
  directorWeaveProblems,
  meetingResume,
  meetingCheckFailures,
  meetingConcerns,
  meetingMarksOf,
  roundDidNotRunOf,
  meetingCheckpointData
};

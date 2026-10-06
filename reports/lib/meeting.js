/**
 * The story meeting's plumbing (phase 4, brief 4.5; spec 4.3 and 4.4; R12): the arc stop
 * is the story meeting, where the director settles the weave before anything is planned.
 *
 * - THE DIRECTOR-SIDE SCHEMA (DIRECTOR_WEAVE_SCHEMA): the weave as the director leaves it,
 *   derived in code from the writer's (lib/sdk-client/subagents.js WEAVE_SCHEMA). It adds
 *   what no writer writes, the director's pick (`picked`, the angle they sent on; piece 3, R1),
 *   and their `answer` on a question, and lets a
 *   thread the director adds have only its id, name and line (phase 4b, briefs 1B and 3B): the
 *   evidence is never the director's (R6), so no thread or connection needs it here, and the
 *   next writer finds the evidence for a thread they added (spec 2026-10-05 section 5.3). The
 *   payload gate validates against it, and past it refuses a pick that names no angle and a
 *   picked angle without the thread that carries the room's verdict (R8). The console's
 *   validator (console/checkpoint-view-logic.js meetingWeaveProblems, 4.8) applies the same
 *   rules, held to the gate's decisions by a corpus test. It is never sent to the SDK, and code
 *   strips the director's keys from what a writer or a rework returns (arc-specialist-nodes.js
 *   weaveFromOutput), so no model writes a pick or an answer.
 * - THE PAYLOADS (meetingResume, which server.js buildResumePayload calls, and only while
 *   the thread is paused at the meeting does it take the meeting's arm alone): approve
 *   carries the weave as the director left it and an optional note; a reweave the same,
 *   and it carries a change to the weave or a note, since answers alone are nothing to fit
 *   in; a send-back a note, and the weave when the director edited it. Each writes the
 *   director's version (with the fact check's mark of the weave the meeting showed), every
 *   angle but the picked one as the meeting showed it (R9), and the standing edits against the
 *   writer's last weave (lib/hand-edit-diff.js standingAtMeeting). A reweave and a send-back
 *   are the director's round, marked
 *   explicitly (`_meetingRound`), which opens a new round: the report and the marks start
 *   over. The approval itself is the stop's to set (checkpoint-nodes.js
 *   checkpointArcSelection).
 * - WHAT THE STOP SHOWS (meetingCheckpointData, which server.js getCheckpointData sends at
 *   `arc-selection`): the weave, the verdict as the parse holds it, the questions with any
 *   answers, a code check still failing on the weave in hand, the threads the director
 *   added, the concerns beside their lines, the marks after a round, the edits a send-back changed, the standing notes (a
 *   round that did not run leaves its note to the note box: unrunRoundNoteIndex), the round
 *   counters, and a round that did not run.
 */
'use strict';

const Ajv = require('ajv');
const { WEAVE_SCHEMA } = require('./sdk-client/subagents');
const {
  MEETING_ROUNDS, PICKED_KEY, isWeave, weaveForPrompt, weaveKey, factCheckMarkOf, withFactCheckMark,
  weaveIdOf, repeatedIds, pickedAngleOf, settledAngleOf
} = require('./weave');
const { WEAVE_ANSWER_KEY, weaveQuestionsOf } = require('./writer-questions');
const { stopRoundOf, isNoteOf } = require('./workflow/state');
const {
  standingAtMeeting, carriedEdits, concernEditIds, editWhere, weaveMarks, handEditReportOf, weaveEditsBetween, weaveDirectorsShare
} = require('./hand-edit-diff');

/** The meeting's three actions: approve, and the director's two rounds. */
const MEETING_ACTIONS = Object.freeze(['approve', ...MEETING_ROUNDS]);

/**
 * The weave as the director leaves it at the story meeting (R12): the writer's schema,
 * with the director's pick (R1) and their answer on a question, and
 * no thread or connection held to have its evidence (phase 4b, briefs 1B and 3B; R6): a thread
 * the director adds is its id, name and line.
 */
const DIRECTOR_WEAVE_SCHEMA = (() => {
  const schema = structuredClone(WEAVE_SCHEMA);
  schema.properties[PICKED_KEY] = {
    type: 'string', description: 'The id of the angle the director picked'
  };
  schema.properties.questions.items.properties[WEAVE_ANSWER_KEY] = {
    type: 'string', description: "The director's answer, word for word"
  };
  ['threads', 'connections'].forEach((collection) => {
    const items = schema.properties[collection].items;
    items.required = items.required.filter((field) => field !== 'evidence');
  });
  return schema;
})();

const validateDirectorWeave = new Ajv({ allErrors: true, strict: true }).compile(DIRECTOR_WEAVE_SCHEMA);

/** The weave's collections whose elements name themselves by an id. */
const ID_COLLECTIONS = ['angles', 'threads', 'connections', 'questions'];

/** Words joined as a list is read: "a", "a and b", "a, b and c". */
function listOf(words) {
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words.join('');
}

/** How many elements of a list carry the id, read as every join at the meeting reads one (weaveIdOf). */
function idCount(elements, id) {
  return (Array.isArray(elements) ? elements : []).filter((element) => weaveIdOf(element) === id).length;
}

/**
 * The refusal for a reweave with nothing to fit in (brief 4.5b; spec 4.4; piece 3, brief 3C): a
 * reweave fits the director's changes and note in, and the pick and the answers travel as they
 * are to every later writer, so a pick alone, or answers alone, is no change to fit in (spec
 * 2026-10-06 section 7). meetingResume reads it from the edits the reweave would list: a line of
 * an angle's pitch, a thread flipped, a thread's field or a thread added each counts.
 */
const EMPTY_REWEAVE = "A reweave fits the director's changes and note into the angle, and this one carries no change to an angle or a thread and no note. The pick and the answers travel as they are to every later writer: approve to send the angle on with them, or change the angle or one of its threads, or write a note, then reweave.";

/**
 * What the director-side schema finds wrong with a weave, as one refusal that says where,
 * or null for a weave it accepts. Past the schema, every thread, connection and question
 * has an id of its own (ruling 3): the edits and the answers each find their
 * element by its id, which a schema cannot hold an array of objects to. A repeat is read
 * by the rule the checks and the diff read (lib/weave.js repeatedIds; fix round 1,
 * finding 3), so "t6" and "t6 " are one id here as there. The refusal names who made the
 * repeat, read from each id's count in the weave the meeting showed and in the director's
 * version (brief 4.5b), and offers only a remedy that works in its case:
 * - an id the director's version holds more often than the weave the meeting showed is the
 *   director's repeat: refused, naming the director. Keeping the ids the meeting showed
 *   and giving each element they added an id of its own clears it, a third "t2" added over
 *   the writer's two included;
 * - a repeat the weave the meeting showed holds as often is the writer's, which the checks
 *   report as the writer's failure and a rework fixes. It passes while the director leaves
 *   the elements under it as the meeting showed them, so every action works, and the
 *   meeting offers no id editing. A change under it is refused, since no edit could find
 *   the element changed by its id (lib/hand-edit-diff.js weaveEditsBetween flags it
 *   `repeatedId`); a send-back, or a reweave with a note, has the rework clear the repeat
 *   (a reweave with nothing else in it is refused as empty).
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
  const theirs = ID_COLLECTIONS.flatMap((collection) => repeatedIds(weave[collection])
    .filter((id) => idCount(weave[collection], id) > idCount(shownWeave && shownWeave[collection], id))
    .map((id) => `two ${collection} share the id "${id}"`));
  if (theirs.length > 0) {
    const text = theirs.join('; ');
    return `${text.charAt(0).toUpperCase()}${text.slice(1)}: the director's changes made ${theirs.length > 1 ? 'these repeats' : 'this repeat'}. Keep the ids the meeting showed, and give each one the director added an id of its own.`;
  }
  // A thread flipped under an id the writer repeated names the threads (piece 3, brief 3C); any
  // other change names its own collection.
  const touched = new Set((shownWeave ? weaveEditsBetween(shownWeave, weave) : [])
    .filter((change) => change.repeatedId)
    .map((change) => {
      const threadId = change.flip ? weaveIdOf(change.at[3].match) : '';
      return threadId && repeatedIds(shownWeave.threads).includes(threadId)
        ? `two threads the id "${threadId}"`
        : `two ${change.scope} the id "${weaveIdOf(change.at[1].match)}"`;
    }));
  if (touched.size > 0) {
    return `The writer gave ${listOf([...touched])}, so the meeting cannot tell which of them the director changed. Leave them as the meeting showed them, and send the weave back or reweave it with a note: the rework gives each an id of its own.`;
  }
  return angleSetProblems(weave, shownWeave) || pickProblems(weave, shownWeave);
}

/**
 * What the gate refuses in the director's pick (piece 3, brief 3B), or null: a pick that names no
 * angle the weave holds; a pick of an angle id the writer repeated (3B fix 7), since the gate
 * stores the angle sent by its id and cannot tell which of them the director picked, while the
 * angle the meeting opened, left open, passes as a writer's repeat left as shown does; and a
 * version that does not carry the thread that carries the room's verdict (R8), which the article
 * always reports (T2): the thread taken out of the weave, its verdict flag taken off (or moved to
 * another thread), or the thread left out of the picked angle. The meeting locks that thread in
 * the open angle, so a version that lacks it came past the console, such as from the harness's
 * approve file.
 *
 * The verdict's thread is the one the weave the meeting showed flags, by id (fix round 1, finding
 * 2): read from the director's own version, a version that clears the flag would leave no thread
 * to hold. With no weave shown, or one that flags none (the checks' failure), the director's
 * version's flags decide.
 *
 * @param {Object} weave - the weave as the director left it, which the schema has taken
 * @param {Object|null} [shown] - the weave the meeting showed
 * @returns {string|null}
 */
function pickProblems(weave, shown = null) {
  const picked = typeof weave[PICKED_KEY] === 'string' ? weave[PICKED_KEY].trim() : '';
  if (picked && !weave.angles.some((angle) => weaveIdOf(angle) === picked)) {
    return `The pick names an angle the weave does not hold ("${picked}"). Pick one of the angles the meeting showed.`;
  }
  const angle = pickedAngleOf(weave);
  if (!angle) return null;
  const openId = weaveIdOf(angle);
  const shownOpen = isWeave(shown) ? pickedAngleOf(shown) : null;
  if (openId && isWeave(shown) && idCount(shown.angles, openId) > 1 && openId !== weaveIdOf(shownOpen)) {
    return `The writer gave more than one angle the id "${openId}", so the meeting cannot tell which of them the director picked. Leave the pick as the meeting showed it, or pick an angle under an id of its own, and send the weave back or reweave it with a note: the rework gives each angle an id of its own.`;
  }
  const named = new Set(angle.threads.map((id) => id.trim()));
  const flagged = (threads) => (Array.isArray(threads) ? threads : [])
    .filter((thread) => thread && typeof thread === 'object' && thread.verdict === true && weaveIdOf(thread));
  const shownVerdict = isWeave(shown) ? flagged(shown.threads) : [];
  const verdictThreads = shownVerdict.length > 0 ? shownVerdict : flagged(weave.threads);
  const problems = verdictThreads.map((thread) => {
    const id = weaveIdOf(thread);
    const name = `"${(typeof thread.name === 'string' && thread.name.trim()) || id}"`;
    const held = weave.threads.filter((own) => weaveIdOf(own) === id);
    if (held.length === 0) return `The director's version takes out ${name}, the thread that carries the room's verdict.`;
    if (!held.some((own) => own.verdict === true)) return `The director's version takes the room's verdict off ${name}, the thread that carries it.`;
    if (!named.has(id)) return `The angle the director picked leaves out ${name}, the thread that carries the room's verdict.`;
    return null;
  }).filter(Boolean);
  if (problems.length === 0) return null;
  return `${problems.join(' ')} The article always reports the verdict, so that thread keeps its verdict and stays in the picked angle.`;
}

/**
 * What the gate refuses in the director's angles (R9; fix round 1, finding 3), or null: an angle
 * the meeting showed that the version drops, and one it adds that the meeting never showed, each
 * named by its headline. The gate stores the angles the meeting showed, by id, so a dropped angle
 * could not be switched to after a reweave or a rollback, and an added one would reopen as the
 * writer's. With no weave shown there is nothing to hold the version to.
 *
 * @param {Object} weave - the weave as the director left it, which the schema has taken
 * @param {Object|null} shown - the weave the meeting showed
 * @returns {string|null}
 */
function angleSetProblems(weave, shown) {
  if (!isWeave(shown) || !Array.isArray(shown.angles)) return null;
  const idsOf = (angles) => angles.filter((angle) => angle && typeof angle === 'object').map((angle) => weaveIdOf(angle));
  const shownIds = idsOf(shown.angles);
  const leftIds = idsOf(weave.angles);
  const named = (angle, id) => `"${(angle && typeof angle.headline === 'string' && angle.headline.trim()) || id || 'an angle with no id'}"`;
  const dropped = shown.angles.filter((angle, i) => angle && typeof angle === 'object' && !leftIds.includes(shownIds[i]));
  const added = weave.angles.filter((angle, i) => !shownIds.includes(leftIds[i]));
  const problems = [
    ...dropped.map((angle) => `drops the angle ${named(angle, weaveIdOf(angle))}, which the meeting showed`),
    ...added.map((angle) => `adds the angle ${named(angle, weaveIdOf(angle))}, which the meeting never showed`)
  ];
  if (problems.length === 0) return null;
  return `The director's version ${listOf(problems)}. The meeting keeps the angles it showed: pick one of them, and change only the one you pick.`;
}

/**
 * The director's version as the gate stores it (R9): the angles the meeting showed, in its order
 * and by id, each as the meeting showed it but the one they picked, which is as they left it,
 * since only the angle the director sends goes on and a change to another is not kept (fix round
 * 1, finding 3: the stored list is built from the meeting's, and the gate refuses a version that
 * drops or adds an angle, angleSetProblems). A pick the director's order alone made, the first
 * angle of a version that names none, is written as their pick, so the angle they sent stays open.
 * A change to a thread's name or line is the thread's, which every angle that tells it shares, so
 * the threads are kept as the director left them. The angle sent takes one place, the first under
 * its id, as the pick opens the first (pickedAngleOf): under an id the writer repeated, which the
 * gate takes only for the angle the meeting opened (pickProblems), the writer's other angles keep
 * theirs as the meeting showed them (3B fix 7).
 *
 * @param {Object} left - the weave as the director left it
 * @param {Object|null} shown - the weave the meeting showed
 * @returns {Object}
 */
function withUnsentAnglesAsShown(left, shown) {
  if (!isWeave(shown) || !Array.isArray(shown.angles)) return left;
  const picked = pickedAngleOf(left);
  const pickedId = picked ? weaveIdOf(picked) : '';
  if (!pickedId) return left;
  const sentAt = shown.angles.findIndex((angle) => weaveIdOf(angle) === pickedId);
  const angles = shown.angles.map((angle, index) => (index === sentAt ? picked : structuredClone(angle)));
  const stored = { ...left, angles };
  if (weaveIdOf(pickedAngleOf(stored)) !== pickedId) stored[PICKED_KEY] = pickedId;
  return stored;
}

/**
 * One of the meeting's payloads, as the stop's resume and the state it writes (brief 4.5).
 *
 * - `{meeting: 'approve', weave, note?}`: resumes as an approval; a note joins the standing
 *   notes as an approval note.
 * - `{meeting: 'reweave', weave, note?}` and `{meeting: 'send-back', note, weave?}`: the
 *   director's round, marked `_meetingRound`; the note is the round's (`_arcFeedback`) and
 *   joins the standing notes as a rejection note, the kind a rework at its stop acts on.
 *   A reweave that carries no edit and no note is refused (brief 4.5b, EMPTY_REWEAVE): its
 *   rework would be told to keep every line, and a second fact check would follow, with
 *   nothing to show.
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
  const sentVersion = weaveForPrompt(sent === undefined || sent === null ? currentState.weave : sent);
  const problems = directorWeaveProblems(sentVersion, { shown });
  if (problems) return refuse(problems);
  const left = withUnsentAnglesAsShown(sentVersion, shown);

  const mark = factCheckMarkOf(currentState.weave);
  const baseline = isWeave(currentState._weaveBaseline) ? currentState._weaveBaseline : shown;
  const handEdits = standingAtMeeting(currentState._weaveHandEdits, baseline, left, { names, shown });
  // The edits the reweave's <HAND_EDITS> would list: with none and no note, it has nothing to fit in.
  if (action === 'reweave' && !note && carriedEdits(handEdits, left).length === 0) return refuse(EMPTY_REWEAVE);
  const stateUpdates = {
    weave: mark ? withFactCheckMark(left, mark) : left,
    _weaveHandEdits: handEdits
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
 * weave in hand. Each carries the rework's message and the director's line, which the meeting
 * shows (lib/weave.js weaveFindings).
 *
 * @param {Object} state
 * @returns {Array<{type: string, message: string, line: string, place?: string}>}
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
 * The threads the director put in the story at the meeting that the weave carries, in the
 * settled angle's order (lib/weave.js settledAngleOf), read from their standing edits: each one
 * they added (`added`), and each they brought into the settled angle (`broughtIn`; piece 3, R2),
 * at whatever look they flipped it in, since each flip is an edit of its own that keeps its author.
 * The next writer finds the evidence for such a thread (spec 2026-10-05 section 5.3): the meeting
 * says so under one the director added with none, at whatever look they added it (the payload's
 * `directorsThreads`, the added ones alone), where a thread of the writer's with none, flipped in
 * or not, is a check's failure, shown beside it (3 fix A); and when the record cannot carry either
 * kind, the map names it in its gap note (lib/map.js mapFindings).
 *
 * @param {Object} state
 * @returns {Array<{id: string, added: boolean, broughtIn: boolean}>}
 */
function meetingDirectorsThreads(state) {
  const settled = state && isWeave(state.weave) ? settledAngleOf(state.weave) : null;
  if (!settled) return [];
  const share = weaveDirectorsShare(carriedEdits(state._weaveHandEdits, state.weave));
  const added = new Set(Object.keys(share.addedThreads));
  const angleId = weaveIdOf(settled.angle);
  const broughtIn = new Set(Object.keys(share.flippedIn)
    .filter((place) => angleId && place.startsWith(`${angleId}.`))
    .map((place) => place.slice(angleId.length + 1)));
  return settled.threads
    .map((thread) => weaveIdOf(thread))
    .filter((id, index, ids) => id && ids.indexOf(id) === index && (added.has(id) || broughtIn.has(id)))
    .map((id) => ({ id, added: added.has(id), broughtIn: broughtIn.has(id) }));
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
 * How the meeting names the line of a change to one of the weave's own fields, for a later stop
 * that names the change to the director (meetingChangePlace): the line as the meeting's page
 * heads it, in a phrase.
 */
const MEETING_FIELD_PLACES = Object.freeze({
  fromYourNotes: 'the words from your notes'
});

/**
 * How the meeting names a change to one line of an angle's pitch (phase 4b, piece 3, brief 3C):
 * the line as the pitch heads it, in a phrase. A later stop names only the changes the settled
 * story shows, which are the sent angle's, so the line alone names it.
 */
const ANGLE_FIELD_PLACES = Object.freeze({
  headline: 'the headline',
  gist: 'the card line',
  story: 'the story',
  question: 'the question it carries',
  lands: 'why it lands',
  ends: 'where it ends up'
});

/**
 * How the meeting names a change to one field of a thread (phase 4b, brief 1B): the thread by
 * its name, quoted, and a change to its line or its name by the words the director gave it.
 * Each takes the thread's name and its line, each quoted.
 */
const THREAD_FIELD_PLACES = Object.freeze({
  name: (name) => `the name ${name}`,
  line: (name, line) => `the line ${line}`,
  verdict: (name) => `whether ${name} carries the room's verdict`
});

/** A line of the weave quoted in a place: its words in quotation marks, without the full stop it ends on. */
function quotedLine(text) {
  return `"${(typeof text === 'string' ? text.trim() : '').replace(/\.$/, '')}"`;
}

/**
 * Where one of the director's changes at the meeting sits, as the meeting names the line
 * (brief 4.14a): a field of the weave by its line ("the words from your notes"), a line of an
 * angle's pitch by its line ("why it lands"; piece 3, brief 3C), a thread by its name and a
 * connection by its line, as the meeting's page shows them ("the line "Morgan paid Riley at the
 * bar""; phase 4b, brief 1B), and a thread the director brought into the story or left out of it
 * by whether it is in the story (R2), never by an id, which the meeting never shows. A later stop
 * that names a meeting change to the director reads it (the map's page, through lib/map.js
 * meetingChangesOf). The element's words are read from `weave` under the edit's id, or from the
 * edit itself for an element the weave no longer holds.
 *
 * @param {Object} edit - one of the meeting's standing edits
 * @param {Object|null} weave - the weave as the director settled it
 * @returns {string}
 */
function meetingChangePlace(edit, weave) {
  const steps = edit && Array.isArray(edit.at) ? edit.at : [];
  const head = steps[0] && typeof steps[0].key === 'string' ? steps[0].key : '';
  if (steps.length === 1) return MEETING_FIELD_PLACES[head] || `the ${head}`;
  const id = steps[1] && steps[1].match ? weaveIdOf(steps[1].match) : '';
  const field = steps[2] && typeof steps[2].key === 'string' ? steps[2].key : '';
  const elementsOf = (collection) => (isWeave(weave) && Array.isArray(weave[collection]) ? weave[collection] : []);
  if (head === 'angles') {
    if (field === 'threads' && steps[3] && steps[3].match) {
      const threadId = weaveIdOf(steps[3].match);
      const thread = elementsOf('threads').find((element) => weaveIdOf(element) === threadId);
      const name = thread && (thread.name || thread.line) ? quotedLine(thread.name || thread.line) : quotedLine(edit.after);
      return `whether ${name} is in the story`;
    }
    return ANGLE_FIELD_PLACES[field] || 'the angle';
  }
  const held = elementsOf(head).find((element) => weaveIdOf(element) === id);
  const element = held || (edit.after && typeof edit.after === 'object' ? edit.after : edit.before) || {};
  const gone = edit.after === null || edit.after === undefined;
  if (head === 'threads') {
    const name = element.name ? quotedLine(element.name) : 'a thread';
    if (field) return (THREAD_FIELD_PLACES[field] || ((n) => `the ${field} of ${n}`))(name, element.line ? quotedLine(element.line) : name);
    return gone ? `the thread you took out, ${name}` : `the thread you added, ${name}`;
  }
  const line = element.line ? quotedLine(element.line) : 'a connection';
  if (field) return field === 'line' ? `the connection ${line}` : `the ${field} of the connection ${line}`;
  return gone ? `the connection you took out, ${line}` : `the connection you added, ${line}`;
}

/** The story meeting's stop, as the director's notes name it (server.js appendGateNote). */
const MEETING_GATE = 'arc-selection';

/**
 * Where the note of a director's round that did not run stands among the director's notes,
 * or -1 (review of 4.5c, finding 1). The round filed its note as a rejection note when it was
 * posted (server.js appendGateNote), and no rework ran with it, so it is the director's to
 * send again: their next action at the meeting sends it with a round, keeps it with Approve
 * as an approval note, or leaves it out, and the server withdraws it unless a round sends it
 * again (server.js withdrawUnrunRoundNote). Until then the stop lists it in the note box, not
 * among the standing notes (meetingCheckpointData). It is the rejection note at the meeting
 * with the round's text, filed in the stop's round (`stopRound`: one more than the director's
 * rounds that ran, a count reviseArcs gives back when the round's rework times out). A note
 * stored before notes recorded their round is never it.
 *
 * @param {Object} state
 * @returns {number}
 */
function unrunRoundNoteIndex(state) {
  const round = roundDidNotRunOf(state);
  const text = round && round.note ? round.note.trim() : '';
  if (!text || !Array.isArray(state.directorGateNotes)) return -1;
  const stopRound = stopRoundOf(MEETING_GATE, state);
  return state.directorGateNotes.findIndex((n) => isNoteOf(n, MEETING_GATE, 'rejection', stopRound)
    && typeof n.text === 'string' && n.text.trim() === text);
}

/**
 * The payload the story meeting's stop sends (brief 4.5; server.js getCheckpointData).
 *
 * @param {Object} state
 * @param {Object} options
 * @param {Object} options.evidenceIndex - each exposed document, by the id a piece of evidence names
 * @param {number} options.maxRevisions - the automated budget of a round
 * @returns {Object}
 */
function meetingCheckpointData(state, { evidenceIndex, maxRevisions }) {
  const s = state || {};
  const notes = Array.isArray(s.directorGateNotes) ? s.directorGateNotes : [];
  const unrunNote = unrunRoundNoteIndex(s);
  return {
    weave: s.weave || null,
    evidenceIndex,
    // The verdict as the parse holds it: what the console's verdictView and votesView read.
    accusation: (s.sessionConfig && s.sessionConfig.accusation) || null,
    questions: weaveQuestionsOf(s.weave && s.weave.questions),
    checkFailures: meetingCheckFailures(s),
    concerns: meetingConcerns(s),
    // Fix round 4: the threads the director added, whose fold says the map writer finds their
    // evidence while they have none. A writer's thread they flipped in stays the writer's to
    // answer for: with no evidence, the check's failure shows beside it alone (3 fix A).
    directorsThreads: meetingDirectorsThreads(s).filter((thread) => thread.added).map((thread) => thread.id),
    marks: meetingMarksOf(s),
    // The edits the round's passes changed, a send-back's with its reasons, and each
    // restore (lib/hand-edit-diff.js reportAfterPass).
    handEditReport: handEditReportOf(s._weaveHandEditReport),
    // The standing notes, without the note of a round that did not run: the note box holds
    // it, or the round's line gives it back, and the director's next action files it or not.
    directorGateNotes: unrunNote === -1 ? notes : notes.filter((_, i) => i !== unrunNote),
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
  // Fix round 4: the threads the director added or brought into the story
  meetingDirectorsThreads,
  meetingMarksOf,
  roundDidNotRunOf,
  unrunRoundNoteIndex,
  meetingCheckpointData,
  // Brief 4.14a: where a meeting change sits, as the meeting names the line
  meetingChangePlace,
  // 3 fix A: how a later stop names a line of an angle's pitch, which the console's words
  // (console/checkpoint-view-logic.js ANGLE_FIELD_WORDS) are held to by a test
  ANGLE_FIELD_PLACES,
  // Piece 3 (R9; brief 3C, fix round 1): the director's version as the gate stores it, which the
  // console's copy (console/checkpoint-view-logic.js withUnsentAnglesAsShown) is held to by a test
  withUnsentAnglesAsShown
};

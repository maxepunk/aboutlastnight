/**
 * The settled weave (phase 4, brief 4.5; phase 4b, piece 3, brief 3B; spec 2026-10-06 section
 * 8): the one renderer that prints the story the director settled at the story meeting, for every
 * later writer. The map writer reads it first, as its task (4.6), and the article writer and the
 * article judge read it first (4.7).
 *
 * It prints the angle the director picked, as they left it, read through lib/weave.js
 * settledAngleOf (the pick, else the first angle):
 * - its headline, story, question, why it lands and where it ends up, and the director's words
 *   it rests on ("from your notes") only when the picked angle is the first, the one that rests
 *   on the director's read (R11);
 * - the threads it tells, in its order, a thread the director added after the angle's own, each
 *   by its id, its name and its line; and under each, its evidence, one piece a line: its stance,
 *   its sources and what it shows (phase 4b, brief 1B; R7), for the map writer to give each beat
 *   the pieces that tell it. A thread with none yet, such as one the director added, says so;
 * - the threads the angle leaves out, last among the threads, by name and nothing more: no id,
 *   no line, no evidence (phase 4b fix round, fix 5). The map writer adds no thread, so what a
 *   left-out thread carries is noise in its prompt;
 * - the connections between its threads, each by its line and the names of the threads it joins.
 *   A connection's kind stays underneath, unprinted. A connection that joins a thread the angle
 *   leaves out is gone from it, so no later writer meets the link;
 * - every question with what its answer changes, the thread it sits beside by name, and the
 *   director's answer word for word or the mark that it is unanswered;
 * - each change the director made at the meeting that it shows, marked on its line by its id in
 *   the meeting's own form, M and the edit's number (meetingChangeId; brief 4.14a; the edits
 *   are read by lib/hand-edit-diff.js weaveDirectorsShare): a line of the sent angle's pitch, a
 *   thread brought into its story or left out of it, a thread added, a thread's name or line, a
 *   connection's line (settledMarksOf; piece 3, brief 3C). The map names what it fits in by
 *   those ids (settledChangesOf, the changes it may name), and no later prompt holds a meeting
 *   change and a map's or a desk's edit under one id.
 *
 * The other angles stay with the meeting, for going back to it (R9): no later writer reads them.
 *
 * renderDirectorAnswers prints the answers alone, for the meeting's fact check after a
 * director's round, which reads them as the director's words (T1).
 *
 * Generic: a weave is angles, threads, connections and questions, so nothing here names a theme.
 */
'use strict';

const { isWeave, settledAngleOf, weaveIdOf } = require('../weave');
const { weaveQuestionsOf, isAnswered, WEAVE_ANSWER_KEY, WEAVE_QUESTION_THREAD_KEY } = require('../writer-questions');
const { weaveDirectorsShare, carriedEdits } = require('../hand-edit-diff');

/** The settled weave's tag, the marker a later writer's render carries. */
const SETTLED_WEAVE_TAG = 'SETTLED_WEAVE';

/** The letter a meeting change's id opens with wherever a later stage's prompt shows it (meetingChangeId). */
const MEETING_CHANGE_PREFIX = 'M';

/**
 * A meeting change's id in the meeting's own form, M and the edit's number (brief 4.14a): the
 * meeting's E1 is M1. The meeting's edits are stored as E1, E2, ..., as the map's and the
 * desk's are, so wherever a later stage's prompt shows a meeting change (the settled weave,
 * which the map writer, the map rework, the article writer, the article rework and the article
 * judge read) it carries this form, and no prompt holds two different edits under one id. A
 * map's change to the weave names its source in this form (lib/map.js meetingEditIdsOf). The
 * meeting's own calls, its rework and its fact check, hold its edits alone and name them as
 * stored.
 *
 * @param {string} id - a meeting edit's id, as stored (`E3`)
 * @returns {string} `M3`
 * @throws {Error} for an id that is no meeting edit's
 */
function meetingChangeId(id) {
  const m = /^E(\d+)$/.exec(typeof id === 'string' ? id.trim() : '');
  if (!m) throw new Error(`meetingChangeId: a meeting edit's id is E and a number (got ${JSON.stringify(id)}).`);
  return `${MEETING_CHANGE_PREFIX}${m[1]}`;
}

/** The answers' tag, as the fact check's prompt prints it (evaluator-nodes.js TRUTH_MATERIAL). */
const DIRECTOR_ANSWERS_TAG = 'DIRECTOR_ANSWERS';

/** A piece's stance, in words. */
const STANCE_WORDS = { supports: 'supports', 'cuts-against': 'cuts against' };

/** A question's kind, in words. */
const QUESTION_KIND_WORDS = { player: 'a player', pronoun: 'a pronoun', figure: 'a figure' };

/** A field as text: the string trimmed, or '' for anything else. */
function textOf(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** The objects in a list, or none. */
function objectsOf(value) {
  return Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : [];
}

/** The mark at the end of a line the director changed, or '' for a line that is the writer's. */
function changeMark(parts) {
  if (parts.length === 0) return '';
  return ` [the director's ${parts.length > 1 ? 'changes' : 'change'} ${parts.join('; ')}]`;
}

/** Words joined as a list is read: "a", "a and b", "a, b and c". */
function listOf(words) {
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words.join('');
}

/**
 * A thread's evidence, one piece a line under it (phase 4b, brief 1B; R7): the piece's stance,
 * its sources as the record names them, and what it shows. A thread with no piece yet says so.
 * Only a thread in the story has its evidence printed (renderSettledWeave).
 */
function evidenceLines(thread) {
  const pieces = objectsOf(thread.evidence);
  if (pieces.length === 0) return ['  - No evidence yet.'];
  return pieces.map((piece) => {
    const sources = listOf((Array.isArray(piece.sources) ? piece.sources : []).map(textOf).filter(Boolean));
    const stance = STANCE_WORDS[piece.stance] || textOf(piece.stance);
    return `  - ${stance}, from ${sources || 'no source'}: ${textOf(piece.shows)}`;
  });
}

/**
 * One question, as the settled weave and the answers print it: its id, kind and what it is
 * about, the thread it sits beside by name when the weave holds it (`threadNames`), the question
 * and what its answer changes, then the answer word for word.
 */
function questionLines(question, { unansweredLine, threadNames = new Map() }) {
  const kind = QUESTION_KIND_WORDS[question.kind] || question.kind;
  const beside = threadNames.get(question[WEAVE_QUESTION_THREAD_KEY]);
  const place = beside ? `; beside the thread "${beside}"` : '';
  const lines = [`- ${question.id} (${kind}; about: ${question.about}${place}): ${question.question} Its answer changes: ${question.changes}`];
  if (isAnswered(question)) lines.push(`  The director's answer, word for word: "${question[WEAVE_ANSWER_KEY].trim()}"`);
  else if (unansweredLine) lines.push('  Unanswered.');
  return lines;
}

/**
 * The pitch's lines the settled weave prints, each with its label, in order (an angle's `gist`
 * is the meeting's card line, which no later writer reads).
 */
const PITCH_LINES = Object.freeze([
  ['headline', 'HEADLINE'],
  ['story', 'STORY'],
  ['question', 'QUESTION'],
  ['lands', 'WHY IT LANDS'],
  ['ends', 'WHERE IT ENDS UP']
]);

/**
 * The director's changes at the meeting that the settled weave shows, each on the line it prints
 * (phase 4b, piece 3, brief 3C): read from their share of the weave (lib/hand-edit-diff.js
 * weaveDirectorsShare), the sent angle's alone, so no later writer meets the id of a change it
 * cannot find on a line.
 * - each line of the sent angle's pitch they rewrote, and "from your notes" when it prints;
 * - each thread in the story they added, brought into the angle, or whose name or line they
 *   rewrote, with what they did to it;
 * - each thread the angle leaves out that they left out of it, added, or renamed;
 * - each connection between its threads whose line they rewrote.
 * `byLine` maps each printed line (`fromYourNotes`, `pitch:<field>`, `thread:<id>`,
 * `leftOut:<id>`, `connection:<id>`) to its marks; `ids` holds every edit id marked.
 *
 * @param {Object} weave
 * @param {Object[]} edits - the director's standing edits the weave carries
 * @returns {{byLine: Map<string, string[]>, ids: Set<string>}}
 */
function settledMarksOf(weave, edits) {
  const byLine = new Map();
  const ids = new Set();
  const settled = isWeave(weave) ? settledAngleOf(weave) : null;
  if (!settled) return { byLine, ids };
  const share = weaveDirectorsShare(edits);
  const angleId = weaveIdOf(settled.angle);
  const mark = (line, editId, what) => {
    if (!editId) return;
    ids.add(editId);
    byLine.set(line, [...(byLine.get(line) || []), what ? `${meetingChangeId(editId)}: ${what}` : meetingChangeId(editId)]);
  };
  PITCH_LINES.forEach(([field]) => mark(`pitch:${field}`, share.angleFields[`${angleId}.${field}`]));
  if (weave.angles[0] === settled.angle && textOf(weave.fromYourNotes)) mark('fromYourNotes', share.fields.fromYourNotes);
  const threadFieldsOf = (id) => Object.entries(share.threadFields).filter(([place]) => place.startsWith(`${id}.`));
  settled.threads.forEach((thread) => {
    const id = textOf(thread.id);
    mark(`thread:${id}`, share.addedThreads[id], 'a thread they added');
    mark(`thread:${id}`, share.flippedIn[`${angleId}.${id}`], 'brought into the story');
    threadFieldsOf(id).forEach(([place, editId]) => mark(`thread:${id}`, editId, `the ${place.slice(id.length + 1)}`));
  });
  settled.leftOut.forEach((thread) => {
    const id = textOf(thread.id);
    mark(`leftOut:${id}`, share.addedThreads[id], 'a thread they added');
    mark(`leftOut:${id}`, share.flippedOut[`${angleId}.${id}`], 'left out of the story');
    mark(`leftOut:${id}`, share.threadFields[`${id}.name`], 'the name');
  });
  settled.connections.forEach((connection) => {
    const id = textOf(connection.id);
    mark(`connection:${id}`, share.connectionFields[`${id}.line`], 'the line');
  });
  return { byLine, ids };
}

/**
 * The director's changes at the meeting that the settled weave shows (settledMarksOf), in the
 * edits' order: what a later stop may name as a meeting change (lib/map.js meetingChangesOf).
 *
 * @param {Object} weave
 * @param {Object[]} edits - the director's standing edits the weave carries
 * @returns {Object[]}
 */
function settledChangesOf(weave, edits) {
  const { ids } = settledMarksOf(weave, edits);
  return (Array.isArray(edits) ? edits : []).filter((edit) => edit && ids.has(edit.id));
}

/**
 * The story the director settled at the story meeting, for every later writer: the angle they
 * picked, as they left it (lib/weave.js settledAngleOf).
 *
 * @param {Object|null} weave - the weave as the director left it (state.weave)
 * @param {Object[]} edits - the director's standing edits the weave carries
 *   (lib/hand-edit-diff.js carriedEdits)
 * @returns {string} the tagged block, or '' when there is no weave or it holds no angle
 */
function renderSettledWeave(weave, edits) {
  const settled = isWeave(weave) ? settledAngleOf(weave) : null;
  if (!settled) return '';
  const { angle } = settled;
  const marks = settledMarksOf(weave, edits).byLine;
  const marked = (line) => changeMark(marks.get(line) || []);
  const threadNames = new Map(weave.threads.filter((thread) => thread && weaveIdOf(thread)).map((thread) => [weaveIdOf(thread), textOf(thread.name) || textOf(thread.line)]));
  const isFirst = weave.angles[0] === angle;

  const lines = [
    `<${SETTLED_WEAVE_TAG}>`,
    "The story the director settled at the story meeting: the angle they picked, as they left it, with the director's answers to the questions. A line that ends in [the director's change ...] holds a change the director made at the meeting, named by its id. Each answer is the director's words, word for word. The threads in the story come in the order the angle tells them, and under each is its evidence, one piece a line: whether it supports the thread or cuts against it, its sources, and what it shows. The threads the angle leaves out come after them, by name.",
    '',
    ...PITCH_LINES.map(([field, label]) => `${label}: ${textOf(angle[field])}${marked(`pitch:${field}`)}`)
  ];
  if (isFirst && textOf(weave.fromYourNotes)) {
    lines.push(`FROM THE DIRECTOR'S NOTES: "${textOf(weave.fromYourNotes)}"${marked('fromYourNotes')}`);
  }

  lines.push('', 'THREADS IN THE STORY:');
  settled.threads.forEach((thread) => {
    const id = textOf(thread.id);
    const verdict = thread.verdict === true ? " It carries the room's verdict." : '';
    lines.push(`- ${id} ${textOf(thread.name)}: ${textOf(thread.line)}${verdict}${marked(`thread:${id}`)}`);
    lines.push(...evidenceLines(thread));
  });
  if (settled.leftOut.length > 0) {
    const leftOut = settled.leftOut.map((thread) => `${textOf(thread.name) || textOf(thread.line)}${marked(`leftOut:${textOf(thread.id)}`)}`);
    lines.push('', `THREADS LEFT OUT: ${leftOut.join('; ')}`);
  }

  if (settled.connections.length > 0) {
    const nameOf = (id) => (threadNames.get(id) ? `"${threadNames.get(id)}"` : id);
    lines.push('', 'CONNECTIONS:');
    settled.connections.forEach((connection) => {
      const joins = Array.isArray(connection.joins) ? connection.joins.map(textOf).filter(Boolean) : [];
      lines.push(`- ${textOf(connection.id)}, joining ${joins.map(nameOf).join(' and ')}: ${textOf(connection.line)}${marked(`connection:${textOf(connection.id)}`)}`);
    });
  }

  const questions = weaveQuestionsOf(weave.questions);
  if (questions.length > 0) {
    lines.push('', "QUESTIONS TO THE DIRECTOR, WITH THE DIRECTOR'S ANSWERS:");
    questions.forEach((question) => lines.push(...questionLines(question, { unansweredLine: true, threadNames })));
  }
  lines.push(`</${SETTLED_WEAVE_TAG}>`);
  return lines.join('\n');
}

/**
 * The settled weave from a thread's state: the weave and the director's standing edits it
 * carries (state._weaveHandEdits). What the map writer and the article writer call.
 *
 * @param {Object} state
 * @returns {string}
 */
function settledWeaveOf(state) {
  const weave = state && state.weave;
  return renderSettledWeave(weave, carriedEdits(state && state._weaveHandEdits, weave));
}

/**
 * The director's answers at the story meeting, each under its question, for the meeting's
 * fact check after a director's round (T1). Only answered questions print.
 *
 * @param {*} questions - a weave's questions
 * @returns {string} the tagged block, or '' when the director has answered nothing
 */
function renderDirectorAnswers(questions) {
  const answered = weaveQuestionsOf(questions).filter(isAnswered);
  if (answered.length === 0) return '';
  return [
    `<${DIRECTOR_ANSWERS_TAG}>`,
    "The director's answers at the story meeting, each under its question: the director's own words, record as the notes are (T1).",
    ...answered.flatMap((question) => questionLines(question, { unansweredLine: false })),
    `</${DIRECTOR_ANSWERS_TAG}>`
  ].join('\n');
}

module.exports = {
  SETTLED_WEAVE_TAG,
  DIRECTOR_ANSWERS_TAG,
  renderSettledWeave,
  settledWeaveOf,
  renderDirectorAnswers,
  // Brief 4.14a: a meeting change's id in the meeting's own form
  MEETING_CHANGE_PREFIX,
  meetingChangeId,
  // Piece 3 (brief 3C): the director's changes the settled weave shows
  settledChangesOf
};

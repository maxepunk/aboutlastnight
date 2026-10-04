/**
 * The settled weave (phase 4, brief 4.5; spec 4.4 and 5.1): the one renderer that prints
 * the weave as the director left it at the story meeting, for every later writer. The map
 * writer reads it first, as its task (4.6), and the article writer reads it first (4.7).
 *
 * It prints:
 * - the story, its question and the working headline, and the director's words the story
 *   rests on;
 * - every thread with its role, the main thread first and the left-out threads last, each
 *   with its receipt, a thread the director added among them;
 * - the connections the story keeps and the convergence (lib/weave.js storyConnections). A
 *   connection the director struck is gone from it, and since brief 4.14a so is one that
 *   joins a thread left out, so no later writer meets the link;
 * - every question with what its answer changes, and the director's answer word for word
 *   or the mark that it is unanswered;
 * - each change the director made at the meeting, marked on its line by its edit's id
 *   (lib/hand-edit-diff.js weaveDirectorsShare reads the edits): the map marks what it
 *   fits in by those ids.
 *
 * The writer's stronger-main-thread proposal stays out: the roles say which thread the
 * director made the main thread.
 *
 * renderDirectorAnswers prints the answers alone, for the meeting's fact check after a
 * director's round, which reads them as the director's words (T1).
 *
 * Generic: a weave is a story, threads, connections and questions, so nothing here names a
 * theme.
 */
'use strict';

const { isWeave, storyConnections, WEAVE_ROLES } = require('../weave');
const { weaveQuestionsOf, isAnswered, WEAVE_ANSWER_KEY } = require('../writer-questions');
const { weaveDirectorsShare, carriedEdits } = require('../hand-edit-diff');

/** The settled weave's tag, the marker a later writer's render carries. */
const SETTLED_WEAVE_TAG = 'SETTLED_WEAVE';

/** The answers' tag, as the fact check's prompt prints it (evaluator-nodes.js TRUTH_MATERIAL). */
const DIRECTOR_ANSWERS_TAG = 'DIRECTOR_ANSWERS';

/** What two threads share at a connection, in words. */
const CONNECTION_KIND_WORDS = { person: 'a shared person', moment: 'a moment', document: 'a document', line: 'a line' };

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

/** A role in words: `main-thread` is "main thread". */
function roleWords(role) {
  return textOf(role).replace(/-/g, ' ');
}

/** The mark at the end of a line the director changed, or '' for a line that is the writer's. */
function changeMark(parts) {
  if (parts.length === 0) return '';
  return ` [the director's ${parts.length > 1 ? 'changes' : 'change'} ${parts.join('; ')}]`;
}

/**
 * One question, as the settled weave and the answers print it: its id, kind and what it is
 * about, the question and what its answer changes, then the answer word for word.
 */
function questionLines(question, { unansweredLine }) {
  const kind = QUESTION_KIND_WORDS[question.kind] || question.kind;
  const lines = [`- ${question.id} (${kind}; about: ${question.about}): ${question.question} Its answer changes: ${question.changes}`];
  if (isAnswered(question)) lines.push(`  The director's answer, word for word: "${question[WEAVE_ANSWER_KEY].trim()}"`);
  else if (unansweredLine) lines.push('  Unanswered.');
  return lines;
}

/**
 * The weave as the director left it at the story meeting, for every later writer.
 *
 * @param {Object|null} weave - the weave as the director left it (state.weave)
 * @param {Object[]} edits - the director's standing edits the weave carries
 *   (lib/hand-edit-diff.js carriedEdits)
 * @returns {string} the tagged block, or '' when there is no weave
 */
function renderSettledWeave(weave, edits) {
  if (!isWeave(weave)) return '';
  const share = weaveDirectorsShare(edits);
  const fieldMark = (field) => changeMark(share.fields[field] ? [share.fields[field]] : []);

  const lines = [
    `<${SETTLED_WEAVE_TAG}>`,
    "The weave as the director settled it at the story meeting, with the director's answers to the questions. A line that ends in [the director's change ...] holds a change the director made at the meeting, named by its id. Each answer is the director's words, word for word.",
    '',
    `STORY: ${textOf(weave.story)}${fieldMark('story')}`,
    `QUESTION: ${textOf(weave.question)}${fieldMark('question')}`,
    `WORKING HEADLINE: ${textOf(weave.headline)}${fieldMark('headline')}`
  ];
  if (textOf(weave.fromYourNotes)) {
    lines.push(`FROM THE DIRECTOR'S NOTES: "${textOf(weave.fromYourNotes)}"${fieldMark('fromYourNotes')}`);
  }

  const rank = (thread) => {
    const index = WEAVE_ROLES.indexOf(thread.role);
    return index === -1 ? WEAVE_ROLES.length : index;
  };
  const threads = objectsOf(weave.threads)
    .map((thread, order) => ({ thread, order }))
    .sort((a, b) => rank(a.thread) - rank(b.thread) || a.order - b.order)
    .map(({ thread }) => thread);
  lines.push('', 'THREADS:');
  threads.forEach((thread) => {
    const id = textOf(thread.id);
    const parts = [];
    if (share.addedThreads[id]) parts.push(`${share.addedThreads[id]}: a thread they added`);
    if (share.reroledThreads[id]) parts.push(`${share.reroledThreads[id]}: the role`);
    Object.entries(share.threadFields)
      .filter(([place]) => place.startsWith(`${id}.`))
      .forEach(([place, editId]) => parts.push(`${editId}: the ${place.slice(id.length + 1)}`));
    const receipt = textOf(thread.receipt) ? ` Receipt: ${textOf(thread.receipt)}.` : '';
    const verdict = thread.verdict === true ? " It carries the room's verdict." : '';
    const reason = textOf(thread.reason) && thread.role === 'left-out' ? ` Why it is left out: ${textOf(thread.reason)}` : '';
    lines.push(`- ${id} (${roleWords(thread.role)}): ${textOf(thread.claim)}${receipt}${verdict}${reason}${changeMark(parts)}`);
  });

  const connections = storyConnections(weave);
  if (connections.length > 0) {
    lines.push('', 'CONNECTIONS:');
    connections.forEach((connection) => {
      const joins = Array.isArray(connection.joins) ? connection.joins.map(textOf).filter(Boolean) : [];
      const kind = CONNECTION_KIND_WORDS[connection.kind] || textOf(connection.kind);
      lines.push(`- ${textOf(connection.id)}, ${kind}, joining ${joins.join(' and ')}: ${textOf(connection.detail)}`);
    });
  }
  lines.push('', `CONVERGENCE: ${textOf(weave.convergence)}${fieldMark('convergence')}`);

  const questions = weaveQuestionsOf(weave.questions);
  if (questions.length > 0) {
    lines.push('', "QUESTIONS TO THE DIRECTOR, WITH THE DIRECTOR'S ANSWERS:");
    questions.forEach((question) => lines.push(...questionLines(question, { unansweredLine: true })));
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
  renderDirectorAnswers
};

/**
 * The weave (phase 4, brief 4.4; spec docs/superpowers/specs/2026-10-02-story-meeting-and-map.md
 * section 4.5; phase 4b, piece 3, brief 3B; spec 2026-10-06 sections 3, 4, 8, 9 and 17;
 * CONTEXT.md "Weave"): what the arc writer brings to the story meeting. The arc writer pitches
 * two or three angles over one shared set of threads, and the director picks one and settles it.
 *
 * This module holds the weave's shape constants and the rules every reader of a weave
 * shares, so each rule is one function: the arc writer and its rework (the schema in
 * lib/sdk-client/subagents.js is built from these constants), the code checks
 * (checkWeave), the fact check's mark (the evaluator), the routing (graph.js), the
 * meeting, and every later writer, which reads the settled angle through one helper
 * (settledAngleOf).
 *
 * A weave holds (phase 4b, pieces 1 and 3: the lines at the level of the story, the evidence
 * underneath):
 * - `angles`: two or three, each `{id, headline, gist, story, question, lands, ends, threads}`
 *   (ANGLE_FIELDS are the printed ones): a story the article could tell, its card's one sentence,
 *   the story, the question it carries, why it lands with the players, where it ends up, and the
 *   ids of the threads it tells, in the order it tells them;
 * - `fromYourNotes`: the director's own words angle 1 rests on, present only when the notes end
 *   with the director's read;
 * - `threads`: `{id, name, line, verdict?, evidence}`, the one set every angle draws on, each a
 *   name and one line in story terms, `verdict: true` on the thread that carries the room's
 *   verdict, and its evidence: the pieces of the record that tell it (lib/evidence.js);
 * - `connections`: `{id, joins: [threadId, threadId], line, kind, evidence}`, the kind
 *   underneath and never printed;
 * - `questions`: the questions for the director (lib/writer-questions.js
 *   WEAVE_QUESTIONS_PROPERTY), each beside the thread its answer changes or by the pitch.
 *
 * Code-owned keys open with an underscore and never reach a prompt (weaveForPrompt): the
 * fact check's mark, FACT_CHECK_MARK_KEY.
 *
 * At the story meeting the director leaves the weave with their changes in it and their pick,
 * `picked` (PICKED_KEY, R1): the id of the angle they sent on, written by the meeting's gate and
 * owned by code as an answer is, so code strips it from a writer's or a rework's output and puts
 * it back after a rework while its angle survives (arc-specialist-nodes.js), and no prompt prints
 * it (weaveForRework, weaveForJudge). With none, the first angle is open (pickedAngleOf). Every reader after the meeting reads the picked angle, its
 * threads in its order, the threads it leaves out and the connections between its threads
 * through settledAngleOf. The checks read only the writer's text (R11): the director's share of
 * the weave, read from their standing edits (lib/hand-edit-diff.js weaveDirectorsShare), is never
 * a check's failure. The evidence is never
 * the director's (R6), so every piece is the writer's to answer for.
 *
 * Generic: a weave is angles, threads, connections and questions, so nothing here names a theme.
 */

const crypto = require('crypto');
const { isVerbatimIn } = require('./grounding');
const { wordCount, pageLengthOf } = require('./word-count');
const { WEAVE_ANSWER_KEY, WEAVE_QUESTION_THREAD_KEY, isAnswered, withoutAnswers } = require('./writer-questions');
// Phase 4b (brief 1B; R10): the evidence check and the story-terms check, which the map shares.
const {
  evidenceProblems, describeEvidenceProblems, evidenceProblemsSaid, storyTermsProblems, describeStoryTerms, storyTermsSaid, STORY_TERMS_FIX
} = require('./evidence');

/**
 * An angle's printed fields, in the order the meeting prints its pitch (spec 2026-10-06 sections 4
 * and 17): the headline, the card's one sentence (`gist`), the story, the question it carries, why
 * it lands with the players and where it ends up. An angle's `id` and its `threads` are not printed
 * text.
 */
const ANGLE_FIELDS = Object.freeze(['headline', 'gist', 'story', 'question', 'lands', 'ends']);

/** The weave's key for the director's pick: the id of the angle they sent on (R1). */
const PICKED_KEY = 'picked';

/**
 * The words a question may use across its `about`, `question` and `changes` together (R4; spec
 * 9.1): one or two short sentences and a line on what its answer changes (C15). On 100326 one
 * question ran to 79.
 */
const QUESTION_WORD_BOUND = 40;

/** What two threads share at a connection: a person, a moment, a document or a line. Kept underneath, never printed. */
const CONNECTION_KINDS = Object.freeze(['person', 'moment', 'document', 'line']);

/**
 * The bound on the story meeting's page, as it prints with any angle open (spec 2026-10-06
 * sections 5 and 9.1; R5). The rule is lib/word-count.js pageLengthOf's, which the map keeps
 * too: the meeting's writer is held only to its own words, and may use
 * max(MEETING_WORD_FLOOR, MEETING_WORD_BOUND - overhead) of them (meetingLengthOf). The meeting's
 * overhead is what code prints: the verdict, its charge and its vote, the open angle's card line,
 * the verdict thread's lock and the thin-notes line (labels are no words on the page). The check
 * node counts it once with each angle open, with every field the writer writes left blank
 * (weaveWritersTextBlank; lib/workflow/nodes/arc-specialist-nodes.js meetingPageWords), on the
 * writer's share of the weave (writersShareOf). The writer's task asks
 * for the page and for its own share of it.
 */
const MEETING_WORD_BOUND = 450;

/**
 * The integrator's guard (fix round 4): the words of its own the meeting's writer may always use,
 * the floor of pageLengthOf's rule, so that the lines code prints, such as a long split vote,
 * never leave the writer fewer than 350 words (R5).
 */
const MEETING_WORD_FLOOR = 350;

/**
 * The meeting's length as the check reads it, by pageLengthOf's rule with the meeting's bound
 * and floor: the page's words, the writer's own words on it (the page's less its overhead) and
 * the words of its own the writer may use.
 *
 * @param {number} pageWords - the meeting's page as it first opens, counted
 * @param {number} overheadWords - the words on that page the writer did not write
 * @returns {{page: number, writer: number, allowance: number}}
 */
function meetingLengthOf(pageWords, overheadWords) {
  return pageLengthOf(pageWords, overheadWords, { bound: MEETING_WORD_BOUND, floor: MEETING_WORD_FLOOR });
}

/** The `source` the weave checks stamp on validationResults (node-helpers.js CODE_CHECKS). */
const WEAVE_CHECKS_SOURCE = 'weave-checks';

/**
 * Where the fact check marks the weave it judged: `{at, ready, fixes}`. `ready` is the
 * fact check's verdict and `fixes` the automatic fixes run on that verdict. The fix keeps
 * the mark; a director's round writes a weave without it, so the fact check runs again.
 */
const FACT_CHECK_MARK_KEY = '_factCheck';

/**
 * The director's two rounds at the story meeting: a reweave fits their changes in, a
 * send-back rethinks the weave as their note asks. The round mark (state `_meetingRound`)
 * names the round explicitly, so no rework reads the note's presence to tell them apart.
 */
const MEETING_ROUNDS = Object.freeze(['reweave', 'send-back']);

/** Whether a value is a weave: an object with a list of threads. */
function isWeave(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.threads));
}

/** A field as text: the string trimmed, or '' for anything else. */
function textOf(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** The objects in a list, or none. */
function objectsOf(value) {
  return Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : [];
}

/** Does `object` hold `key` as its own property? */
function has(object, key) {
  return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * A thread's, connection's or question's id as every join at the story meeting reads it
 * (ruling 3; fix round 1, finding 3): the id trimmed, or '' for an element with no id
 * text. The meeting's gate (lib/meeting.js), the checks and the diff and the edits
 * (lib/hand-edit-diff.js) all read an element's id through it.
 *
 * @param {*} element
 * @returns {string}
 */
function weaveIdOf(element) {
  return element && typeof element === 'object' ? textOf(element.id) : '';
}

/**
 * The ids that more than one element of a list carries (weaveIdOf), each once, in the
 * order each first repeats: the one rule for a repeated id, which the meeting's gate, the
 * checks and the diff all call (ruling 3; fix round 1, finding 3). An element with no id
 * repeats nothing.
 *
 * @param {*} elements - a weave's threads, connections or questions
 * @returns {string[]}
 */
function repeatedIds(elements) {
  const seen = new Set();
  const repeated = [];
  objectsOf(elements).forEach((element) => {
    const id = weaveIdOf(element);
    if (!id) return;
    if (seen.has(id) && !repeated.includes(id)) repeated.push(id);
    seen.add(id);
  });
  return repeated;
}

/**
 * Each element's place under its id (weaveIdOf), index for index with the list:
 * `${occurrence}:${id}`, the first element under an id occurrence 0 and a second under the
 * same id occurrence 1, so the elements under an id a list repeats pair in order between
 * two versions. The diff (lib/hand-edit-diff.js elementsById) keys its elements by it
 * (brief 4.5b; the integrator's merge). The questions' carry reads it as a question's place
 * (lib/writer-questions.js carriedWeaveQuestions). An element with no id has no place: null.
 *
 * @param {*} elements - a weave's threads, connections or questions
 * @returns {Array<string|null>}
 */
function occurrenceKeys(elements) {
  const seen = new Map();
  return (Array.isArray(elements) ? elements : []).map((element) => {
    const id = weaveIdOf(element);
    if (!id) return null;
    const occurrence = seen.get(id) || 0;
    seen.set(id, occurrence + 1);
    return `${occurrence}:${id}`;
  });
}

/**
 * The director's share of the weave, with each part present (phase 4b, piece 3, brief 3C):
 * `{fields, angleFields, flippedIn, flippedOut, addedThreads, threadFields, addedConnections,
 * connectionFields}`, each a map from what the director changed to the id of their standing edit
 * (lib/hand-edit-diff.js weaveDirectorsShare builds it): a field of the weave they rewrote
 * (`fromYourNotes`), a line of an angle's pitch they rewrote (`a1.story`), a thread they brought
 * into an angle or left out of it (`a1.t6`, R2), a thread they added (`t7`), a field of a thread
 * they rewrote (`t3.line`), a connection they added (`c5`), a field of a connection they rewrote
 * (`c1.line`); and `threadIndexes`, where in the weave's threads each thread their edits find
 * sits, by its id, which tells their thread from the writer's under an id the writer repeated.
 */
function shareOf(directorsShare) {
  const share = directorsShare && typeof directorsShare === 'object' ? directorsShare : {};
  return {
    fields: share.fields || {},
    angleFields: share.angleFields || {},
    flippedIn: share.flippedIn || {},
    flippedOut: share.flippedOut || {},
    addedThreads: share.addedThreads || {},
    threadFields: share.threadFields || {},
    addedConnections: share.addedConnections || {},
    connectionFields: share.connectionFields || {},
    threadIndexes: share.threadIndexes || {}
  };
}

/** The ids, under an element's id, of a share's map keyed `<id>.<part>` (`a1.story` and `a1.t6` under `a1`). */
function partsUnder(map, id) {
  return id ? Object.keys(map).filter((key) => key.startsWith(`${id}.`)).map((key) => key.slice(id.length + 1)) : [];
}

/** The ids of the threads an angle names, trimmed, each once, in its order. */
function angleThreadIds(angle) {
  const ids = (angle && Array.isArray(angle.threads) ? angle.threads : []).map(textOf).filter(Boolean);
  return [...new Set(ids)];
}

/**
 * The angle the director picked (R1): the angle `picked` names, else the first angle, else null
 * for a weave with no angle. The one reading of the pick, which every reader of the settled story
 * and the meeting's gate call.
 *
 * @param {Object|null} weave
 * @returns {Object|null}
 */
function pickedAngleOf(weave) {
  const angles = objectsOf(weave && weave.angles);
  if (angles.length === 0) return null;
  const picked = textOf(weave[PICKED_KEY]);
  return (picked && angles.find((angle) => weaveIdOf(angle) === picked)) || angles[0];
}

/**
 * The settled story (spec 2026-10-06 section 8; survey Q1): the one reading of the angle the
 * director picked, which every reader after the meeting goes through (the settled weave the later
 * writers read, the map's settled story, the map checks' threads and connections, the director's
 * threads the map may name in its gap note).
 * - `angle`: the picked angle (pickedAngleOf);
 * - `threads`: the threads it tells, in its order, each once: an id it names that the weave
 *   does not hold is skipped, and a thread the director added comes after the angle's own, since
 *   the meeting appends it;
 * - `leftOut`: every other thread, in the weave's order;
 * - `connections`: the connections that join two of its threads.
 *
 * @param {Object|null} weave
 * @returns {{angle: Object, threads: Object[], leftOut: Object[], connections: Object[]}|null}
 *   null for a weave with no angle
 */
function settledAngleOf(weave) {
  const angle = pickedAngleOf(weave);
  if (!angle) return null;
  const threads = objectsOf(weave.threads);
  const inStory = angleThreadIds(angle)
    .map((id) => threads.find((thread) => weaveIdOf(thread) === id))
    .filter(Boolean);
  const inIds = new Set(inStory.map((thread) => weaveIdOf(thread)));
  return {
    angle,
    threads: inStory,
    leftOut: threads.filter((thread) => !inStory.includes(thread)),
    connections: objectsOf(weave.connections).filter((connection) => {
      const joins = Array.isArray(connection.joins) ? connection.joins.map(textOf) : [];
      return joins.length === 2 && joins[0] !== joins[1] && joins.every((id) => inIds.has(id));
    })
  };
}

/**
 * The connections the settled story keeps (settledAngleOf): the connections between two
 * threads of the picked angle. Every reader of the story's connections reads these: the settled
 * weave, and through it the map writer and the article writer, and the map check.
 *
 * @param {Object} weave
 * @returns {Object[]}
 */
function storyConnections(weave) {
  const settled = settledAngleOf(weave);
  return settled ? settled.connections : [];
}

/**
 * The weave with the director's pick carried over from the version a rework started from (R1):
 * the pick stays while its angle survives by id, and goes otherwise, so the first angle is open.
 * Whatever pick the rework's output carries is code's to set, never the model's.
 *
 * @param {Object} weave - the rework's weave
 * @param {Object|null} previous - the weave the rework started from
 * @returns {Object}
 */
function withPickFrom(weave, previous) {
  if (!weave || typeof weave !== 'object') return weave;
  const { [PICKED_KEY]: _ignored, ...out } = weave;
  const picked = textOf(previous && previous[PICKED_KEY]);
  return picked && objectsOf(out.angles).some((angle) => weaveIdOf(angle) === picked) ? { ...out, [PICKED_KEY]: picked } : out;
}

/**
 * The weave with each question's `thread` kept only while the weave holds that thread (R10): a
 * question whose thread a rework dropped or renumbered sits by the pitch, answered or not, and
 * keeps its answer.
 *
 * Given the version the rework started from and the questions the rework returned (fix round 1,
 * finding 4), a question whose `thread` came from that version keeps it only while the weave
 * holds the same thread under the id, by its name or its line: a rework may renumber the threads
 * and give the id to another thread, and the director's answer must not then sit beside it. Such
 * a question is one that is answered (code keeps an answered question whole, lib/writer-questions.js
 * carriedWeaveQuestions), or one the rework did not return in any form, which code carried. A
 * question the rework returned (unanswered, as the rework wrote it) names its thread in the
 * rework's own numbering, so only the "still held" test reads it.
 *
 * @param {Object} weave
 * @param {Object|null} [previous] - the weave the rework started from
 * @param {*} [returned] - the questions the rework returned
 * @returns {Object}
 */
function withHeldQuestionThreads(weave, previous = null, returned = undefined) {
  if (!isWeave(weave) || !Array.isArray(weave.questions)) return weave;
  const threadsUnder = (version) => new Map(objectsOf(version && version.threads)
    .filter((thread) => weaveIdOf(thread))
    .map((thread) => [weaveIdOf(thread), thread]));
  const now = threadsUnder(weave);
  const before = threadsUnder(previous);
  const wordsOf = (question) => JSON.stringify(['kind', 'about', 'question', 'changes', WEAVE_QUESTION_THREAD_KEY]
    .map((field) => textOf(question[field])));
  // Without the rework's list, every question is the one the rework started from.
  const reworksOwn = Array.isArray(returned) ? new Set(objectsOf(returned).map(wordsOf)) : new Set();
  const sameThread = (a, b) => (textOf(a.name) && textOf(a.name) === textOf(b.name)) || (textOf(a.line) && textOf(a.line) === textOf(b.line));
  return {
    ...weave,
    questions: weave.questions.map((question) => {
      if (!question || typeof question !== 'object' || !has(question, WEAVE_QUESTION_THREAD_KEY)) return question;
      const id = textOf(question[WEAVE_QUESTION_THREAD_KEY]);
      const fromPrevious = isAnswered(question) || !reworksOwn.has(wordsOf(question));
      const held = now.has(id) && (!fromPrevious || !before.has(id) || sameThread(before.get(id), now.get(id)));
      if (held) return question;
      const { [WEAVE_QUESTION_THREAD_KEY]: _stale, ...byThePitch } = question;
      return byThePitch;
    })
  };
}

/**
 * The fields of the weave the story meeting prints, part by part, in the order it prints
 * them (brief 4.5b): the one list the edits read a weave's text by (lib/hand-edit-diff.js
 * weaveParts), so a field added to the weave is added here once. The parts are the weave's
 * own field, "from your notes", then each angle's pitch (ANGLE_FIELDS; phase 4b, brief 3B),
 * each thread's name and line, each connection's line and each question's. The pick is no
 * printed field (R1): it is the director's choice, which code keeps. The evidence under a line is
 * no printed field either: the page folds it, and it is never the director's (R6). A question's
 * answer is no printed field of the weave's: it is the director's words, kept with the question
 * (lib/writer-questions.js), and so is the thread a question sits beside, which the page shows by
 * where it puts the question.
 *
 * `directorsWords` names the field that quotes the director's notes, "from your notes", which
 * the story-terms check leaves alone.
 */
const WEAVE_PRINTED_FIELDS = Object.freeze({
  weave: Object.freeze(['fromYourNotes']),
  angles: ANGLE_FIELDS,
  threads: Object.freeze(['name', 'line']),
  connections: Object.freeze(['line']),
  questions: Object.freeze(['about', 'question', 'changes']),
  directorsWords: Object.freeze(['fromYourNotes'])
});

/**
 * The weave's printed fields (WEAVE_PRINTED_FIELDS), each as it stands in the weave, in the
 * order the meeting prints them: `{part, field, text, element?, directorsWords?}`, where
 * `part` is the weave's part (`weave`, `angles`, `threads`, `connections`, `questions`),
 * `element` the angle, thread, connection or question the field belongs to, and `text` the
 * field's value.
 *
 * @param {Object} weave
 * @returns {Array<{part: string, field: string, text: *, element?: Object, directorsWords?: true}>}
 */
function printedWeaveFields(weave) {
  if (!weave || typeof weave !== 'object') return [];
  const fieldsOf = (part, element) => WEAVE_PRINTED_FIELDS[part].map((field) => ({ part, field, text: element[field], element }));
  return [
    ...WEAVE_PRINTED_FIELDS.weave.map((field) => ({
      part: 'weave', field, text: weave[field], ...(WEAVE_PRINTED_FIELDS.directorsWords.includes(field) && { directorsWords: true })
    })),
    ...objectsOf(weave.angles).flatMap((angle) => fieldsOf('angles', angle)),
    ...objectsOf(weave.threads).flatMap((thread) => fieldsOf('threads', thread)),
    ...objectsOf(weave.connections).flatMap((connection) => fieldsOf('connections', connection)),
    ...objectsOf(weave.questions).flatMap((question) => fieldsOf('questions', question))
  ];
}

/**
 * The weave as the writer's share of it, for the meeting's page the check node counts
 * (Review focus 3: only the writer's output is held to the bound, never the director's
 * version). Read from the director's share (shareOf), it has:
 * - each line the director rewrote empty: a field of the weave, a line of an angle's pitch, a
 *   field of a thread or of a connection, so a pitch the director lengthened is never counted as
 *   the writer's (piece 3, brief 3C);
 * - each thread the director brought into an angle off that angle's list, so its line, which the
 *   angle prints only by their choice, is not counted (R2); a thread they left out of one stays
 *   out, since the page then prints less of the writer's;
 * - no thread the director added, and no connection they added;
 * - no answer on any question, since the answers are the director's words.
 * "From your notes" stays as the page prints it: it quotes the director's notes, and an empty
 * one would print the page's thin-notes line in its place. The weave given is left as it was.
 *
 * @param {Object} weave
 * @param {Object} [directorsShare] - shareOf's parts
 * @returns {Object}
 */
function writersShareOf(weave, directorsShare) {
  if (!isWeave(weave)) return weave;
  const share = shareOf(directorsShare);
  const out = { ...weave };
  Object.keys(share.fields).forEach((field) => {
    if (WEAVE_PRINTED_FIELDS.directorsWords.includes(field)) return;
    if (typeof out[field] === 'string') out[field] = '';
  });
  /** The element with each text field the director rewrote (`<id>.<field>` in `fields`) empty. */
  const writersLines = (element, fields) => {
    if (!element || typeof element !== 'object') return element;
    const typed = partsUnder(fields, weaveIdOf(element)).filter((field) => typeof element[field] === 'string');
    return typed.length === 0 ? element : { ...element, ...Object.fromEntries(typed.map((field) => [field, ''])) };
  };
  if (Array.isArray(weave.angles)) {
    out.angles = weave.angles.map((angle) => {
      const lines = writersLines(angle, share.angleFields);
      const broughtIn = partsUnder(share.flippedIn, weaveIdOf(angle));
      if (broughtIn.length === 0 || !Array.isArray(lines.threads)) return lines;
      return { ...lines, threads: lines.threads.filter((id) => !broughtIn.includes(textOf(id))) };
    });
  }
  out.threads = weave.threads
    .filter((thread) => !has(share.addedThreads, weaveIdOf(thread)))
    .map((thread) => writersLines(thread, share.threadFields));
  if (Array.isArray(weave.connections)) {
    out.connections = weave.connections
      .filter((connection) => !has(share.addedConnections, weaveIdOf(connection)))
      .map((connection) => writersLines(connection, share.connectionFields));
  }
  if (Array.isArray(weave.questions)) out.questions = withoutAnswers(weave.questions);
  return out;
}

/**
 * What a field the writer writes holds on the page the meeting's overhead is counted on: a mark
 * with no word in it (lib/word-count.js wordCount), so the page keeps every line and label it
 * prints. A field left empty would change them: a thread with no name is named by its line, a
 * connection that joins one by words the page never prints, and a question with no text is not
 * asked.
 */
const NO_WORDS = '-';

/**
 * The weave with every field the writer writes holding no word (NO_WORDS; pageLengthOf's rule),
 * for the page the check node counts the meeting's overhead on: each of the fields the meeting
 * prints (WEAVE_PRINTED_FIELDS) that holds text, which are "from your notes" (the writer chooses
 * how much of the director's words to quote), each angle's pitch, each thread's name and line,
 * each connection's line, and each question's text, what it changes and what it is about.
 * So the verdict, the open angle's card line, the verdict thread's lock and the thin-notes line
 * count as code's. The pick stays, so the page opens the same angle. The weave given is left as it
 * was.
 *
 * @param {Object} weave
 * @returns {Object}
 */
function weaveWritersTextBlank(weave) {
  if (!isWeave(weave)) return weave;
  const out = JSON.parse(JSON.stringify(weave));
  printedWeaveFields(out).forEach(({ part, field, element }) => {
    const holder = part === 'weave' ? out : element;
    if (holder && typeof holder === 'object' && typeof holder[field] === 'string' && holder[field].trim()) holder[field] = NO_WORDS;
  });
  return out;
}

/**
 * The writer's lines on the meeting's page with the picked angle open (pickedAngleOf), each with
 * its words, the longest first, as the page prints them (console/checkpoint-view-logic.js
 * meetingView): "from your notes", the card of each other angle (its headline and its card line),
 * the open angle's pitch (its headline, story, question, why it lands and where it ends up), each
 * of its threads (its name and its line), the names of the threads it leaves out, the line of each
 * connection between its threads, and each question. Read from the writer's share of the weave
 * (writersShareOf), so the director's lines hold no word. The over-length check names the longest
 * to the rework, by the ids it reads.
 *
 * @param {Object} weave - the writer's share of the weave, with the angle to open picked
 * @returns {Array<{name: string, words: number}>}
 */
function writersLinesOnPage(weave) {
  const lines = [];
  const add = (name, ...texts) => {
    const words = texts.reduce((sum, text) => sum + wordCount(textOf(text)), 0);
    if (words > 0) lines.push({ name, words });
  };
  if (!isWeave(weave)) return lines;
  add('"from your notes"', weave.fromYourNotes);
  const settled = settledAngleOf(weave);
  objectsOf(weave.angles)
    .filter((angle) => !settled || angle !== settled.angle)
    .forEach((angle) => add(`angle ${weaveIdOf(angle)}'s headline and card line`, angle.headline, angle.gist));
  if (settled) {
    const id = weaveIdOf(settled.angle);
    add(`angle ${id}'s pitch`, settled.angle.headline, settled.angle.story, settled.angle.question, settled.angle.lands, settled.angle.ends);
    settled.threads.forEach((thread) => add(`thread ${weaveIdOf(thread)}'s name and line`, thread.name, thread.line));
    add(`the names of the threads angle ${id} leaves out`, ...settled.leftOut.map((thread) => thread.name));
    settled.connections.forEach((connection) => add(`connection ${weaveIdOf(connection)}'s line`, connection.line));
  }
  objectsOf(weave.questions).forEach((question) => add(`question ${weaveIdOf(question)}`, question.about, question.question, question.changes));
  return lines.sort((a, b) => b.words - a.words);
}

/**
 * The weave as a prompt prints it: without its code-owned keys (those that open with an
 * underscore, the fact check's mark among them).
 *
 * @param {Object|null} weave
 * @returns {Object|null}
 */
function weaveForPrompt(weave) {
  if (!weave || typeof weave !== 'object' || Array.isArray(weave)) return weave;
  return Object.fromEntries(Object.entries(weave).filter(([key]) => !key.startsWith('_')));
}

/**
 * The weave as a rework reads it (brief 4.5): without its code-owned keys or the director's
 * pick. The pick is code's (R1), put back after the rework while its angle survives
 * (withPickFrom), so no prompt prints it. The answers stay on their questions, since a rework
 * works from them.
 *
 * @param {Object|null} weave
 * @returns {Object|null}
 */
function weaveForRework(weave) {
  const view = weaveForPrompt(weave);
  if (!view || typeof view !== 'object' || Array.isArray(view)) return view;
  const { [PICKED_KEY]: _pick, ...unpicked } = view;
  return unpicked;
}

/**
 * The weave as the fact check judges it (brief 4.5): the rework's view, without the pick,
 * with no answer on any question. The answers are the director's words, which the fact check reads apart,
 * as record (T1), never as the writer's text it judges.
 *
 * @param {Object|null} weave
 * @returns {Object|null}
 */
function weaveForJudge(weave) {
  const view = weaveForRework(weave);
  if (!isWeave(view) || !Array.isArray(view.questions)) return view;
  return {
    ...view,
    questions: view.questions.map((question) => {
      if (!has(question, WEAVE_ANSWER_KEY)) return question;
      const { [WEAVE_ANSWER_KEY]: _answer, ...asked } = question;
      return asked;
    })
  };
}

/** JSON with every object's keys sorted, so equal content gives one text. */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).filter(key => value[key] !== undefined).sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

/**
 * The weave's version stamp: a short hash of its content, without its code-owned keys.
 * A check result and a fact check stamped with it say which weave they read.
 *
 * @param {Object} weave
 * @returns {string} 12 hex characters
 */
function weaveKey(weave) {
  return crypto.createHash('sha1').update(canonicalJson(weaveForPrompt(weave) || null)).digest('hex').slice(0, 12);
}

/** The fact check's mark on a weave, or null when no fact check has judged it. */
function factCheckMarkOf(weave) {
  const mark = weave && typeof weave === 'object' ? weave[FACT_CHECK_MARK_KEY] : null;
  return mark && typeof mark === 'object' ? mark : null;
}

/** Whether the fact check has judged this weave. */
function isWeaveJudged(weave) {
  return factCheckMarkOf(weave) !== null;
}

/**
 * @param {Object} weave
 * @param {{at: string, ready: boolean, fixes: number}} mark
 * @returns {Object} the weave with the mark
 */
function withFactCheckMark(weave, mark) {
  return { ...weave, [FACT_CHECK_MARK_KEY]: mark };
}

/**
 * Whether the director has approved the story meeting: the meeting's own approval
 * (`meetingApproved`), which the stop sets when the director approves (brief 4.5). The
 * one rule: the check node, the fact check's skip and both arc routes read it here.
 *
 * @param {Object} state
 * @returns {boolean}
 */
function isMeetingApproved(state) {
  return Boolean(state && state.meetingApproved === true);
}

/**
 * The director's round at the story meeting, from its explicit mark (`_meetingRound`):
 * 'reweave' or 'send-back', or null when the rework in hand is an automatic pass. The
 * mark, never the note's presence, decides the rework's scope, its system prompt and the
 * round's counters (brief 4.5).
 *
 * @param {Object} state
 * @returns {'reweave'|'send-back'|null}
 */
function meetingRoundOf(state) {
  const round = state && state._meetingRound;
  return MEETING_ROUNDS.includes(round) ? round : null;
}

/** The director's words "from your notes" quotes, without quotation marks around them. */
function quotedWords(text) {
  return textOf(text).replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '');
}

/**
 * How a failure's line names a field of an element to the director: as the meeting prints it, a
 * thread's name and line, and an angle's pitch (phase 4b, brief 3B).
 */
const ELEMENT_FIELD_WORDS = Object.freeze({
  name: 'its name',
  line: 'its line',
  gist: 'its card line',
  story: 'its story',
  question: 'its question',
  lands: 'why it lands',
  ends: 'where it ends up'
});

/** An angle's lines the story-terms check reads: every printed field but the headline, the article's own line (R2). */
const ANGLE_STORY_FIELDS = Object.freeze(ANGLE_FIELDS.filter((field) => field !== 'headline'));

/**
 * Why a line that fails the story-terms check is wrong, said to the director after what it holds
 * (storyTermsSaid): the meeting's lines tell the story, and the record's details travel under them.
 */
const STORY_TERMS_LINE = "The meeting tells the story in plain words; the record's quotations, times, figures and documents go in the evidence underneath.";

/** A phrase with its first letter up, to open a line. */
function opening(text) {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

/** Words joined as a list is read: "a", "a and b", "a, b and c". */
function listOf(words) {
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words.join('');
}

/** A thread as a check's line names it, in the director's words for it: by its name; by its line, or its id, when it has none. */
function threadWords(thread) {
  return `the thread "${textOf(thread.name) || textOf(thread.line) || weaveIdOf(thread)}"`;
}

/** An angle as a check's line names it: by its headline, or its card line, as the meeting shows its card. */
function angleWords(angle) {
  const name = textOf(angle.headline) || textOf(angle.gist);
  return name ? `the angle "${name}"` : 'an angle with no headline';
}

/** A connection as a check's line names it: by its line, or its id when it has none. */
function connectionWords(connection) {
  return `the connection "${textOf(connection.line) || weaveIdOf(connection)}"`;
}

/** A question as a check's line names it: by what it asks. */
function questionWords(question) {
  return `the question "${textOf(question.question) || textOf(question.about) || weaveIdOf(question)}"`;
}

/** Where a failure about an element sits, as the meeting reads a place (`threads[#t3]`), or null for an element with no id. */
function elementPlace(collection, element) {
  const id = weaveIdOf(element);
  return id ? `${collection}[#${id}]` : null;
}

/**
 * The code checks on a weave (spec 2026-10-05 sections 4.1 and 6.1; spec 2026-10-06 section 9.1),
 * on the writer's text alone (R11, brief 4.5).
 *
 * Each failure is `{type, message, line, place?}`, the convention the map's checks follow too:
 * - `message` is the rework's: one line that names the line it is about (an angle by its
 *   headline, a thread by its name, a connection by its line) and its fix, in the writer's terms:
 *   a thread id the rework must fix, the piece of evidence by its number, a source by its id, the
 *   rule item it breaks. The rework reads it, through validationResults.
 * - `line` is the director's (spec 6.3): what is wrong at that place, in plain words, as the
 *   meeting names things: an angle by its headline, a thread by its name, a document by what it
 *   is if at all, never an id, a piece's number, a source's code, a rule item, a tag or a field's
 *   name. The meeting shows it when the check still fails after the rework
 *   (console/checkpoint-view-logic.js failuresBesideLines), and lib/evidence.js storyTermsSaid and
 *   evidenceProblemsSaid say the shared checks' hits in these words.
 * - `place` is where the meeting shows it, beside the line it names: an angle's, a thread's, a
 *   connection's or a question's path (`angles[#a2]`, `threads[#t3]`, `connections[#c2]`,
 *   `questions[#q1]`) or "from your notes" (`fromYourNotes`). A failure with no place (the count
 *   of angles, the page's length and a verdict no thread carries) sits at the top of the page.
 *
 * In the order the meeting prints the weave:
 * - the writer pitches two or three angles (`angle-count`; C1);
 * - each angle has every field, its headline, card line, story, question, why it lands, where it
 *   ends up and at least one thread (`angle-incomplete`); names only threads the weave holds
 *   (`angle-names-unknown-thread`); and holds the thread that carries the room's verdict
 *   (`angle-without-verdict`; C16, T2);
 * - each of the writer's lines is in story terms (`story-terms`; lib/evidence.js
 *   storyTermsProblems: no document id, quotation, clock time or money figure): each angle's card
 *   line, story, question, why it lands and where it ends up, each thread's name and line, and
 *   each connection's line. Exempt (R2): each angle's headline, the article's own printed
 *   line, "from your notes", the questions, and the verdict line, which code prints;
 * - every angle has an id of its own (`duplicate-id`);
 * - "from your notes" is word for word in the director's notes or corrections
 *   (`from-your-notes-not-verbatim`; lib/grounding.js isVerbatimIn);
 * - every thread the writer wrote, in an angle or in none, has a piece of evidence that supports
 *   it (`thread-without-evidence`), and every piece of a thread or a connection passes the
 *   evidence check (`evidence-not-in-record`; lib/evidence.js evidenceProblems);
 * - every thread, connection and question has an id of its own (`duplicate-id`), a repeat read by
 *   repeatedIds, the rule the meeting's gate and the diff read too. A repeat is the writer's
 *   failure, under the id of a thread the director added or changed too, and then its line says
 *   the director's thread keeps the id (brief 4.5b);
 * - the room's verdict is one of the threads: a thread marked `verdict: true`
 *   (`no-verdict-thread`);
 * - every connection joins two threads the weave holds (`connection-joins-unknown-thread`);
 * - each question comes to at most QUESTION_WORD_BOUND words across what it is about, the
 *   question and what its answer changes (`question-too-long`; R4), and a question that sits
 *   beside a thread names one the weave holds (`question-thread-unknown`). One question per
 *   subject is the writer's rule (C15), not a check's;
 * - the writer's own words on the meeting's page stay within the words it may use with each angle
 *   open (`over-length`; R5; lib/word-count.js pageLengthOf's rule): the check node counts the
 *   page of the writer's share (writersShareOf) once with each angle open, with lib/stop-pages.js
 *   wordsShown, and its overhead (weaveWritersTextBlank), and passes the worst angle's length
 *   (meetingLengthOf) with that angle's id, which this module does not count. The message and the
 *   line name that angle by its headline.
 *
 * The director's share of the weave is never a check's failure: a line they wrote is not held
 * to story terms (a line of an angle's pitch, a field of a thread or of a connection they
 * rewrote, and every line of a thread or a connection they added), a thread they added may have
 * no evidence, "from your notes" they rewrote is not checked against the notes, and their words,
 * the line of a thread they brought into an angle among them, add nothing to the count
 * (writersShareOf). A thread they brought in or left out is still the writer's text, held as the
 * writer's. The evidence is never theirs (R6), so every piece is the writer's, under the
 * director's thread too. A failure their change causes is a concern on their edit, beside its
 * line: the verdict flag they took off, a line of the pitch they emptied.
 *
 * Player coverage is not checked here: the map places every player (spec 4.5).
 *
 * @param {Object} weave
 * @param {Object} inputs
 * @param {Object} inputs.evidence - what the evidence and story-terms checks read
 *   (lib/evidence.js evidenceContextOf)
 * @param {string[]} inputs.directorWords - the director's notes and corrections, which "from
 *   your notes" quotes
 * @param {Object} [inputs.directorsShare] - the director's share of the weave (shareOf)
 * @param {{page: number, writer: number, allowance: number, angle: (string|null)}|null} [inputs.length] -
 *   the meeting's page with its worst angle open, counted (meetingLengthOf), and that angle's id;
 *   none, no length check
 * @returns {{failures: Array<{type: string, message: string, line: string, place?: string}>,
 *            concerns: Array<{type: string, editIds: string[], finding: string}>}}
 */
function weaveFindings(weave, { evidence = null, directorWords = [], directorsShare, length = null } = {}) {
  if (!isWeave(weave)) {
    return {
      failures: [{ type: 'no-weave', message: 'The output holds no threads. Write the whole weave in the OUTPUT FORMAT at the top.', line: 'The writer returned no threads.' }],
      concerns: []
    };
  }
  const share = shareOf(directorsShare);
  const failures = [];
  const concerns = [];
  const fail = (type, message, line, place) => failures.push(place ? { type, message, line, place } : { type, message, line });
  const concern = (type, editIds, finding) => concerns.push({ type, editIds, finding });
  const editOf = (map, key) => (has(map, key) ? map[key] : null);
  const threads = objectsOf(weave.threads);
  const angles = objectsOf(weave.angles);
  const threadIds = new Set(threads.map(thread => weaveIdOf(thread)).filter(Boolean));
  const verdictThreads = threads.filter(thread => thread.verdict === true && weaveIdOf(thread));

  /** The fields of an element whose text holds what story terms leave to the evidence, each with what it holds. */
  const termsIn = (element, fields) => fields
    .map((field) => ({ field, problems: storyTermsProblems(element[field], evidence) }))
    .filter((entry) => entry.problems.length > 0);
  const elementTerms = (words, place, element, fields) => {
    const found = termsIn(element, fields);
    if (found.length === 0) return;
    const holds = found.map(({ field, problems }) => `its ${field} ${describeStoryTerms(problems)}`).join('; ');
    const said = found.map(({ field, problems }) => `${ELEMENT_FIELD_WORDS[field] || 'it'} ${storyTermsSaid(problems)}`).join('; ');
    fail('story-terms', `${opening(words)}: ${holds}. ${STORY_TERMS_FIX}`, `${opening(words)}: ${said}. ${STORY_TERMS_LINE}`, place);
  };
  const piecesCheck = (words, place, pieces) => {
    const problems = evidenceProblems(pieces, evidence);
    if (problems.length === 0) return;
    const { what, fix } = describeEvidenceProblems(problems);
    fail('evidence-not-in-record', `${opening(words)}: ${what}. ${fix}`, `The evidence behind ${words} ${evidenceProblemsSaid(problems)}.`, place);
  };

  // The angles (spec 9.1): two or three, each whole, telling threads the weave holds, the
  // verdict's among them.
  if (angles.length < 2 || angles.length > 3) {
    const pitched = `${angles.length} ${angles.length === 1 ? 'angle' : 'angles'}`;
    fail('angle-count', `The weave pitches ${pitched}. Pitch two or three angles, as C1 (<craft-story>) sets out, each a different story told through the weave's threads.`,
      `The writer pitched ${pitched}, and the meeting reads two or three.`);
  }
  angles.forEach((angle) => {
    const words = angleWords(angle);
    const place = elementPlace('angles', angle);
    const named = angleThreadIds(angle);
    // Piece 3 (brief 3C): a line of the pitch the director rewrote is theirs, never the writer's
    // failure; one they emptied is a concern beside it.
    const angleId = weaveIdOf(angle);
    const theirs = (field) => has(share.angleFields, `${angleId}.${field}`);
    const lacking = ANGLE_FIELDS.filter((field) => !textOf(angle[field]) && !theirs(field));
    const emptied = ANGLE_FIELDS.filter((field) => !textOf(angle[field]) && theirs(field));
    if (named.length === 0) lacking.push('threads');
    if (lacking.length > 0) {
      fail('angle-incomplete', `${opening(words)} has no ${listOf(lacking)}. Give each angle every field of the OUTPUT FORMAT, its threads among them.`,
        `${opening(words)} is missing part of its pitch.`, place);
    }
    if (emptied.length > 0) {
      concern('angle-incomplete', emptied.map((field) => share.angleFields[`${angleId}.${field}`]),
        `${opening(words)} is missing ${listOf(emptied.map((field) => ELEMENT_FIELD_WORDS[field] || `its ${field}`))}.`);
    }
    const unknown = named.filter((id) => !threadIds.has(id));
    if (unknown.length > 0) {
      fail('angle-names-unknown-thread', `${opening(words)} names ${unknown.length > 1 ? 'threads' : 'a thread'} the weave does not hold: ${listOf(unknown)}. Name only the ids of the weave's threads.`,
        `${opening(words)} names a thread the weave does not hold.`, place);
    }
    const missing = verdictThreads.filter((thread) => !named.includes(weaveIdOf(thread)));
    if (missing.length > 0) {
      const verdictNames = listOf(missing.map((thread) => `"${textOf(thread.name) || textOf(thread.line) || weaveIdOf(thread)}"`));
      fail('angle-without-verdict', `${opening(words)} leaves out ${verdictNames}, the thread that carries the room's verdict. Put it in every angle, as C16 (<craft-story>) sets out.`,
        `${opening(words)} leaves out ${verdictNames}, the thread that tells the room's verdict.`, place);
    }
    elementTerms(words, place, angle, ANGLE_STORY_FIELDS.filter((field) => !theirs(field)));
  });
  repeatedIds(angles).forEach((id) => {
    const headlines = listOf(angles.filter((angle) => weaveIdOf(angle) === id).map((angle) => `"${textOf(angle.headline) || id}"`));
    fail('duplicate-id', `Two angles share one id: ${headlines}. Give each angle an id of its own.`,
      `The writer gave the angles ${headlines} one id, so the meeting cannot change them.`, `angles[#${id}]`);
  });

  const fromYourNotes = quotedWords(weave.fromYourNotes);
  if (fromYourNotes && !has(share.fields, 'fromYourNotes')) {
    const words = (Array.isArray(directorWords) ? directorWords : []).filter(text => typeof text === 'string');
    if (!words.some(source => isVerbatimIn(fromYourNotes, source))) {
      fail('from-your-notes-not-verbatim', `"From your notes" is not word for word in the director's notes or corrections: "${fromYourNotes}". Copy one unbroken passage of the director's own words exactly, or leave the field out when angle 1 does not start from the director's read.`,
        '"From your notes" quotes words your notes and corrections do not hold word for word.', 'fromYourNotes');
    }
  }

  threads.forEach((thread) => {
    const id = weaveIdOf(thread);
    const words = threadWords(thread);
    const place = elementPlace('threads', thread);
    const added = editOf(share.addedThreads, id);
    if (!added) {
      const fields = ['name', 'line'].filter((field) => !has(share.threadFields, `${id}.${field}`));
      elementTerms(words, place, thread, fields);
    }
    if (!added && !objectsOf(thread.evidence).some((piece) => piece.stance === 'supports')) {
      fail('thread-without-evidence', `${opening(words)} has no piece of evidence that supports it. Give it the pieces of the record that tell it, at least one with the stance "supports".`,
        `${opening(words)} has nothing behind it: no piece of the record supports it.`, place);
    }
    piecesCheck(words, place, thread.evidence);
  });
  // A repeated thread id is the writer's failure (brief 4.5b). The director's share holds
  // one thread under an id, since the meeting's gate refuses a repeat the director's changes
  // make (lib/meeting.js directorWeaveProblems), so every repeat holds a thread of the
  // writer's: R11 exempts the director's thread, never the writer's duplicate of its id.
  // When one of the threads is the director's, the line names it, the thread their edits find
  // under the id (the share's threadIndexes), so the rework knows which thread keeps the id.
  repeatedIds(threads).forEach((id) => {
    const under = threads.filter((thread) => weaveIdOf(thread) === id);
    const nameOf = (thread) => `"${textOf(thread.name) || textOf(thread.line) || id}"`;
    const names = listOf(under.map(nameOf));
    const nameTheThread = 'make each angle, connection and question name the thread it means.';
    const added = editOf(share.addedThreads, id);
    const flipped = [...Object.keys(share.flippedIn), ...Object.keys(share.flippedOut)].some((place) => place.endsWith(`.${id}`));
    const changed = flipped || partsUnder(share.threadFields, id).length > 0;
    const said = `The writer gave the threads ${names} one id, so the meeting cannot change them`;
    if (!added && !changed) {
      fail('duplicate-id', `Two threads share one id: ${names}. Give each thread an id of its own, and ${nameTheThread}`, `${said}.`, `threads[#${id}]`);
      return;
    }
    const did = added ? 'added' : 'changed';
    const theirs = [...new Set((share.threadIndexes[id] || []).map((index) => weave.threads[index]))].filter((thread) => under.includes(thread));
    if (theirs.length === 1) {
      const director = nameOf(theirs[0]);
      const others = under.filter((thread) => thread !== theirs[0]);
      const othersNamed = listOf(others.map(nameOf));
      fail('duplicate-id', `Two threads share one id: ${names}, and ${director} is the thread the director ${did}. Keep the id on ${director}, since their edits find it by its id, and give ${othersNamed} ${others.length > 1 ? 'each ' : ''}an id of its own; ${nameTheThread}`,
        `The writer gave the ${others.length > 1 ? 'threads' : 'thread'} ${othersNamed} the id of your thread ${director}, so the meeting cannot change them.`, `threads[#${id}]`);
      return;
    }
    fail('duplicate-id', `Two threads share one id: ${names}, and one of them is the thread the director ${did}. Keep the id on the director's thread, since their edits find it by its id, and give the other thread an id of its own; ${nameTheThread}`,
      `${said}, and one of them is yours.`, `threads[#${id}]`);
  });

  if (verdictThreads.length === 0) {
    const flagEdits = threads.map(thread => editOf(share.threadFields, `${weaveIdOf(thread)}.verdict`)).filter(Boolean);
    if (flagEdits.length > 0) concern('no-verdict-thread', flagEdits, "No thread carries the room's verdict.");
    else fail('no-verdict-thread', 'No thread carries the room\'s verdict. Mark the thread that tells the verdict with "verdict": true, and put it in every angle (C16).', "No thread tells the room's verdict.");
  }

  objectsOf(weave.connections).forEach((connection) => {
    const words = connectionWords(connection);
    const place = elementPlace('connections', connection);
    const connectionId = weaveIdOf(connection);
    if (!has(share.addedConnections, connectionId)) {
      elementTerms(words, place, connection, ['line'].filter((field) => !has(share.connectionFields, `${connectionId}.${field}`)));
    }
    const joins = Array.isArray(connection.joins) ? connection.joins.map(textOf) : [];
    if (joins.length !== 2 || !joins[0] || !joins[1] || joins[0] === joins[1]) {
      fail('connection-joins-unknown-thread', `${opening(words)} must join two different threads of the weave. Give the ids of the two threads it joins.`,
        `${opening(words)} does not join two threads of the weave.`, place);
    } else if (joins.some(id => !threadIds.has(id))) {
      fail('connection-joins-unknown-thread', `${opening(words)} joins a thread the weave does not hold. Make it join two threads of the weave, by their ids.`,
        `${opening(words)} joins a thread the weave does not hold.`, place);
    }
    piecesCheck(words, place, connection.evidence);
  });
  repeatedIds(objectsOf(weave.connections)).forEach((id) => {
    const lines = listOf(objectsOf(weave.connections).filter((connection) => weaveIdOf(connection) === id).map((connection) => `"${textOf(connection.line) || id}"`));
    fail('duplicate-id', `Two connections share one id: ${lines}. Give each connection an id of its own.`,
      `The writer gave the connections ${lines} one id, so the meeting cannot change them.`, `connections[#${id}]`);
  });

  // The questions (R4): each short, and beside a thread the weave holds when it names one. A
  // question the director has answered is not held to the bound (fix round 1, finding 5): code
  // keeps its words whatever a rework writes (C15, lib/writer-questions.js carriedWeaveQuestions),
  // so no rework could shorten it, and the director has already read it.
  objectsOf(weave.questions).forEach((question) => {
    const words = questionWords(question);
    const place = elementPlace('questions', question);
    const count = ['about', 'question', 'changes'].reduce((sum, field) => sum + wordCount(textOf(question[field])), 0);
    if (count > QUESTION_WORD_BOUND && !isAnswered(question)) {
      fail('question-too-long', `${opening(words)} runs to ${count} words across its about, question and changes, past the ${QUESTION_WORD_BOUND} a question may use. Ask it in one or two short sentences, with a line on what its answer changes, as C15 (<craft-questions>) sets out.`,
        `${opening(words)} runs to ${count} words, past the ${QUESTION_WORD_BOUND} a question may use.`, place);
    }
    const beside = textOf(question[WEAVE_QUESTION_THREAD_KEY]);
    if (has(question, WEAVE_QUESTION_THREAD_KEY) && !threadIds.has(beside)) {
      fail('question-thread-unknown', `${opening(words)} sits beside a thread the weave does not hold${beside ? `: ${beside}` : ''}. Give it the id of the thread its answer changes, or leave "thread" out when its answer changes who appears in the story.`,
        `${opening(words)} sits beside a thread the weave does not hold.`, place);
    }
  });
  repeatedIds(objectsOf(weave.questions)).forEach((id) => {
    const asked = listOf(objectsOf(weave.questions).filter((question) => weaveIdOf(question) === id).map((question) => `"${textOf(question.question) || id}"`));
    fail('duplicate-id', `Two questions share one id: ${asked}. Give each question an id of its own.`, `The writer gave the questions ${asked} one id.`, `questions[#${id}]`);
  });

  // The writer's own words on the page stay within its allowance with each angle open (R5;
  // lib/word-count.js pageLengthOf's rule): `length` is the worst angle's count, with its id.
  if (length && Number.isFinite(length.writer) && Number.isFinite(length.allowance) && length.writer > length.allowance) {
    const opened = angles.find((angle) => weaveIdOf(angle) && weaveIdOf(angle) === textOf(length.angle)) || null;
    const writersShare = writersShareOf(weave, directorsShare);
    const page = opened ? { ...writersShare, [PICKED_KEY]: weaveIdOf(opened) } : writersShare;
    const longest = writersLinesOnPage(page).slice(0, 3).map((line) => `${line.name} (${line.words} words)`);
    const open = opened ? `With ${angleWords(opened)} open, the` : 'The';
    fail('over-length', `${open} meeting's page runs to ${length.page} words, ${length.writer} of them in the lines you write, past the ${length.allowance} those lines may use (${MEETING_WORD_FLOOR}, or more while the whole page stays within ${MEETING_WORD_BOUND}). Cut ${length.writer - length.allowance} words or more from your lines on that page${longest.length > 0 ? `, starting with the longest: ${listOf(longest)}` : ''}. Keep each line short, and keep in each angle only the threads its story turns on: the headline and card line of every other angle print beside the open one. The rest of the page (the verdict and the lines beside yours) is printed by code.`,
      `${open} writer's part of the meeting runs to ${length.writer} words, past the ${length.allowance} it may use.`);
  }

  return { failures, concerns };
}

/**
 * The code checks' failures on the writer's text (weaveFindings), each with the rework's
 * message, the director's line and its place: what a rework fixes.
 *
 * @param {Object} weave
 * @param {Object} [inputs] - as weaveFindings
 * @returns {Array<{type: string, message: string, line: string, place?: string}>}
 */
function checkWeave(weave, inputs = {}) {
  return weaveFindings(weave, inputs).failures;
}

module.exports = {
  // Phase 4b, piece 3 (brief 3B): the angles, the pick, the settled reading and the questions' bound
  ANGLE_FIELDS,
  PICKED_KEY,
  QUESTION_WORD_BOUND,
  pickedAngleOf,
  settledAngleOf,
  withPickFrom,
  withHeldQuestionThreads,
  CONNECTION_KINDS,
  WEAVE_CHECKS_SOURCE,
  FACT_CHECK_MARK_KEY,
  // Phase 4b (brief 1B; R5; piece 3): the meeting's page at most 450 words with any angle open; fix
  // round 4: the writer held to its own words, by lib/word-count.js pageLengthOf's rule
  MEETING_WORD_BOUND,
  MEETING_WORD_FLOOR,
  meetingLengthOf,
  weaveWritersTextBlank,
  // Brief 4.5: the meeting's marks on a weave, the round mark and the views of the weave
  MEETING_ROUNDS,
  isWeave,
  weaveForPrompt,
  weaveForRework,
  weaveForJudge,
  weaveKey,
  factCheckMarkOf,
  isWeaveJudged,
  withFactCheckMark,
  isMeetingApproved,
  meetingRoundOf,
  checkWeave,
  weaveFindings,
  // Phase 4b (brief 1B; Review focus 3): the weave as the writer's share of it, which the check
  // node counts the meeting's page on
  writersShareOf,
  // Fix round 1, finding 3: the one reading of an id, and the one rule for a repeated id
  weaveIdOf,
  repeatedIds,
  // Brief 4.5b: the one list of the fields the meeting prints, which the edits read, and an
  // element's place under its id, which the questions' carry pairs by
  WEAVE_PRINTED_FIELDS,
  printedWeaveFields,
  occurrenceKeys,
  // Brief 4.14a: the connections the story keeps (since piece 3, those between the picked angle's
  // threads)
  storyConnections
};

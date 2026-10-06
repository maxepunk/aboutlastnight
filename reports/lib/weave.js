/**
 * The weave (phase 4, brief 4.4; spec docs/superpowers/specs/2026-10-02-story-meeting-and-map.md
 * sections 4.2 and 4.5; CONTEXT.md "Weave"): how the threads make one story. The arc
 * writer writes one weave, the story the article will tell, and the director settles it
 * at the story meeting.
 *
 * This module holds the weave's shape constants and the rules every reader of a weave
 * shares, so each rule is one function: the arc writer and its rework (the schema in
 * lib/sdk-client/subagents.js is built from these constants), the code checks
 * (checkWeave), the fact check's mark (the evaluator), the routing (graph.js) and the
 * meeting.
 *
 * A weave holds (phase 4b, piece 1, brief 1B; spec 2026-10-05 sections 4.1 and 5; R1: the lines
 * at the level of the story, the evidence underneath):
 * - `story`, `question`, `headline`: the story in one to three sentences, the question
 *   it carries through the article, a working headline;
 * - `fromYourNotes`: the director's own words the story rests on, present only when the
 *   story starts from the director's read;
 * - `threads`: `{id, name, line, role, verdict?, reason?, evidence}`, each a short name and
 *   one line in story terms, in a WEAVE_ROLES role, `verdict: true` on the thread that
 *   carries the room's verdict, a left-out thread's one-line reason, and its evidence: the
 *   pieces of the record that tell it (lib/evidence.js);
 * - `connections`: `{id, joins: [threadId, threadId], line, kind, evidence}`, the kind
 *   underneath and never printed;
 * - `convergence`;
 * - `strongerMainThread`: `{thread, reason}`, optional;
 * - `questions`: the questions for the director (lib/writer-questions.js
 *   WEAVE_QUESTIONS_PROPERTY).
 *
 * Code-owned keys open with an underscore and never reach a prompt (weaveForPrompt): the
 * fact check's mark, FACT_CHECK_MARK_KEY.
 *
 * At the story meeting (brief 4.5) the director leaves the weave with their changes in it:
 * edited fields, roles, added threads, an `answer` on a question, and `struck: true` on a
 * connection they struck (STRUCK_KEY). A struck connection stays in the weave so the
 * meeting can show it struck; the meeting prints and the checks read the live connections
 * (liveConnections). A connection that joins a left-out thread is out of the story with it
 * (brief 4.14a), so every reader of the story reads the connections the story keeps
 * (storyConnections): neither struck nor joining a thread left out. The checks read only
 * the writer's text (R11): the director's share of the weave, read from their standing
 * edits (lib/hand-edit-diff.js weaveDirectorsShare), is never a check's failure, and the
 * verdict thread the director left out is a concern (weaveFindings). The evidence is never
 * the director's (R6), so every piece is the writer's to answer for.
 *
 * Generic: a weave is a story, threads, connections and questions, so nothing here names
 * a theme.
 */

const crypto = require('crypto');
const { isVerbatimIn } = require('./grounding');
const { WEAVE_ANSWER_KEY, withoutAnswers } = require('./writer-questions');
// Phase 4b (brief 1B; R10): the evidence check and the story-terms check, which the map shares.
const {
  evidenceProblems, describeEvidenceProblems, evidenceProblemsSaid, storyTermsProblems, describeStoryTerms, storyTermsSaid, STORY_TERMS_FIX
} = require('./evidence');

/** A thread's role toward the main thread, in the order the meeting lists them. */
const WEAVE_ROLES = Object.freeze(['main-thread', 'grounds-it', 'complicates-it', 'mirrors-it', 'carries-it-forward', 'left-out']);
const MAIN_THREAD_ROLE = 'main-thread';
const LEFT_OUT_ROLE = 'left-out';

/** What two threads share at a connection: a person, a moment, a document or a line. Kept underneath, never printed. */
const CONNECTION_KINDS = Object.freeze(['person', 'moment', 'document', 'line']);

/**
 * The bound on the story meeting's page, as it prints when it first opens (spec 2026-10-05
 * section 4.1; R5): counted by lib/stop-pages.js wordsShown, the count the stops log records,
 * which the check node passes to weaveFindings. Stated once: the check holds the writer's
 * output to it, and the writer's task asks for it.
 */
const MEETING_WORD_BOUND = 300;

/** The `source` the weave checks stamp on validationResults (node-helpers.js CODE_CHECKS). */
const WEAVE_CHECKS_SOURCE = 'weave-checks';

/**
 * Where the fact check marks the weave it judged: `{at, ready, fixes}`. `ready` is the
 * fact check's verdict and `fixes` the automatic fixes run on that verdict. The fix keeps
 * the mark; a director's round writes a weave without it, so the fact check runs again.
 */
const FACT_CHECK_MARK_KEY = '_factCheck';

/** The key that marks a connection the director struck at the story meeting (`struck: true`). */
const STRUCK_KEY = 'struck';

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
 * The director's share of the weave, with each part present: `{addedThreads,
 * reroledThreads, fields, threadFields, addedConnections, connectionFields}`, each a map
 * from what the director changed to the id of their standing edit (lib/hand-edit-diff.js
 * weaveDirectorsShare builds it): a thread they added (`t7`), a thread they re-roled
 * (`t3`), a top-level field they rewrote (`story`), a field of a thread they rewrote
 * (`t3.line`), a connection they added (`c5`), a field of a connection they rewrote
 * (`c1.line`); and `threadIndexes`, where in the weave's threads each thread their edits find
 * sits, by its id, which tells their thread from the writer's under an id the writer repeated.
 */
function shareOf(directorsShare) {
  const share = directorsShare && typeof directorsShare === 'object' ? directorsShare : {};
  return {
    addedThreads: share.addedThreads || {},
    reroledThreads: share.reroledThreads || {},
    fields: share.fields || {},
    threadFields: share.threadFields || {},
    addedConnections: share.addedConnections || {},
    connectionFields: share.connectionFields || {},
    threadIndexes: share.threadIndexes || {}
  };
}

/** Whether the director struck this connection at the story meeting. */
function isStruck(connection) {
  return Boolean(connection && typeof connection === 'object' && connection[STRUCK_KEY] === true);
}

/**
 * The live connections: every one the director did not strike. The meeting prints them, a
 * connection that joins a left-out thread among them, and the weave's checks read them all,
 * so a connection that joins a thread the weave does not hold is still the writer's failure.
 */
function liveConnections(weave) {
  return objectsOf(weave && weave.connections).filter(connection => !isStruck(connection));
}

/**
 * The left-out threads a connection joins (brief 4.14a): each id it joins under which the
 * weave holds threads and every one of them is left out, in the order the connection names
 * them, each once. An id that also names a thread in the story keeps the connection there,
 * since a repeated id is the writer's to clear, which the checks report; an id the weave
 * does not hold is the checks' failure, not a left-out thread.
 *
 * @param {Object} connection
 * @param {Object} weave
 * @returns {string[]}
 */
function leftOutThreadsJoined(connection, weave) {
  const joins = connection && typeof connection === 'object' && Array.isArray(connection.joins) ? connection.joins.map(textOf) : [];
  const threads = objectsOf(weave && weave.threads);
  return [...new Set(joins.filter(Boolean))].filter((id) => {
    const under = threads.filter((thread) => weaveIdOf(thread) === id);
    return under.length > 0 && under.every((thread) => thread.role === LEFT_OUT_ROLE);
  });
}

/**
 * The connections the story keeps (brief 4.14a): the live connections that join no left-out
 * thread. A connection that joins a left-out thread goes out of the story with it, as a
 * struck one does, and comes back when the thread does. Every reader of the story's
 * connections reads these: the settled weave, and through it the map writer and the article
 * writer, and the map check.
 *
 * @param {Object} weave
 * @returns {Object[]}
 */
function storyConnections(weave) {
  return liveConnections(weave).filter(connection => leftOutThreadsJoined(connection, weave).length === 0);
}

/**
 * The fields of the weave the story meeting prints, part by part, in the order it prints
 * them (brief 4.5b): the one list the edits read a weave's text by (lib/hand-edit-diff.js
 * weaveParts), so a field added to the weave is added here once. The parts are the weave's
 * own fields, then each thread's (its name, its line and a left-out thread's reason), each
 * live connection's line, the stronger main thread's and each question's (phase 4b, brief
 * 1B). The evidence under a line is no printed field: the page folds it, and it is never the
 * director's (R6). A question's answer is no printed field of the weave's either: it is the
 * director's words, kept with the question (lib/writer-questions.js).
 *
 * `directorsWords` names the field that quotes the director's notes, "from your notes", which
 * the story-terms check leaves alone.
 */
const WEAVE_PRINTED_FIELDS = Object.freeze({
  weave: Object.freeze(['story', 'question', 'headline', 'fromYourNotes', 'convergence']),
  threads: Object.freeze(['name', 'line', 'reason']),
  connections: Object.freeze(['line']),
  strongerMainThread: Object.freeze(['reason']),
  questions: Object.freeze(['about', 'question', 'changes']),
  directorsWords: Object.freeze(['fromYourNotes'])
});

/**
 * The weave's printed fields (WEAVE_PRINTED_FIELDS), each as it stands in the weave, in the
 * order the meeting prints them: `{part, field, text, element?, directorsWords?}`, where
 * `part` is the weave's part (`weave`, `threads`, `connections`, `strongerMainThread`,
 * `questions`), `element` the thread, connection or question the field belongs to, and
 * `text` the field's value. A struck connection prints nothing (liveConnections).
 *
 * @param {Object} weave
 * @returns {Array<{part: string, field: string, text: *, element?: Object, directorsWords?: true}>}
 */
function printedWeaveFields(weave) {
  if (!weave || typeof weave !== 'object') return [];
  const fieldsOf = (part, element) => WEAVE_PRINTED_FIELDS[part].map((field) => ({ part, field, text: element[field], element }));
  const stronger = weave.strongerMainThread && typeof weave.strongerMainThread === 'object' ? weave.strongerMainThread : {};
  return [
    ...WEAVE_PRINTED_FIELDS.weave.map((field) => ({
      part: 'weave', field, text: weave[field], ...(WEAVE_PRINTED_FIELDS.directorsWords.includes(field) && { directorsWords: true })
    })),
    ...objectsOf(weave.threads).flatMap((thread) => fieldsOf('threads', thread)),
    ...liveConnections(weave).flatMap((connection) => fieldsOf('connections', connection)),
    ...fieldsOf('strongerMainThread', stronger),
    ...objectsOf(weave.questions).flatMap((question) => fieldsOf('questions', question))
  ];
}

/**
 * The weave as the writer's share of it, for the meeting's page the check node counts
 * (Review focus 3: only the writer's output is held to the bound, never the director's
 * version). Read from the director's share (shareOf), it has:
 * - each line the director rewrote empty: a field of the weave, a field of a thread or of a
 *   connection, the stronger main thread's reason;
 * - no thread the director added or re-roled, since whether a re-roled thread's line prints
 *   is the director's choice, and no connection they added;
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
    if (field === 'strongerMainThread') {
      if (out.strongerMainThread && typeof out.strongerMainThread === 'object') out.strongerMainThread = { ...out.strongerMainThread, reason: '' };
      return;
    }
    if (typeof out[field] === 'string') out[field] = '';
  });
  /** The element with each text field the director rewrote (`<id>.<field>` in `fields`) empty. */
  const writersLines = (element, fields) => {
    const id = weaveIdOf(element);
    const typed = Object.keys(fields)
      .filter((place) => id && place.startsWith(`${id}.`))
      .map((place) => place.slice(id.length + 1))
      .filter((field) => typeof element[field] === 'string');
    return typed.length === 0 ? element : { ...element, ...Object.fromEntries(typed.map((field) => [field, ''])) };
  };
  out.threads = weave.threads
    .filter((thread) => !(has(share.addedThreads, weaveIdOf(thread)) || has(share.reroledThreads, weaveIdOf(thread))))
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
 * The weave as a rework reads it (brief 4.5): without its code-owned keys or the
 * connections the director struck, which the rework's <HAND_EDITS> lists as struck. The
 * answers stay on their questions, since a rework works from them.
 *
 * @param {Object|null} weave
 * @returns {Object|null}
 */
function weaveForRework(weave) {
  const view = weaveForPrompt(weave);
  if (!isWeave(view) || !Array.isArray(view.connections)) return view;
  return { ...view, connections: view.connections.filter(connection => !isStruck(connection)) };
}

/**
 * The weave as the fact check judges it (brief 4.5): the rework's view with no answer on
 * any question. The answers are the director's words, which the fact check reads apart,
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

/**
 * Whether two connections are one connection whatever their words (brief 4.14a): the same
 * kind, joining the same two threads in either order. A rework may reword a connection it
 * brings back; another kind of touch between the same threads, or a touch between other
 * threads, is another connection.
 *
 * @param {Object} a
 * @param {Object} b
 * @returns {boolean}
 */
function isSameConnection(a, b) {
  if (!a || typeof a !== 'object' || !b || typeof b !== 'object') return false;
  const ends = (connection) => (Array.isArray(connection.joins) ? connection.joins.map(textOf) : []).sort().join('\n');
  return textOf(a.kind) === textOf(b.kind) && ends(a) === ends(b);
}

/**
 * A connection id no connection holds (brief 4.14a): `c` and the number after the highest of
 * the `c<n>` ids in use, so a connection a rework added never takes an id the round has used.
 *
 * @param {Iterable<string>} taken - the connection ids in use
 * @returns {string}
 */
function freshConnectionId(taken) {
  let highest = 0;
  [...taken].forEach((id) => {
    const m = /^c(\d+)$/.exec(textOf(id));
    if (m) highest = Math.max(highest, Number(m[1]));
  });
  return `c${highest + 1}`;
}

/**
 * A rework's weave with each connection the director struck as the weave it started from
 * holds it (briefs 4.5 and 4.14a). The rework never saw them (they are out of its view,
 * weaveForRework), so it may return another connection under a struck one's id:
 * - the struck connection itself, returned under its id, in its words or others, stays as
 *   the rework wrote it: putting the strike back on it is the restore's work
 *   (lib/hand-edit-diff.js settleEdits), which records it, and a send-back's rework that
 *   brings it back is a change of the director's edit, which it names with its reason;
 * - any other connection under a struck id keeps its words and joins under an id of its own
 *   (freshConnectionId), numbered after every connection id in use in the output, in the
 *   weave the rework started from and in the weave the round started from (`roundStart`), so
 *   the meeting's marks read it as new this round;
 * - a struck connection the output then lacks goes back where it sat, still struck.
 *
 * @param {Object} output - the rework's weave
 * @param {Object} previous - the weave the rework started from
 * @param {Object} [options]
 * @param {Object|null} [options.roundStart] - the weave the director's round started from, the
 *   version the meeting's marks are read against (state `_weaveMarks.from`), when a round ran
 * @returns {Object} `output` itself when it needs neither
 */
function withStruckConnections(output, previous, { roundStart = null } = {}) {
  if (!isWeave(output) || !isWeave(previous)) return output;
  const struck = objectsOf(previous.connections)
    .map((connection, index) => ({ connection, index }))
    .filter(({ connection }) => isStruck(connection) && weaveIdOf(connection));
  if (struck.length === 0) return output;
  const taken = new Set([output, previous, roundStart]
    .flatMap((weave) => objectsOf(isWeave(weave) ? weave.connections : []).map(connection => weaveIdOf(connection)))
    .filter(Boolean));
  let renamed = false;
  let connections = Array.isArray(output.connections) ? [...output.connections] : [];
  struck.forEach(({ connection: struckOne }) => {
    const id = weaveIdOf(struckOne);
    let kept = false;
    connections = connections.map((connection) => {
      if (weaveIdOf(connection) !== id) return connection;
      if (!kept && isSameConnection(connection, struckOne)) {
        kept = true;
        return connection;
      }
      const fresh = freshConnectionId(taken);
      taken.add(fresh);
      renamed = true;
      return { ...connection, id: fresh };
    });
  });
  const present = new Set(objectsOf(connections).map(connection => weaveIdOf(connection)));
  const missing = struck.filter(({ connection }) => !present.has(weaveIdOf(connection)));
  if (!renamed && missing.length === 0) return output;
  missing.forEach(({ connection, index }) => {
    connections.splice(Math.min(index, connections.length), 0, JSON.parse(JSON.stringify(connection)));
  });
  return { ...output, connections };
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

/** How a check's line names a field of the weave: as the meeting heads its line. */
const FIELD_WORDS = Object.freeze({
  story: 'the story',
  question: 'the question it carries',
  convergence: 'where they converge',
  strongerMainThread: 'the stronger main thread'
});

/** How a failure's line names a field of an element to the director: as the meeting prints it. */
const ELEMENT_FIELD_WORDS = Object.freeze({ name: 'its name', line: 'its line', reason: 'its reason' });

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

/** A connection as a check's line names it: by its line, or its id when it has none. */
function connectionWords(connection) {
  return `the connection "${textOf(connection.line) || weaveIdOf(connection)}"`;
}

/** Where a failure about an element sits, as the meeting reads a place (`threads[#t3]`), or null for an element with no id. */
function elementPlace(collection, element) {
  const id = weaveIdOf(element);
  return id ? `${collection}[#${id}]` : null;
}

/**
 * The code checks on a weave (spec 2026-10-05 sections 4.1 and 6.1; spec 2026-10-02 section 4.5),
 * on the writer's text alone (R11, brief 4.5).
 *
 * Each failure is `{type, message, line, place?}`, the convention the map's checks follow too:
 * - `message` is the rework's: one line that names the line it is about (a thread by its name, a
 *   connection by its line, a field of the weave as the meeting heads it, never an id) and its fix,
 *   in the writer's terms: the piece of evidence by its number, a source by its id, the rule item
 *   it breaks. The rework reads it, through validationResults.
 * - `line` is the director's (spec 6.3): what is wrong at that place, in plain words, as the
 *   meeting names things: a thread by its name, a document by what it is if at all, never an id, a
 *   piece's number, a source's code, a rule item, a tag or a field's name. The meeting shows it
 *   when the check still fails after the rework (console/checkpoint-view-logic.js
 *   failuresBesideLines), and lib/evidence.js storyTermsSaid and evidenceProblemsSaid say the
 *   shared checks' hits in these words.
 * - `place` is where the meeting shows it, beside the line it names: a thread's or a connection's
 *   path (`threads[#t3]`, `connections[#c2]`, `questions[#q1]`) or a field of the weave (`story`,
 *   `question`, `convergence`, `fromYourNotes`, `strongerMainThread`). A failure with no place,
 *   the page's length and a verdict no thread carries, sits at the top of the page.
 *
 * In the order the meeting prints the weave:
 * - each of the writer's lines is in story terms (`story-terms`; lib/evidence.js
 *   storyTermsProblems: no document id, quotation, clock time or money figure): the story and its
 *   question, each thread's name and line and a left-out thread's reason, each live connection's
 *   line, the convergence and the stronger main thread's reason. Exempt (R2): the headline, "from
 *   your notes", the questions, and the verdict line, which code prints;
 * - "from your notes" is word for word in the director's notes or corrections
 *   (`from-your-notes-not-verbatim`; lib/grounding.js isVerbatimIn);
 * - each thread in the story (every role but left out) has a piece of evidence that supports it
 *   (`thread-without-evidence`), and every piece of a thread or a live connection passes the
 *   evidence check (`evidence-not-in-record`; lib/evidence.js evidenceProblems);
 * - each left-out thread has its reason (`left-out-without-reason`);
 * - every thread, connection and question has an id of its own (`duplicate-id`), a repeat read by
 *   repeatedIds, the rule the meeting's gate and the diff read too. A repeat is the writer's
 *   failure, under the id of a thread the director added or changed too, and then its line says
 *   the director's thread keeps the id (brief 4.5b);
 * - the room's verdict is one of the threads: a thread marked `verdict: true`, in a role other
 *   than left out (`no-verdict-thread`);
 * - every live connection joins two threads the weave holds (`connection-joins-unknown-thread`);
 * - a stronger main thread names a thread the weave holds (`stronger-main-thread-unknown`);
 * - the meeting's page as it first opens comes to no more than MEETING_WORD_BOUND words
 *   (`over-length`; R5): the check node counts the page of the writer's share (writersShareOf)
 *   with lib/stop-pages.js wordsShown and passes the count, which this module does not compute.
 *
 * The director's share of the weave is never a check's failure: a line they wrote is not held
 * to story terms (a field of the weave, of a thread or of a connection they rewrote, and every
 * line of a thread or a connection they added), a thread they added or re-roled may have no
 * evidence and no reason, a field they rewrote is not checked against the notes, and their
 * words add nothing to the count. The evidence is never theirs (R6), so every piece is the
 * writer's, under the director's thread too.
 * A failure their change causes is a concern on their edit, beside its line: the verdict thread
 * they left out, the verdict flag they took off.
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
 * @param {number|null} [inputs.pageWords] - the meeting's page as it first opens, counted;
 *   none, no length check
 * @returns {{failures: Array<{type: string, message: string, line: string, place?: string}>,
 *            concerns: Array<{type: string, editIds: string[], finding: string}>}}
 */
function weaveFindings(weave, { evidence = null, directorWords = [], directorsShare, pageWords = null } = {}) {
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
  const fieldTerms = (field) => {
    if (has(share.fields, field)) return;
    const problems = storyTermsProblems(weave[field], evidence);
    if (problems.length > 0) {
      fail('story-terms', `${opening(FIELD_WORDS[field])} ${describeStoryTerms(problems)}. ${STORY_TERMS_FIX}`,
        `${opening(FIELD_WORDS[field])} ${storyTermsSaid(problems)}. ${STORY_TERMS_LINE}`, field);
    }
  };
  const piecesCheck = (words, place, pieces) => {
    const problems = evidenceProblems(pieces, evidence);
    if (problems.length === 0) return;
    const { what, fix } = describeEvidenceProblems(problems);
    fail('evidence-not-in-record', `${opening(words)}: ${what}. ${fix}`, `The evidence behind ${words} ${evidenceProblemsSaid(problems)}.`, place);
  };

  fieldTerms('story');
  fieldTerms('question');

  const fromYourNotes = quotedWords(weave.fromYourNotes);
  if (fromYourNotes && !has(share.fields, 'fromYourNotes')) {
    const words = (Array.isArray(directorWords) ? directorWords : []).filter(text => typeof text === 'string');
    if (!words.some(source => isVerbatimIn(fromYourNotes, source))) {
      fail('from-your-notes-not-verbatim', `"From your notes" is not word for word in the director's notes or corrections: "${fromYourNotes}". Copy one unbroken passage of the director's own words exactly, or leave the field out when the story does not start from the director's read.`,
        '"From your notes" quotes words your notes and corrections do not hold word for word.', 'fromYourNotes');
    }
  }

  threads.forEach((thread) => {
    const id = weaveIdOf(thread);
    const words = threadWords(thread);
    const place = elementPlace('threads', thread);
    const added = editOf(share.addedThreads, id);
    const director = added || editOf(share.reroledThreads, id);
    const leftOut = thread.role === LEFT_OUT_ROLE;
    if (!added) {
      const fields = (leftOut ? ['name', 'line', 'reason'] : ['name', 'line']).filter((field) => !has(share.threadFields, `${id}.${field}`));
      elementTerms(words, place, thread, fields);
    }
    if (!leftOut && !director && !objectsOf(thread.evidence).some((piece) => piece.stance === 'supports')) {
      fail('thread-without-evidence', `${opening(words)} is in the story with no piece of evidence that supports it. Give it the pieces of the record that tell it, at least one with the stance "supports".`,
        `${opening(words)} is in the story with nothing behind it: no piece of the record supports it.`, place);
    }
    piecesCheck(words, place, thread.evidence);
    if (leftOut && !textOf(thread.reason) && !director) {
      fail('left-out-without-reason', `${opening(words)} is left out with no reason. Give the one line on why the story does not need it.`,
        `${opening(words)} is left out with no reason given.`, place);
    }
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
    const nameTheThread = 'make each connection and the stronger main thread name the thread they mean.';
    const added = editOf(share.addedThreads, id);
    const changed = editOf(share.reroledThreads, id) || Object.keys(share.threadFields).some((place) => place.startsWith(`${id}.`));
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

  const verdictThreads = threads.filter(thread => thread.verdict === true);
  if (verdictThreads.length === 0) {
    const flagEdits = threads.map(thread => editOf(share.threadFields, `${weaveIdOf(thread)}.verdict`)).filter(Boolean);
    if (flagEdits.length > 0) concern('no-verdict-thread', flagEdits, "No thread carries the room's verdict.");
    else fail('no-verdict-thread', 'No thread carries the room\'s verdict. Mark the thread that tells the verdict with "verdict": true, and give it a role in the story (C16).', "No thread tells the room's verdict.");
  } else if (verdictThreads.every(thread => thread.role === LEFT_OUT_ROLE)) {
    const roleEdits = verdictThreads
      .map(thread => editOf(share.reroledThreads, weaveIdOf(thread)) || editOf(share.addedThreads, weaveIdOf(thread)))
      .filter(Boolean);
    const words = opening(threadWords(verdictThreads[0]));
    if (roleEdits.length > 0) concern('no-verdict-thread', roleEdits, `${words} carries the room's verdict and is left out.`);
    else fail('no-verdict-thread', `${words} carries the room's verdict and is left out. Give it a role in the story (C16).`, `${words} tells the room's verdict and is left out.`, elementPlace('threads', verdictThreads[0]));
  }

  const threadIds = new Set(threads.map(thread => weaveIdOf(thread)).filter(Boolean));
  liveConnections(weave).forEach((connection) => {
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

  fieldTerms('convergence');

  const stronger = weave.strongerMainThread;
  if (stronger && typeof stronger === 'object') {
    if (!threadIds.has(textOf(stronger.thread))) {
      fail('stronger-main-thread-unknown', "The stronger main thread names a thread the weave does not hold. Name one of the weave's threads by its id, or leave strongerMainThread out.",
        'The stronger main thread names a thread the weave does not hold.', 'strongerMainThread');
    }
    if (!has(share.fields, 'strongerMainThread')) elementTerms(FIELD_WORDS.strongerMainThread, 'strongerMainThread', stronger, ['reason']);
  }

  repeatedIds(objectsOf(weave.questions)).forEach((id) => {
    const asked = listOf(objectsOf(weave.questions).filter((question) => weaveIdOf(question) === id).map((question) => `"${textOf(question.question) || id}"`));
    fail('duplicate-id', `Two questions share one id: ${asked}. Give each question an id of its own.`, `The writer gave the questions ${asked} one id.`, `questions[#${id}]`);
  });

  if (typeof pageWords === 'number' && Number.isFinite(pageWords) && pageWords > MEETING_WORD_BOUND) {
    fail('over-length', `The meeting's page runs to ${pageWords} words, past its bound of ${MEETING_WORD_BOUND}. Bring it to ${MEETING_WORD_BOUND} words or fewer: keep each line short, and keep in the story only the threads and connections it turns on.`,
      `The writer's page runs to ${pageWords} words, past the meeting's ${MEETING_WORD_BOUND}.`);
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
  WEAVE_ROLES,
  MAIN_THREAD_ROLE,
  LEFT_OUT_ROLE,
  CONNECTION_KINDS,
  WEAVE_CHECKS_SOURCE,
  FACT_CHECK_MARK_KEY,
  // Phase 4b (brief 1B; R5): the meeting's page at most 300 words, as it first opens
  MEETING_WORD_BOUND,
  // Brief 4.5: the meeting's marks on a weave, the round mark and the views of the weave
  STRUCK_KEY,
  MEETING_ROUNDS,
  isWeave,
  isStruck,
  liveConnections,
  weaveForPrompt,
  weaveForRework,
  weaveForJudge,
  withStruckConnections,
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
  // Brief 4.14a: the connections the story keeps, the left-out threads a connection goes out
  // with, and the struck connection a rework returned, told from another under its id
  storyConnections,
  leftOutThreadsJoined,
  isSameConnection,
  freshConnectionId
};

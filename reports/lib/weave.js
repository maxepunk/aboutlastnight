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
 * A weave holds:
 * - `story`, `question`, `headline`: the story in one to three sentences, the question
 *   it carries through the article, a working headline;
 * - `fromYourNotes`: the director's own words the story rests on, present only when the
 *   story starts from the director's read;
 * - `threads`: `{id, claim, role, receipt?, reason?, verdict?}`, each in a WEAVE_ROLES
 *   role, its receipt a document id from the record or LEDGER_RECEIPT, a left-out
 *   thread's one-line reason, and `verdict: true` on the thread that carries the room's
 *   verdict;
 * - `connections`: `{id, kind, joins: [threadId, threadId], detail}`;
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
 * meeting can show it struck; every reader of the story reads the live connections alone
 * (liveConnections). The checks read only the writer's text (R11): the director's share
 * of the weave, read from their standing edits (lib/hand-edit-diff.js
 * weaveDirectorsShare), is never a check's failure, and a receipt the director typed that
 * names no document is a concern (weaveFindings).
 *
 * Generic: a weave is a story, threads, connections and questions, so nothing here names
 * a theme.
 */

const crypto = require('crypto');
const { isVerbatimIn } = require('./grounding');
const { wordCount } = require('./word-count');
const { WEAVE_ANSWER_KEY } = require('./writer-questions');

/** A thread's role toward the main thread, in the order the meeting lists them. */
const WEAVE_ROLES = Object.freeze(['main-thread', 'grounds-it', 'complicates-it', 'mirrors-it', 'carries-it-forward', 'left-out']);
const MAIN_THREAD_ROLE = 'main-thread';
const LEFT_OUT_ROLE = 'left-out';

/** What two threads share at a connection: a person, a moment, a document or a line. */
const CONNECTION_KINDS = Object.freeze(['person', 'moment', 'document', 'line']);

/** The receipt that names the ledger rather than a document. */
const LEDGER_RECEIPT = 'ledger';

/**
 * The bound on the writer's words in the fields the meeting prints, for a weave of
 * about 400 words (spec 4.3). Stated once: the check holds a weave to it, and the
 * writer's task asks for about 400.
 */
const WEAVE_WORD_BOUND = 500;

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
 * reroledThreads, fields, threadFields}`, each a map from what the director changed to
 * the id of their standing edit (lib/hand-edit-diff.js weaveDirectorsShare builds it):
 * a thread they added (`t7`), a thread they re-roled (`t3`), a top-level field they
 * rewrote (`story`), a field of a thread they rewrote (`t3.receipt`).
 */
function shareOf(directorsShare) {
  const share = directorsShare && typeof directorsShare === 'object' ? directorsShare : {};
  return {
    addedThreads: share.addedThreads || {},
    reroledThreads: share.reroledThreads || {},
    fields: share.fields || {},
    threadFields: share.threadFields || {}
  };
}

/** Whether the director struck this connection at the story meeting. */
function isStruck(connection) {
  return Boolean(connection && typeof connection === 'object' && connection[STRUCK_KEY] === true);
}

/** The connections the story keeps: every one the director did not strike. */
function liveConnections(weave) {
  return objectsOf(weave && weave.connections).filter(connection => !isStruck(connection));
}

/**
 * The fields of the weave the story meeting prints, part by part, in the order it prints
 * them (brief 4.5b): the one list the edits read a weave's text by (lib/hand-edit-diff.js
 * weaveParts) and the writer's length is counted on (weaveWordCount), so a field added to
 * the weave is added here once. The parts are the weave's own fields, then each thread's,
 * each live connection's, the stronger main thread's and each question's. A question's
 * answer is no printed field of the weave's: it is the director's words, kept with the
 * question (lib/writer-questions.js).
 *
 * `directorsWords` names the one field the two readers read differently: "from your notes"
 * quotes the director's notes, so the edits read it as the meeting prints it, and the
 * writer's length leaves it out.
 */
const WEAVE_PRINTED_FIELDS = Object.freeze({
  weave: Object.freeze(['story', 'question', 'headline', 'fromYourNotes', 'convergence']),
  threads: Object.freeze(['claim', 'reason']),
  connections: Object.freeze(['detail']),
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
 * The writer's words in the fields the meeting prints (printedWeaveFields). "From your
 * notes" and the answers are the director's words, so they do not count. Given the
 * director's share of the weave (brief 4.5), the director's own text does not count
 * either: a field they rewrote, a thread they added, a thread's claim or reason they typed.
 *
 * @param {Object} weave
 * @param {Object} [directorsShare] - shareOf's parts
 * @returns {number}
 */
function weaveWordCount(weave, directorsShare) {
  if (!weave || typeof weave !== 'object') return 0;
  const share = shareOf(directorsShare);
  const directors = ({ part, field, element, directorsWords }) => Boolean(directorsWords)
    || (part === 'weave' && has(share.fields, field))
    || (part === 'threads' && (has(share.addedThreads, weaveIdOf(element)) || has(share.threadFields, `${weaveIdOf(element)}.${field}`)));
  return printedWeaveFields(weave)
    .filter((entry) => !directors(entry))
    .reduce((sum, entry) => sum + wordCount(textOf(entry.text)), 0);
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
 * A rework's weave with the connections the director struck that it never saw (they are
 * out of its view, weaveForRework) back where they sat in the weave it started from, still
 * struck. A connection the rework returned under a struck connection's id stays as the
 * rework wrote it: putting the strike back on it is the restore's work
 * (lib/hand-edit-diff.js settleEdits), which records it.
 *
 * @param {Object} output - the rework's weave
 * @param {Object} previous - the weave the rework started from
 * @returns {Object} `output` itself when no struck connection is missing from it
 */
function withStruckConnections(output, previous) {
  if (!isWeave(output) || !isWeave(previous)) return output;
  const present = new Set(objectsOf(output.connections).map(connection => weaveIdOf(connection)));
  const missing = objectsOf(previous.connections)
    .map((connection, index) => ({ connection, index }))
    .filter(({ connection }) => isStruck(connection) && weaveIdOf(connection) && !present.has(weaveIdOf(connection)));
  if (missing.length === 0) return output;
  const connections = Array.isArray(output.connections) ? [...output.connections] : [];
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

/**
 * The code checks on a weave (spec 4.5), on the writer's text alone (R11, brief 4.5).
 * Each failure is one line that names the defect and its fix, in the order the meeting
 * prints the weave:
 * - each thread has a receipt (`thread-without-receipt`), and each receipt given names a
 *   document in the record, in any case, or the ledger (`receipt-not-in-record`);
 * - each left-out thread has its reason (`left-out-without-reason`);
 * - every thread, connection and question has an id of its own (`duplicate-id`), a repeat
 *   read by repeatedIds, the rule the meeting's gate and the diff read too. A repeat is
 *   the writer's failure, under the id of a thread the director added or changed too,
 *   and then its line says the director's thread keeps the id (brief 4.5b);
 * - the room's verdict is one of the threads: a thread marked `verdict: true`, in a role
 *   other than left out (`no-verdict-thread`);
 * - every live connection joins two threads the weave holds (`connection-joins-unknown-thread`);
 * - "from your notes" is word for word in the director's notes or corrections
 *   (`from-your-notes-not-verbatim`; lib/grounding.js isVerbatimIn);
 * - a stronger main thread names a thread the weave holds (`stronger-main-thread-unknown`);
 * - the writer's words come to no more than WEAVE_WORD_BOUND (`over-length`).
 *
 * The director's share of the weave is never a check's failure: a thread they added or
 * re-roled may have no receipt and no reason, a field they rewrote is not checked against
 * the notes, and their words add no length. A failure their change causes is a concern
 * on their edit, beside its line: a receipt they typed that names no document, the verdict
 * thread they left out.
 *
 * Player coverage is not checked here: the map places every player (spec 4.5).
 *
 * @param {Object} weave
 * @param {Object} inputs
 * @param {Iterable<string>} inputs.recordIds - the ids a document in the record answers to
 *   (node-helpers.js buildValidEvidenceIds)
 * @param {string[]} inputs.directorWords - the director's notes and corrections
 * @param {Object} [inputs.directorsShare] - the director's share of the weave (shareOf)
 * @returns {{failures: Array<{type: string, message: string}>,
 *            concerns: Array<{type: string, editIds: string[], finding: string}>}}
 */
function weaveFindings(weave, { recordIds = [], directorWords = [], directorsShare } = {}) {
  if (!isWeave(weave)) {
    return { failures: [{ type: 'no-weave', message: 'The output holds no threads. Write the whole weave in the OUTPUT FORMAT at the top.' }], concerns: [] };
  }
  const share = shareOf(directorsShare);
  const failures = [];
  const concerns = [];
  const fail = (type, message) => failures.push({ type, message });
  const concern = (type, editIds, finding) => concerns.push({ type, editIds, finding });
  const known = new Set([...recordIds].filter(id => typeof id === 'string').map(id => id.trim().toLowerCase()));
  const threads = objectsOf(weave.threads);
  const name = (thread) => (weaveIdOf(thread) ? `"${weaveIdOf(thread)}"` : 'with no id');
  const editOf = (map, key) => (has(map, key) ? map[key] : null);

  threads.forEach((thread) => {
    const id = weaveIdOf(thread);
    const added = editOf(share.addedThreads, id);
    const director = added || editOf(share.reroledThreads, id);
    const typedReceipt = editOf(share.threadFields, `${id}.receipt`) || added;
    const receipt = textOf(thread.receipt);
    if (!receipt) {
      if (!director) fail('thread-without-receipt', `Thread ${name(thread)} has no receipt. Give it its strongest receipt: the id of a document in <RECORD>, or "${LEDGER_RECEIPT}".`);
    } else if (receipt.toLowerCase() !== LEDGER_RECEIPT && !known.has(receipt.toLowerCase())) {
      if (typedReceipt) concern('receipt-not-in-record', [typedReceipt], `Thread ${name(thread)} gives the receipt "${receipt}", which names no document in the record.`);
      else fail('receipt-not-in-record', `Thread ${name(thread)} gives the receipt "${receipt}", which names no document in <RECORD>. Give the id of the document in <RECORD> that backs the thread, or "${LEDGER_RECEIPT}".`);
    }
    if (thread.role === LEFT_OUT_ROLE && !textOf(thread.reason) && !director) {
      fail('left-out-without-reason', `Thread ${name(thread)} is left out with no reason. Give the one line on why the story does not need it.`);
    }
  });
  // A repeated thread id is the writer's failure (brief 4.5b). The director's share holds
  // one thread under an id, since the meeting's gate refuses a repeat the director's changes
  // make (lib/meeting.js directorWeaveProblems), so every repeat holds a thread of the
  // writer's: R11 exempts the director's thread, never the writer's duplicate of its id.
  // When one of the threads is the director's, the line says which thread keeps the id.
  repeatedIds(threads).forEach((id) => {
    const directorsEdits = [...new Set([
      editOf(share.addedThreads, id), editOf(share.reroledThreads, id),
      ...Object.keys(share.threadFields).filter((place) => place.startsWith(`${id}.`)).map((place) => share.threadFields[place])
    ].filter(Boolean))];
    const nameTheThread = 'make each connection and the stronger main thread name the thread they mean.';
    if (directorsEdits.length === 0) {
      fail('duplicate-id', `Two threads share the id "${id}". Give each thread an id of its own, and ${nameTheThread}`);
      return;
    }
    const whose = editOf(share.addedThreads, id) ? 'the thread the director added' : 'the thread the director changed';
    const edits = directorsEdits.length > 1 ? `${directorsEdits.slice(0, -1).join(', ')} and ${directorsEdits[directorsEdits.length - 1]}` : directorsEdits[0];
    fail('duplicate-id', `Two threads share the id "${id}", and one of them is ${whose} (${edits} in <HAND_EDITS>). Keep "${id}" on the director's thread, since their edits find it by its id, and give the other thread an id of its own; ${nameTheThread}`);
  });

  const verdictThreads = threads.filter(thread => thread.verdict === true);
  if (verdictThreads.length === 0) {
    const flagEdits = threads.map(thread => editOf(share.threadFields, `${weaveIdOf(thread)}.verdict`)).filter(Boolean);
    if (flagEdits.length > 0) concern('no-verdict-thread', flagEdits, "No thread carries the room's verdict.");
    else fail('no-verdict-thread', 'No thread carries the room\'s verdict. Mark the thread that tells the verdict with "verdict": true, and give it a role in the story (C16).');
  } else if (verdictThreads.every(thread => thread.role === LEFT_OUT_ROLE)) {
    const roleEdits = verdictThreads
      .map(thread => editOf(share.reroledThreads, weaveIdOf(thread)) || editOf(share.addedThreads, weaveIdOf(thread)))
      .filter(Boolean);
    if (roleEdits.length > 0) concern('no-verdict-thread', roleEdits, `Thread ${name(verdictThreads[0])} carries the room's verdict and is left out.`);
    else fail('no-verdict-thread', `Thread ${name(verdictThreads[0])} carries the room's verdict and is left out. Give it a role in the story (C16).`);
  }

  const threadIds = new Set(threads.map(thread => weaveIdOf(thread)).filter(Boolean));
  liveConnections(weave).forEach((connection) => {
    const label = weaveIdOf(connection) ? `"${weaveIdOf(connection)}"` : 'with no id';
    const joins = Array.isArray(connection.joins) ? connection.joins.map(textOf) : [];
    if (joins.length !== 2 || !joins[0] || !joins[1] || joins[0] === joins[1]) {
      const listed = joins.length > 0 ? joins.map(id => `"${id}"`).join(', ') : 'nothing';
      fail('connection-joins-unknown-thread', `Connection ${label} joins ${listed}. A connection joins two threads of the weave: give the ids of the two threads it joins.`);
      return;
    }
    const missing = joins.filter(id => !threadIds.has(id));
    if (missing.length > 0) {
      fail('connection-joins-unknown-thread', `Connection ${label} joins "${joins[0]}" and "${joins[1]}", and the weave holds no thread ${missing.map(id => `"${id}"`).join(' or ')}. Make it join two threads of the weave, by their ids.`);
    }
  });
  repeatedIds(objectsOf(weave.connections)).forEach((id) => {
    fail('duplicate-id', `Two connections share the id "${id}". Give each connection an id of its own.`);
  });

  const fromYourNotes = quotedWords(weave.fromYourNotes);
  if (fromYourNotes && !has(share.fields, 'fromYourNotes')) {
    const words = (Array.isArray(directorWords) ? directorWords : []).filter(text => typeof text === 'string');
    if (!words.some(source => isVerbatimIn(fromYourNotes, source))) {
      fail('from-your-notes-not-verbatim', `"From your notes" is not word for word in the director's notes or corrections: "${fromYourNotes}". Copy one unbroken passage of the director's own words exactly, or leave the field out when the story does not start from the director's read.`);
    }
  }

  const stronger = weave.strongerMainThread;
  if (stronger && typeof stronger === 'object' && !threadIds.has(textOf(stronger.thread))) {
    const named = textOf(stronger.thread);
    fail('stronger-main-thread-unknown', `The stronger main thread names "${named}", and the weave holds no thread "${named}". Name one of the weave's threads by its id, or leave strongerMainThread out.`);
  }

  repeatedIds(objectsOf(weave.questions)).forEach((id) => {
    fail('duplicate-id', `Two questions share the id "${id}". Give each question an id of its own.`);
  });

  const total = weaveWordCount(weave, share);
  if (total > WEAVE_WORD_BOUND) {
    fail('over-length', `The weave runs to ${total} words in the fields the meeting prints, past the bound of ${WEAVE_WORD_BOUND} for a weave of about 400. Bring it to about 400 words, every thread still on the page in its one line.`);
  }

  return { failures, concerns };
}

/**
 * The code checks' failures on the writer's text (weaveFindings), each one line that names
 * the defect and its fix: what a rework fixes.
 *
 * @param {Object} weave
 * @param {Object} [inputs] - as weaveFindings
 * @returns {Array<{type: string, message: string}>}
 */
function checkWeave(weave, inputs = {}) {
  return weaveFindings(weave, inputs).failures;
}

module.exports = {
  WEAVE_ROLES,
  MAIN_THREAD_ROLE,
  LEFT_OUT_ROLE,
  CONNECTION_KINDS,
  LEDGER_RECEIPT,
  WEAVE_WORD_BOUND,
  WEAVE_CHECKS_SOURCE,
  FACT_CHECK_MARK_KEY,
  // Brief 4.5: the meeting's marks on a weave, the round mark and the views of the weave
  STRUCK_KEY,
  MEETING_ROUNDS,
  isWeave,
  isStruck,
  liveConnections,
  weaveWordCount,
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
  // Fix round 1, finding 3: the one reading of an id, and the one rule for a repeated id
  weaveIdOf,
  repeatedIds,
  // Brief 4.5b: the one list of the fields the meeting prints, which the edits and the length
  // read, and an element's place under its id, which the questions' carry pairs by
  WEAVE_PRINTED_FIELDS,
  printedWeaveFields,
  occurrenceKeys
};

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
 * Generic: a weave is a story, threads, connections and questions, so nothing here names
 * a theme.
 */

const crypto = require('crypto');
const { isVerbatimIn } = require('./grounding');
const { wordCount } = require('./word-count');

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

/**
 * The writer's words in the fields the meeting prints: the story, the question, the
 * headline, the convergence, each thread's claim and reason, each connection's detail,
 * the stronger main thread's reason, and each question with what it is about and what
 * its answer changes. "From your notes" is the director's words, so it does not count.
 *
 * @param {Object} weave
 * @returns {number}
 */
function weaveWordCount(weave) {
  if (!weave || typeof weave !== 'object') return 0;
  const texts = [
    weave.story, weave.question, weave.headline, weave.convergence,
    ...objectsOf(weave.threads).flatMap(t => [t.claim, t.reason]),
    ...objectsOf(weave.connections).map(c => c.detail),
    weave.strongerMainThread && weave.strongerMainThread.reason,
    ...objectsOf(weave.questions).flatMap(q => [q.about, q.question, q.changes])
  ];
  return texts.reduce((sum, text) => sum + wordCount(textOf(text)), 0);
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
 * Whether the director has approved the story meeting. Until the meeting's own approval
 * exists, the stop's approval is the arc selection it returns, which the evaluator's skip
 * read before this slice. The one rule: the check node, the fact check and the routing
 * read it here.
 *
 * @param {Object} state
 * @returns {boolean}
 */
function isMeetingApproved(state) {
  return Array.isArray(state && state.selectedArcs) && state.selectedArcs.length > 0;
}

/** The director's words "from your notes" quotes, without quotation marks around them. */
function quotedWords(text) {
  return textOf(text).replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '');
}

/**
 * The code checks on a weave the writer wrote (spec 4.5). Each failure is one line that
 * names the defect and its fix, in the order the meeting prints the weave:
 * - each thread has a receipt (`thread-without-receipt`), and each receipt given names a
 *   document in the record, in any case, or the ledger (`receipt-not-in-record`);
 * - each left-out thread has its reason (`left-out-without-reason`);
 * - the room's verdict is one of the threads: a thread marked `verdict: true`, in a role
 *   other than left out (`no-verdict-thread`);
 * - every connection joins two threads the weave holds (`connection-joins-unknown-thread`);
 * - "from your notes" is word for word in the director's notes or corrections
 *   (`from-your-notes-not-verbatim`; lib/grounding.js isVerbatimIn);
 * - the writer's words come to no more than WEAVE_WORD_BOUND (`over-length`).
 *
 * Player coverage is not checked here: the map places every player (spec 4.5).
 *
 * @param {Object} weave
 * @param {Object} inputs
 * @param {Iterable<string>} inputs.recordIds - the ids a document in the record answers to
 *   (node-helpers.js buildValidEvidenceIds)
 * @param {string[]} inputs.directorWords - the director's notes and corrections
 * @returns {Array<{type: string, message: string}>}
 */
function checkWeave(weave, { recordIds = [], directorWords = [] } = {}) {
  if (!isWeave(weave)) {
    return [{ type: 'no-weave', message: 'The output holds no threads. Write the whole weave in the OUTPUT FORMAT at the top.' }];
  }
  const failures = [];
  const fail = (type, message) => failures.push({ type, message });
  const known = new Set([...recordIds].filter(id => typeof id === 'string').map(id => id.trim().toLowerCase()));
  const threads = objectsOf(weave.threads);
  const name = (thread) => (textOf(thread.id) ? `"${textOf(thread.id)}"` : 'with no id');

  threads.forEach((thread) => {
    const receipt = textOf(thread.receipt);
    if (!receipt) {
      fail('thread-without-receipt', `Thread ${name(thread)} has no receipt. Give it its strongest receipt: the id of a document in <RECORD>, or "${LEDGER_RECEIPT}".`);
    } else if (receipt.toLowerCase() !== LEDGER_RECEIPT && !known.has(receipt.toLowerCase())) {
      fail('receipt-not-in-record', `Thread ${name(thread)} gives the receipt "${receipt}", which names no document in <RECORD>. Give the id of the document in <RECORD> that backs the thread, or "${LEDGER_RECEIPT}".`);
    }
    if (thread.role === LEFT_OUT_ROLE && !textOf(thread.reason)) {
      fail('left-out-without-reason', `Thread ${name(thread)} is left out with no reason. Give the one line on why the story does not need it.`);
    }
  });

  const verdictThreads = threads.filter(thread => thread.verdict === true);
  if (verdictThreads.length === 0) {
    fail('no-verdict-thread', 'No thread carries the room\'s verdict. Mark the thread that tells the verdict with "verdict": true, and give it a role in the story (C16).');
  } else if (verdictThreads.every(thread => thread.role === LEFT_OUT_ROLE)) {
    fail('no-verdict-thread', `Thread ${name(verdictThreads[0])} carries the room's verdict and is left out. Give it a role in the story (C16).`);
  }

  const threadIds = new Set(threads.map(thread => textOf(thread.id)).filter(Boolean));
  objectsOf(weave.connections).forEach((connection) => {
    const label = textOf(connection.id) ? `"${textOf(connection.id)}"` : 'with no id';
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

  const fromYourNotes = quotedWords(weave.fromYourNotes);
  if (fromYourNotes) {
    const words = (Array.isArray(directorWords) ? directorWords : []).filter(text => typeof text === 'string');
    if (!words.some(source => isVerbatimIn(fromYourNotes, source))) {
      fail('from-your-notes-not-verbatim', `"From your notes" is not word for word in the director's notes or corrections: "${fromYourNotes}". Copy one unbroken passage of the director's own words exactly, or leave the field out when the story does not start from the director's read.`);
    }
  }

  const total = weaveWordCount(weave);
  if (total > WEAVE_WORD_BOUND) {
    fail('over-length', `The weave runs to ${total} words in the fields the meeting prints, past the bound of ${WEAVE_WORD_BOUND} for a weave of about 400. Bring it to about 400 words, every thread still on the page in its one line.`);
  }

  return failures;
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
  isWeave,
  weaveWordCount,
  weaveForPrompt,
  weaveKey,
  factCheckMarkOf,
  isWeaveJudged,
  withFactCheckMark,
  isMeetingApproved,
  checkWeave
};

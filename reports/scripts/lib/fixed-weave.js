'use strict';
/**
 * The story meeting scripts/render-prompts.js plants when a thread holds no weave (phase
 * 4, briefs 4.4 and 4.5), as it plants FIXED_NOTES: invented text, so a render shows where
 * each part of a weave lands in a prompt, whatever the session.
 *
 * FIXED_BASELINE is the writer's weave, and FIXED_WEAVE the weave as the director left it
 * at the meeting (the shapes lib/meeting.js DIRECTOR_WEAVE_SCHEMA allows). The director's
 * changes between them, which lib/hand-edit-diff.js standingAtMeeting reads as the
 * standing edits:
 * - an edit: the story, marked "[RENDER-DIFF EDIT]";
 * - a new main thread: t2, which the writer proposed in `strongerMainThread`, is the main
 *   thread, and t1, which carries the verdict, complicates it;
 * - a struck connection: c2, `struck: true`.
 * Question q1 carries the director's answer (`answer`), which is no edit; q2 is unanswered.
 *
 * Thread t4's receipt names no document in any record, in both versions, so the weave
 * checks find one failure on every session and the arc rework's automatic pass has a line
 * of the writer's to fix. Every other receipt is the ledger, so the planted weave reads
 * the same against every session's record.
 */

const FIXED_BASELINE = Object.freeze({
  story: 'RENDER-DIFF STORY: the room settled on one account of the morning, and the record tells a second one.',
  question: 'RENDER-DIFF QUESTION: which account does the article stand on?',
  headline: 'RENDER-DIFF HEADLINE',
  threads: [
    { id: 't1', claim: "RENDER-DIFF THREAD 1: the room's verdict, as the group statement gave it.", role: 'main-thread', receipt: 'ledger', verdict: true },
    { id: 't2', claim: 'RENDER-DIFF THREAD 2: the money moved in the last minutes of the morning.', role: 'grounds-it', receipt: 'ledger' },
    { id: 't3', claim: 'RENDER-DIFF THREAD 3: a thread the story does not need.', role: 'left-out', receipt: 'ledger', reason: 'RENDER-DIFF REASON: the record holds one line of it.' },
    { id: 't4', claim: 'RENDER-DIFF THREAD 4: a thread whose receipt the record does not hold.', role: 'mirrors-it', receipt: 'RENDER-DIFF-RECEIPT' }
  ],
  connections: [
    { id: 'c1', kind: 'moment', joins: ['t1', 't2'], detail: 'RENDER-DIFF CONNECTION 1: the vote and the last sale share a minute.' },
    { id: 'c2', kind: 'person', joins: ['t2', 't4'], detail: 'RENDER-DIFF CONNECTION 2: struck at the meeting.' }
  ],
  convergence: 'RENDER-DIFF CONVERGENCE: the two accounts meet at the close.',
  strongerMainThread: { thread: 't2', reason: 'RENDER-DIFF: the money carries a stronger story than the verdict.' },
  questions: [
    {
      id: 'q1', kind: 'figure', about: 'RENDER-DIFF figure', question: 'RENDER-DIFF QUESTION 1: is this ledger entry right?',
      changes: "RENDER-DIFF: the money section's key line."
    },
    {
      id: 'q2', kind: 'player', about: 'RENDER-DIFF player', question: 'RENDER-DIFF QUESTION 2: what did this player do?',
      changes: 'RENDER-DIFF: whether the player prints.'
    }
  ]
});

const FIXED_WEAVE = Object.freeze({
  ...FIXED_BASELINE,
  story: `${FIXED_BASELINE.story} [RENDER-DIFF EDIT]`,
  threads: FIXED_BASELINE.threads.map((thread) => {
    if (thread.id === 't1') return { ...thread, role: 'complicates-it' };
    if (thread.id === 't2') return { ...thread, role: 'main-thread' };
    return thread;
  }),
  connections: FIXED_BASELINE.connections.map((connection) => (connection.id === 'c2' ? { ...connection, struck: true } : connection)),
  questions: FIXED_BASELINE.questions.map((question) => (question.id === 'q1'
    ? { ...question, answer: 'RENDER-DIFF ANSWER: print it as the ledger gives it.' }
    : question))
});

/** A fresh copy of the weave as the director left it, for a state to hold. */
function fixedWeave() {
  return JSON.parse(JSON.stringify(FIXED_WEAVE));
}

/** A fresh copy of the writer's weave the director's changes are read against. */
function fixedBaseline() {
  return JSON.parse(JSON.stringify(FIXED_BASELINE));
}

module.exports = { FIXED_WEAVE, FIXED_BASELINE, fixedWeave, fixedBaseline };

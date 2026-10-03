'use strict';
/**
 * The weave scripts/render-prompts.js plants when a thread holds none (phase 4, brief
 * 4.4), as it plants FIXED_NOTES: invented text, so a render shows where each part of
 * a weave lands in a prompt, whatever the session.
 *
 * It carries the director's changes at the story meeting, so the calls after the
 * meeting render with them: an edit (the story, marked "[RENDER-DIFF EDIT]"), an answer
 * (question q1's `answer`), a struck connection (c2, `struck: true`) and a new main
 * thread (t2, which the writer proposed in `strongerMainThread`, is the main thread, and
 * t1, which carries the verdict, complicates it). Thread t4's receipt names no document
 * in any record, so the weave checks find one failure on every session and the arc
 * rework's automatic pass has a line to fix.
 *
 * Every receipt but t4's is the ledger, so the planted weave reads the same against
 * every session's record.
 */

const FIXED_WEAVE = Object.freeze({
  story: 'RENDER-DIFF STORY: the room settled on one account of the morning, and the record tells a second one. [RENDER-DIFF EDIT]',
  question: 'RENDER-DIFF QUESTION: which account does the article stand on?',
  headline: 'RENDER-DIFF HEADLINE',
  threads: [
    { id: 't1', claim: "RENDER-DIFF THREAD 1: the room's verdict, as the group statement gave it.", role: 'complicates-it', receipt: 'ledger', verdict: true },
    { id: 't2', claim: 'RENDER-DIFF THREAD 2: the money moved in the last minutes of the morning.', role: 'main-thread', receipt: 'ledger' },
    { id: 't3', claim: 'RENDER-DIFF THREAD 3: a thread the story does not need.', role: 'left-out', receipt: 'ledger', reason: 'RENDER-DIFF REASON: the record holds one line of it.' },
    { id: 't4', claim: 'RENDER-DIFF THREAD 4: a thread whose receipt the record does not hold.', role: 'mirrors-it', receipt: 'RENDER-DIFF-RECEIPT' }
  ],
  connections: [
    { id: 'c1', kind: 'moment', joins: ['t1', 't2'], detail: 'RENDER-DIFF CONNECTION 1: the vote and the last sale share a minute.' },
    { id: 'c2', kind: 'person', joins: ['t2', 't4'], detail: 'RENDER-DIFF CONNECTION 2: struck at the meeting.', struck: true }
  ],
  convergence: 'RENDER-DIFF CONVERGENCE: the two accounts meet at the close.',
  strongerMainThread: { thread: 't2', reason: 'RENDER-DIFF: the money carries a stronger story than the verdict.' },
  questions: [
    {
      id: 'q1', kind: 'figure', about: 'RENDER-DIFF figure', question: 'RENDER-DIFF QUESTION 1: is this ledger entry right?',
      changes: "RENDER-DIFF: the money section's key line.", answer: 'RENDER-DIFF ANSWER: print it as the ledger gives it.'
    },
    {
      id: 'q2', kind: 'player', about: 'RENDER-DIFF player', question: 'RENDER-DIFF QUESTION 2: what did this player do?',
      changes: 'RENDER-DIFF: whether the player prints.'
    }
  ]
});

/** A fresh copy of the fixed weave, for a state to hold. */
function fixedWeave() {
  return JSON.parse(JSON.stringify(FIXED_WEAVE));
}

module.exports = { FIXED_WEAVE, fixedWeave };

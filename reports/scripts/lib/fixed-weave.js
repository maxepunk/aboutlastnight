'use strict';
/**
 * The story meeting scripts/render-prompts.js plants when a thread holds no weave (phase
 * 4, briefs 4.4 and 4.5), as it plants FIXED_NOTES: invented text, so a render shows where
 * each part of a weave lands in a prompt, whatever the session. Since phase 4b (brief 1B) it
 * is in the story-level shape: each thread a name and a line, each thread and connection with
 * its evidence underneath; since piece 3 (brief 3B), pitched as three angles over one shared
 * set of threads, the verdict's thread in each, t3 in none.
 *
 * FIXED_BASELINE is the writer's weave, and FIXED_WEAVE the weave as the director left it
 * at the meeting (the shapes lib/meeting.js DIRECTOR_WEAVE_SCHEMA allows). The director's
 * changes between them, which lib/hand-edit-diff.js standingAtMeeting reads as the
 * standing edits:
 * - a thread they added, t5, appended to the angle they picked.
 * Beside them, the director's pick (angle 1), a rewrite of angle 1's story, marked "[RENDER-DIFF
 * EDIT]", and t3 flipped into angle 1: until slice 3C makes an angle's pitch and its threads the
 * director's edits, these two change what the settled weave prints and make no edit.
 * Question q1 carries the director's answer (`answer`), which is no edit, and sits beside
 * thread t2; q2 sits by the pitch, unanswered.
 *
 * A piece of thread t4's evidence names a document no record holds, RENDER-DIFF-DOC, in both
 * versions, so the weave checks find one failure on every session and the arc rework's
 * automatic pass has a line of the writer's to fix. Every other piece names the ledger or the
 * director's notes and quotes nothing, so the planted weave reads the same against every
 * session's record.
 */

/** A piece of evidence, as the weave carries it under a line (lib/evidence.js EVIDENCE_PIECE_SCHEMA). */
const piece = (sources, shows, stance = 'supports') => ({ sources, shows, stance });

/** An angle of the planted weave, its every line marked with its number. */
const angle = (n, threads) => ({
  id: `a${n}`,
  headline: `RENDER-DIFF HEADLINE ${n}`,
  gist: `RENDER-DIFF GIST ${n}: one sentence for the angle's card.`,
  story: `RENDER-DIFF STORY ${n}: the room settled on one account of the morning, and the record tells another.`,
  question: `RENDER-DIFF QUESTION ${n}: which account does the article stand on?`,
  lands: `RENDER-DIFF LANDS ${n}: every player argued the account.`,
  ends: `RENDER-DIFF ENDS ${n}: the two accounts meet at the close.`,
  threads
});

const FIXED_BASELINE = Object.freeze({
  angles: [angle(1, ['t1', 't2', 't4']), angle(2, ['t2', 't1']), angle(3, ['t4', 't1'])],
  threads: [
    {
      id: 't1', name: 'RENDER-DIFF THREAD 1', line: "RENDER-DIFF LINE 1: the room's verdict, as the group statement gave it.", verdict: true,
      evidence: [piece(['notes'], 'RENDER-DIFF PIECE 1: the notes record the vote.')]
    },
    {
      id: 't2', name: 'RENDER-DIFF THREAD 2', line: 'RENDER-DIFF LINE 2: the money moved in the last minutes of the morning.',
      evidence: [
        piece(['ledger'], 'RENDER-DIFF PIECE 2: the ledger holds the last sales of the morning.'),
        piece(['ledger', 'evidence-log'], 'RENDER-DIFF PIECE 3: the ledger set against the evidence log.', 'cuts-against')
      ]
    },
    {
      id: 't3', name: 'RENDER-DIFF THREAD 3', line: 'RENDER-DIFF LINE 3: a thread no angle tells.',
      evidence: [piece(['ledger'], 'RENDER-DIFF PIECE 4: one sale.')]
    },
    {
      id: 't4', name: 'RENDER-DIFF THREAD 4', line: 'RENDER-DIFF LINE 4: a thread whose evidence names a document the record does not hold.',
      evidence: [piece(['RENDER-DIFF-DOC'], 'RENDER-DIFF PIECE 5: a document no record holds.')]
    }
  ],
  connections: [
    {
      id: 'c1', joins: ['t1', 't2'], line: 'RENDER-DIFF CONNECTION 1: the vote and the last sale share a minute.', kind: 'moment',
      evidence: [piece(['notes', 'ledger'], 'RENDER-DIFF PIECE 6: the vote beside the last sale.')]
    },
    {
      id: 'c2', joins: ['t2', 't4'], line: 'RENDER-DIFF CONNECTION 2: one account in both threads.', kind: 'person',
      evidence: [piece(['ledger'], 'RENDER-DIFF PIECE 7: one account in both threads.')]
    }
  ],
  questions: [
    {
      id: 'q1', kind: 'figure', about: 'RENDER-DIFF figure', question: 'RENDER-DIFF QUESTION 1: is this ledger entry right?',
      changes: "RENDER-DIFF: the money section's key line.", thread: 't2'
    },
    {
      id: 'q2', kind: 'player', about: 'RENDER-DIFF player', question: 'RENDER-DIFF QUESTION 2: what did this player do?',
      changes: 'RENDER-DIFF: whether the player prints.'
    }
  ]
});

/** The thread the director adds at the meeting, with no evidence: the map writer finds it. */
const ADDED_THREAD = Object.freeze({ id: 't5', name: 'RENDER-DIFF THREAD 5', line: 'RENDER-DIFF LINE 5: a thread the director added.' });

const FIXED_WEAVE = Object.freeze({
  ...FIXED_BASELINE,
  picked: 'a1',
  angles: FIXED_BASELINE.angles.map((a) => (a.id === 'a1'
    ? { ...a, story: `${a.story} [RENDER-DIFF EDIT]`, threads: [...a.threads, 't3', ADDED_THREAD.id] }
    : a)),
  threads: [...FIXED_BASELINE.threads, ADDED_THREAD],
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

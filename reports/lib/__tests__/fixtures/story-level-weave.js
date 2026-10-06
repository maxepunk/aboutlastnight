/**
 * A weave at the story level, with its evidence underneath, in session 100226's shape (phase 4b,
 * piece 1, brief 1B; spec 2026-10-05 sections 4.1 and 5): the story, its question and headline,
 * the director's words it rests on; seven threads in the story, the main thread carrying the
 * room's verdict, and three left out by name with their reasons; four connections; the
 * convergence; a question about a player. Each line is in story terms, and each piece names a
 * source the record below holds, its quotations word for word.
 *
 * The record: two exposed memories, a paper email, a sale into an account and an exposure on the
 * evidence log, and one buried memory, which no piece names. Invented text: the repo is public.
 *
 * Not a test file (jest's testMatch is *.test.js).
 */

const clone = (v) => JSON.parse(JSON.stringify(v));

const JES = 'JES002 - 11:05PM - Jess tells Sarah: "You know he tests every batch on himself first."';
const SAM = 'SAM001 - 10:12PM - Sam reads the journal over Marcus’s shoulder. “I think he is trying the new batch on himself,” Sam writes in the margin.';
const EMAIL = 'From Marcus to Quinn: raise the dose for the pilot.\nThe board wants the results by Friday.';

/** The director's notes and their one correction. */
const NOTES = 'Alex asked the room if Marcus had dosed them all. In the end it was the pilot run for a bigger launch, and the room never said so.';
const CORRECTION = 'Quinn spoke before Alex at the second count, not after.';
const ACCUSATION_RAW = 'Ten votes for an accidental overdose; two for Alex.';

/** The curated bundle. */
function storyLevelRecord() {
  return {
    exposed: {
      tokens: [
        { id: 'jes002', tokenId: 'jes002', fullContent: JES, summary: 'Jess warns Sarah', rawData: { tokenId: 'jes002', name: 'JES002 - The warning', fullDescription: JES, owners: ['Jess Moreau'] } },
        { id: 'sam001', tokenId: 'sam001', fullContent: SAM, summary: 'Sam watches Marcus', rawData: { tokenId: 'sam001', name: 'SAM001 - The journal', fullDescription: SAM, owners: ['Sam Okafor'] } }
      ],
      paperEvidence: [
        { notionId: 'p-email', id: 'p-email', name: 'Email to Quinn', basicType: 'Document', description: EMAIL, fullContent: EMAIL, owners: ['Marcus Blackwood'] }
      ]
    },
    buried: {
      transactions: [
        { id: 'kai009', tokenId: 'kai009', sourceType: 'memory-token', shellAccount: 'Rich', amount: 150000, time: '09:58 PM', summary: 'Kai hides the vial' }
      ]
    }
  };
}

/** A piece of evidence. */
const piece = (sources, shows, stance = 'supports') => ({ sources, shows, stance });

/** The writer's weave, at the story level. */
const STORY_LEVEL_WEAVE = {
  story: "The room called Marcus's death an accident, a verdict that left every hand clean, though its own evidence describes a trial run.",
  question: 'If Marcus died of his own dose, whose trial was it?',
  headline: 'Ten Votes Call the Trial Run an Accident',
  fromYourNotes: 'it was the pilot run for a bigger launch',
  threads: [
    {
      id: 't1', name: 'An accident', line: "The room's verdict, which cleared every hand.", role: 'main-thread', verdict: true,
      evidence: [
        piece(['notes'], 'Alex asks the room if Marcus had dosed them all, and the room votes for an accident.'),
        piece(['ledger', 'evidence-log'], 'A sale into Rich two minutes after the warning was turned in.', 'cuts-against')
      ]
    },
    {
      id: 't2', name: "Marcus's own dosing", line: 'He had been trying the batch on himself.', role: 'grounds-it',
      evidence: [
        piece(['sam001'], 'Sam writes, "I think he is trying the new batch on himself"'),
        piece(['jes002'], 'Jess warns Sarah, "You know he tests every batch on himself first."')
      ]
    },
    {
      id: 't3', name: 'The trial run', line: 'The night tried the batch on its guests, and someone wanted it tried.', role: 'complicates-it',
      evidence: [piece(['p-email'], 'Marcus asks Quinn to "raise the dose for the pilot"')]
    },
    {
      id: 't4', name: "Quinn's two stories", line: 'What Quinn told the room does not match what Quinn was asked to do.', role: 'complicates-it',
      evidence: [piece(['notes', 'p-email'], 'Quinn spoke first at the count, and the email asks Quinn to raise the dose.')]
    },
    {
      id: 't5', name: 'The memories sold', line: 'Sold off while the room argued.', role: 'mirrors-it',
      evidence: [piece(['ledger'], 'A sale into Rich while the room argued.')]
    },
    {
      id: 't6', name: 'Reality is negotiable', line: 'The truth around Marcus has been bent before.', role: 'mirrors-it',
      evidence: [piece(['p-email'], 'The board wants results by a date, whatever the batch does.')]
    },
    {
      id: 't7', name: 'The successors', line: 'The company waits to name Quinn and Alex until the case closes.', role: 'carries-it-forward',
      evidence: [piece(['notes'], 'The pilot run was for a bigger launch.')]
    },
    { id: 't8', name: 'The other suspects', line: 'The room weighed three others and let them go.', role: 'left-out', reason: 'The room set them aside early.', evidence: [] },
    { id: 't9', name: 'Protecting Sarah', line: 'Jess kept Sarah out of the vote.', role: 'left-out', reason: 'It touches no thread the story follows.', evidence: [] },
    { id: 't10', name: "Remi's and Kai's quarrels", line: 'Two old grudges flared at the bar.', role: 'left-out', reason: 'They stayed private.', evidence: [] }
  ],
  connections: [
    { id: 'c1', joins: ['t4', 't7'], line: 'Quinn and Alex steered the verdict, and they are the successors.', kind: 'person', evidence: [piece(['notes'], 'Quinn spoke first at the count.')] },
    { id: 'c2', joins: ['t2', 't3'], line: "Marcus's last instructions came from someone. Whose?", kind: 'document', evidence: [piece(['p-email'], 'Marcus asks Quinn to "raise the dose for the pilot"')] },
    { id: 'c3', joins: ['t5', 't3'], line: 'The sales spiked as the trial run came to light.', kind: 'moment', evidence: [piece(['ledger', 'evidence-log'], 'The sale into Rich follows the warning turned in.')] },
    { id: 'c4', joins: ['t1', 't6'], line: 'A negotiated verdict, beside Reality is negotiable.', kind: 'line', evidence: [piece(['notes'], 'The room votes for an accident.')] }
  ],
  convergence: 'An overdose closes the case on the one man who cannot answer. Does the trial run become the launch?',
  questions: [
    { id: 'q1', kind: 'player', about: 'Remi', question: 'The notes record nothing Remi did in the room. What did Remi do?', changes: 'Gives Remi a moment in the article.' }
  ]
};

/** A fresh copy of the writer's weave. */
function storyLevelWeave() {
  return clone(STORY_LEVEL_WEAVE);
}

/** A state at the weave checks: the record, the evidence log, the director's words and the weave, the meeting not yet approved. */
function storyLevelState(overrides = {}) {
  return {
    sessionId: '100226',
    theme: 'journalist',
    evidenceBundle: storyLevelRecord(),
    sessionConfig: {
      roster: ['Alex', 'Quinn', 'Sam', 'Jess', 'Sarah', 'Remi', 'Kai'],
      accusation: { verdictKind: 'overdose', accused: [], charge: 'Accidental overdose', votes: [{ option: 'Accident', count: 10, adopted: true }, { option: 'Alex', count: 2 }] },
      accusationRaw: ACCUSATION_RAW,
      exposures: [{ tokenId: 'jes002', exposer: 'NovaNews (Anonymous)', time: '09:56 PM' }]
    },
    directorNotes: { rawProse: NOTES },
    inputReviewCorrections: [CORRECTION],
    weave: storyLevelWeave(),
    meetingApproved: false,
    ...overrides
  };
}

module.exports = { STORY_LEVEL_WEAVE, storyLevelWeave, storyLevelRecord, storyLevelState, piece, NOTES, CORRECTION, ACCUSATION_RAW, JES, SAM, EMAIL };

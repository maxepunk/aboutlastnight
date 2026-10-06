/**
 * A session state that reaches every section of the three writers (phase 2, 2.3), past
 * the story meeting (phase 4): the weave, the meeting approved, and the map.
 *
 * Used by reworker-writer-parity.test.js (each reworker carries its writer's
 * sections) and writer-prompts-pinned.test.js (the writers' prompts are byte for
 * byte what they were before the reworkers were built from them). Deterministic:
 * nothing here depends on the clock or on the file system.
 *
 * Not a test file (jest's testMatch is *.test.js).
 */

const MEMORY_ALE = 'ALE003 - 11:32PM - MARCUS brags about the BizAI sale. "Worth it. Finally worth it." Alex says nothing.';
const MEMORY_MOR = 'MOR001 - 10:15PM - Morgan hands Riley an envelope by the bar. "Not here," Riley says, and pockets it.';
const PAPER_DNA = 'Paternity test result. Subject: Sarah Blackwood. The probability of paternity is 99.9 percent. Signed, Dr. Ames.';
const PAPER_LETTER = 'Dear Marcus, I know what you did with the Stanford patents. You have until Friday. - A friend';

/** The documents whose full text a card may quote, by id. */
const DOCUMENT_TEXT = {
  ale003: MEMORY_ALE,
  mor001: MEMORY_MOR,
  'p-dna': PAPER_DNA,
  'p-rescued': PAPER_LETTER
};

/**
 * The map writer's story map (phase 4, brief 4.6) for this fixture's weave and record: every
 * roster player in a beat, three cards from the record, both kept photos placed (the hero at
 * the top), both connections landed, and no change to the weave, so every map check passes.
 * Since phase 4b (brief 1D) it is at the level of the story: each beat a move with its people,
 * the threads it carries and its evidence underneath, each piece naming a document of the
 * record, the ledger or the director's notes and quoting its source word for word, and each card
 * beat flagging the piece whose document it prints. Every thread in the story lands in a beat.
 * Invented text. Exported as OUTLINE too: the map is the outline stop's output.
 */
const MAP = {
  headline: 'The Room Voted Overdose. The Ledger Kept Talking.',
  deck: 'Marcus bragged about a sale the night he died, and the room settled on an accidental overdose.',
  topPhoto: 'hero.jpg',
  sections: [
    {
      slot: 'lede', heading: '', job: 'Open on the vote and ask who gained from the sale.',
      beats: [
        {
          id: 'b1', move: 'The deadlock between Alex and Morgan, then the vote for an overdose', players: ['Alex', 'Morgan'], threads: ['t1', 't3'], connection: 'c1', kind: 'scene',
          evidence: [{ sources: ['notes'], shows: 'Alex and Morgan argued at the bar.', stance: 'supports' }]
        }
      ],
      photos: []
    },
    {
      slot: 'theStory', heading: 'The Story', job: 'How the sale and the envelope sat under the vote.',
      beats: [
        {
          id: 'b2', move: 'Marcus brags about the sale', players: ['Alex'], threads: ['t2', 't4'], connection: 'c2', card: true, kind: 'receipt',
          evidence: [{ sources: ['ale003'], shows: 'Marcus on the sale: "Worth it. Finally worth it."', stance: 'supports', card: true }]
        },
        {
          id: 'b3', move: 'Morgan pays Riley at the bar', players: ['Morgan', 'Riley'], threads: ['t3'], card: true, kind: 'receipt',
          evidence: [{ sources: ['mor001'], shows: 'Morgan hands Riley an envelope by the bar, and Riley says "Not here."', stance: 'supports', card: true }]
        },
        {
          id: 'b4', move: 'The paternity result names Sarah', players: ['Sarah'], threads: ['t4'], card: true, kind: 'receipt',
          evidence: [{ sources: ['p-dna'], shows: 'The paternity test names Sarah Blackwood.', stance: 'supports', card: true }]
        }
      ],
      photos: [{ filename: 'p2.jpg', beat: 'b2' }]
    },
    {
      slot: 'followTheMoney', heading: 'Follow the Money', job: 'What the sale paid, and to whom.',
      beats: [
        {
          id: 'b5', move: 'The sale pays into Melanie', players: [], threads: ['t2'], kind: 'figure',
          evidence: [{ sources: ['ledger'], shows: 'Melanie, $75,000 at 07:50 PM', stance: 'supports' }]
        }
      ],
      photos: []
    },
    {
      slot: 'closing', heading: '', job: 'Who still gains from the sale.',
      beats: [
        {
          id: 'b6', move: 'Riley says they only kept the books', players: ['Riley'], threads: ['t3'], kind: 'line',
          evidence: [{ sources: ['notes'], shows: 'Riley watched the ledger all morning.', stance: 'supports' }]
        }
      ],
      photos: []
    }
  ],
  dropped: [
    { slot: 'thePlayers', reason: 'Every player appears above.' },
    { slot: 'whatsMissing', reason: "Its question is the closing's." }
  ],
  leftOut: [
    {
      id: 'b9', move: 'An unsigned letter threatens Marcus', players: [], threads: ['t1'], kind: 'receipt',
      evidence: [{ sources: ['p-rescued'], shows: 'A friend gives Marcus "until Friday".', stance: 'supports' }]
    }
  ],
  expectedLength: 1200,
  weaveChanges: []
};
const OUTLINE = MAP;

/**
 * The arc writer's weave (phase 4, brief 4.4; phase 4b, briefs 1B and 3B), for this fixture's
 * record: three angles over five threads, the verdict's thread in each and one thread no angle
 * uses; each thread a short name and one line in story terms, with its evidence underneath, every
 * piece naming one of the record's documents, the ledger or the director's notes and quoting its
 * source word for word; "from your notes" is the notes' own words, which angle 1 rests on; one
 * question by the pitch and one beside a thread; and every check passes. Invented text.
 */
const WEAVE = {
  angles: [
    {
      id: 'a1',
      headline: 'The Room Voted Overdose. The Ledger Kept Talking.',
      gist: 'The room called it an overdose, and the ledger points at a sale.',
      story: 'The room called it an accidental overdose, and the record points at a sale Marcus made the night he died.',
      question: 'Who gained from the sale the room left out of its statement?',
      lands: 'Every player sat through the deadlock that ended in the vote.',
      ends: 'The verdict closes the night; the sale and the heir keep it open.',
      threads: ['t1', 't2', 't3', 't4']
    },
    {
      id: 'a2',
      headline: 'Morgan Paid Riley at the Bar While the Room Argued',
      gist: 'Morgan argued for the overdose and paid Riley out of sight.',
      story: 'Morgan held one side of the deadlock and paid Riley at the bar. The room never asked why.',
      question: 'What did the envelope buy?',
      lands: 'The players watched Morgan argue and never saw the envelope.',
      ends: 'The vote went Morgan\'s way, and the envelope stayed out of the statement.',
      threads: ['t3', 't1']
    },
    {
      id: 'a3',
      headline: 'Sarah Inherits What the Room Never Weighed',
      gist: 'A paternity result names Sarah as the heir the room never discussed.',
      story: 'The room settled on an overdose, and a paternity result makes Sarah the heir to everything Marcus left.',
      question: 'Who gains from a death the room called an accident?',
      lands: 'The players never weighed the heir.',
      ends: 'The verdict stands, and Sarah inherits.',
      threads: ['t4', 't1']
    }
  ],
  fromYourNotes: 'Riley watched the ledger all morning',
  threads: [
    {
      id: 't1', name: 'The overdose vote', line: 'The room settled on an accidental overdose after a deadlock between Alex and Morgan.', verdict: true,
      evidence: [{ sources: ['notes'], shows: 'Alex and Morgan argued at the bar.', stance: 'supports' }]
    },
    {
      id: 't2', name: 'The sale', line: 'Marcus bragged about the BizAI sale the night he died.',
      evidence: [{ sources: ['ale003'], shows: 'Marcus on the sale: "Worth it. Finally worth it."', stance: 'supports' }]
    },
    {
      id: 't3', name: 'The envelope', line: 'Morgan paid Riley at the bar, out of sight.',
      evidence: [{ sources: ['mor001'], shows: 'Morgan hands Riley an envelope by the bar, and Riley says "Not here."', stance: 'supports' }]
    },
    {
      id: 't4', name: 'The heir', line: "A paternity result names Sarah as Marcus's heir.",
      evidence: [{ sources: ['p-dna'], shows: 'The paternity test names Sarah Blackwood.', stance: 'supports' }]
    },
    {
      id: 't5', name: 'The letter', line: 'An unsigned letter threatened Marcus over the patents.',
      evidence: [{ sources: ['p-rescued'], shows: 'A friend gives Marcus "until Friday".', stance: 'supports' }]
    }
  ],
  connections: [
    {
      id: 'c1', joins: ['t1', 't3'], line: 'Morgan sits on one side of the deadlock and pays at the bar.', kind: 'person',
      evidence: [{ sources: ['notes', 'mor001'], shows: 'Morgan argues at the bar and hands Riley the envelope there.', stance: 'supports' }]
    },
    {
      id: 'c2', joins: ['t2', 't4'], line: 'The night of the sale is the night the result came back.', kind: 'moment',
      evidence: [{ sources: ['ale003', 'p-dna'], shows: 'The brag and the test result come from the same night.', stance: 'supports' }]
    }
  ],
  questions: [
    { id: 'q1', kind: 'player', about: 'Sarah', question: 'The record holds nothing Sarah did this morning: what did Sarah do?', changes: 'Where Sarah appears in the article.' },
    { id: 'q2', kind: 'figure', about: 'The BizAI sale', question: 'Did the BizAI sale go through the night Marcus died?', changes: 'Whether the article calls it a sale.', thread: 't2' }
  ]
};

/** A previous article whose cards quote documents from the record. */
const PREVIOUS_BUNDLE = {
  headline: { main: 'The Sale', kicker: 'NovaNews', deck: 'A vote for overdose' },
  byline: { author: 'Cass Nova | NovaNews', title: 'Senior Investigative Correspondent' },
  sections: [
    {
      id: 'the-story', type: 'narrative', heading: 'The Story',
      content: [
        { type: 'paragraph', text: 'Marcus bragged.' },
        { type: 'evidence-card', tokenId: 'ale003', headline: 'The brag', content: 'ALE003 - 11:32PM - MARCUS brags', owner: 'Alex Reeves', significance: 'critical' },
        { type: 'paragraph', text: 'Then the test came back.' },
        { type: 'evidence-card', tokenId: 'p-dna', headline: 'The test', content: 'The probability of paternity is 99.9 percent.', owner: 'Sarah Blackwood', significance: 'supporting' }
      ]
    }
  ],
  evidenceCards: [
    { tokenId: 'mor001', headline: 'The envelope', summary: 'Morgan pays Riley', owner: 'Morgan Reed', significance: 'supporting', placement: 'sidebar' },
    { tokenId: 'p-rescued', headline: 'The letter', summary: 'A threat to Marcus', owner: 'Unknown', significance: 'contextual', placement: 'sidebar' }
  ],
  metadata: { sessionId: '010126', theme: 'journalist', generatedAt: '2026-01-01T00:00:00.000Z' }
};

/**
 * @param {string} [theme='journalist']
 * @returns {Object} a state with every writer input populated and no tail inputs
 *   (no arc-stop guidance, no gate notes, no advisories): add those per test.
 */
function reworkFixtureState(theme = 'journalist') {
  const evidenceBundle = {
    exposed: {
      tokens: [
        {
          id: 'ale003', sourceType: 'memory-token', owner: null, summary: 'Marcus brags',
          fullContent: MEMORY_ALE, content: MEMORY_ALE, characterRefs: ['Marcus', 'Alex'], temporalContext: 'PARTY',
          rawData: { tokenId: 'ale003', name: 'ALE003 - The sale', fullDescription: MEMORY_ALE, owners: ['Alex Reeves'] }
        },
        {
          id: 'mor001', sourceType: 'memory-token', owner: 'Morgan Reed', summary: 'An envelope',
          fullContent: MEMORY_MOR, content: MEMORY_MOR, characterRefs: ['Morgan', 'Riley'], temporalContext: 'PARTY',
          rawData: { tokenId: 'mor001', name: 'MOR001 - The envelope', fullDescription: MEMORY_MOR, owners: ['Morgan Reed'] }
        }
      ],
      paperEvidence: [
        {
          notionId: 'p-dna', id: 'p-dna', name: 'DNA test', basicType: 'Document', description: PAPER_DNA,
          owners: ['Sarah Blackwood'], fullContent: PAPER_DNA, sourceType: 'paper-evidence', temporalContext: 'BACKGROUND'
        },
        // A rescued item: the raw record, no id, no fullContent.
        { notionId: 'p-rescued', name: 'Rescued letter', basicType: 'Prop', description: PAPER_LETTER, owners: [], rescuedByHuman: true }
      ]
    },
    buried: {
      transactions: [
        { sourceType: 'memory-token', shellAccount: 'Melanie', amount: 75000, time: '07:50 PM', temporalContext: 'INVESTIGATION' }
      ]
    }
  };

  return {
    sessionId: '010126',
    theme,
    sessionConfig: {
      roster: ['Alex', 'Morgan', 'Sarah', 'Riley'],
      rosterPronouns: { Alex: 'he/him', Morgan: 'she/her', Sarah: 'she/her', Riley: 'they/them' },
      accusation: { accused: [], charge: 'Accidental overdose', verdictKind: 'overdose' },
      accusationRaw: 'Six votes for an accidental overdose, after a deadlock between Alex and Morgan.',
      reportingMode: 'remote',
      journalistFirstName: 'Cass'
    },
    canonicalCharacters: { Alex: 'Alex Reeves', Morgan: 'Morgan Reed', Sarah: 'Sarah Blackwood', Riley: 'Riley Torres' },
    characterData: {
      characters: {
        Alex: { role: 'CEO', groups: ['Stanford Four'], relationships: { Marcus: 'partner' } },
        Morgan: { role: 'Investor', groups: [], relationships: {} }
      }
    },
    playerFocus: {
      accusation: { accused: [], charge: 'Accidental overdose', verdictKind: 'overdose', reasoning: 'Deadlocked, then settled' },
      whiteboardContext: { suspectsExplored: ['Alex', 'Morgan'], connections: ['Alex -> Marcus'], notes: ['BizAI?'], namesFound: ['Riley'] },
      primaryInvestigation: 'Who sold the company?'
    },
    directorNotes: {
      rawProse: 'Alex and Morgan argued at the bar. Riley watched the ledger all morning. Following the investigation, Riley left town.',
      quotes: [{ speaker: 'Riley', text: 'I only kept the books', confidence: 'high' }],
      transactionReferences: [],
      // An item stored before 3.6, with the enricher's headline beside the director's
      // sentence: the pinned renders print the sentence alone under <EPILOGUE> (3.6
      // fix batch, item 10).
      postInvestigationDevelopments: [{ headline: 'Riley left town', detail: 'Following the investigation, Riley left town.' }]
    },
    inputReviewCorrections: ['The quote at the bar was Morgan to Alex, not Alex to Morgan.'],
    evidenceBundle,
    // Phase 4 (brief 4.4): the weave. Brief 4.6: the old arc channels went with their last
    // readers (R4), and the story meeting is approved: this is a state past the meeting.
    weave: JSON.parse(JSON.stringify(WEAVE)),
    meetingApproved: true,
    narrativeTensions: {
      tensions: [{ type: 'public-vs-private', narrativeNote: 'Riley said they only kept the books, and an account in their circle took money.' }]
    },
    sessionPhotos: ['photos/hero.jpg', 'photos/p2.jpg', 'photos/whiteboard.jpg'],
    whiteboardPhotoPath: 'photos/whiteboard.jpg',
    photoAnalyses: {
      analyses: [
        { filename: 'hero.jpg', identifiedCharacters: ['Alex', 'Morgan', 'Sarah'] },
        { filename: 'p2.jpg', identifiedCharacters: ['Alex'] }
      ]
    },
    photoDescriptions: { 'p2.jpg': 'Alex leans over the ledger and points at a line.' },
    shellAccounts: [{ name: 'Melanie', total: 75000, tokenCount: 1 }],
    outline: JSON.parse(JSON.stringify(MAP)),
    _mapBaseline: JSON.parse(JSON.stringify(MAP))
  };
}

module.exports = { reworkFixtureState, DOCUMENT_TEXT, OUTLINE, MAP, PREVIOUS_BUNDLE, WEAVE };

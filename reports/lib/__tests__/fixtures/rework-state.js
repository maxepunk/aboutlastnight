/**
 * A session state that reaches every section of the three writers (phase 2, 2.3).
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

const OUTLINE = {
  lede: { hook: 'Marcus died with a sale on his lips.', keyTension: 'The room voted overdose.', primaryArc: 'arc-sale' },
  theStory: {
    arcInterweaving: { interleavingPlan: 'Cut between the sale and the envelope.', callbackOpportunities: [], convergencePoint: 'The vote' },
    arcs: [{ name: 'arc-sale', paragraphCount: 3, evidenceCards: [{ tokenId: 'ale003', placement: 'after para 1', loopFunction: 'CLOSER' }], photoPlacement: null }]
  },
  followTheMoney: { arcConnections: [], shellAccounts: [{ name: 'Melanie', total: 75000, inference: 'A quiet sale', relatedArc: 'arc-sale' }], photoPlacement: null },
  thePlayers: { arcConnections: [], exposed: ['Alex'], buried: ['Morgan'] },
  whatsMissing: { arcConnections: [], knownUnknowns: ['Who took the envelope?'], narrativePurpose: 'Pull forward' },
  closing: { arcResolutions: [], systemicAngle: 'Markets for memory', accusationHandling: 'Say what the room said' }
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

  const narrativeArcs = [
    {
      id: 'arc-sale', title: 'The Sale', summary: 'Marcus sold BizAI the night he died.', arcSource: 'accusation',
      keyEvidence: ['ale003', 'p-dna'], characterPlacements: { Alex: 'witness', Sarah: 'heir' },
      evidenceStrength: 'moderate', caveats: ['One memory only'], unansweredQuestions: ['Who bought it?'],
      emotionalHook: 'Worth it', playerEmphasis: 'high', storyRelevance: 'critical',
      analysisNotes: { financial: 'Melanie received $75,000', behavioral: 'Alex went quiet', victimization: 'Sarah' },
      interweaving: { sharedCharacters: ['Alex'], bridgeOpportunities: [], callbackSeeds: ['Worth it'], convergenceRole: 'motive' }
    },
    {
      id: 'arc-envelope', title: 'The Envelope', summary: 'Morgan paid Riley at the bar.', arcSource: 'observation',
      keyEvidence: ['mor001', 'p-rescued'], characterPlacements: { Morgan: 'payer', Riley: 'payee' },
      evidenceStrength: 'weak', caveats: [], unansweredQuestions: ['What was in it?'],
      emotionalHook: 'Not here', playerEmphasis: 'medium', storyRelevance: 'supporting',
      analysisNotes: { financial: '', behavioral: 'Riley hid it', victimization: '' }
    }
  ];

  const packageItem = (id, type, owner) => ({
    id, type, owner, summary: `${id} summary`, fullContent: DOCUMENT_TEXT[id],
    quotableExcerpts: id === 'ale003' ? ['"Worth it. Finally worth it."'] : []
  });

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
      rawProse: 'Alex and Morgan argued at the bar. Riley watched the ledger all morning.',
      quotes: [{ speaker: 'Riley', text: 'I only kept the books', confidence: 'high' }],
      transactionReferences: [],
      postInvestigationDevelopments: [{ headline: 'Riley left town' }]
    },
    inputReviewCorrections: ['The quote at the bar was Morgan to Alex, not Alex to Morgan.'],
    evidenceBundle,
    narrativeArcs,
    selectedArcs: ['arc-sale', 'arc-envelope'],
    _arcAnalysisCache: {
      synthesizedAt: '2026-01-01T00:00:00.000Z',
      synthesisNotes: 'The room settled on overdose; the record points at the sale.',
      interweavingPlan: { suggestedOrder: ['arc-sale', 'arc-envelope'], convergencePoint: 'The vote', keyCallbacks: [] },
      arcCount: 2,
      architecture: 'split-call',
      timing: { total: '1s' }
    },
    narrativeTensions: {
      tensions: [{ type: 'public-vs-private', narrativeNote: 'Riley said they only kept the books, and an account in their circle took money.' }]
    },
    arcEvidencePackages: [
      {
        arcId: 'arc-sale', arcTitle: 'The Sale', arcSource: 'accusation', evidenceStrength: 'moderate',
        evidenceItems: [packageItem('ale003', 'memory', 'Alex Reeves'), packageItem('p-dna', 'paper', 'Sarah Blackwood')],
        photos: [{ filename: 'p2.jpg', characters: ['Alex'] }],
        characterPlacements: { Alex: 'witness' }, analysisNotes: {}
      },
      {
        arcId: 'arc-envelope', arcTitle: 'The Envelope', arcSource: 'observation', evidenceStrength: 'weak',
        evidenceItems: [packageItem('mor001', 'memory', 'Morgan Reed'), packageItem('p-rescued', 'paper', null)],
        photos: [],
        characterPlacements: { Morgan: 'payer' }, analysisNotes: {}
      }
    ],
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
    outline: OUTLINE
  };
}

module.exports = { reworkFixtureState, DOCUMENT_TEXT, OUTLINE, PREVIOUS_BUNDLE };

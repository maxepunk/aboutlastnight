/**
 * Mock LLM Client for Testing
 *
 * CONSOLIDATED mock factory for all tests.
 * SDK pattern returns parsed objects directly (not JSON strings).
 *
 * Usage in tests:
 *   const { createMockSdkClient } = require('../mocks/llm-client.mock');
 *
 *   const mockSdkClient = createMockSdkClient({
 *     evidenceBundle: { exposed: [], buried: [] }
 *   });
 *
 *   const config = { configurable: { sdkClient: mockSdkClient } };
 *   const result = await nodeFunction(state, config);
 */

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Default evidence bundle fixture
 */
function getDefaultEvidenceBundle() {
  return {
    exposed: { tokens: [], paperEvidence: [] },
    buried: { transactions: [], relationships: [] },
    context: { timeline: {}, playerFocus: {}, sessionMetadata: {} },
    curatorNotes: { layerRationale: 'Default test bundle', characterCoverage: {} }
  };
}

/**
 * Default arc analysis fixture
 */
function getDefaultArcAnalysis() {
  return {
    narrativeArcs: [
      { name: 'Test Arc', playerEmphasis: 'HIGH', evidenceTokens: [], charactersFeatured: [], summary: 'Test' }
    ],
    characterPlacementOpportunities: {},
    rosterCoverage: { featured: [], mentioned: [], needsPlacement: [] },
    heroImageSuggestion: null
  };
}

/**
 * Default weave fixture (phase 4, brief 4.4; phase 4b, briefs 1B and 3B): two angles over one
 * thread, the room's verdict, in the story-level shape, its evidence from the director's notes
 * with no quotation, so it passes the weave checks on any record.
 */
function getDefaultWeave() {
  return {
    angles: [
      {
        id: 'a1', headline: 'Test Headline for the Weave', gist: 'The room settled on its verdict.',
        story: 'The room settled on its verdict, and the ledger tells a second story.', question: 'What did the money buy this morning?',
        lands: 'Every player argued the vote.', ends: 'The verdict and the ledger meet at the last sale.', threads: ['t1']
      },
      {
        id: 'a2', headline: 'A Second Test Headline', gist: 'The vote split the room.',
        story: 'The vote split the room, and the split decided the story.', question: 'Who carried the room?',
        lands: 'Every player cast a vote.', ends: 'The split vote stands as the record of the morning.', threads: ['t1']
      }
    ],
    threads: [
      {
        id: 't1', name: 'The verdict', line: 'The room named its culprit after a split vote.', verdict: true,
        evidence: [{ sources: ['notes'], shows: 'The room argued its way to a split vote.', stance: 'supports' }]
      }
    ],
    connections: [],
    questions: []
  };
}

/**
 * Default outline fixture: the story map (phase 4, brief 4.6), in its story-level shape (phase
 * 4b, brief 1D): one move carrying the default weave's one thread, its evidence from the
 * director's notes with no quotation. Invented text; it marks no card, so on a test's own record
 * the map checks may fail its card count, and its one rework returns it again.
 */
function getDefaultOutline() {
  return {
    headline: 'Test Headline for the Map',
    deck: 'Test deck for the map.',
    sections: [
      {
        slot: 'lede', heading: '', job: 'Test job: open on the verdict.',
        beats: [{
          id: 'b1', move: 'The room names its verdict', players: [], threads: ['t1'], kind: 'scene',
          evidence: [{ sources: ['notes'], shows: 'The room argued its way to a split vote.', stance: 'supports' }]
        }],
        photos: []
      }
    ],
    dropped: [],
    leftOut: [],
    expectedLength: 900,
    weaveChanges: []
  };
}

/**
 * Default content bundle fixture
 */
function getDefaultContentBundle() {
  return {
    metadata: {
      sessionId: 'test-session',
      theme: 'journalist',
      generatedAt: new Date().toISOString()
    },
    headline: { main: 'Test Headline for Validation' },
    sections: [{ id: 'test', type: 'narrative', content: [{ type: 'paragraph', text: 'Test content' }] }]
  };
}

/**
 * Default validation results fixture
 */
function getDefaultValidationResults() {
  return {
    passed: true,
    issues: [],
    voice_score: 4,
    voice_notes: 'Test validation passed',
    roster_coverage: { featured: [], mentioned: [], missing: [] },
    systemic_critique_present: true,
    blake_handled_correctly: true
  };
}

/**
 * Default revision fixture
 */
function getDefaultRevision() {
  return {
    contentBundle: getDefaultContentBundle(),
    fixes_applied: ['Test fix applied']
  };
}

/**
 * Default evaluation fixture (for evaluator nodes)
 */
function getDefaultEvaluation() {
  return {
    ready: true,
    overallScore: 0.85,
    criteriaScores: { accuracy: 0.9, narrative: 0.8 },
    issues: [],
    revisionGuidance: '',
    confidence: 'high'
  };
}

/**
 * Default photo analysis fixture
 */
function getDefaultPhotoAnalysis() {
  return {
    filename: 'test.jpg',
    visualContent: 'Test visual content',
    narrativeMoment: 'Test narrative moment',
    suggestedCaption: 'Test caption',
    characterDescriptions: [{ description: 'person in dark clothing', role: 'speaking' }],
    emotionalTone: 'neutral',
    storyRelevance: 'supporting'
  };
}

/**
 * Default specialist fixture (for arc specialist nodes)
 */
function getDefaultSpecialist() {
  return {
    domain: 'test',
    findings: [],
    patterns: [],
    keyInsights: []
  };
}

/**
 * Default preprocessed item fixture
 */
function getDefaultPreprocessedItem() {
  return {
    id: 'item-1',
    summary: 'Mock summary',
    narrativeRelevance: 'high',
    tags: ['mock']
  };
}

// Consolidated DEFAULT_FIXTURES object
const DEFAULT_FIXTURES = {
  evidence: getDefaultEvidenceBundle(),
  arc: getDefaultArcAnalysis(),
  weave: getDefaultWeave(),
  outline: getDefaultOutline(),
  content: getDefaultContentBundle(),
  validation: getDefaultValidationResults(),
  revision: getDefaultRevision(),
  evaluation: getDefaultEvaluation(),
  photo: getDefaultPhotoAnalysis(),
  specialist: getDefaultSpecialist(),
  preprocess: getDefaultPreprocessedItem()
};

// ═══════════════════════════════════════════════════════════════════════════
// PATTERN MATCHING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect which fixture to use based on prompt/systemPrompt content
 *
 * Order matters: more specific matches first, schema matches take priority.
 *
 * @param {Object} options - SDK options
 * @returns {string|null} - Fixture key or null
 */
function detectFixtureKey(options) {
  const { prompt = '', systemPrompt = '', jsonSchema } = options;
  const promptLower = (prompt || '').toLowerCase();
  const systemLower = (systemPrompt || '').toLowerCase();

  // Schema-based matching (most reliable). Phase 4 (brief 4.6): the map writer's schema
  // keeps the outline's id.
  if (jsonSchema?.$id === 'content-bundle') return 'contentBundle';
  if (jsonSchema?.$id === 'outline') return 'outline';

  // Evaluator patterns (must come BEFORE general arc/outline matches)
  // because evaluator prompts contain terms like "narrative arcs".
  // Phase 4 (brief 4.4): the arc stage's judge is the weave's fact check. Brief 4.7c: the
  // outline judge's route went, with the judge itself (brief 4.6; spec 5.4).
  if (systemLower.includes('weave fact check')) {
    return 'weaveFactCheck';
  }
  // Phase 4 (brief 4.7a): the article judge, by its identity line.
  if (systemLower.includes('article judge')) {
    return 'articleEvaluation';
  }

  // The arc writer (and its rework, built from its sections), by the heading its prompt
  // opens with, which marks its call alone. Phase 4 (brief 4.4): it writes the weave. It
  // comes before every match on a word the prompt holds: the prompt carries the whole record,
  // whose text can hold "batch" (fix round 3: on a real record, 092026's, the weave writer got
  // the preprocessor's fixture and threw), and its whiteboard section is labelled as a
  // model's reading of the photo, which the photo match would otherwise take.
  if (promptLower.startsWith('# the weave')) return 'weave';

  // Preprocessing
  if (promptLower.includes('preprocess') || promptLower.includes('batch')) return 'preprocess';

  // Photo analysis
  if (promptLower.includes('photo') || promptLower.includes('image') ||
      systemLower.includes('photograph')) return 'photo';

  // Evidence curation
  if (promptLower.includes('curate') || systemLower.includes('curating evidence')) {
    return 'evidenceBundle';
  }

  // Arc specialists
  if (systemLower.includes('financial specialist') || systemLower.includes('financial patterns')) {
    return 'financialSpecialist';
  }
  if (systemLower.includes('behavioral specialist') || systemLower.includes('behavioral patterns')) {
    return 'behavioralSpecialist';
  }
  if (systemLower.includes('victimization specialist') || systemLower.includes('victimization patterns')) {
    return 'victimizationSpecialist';
  }
  if (systemLower.includes('synthesizer') || systemLower.includes('arc synthesis')) {
    return 'arcSynthesis';
  }

  // Arc analysis
  if (promptLower.includes('narrative arc') || systemLower.includes('analyzing narrative')) {
    return 'arcAnalysis';
  }

  // Outline generation
  if (promptLower.includes('generate outline') ||
      systemLower.includes('story map') ||
      (promptLower.includes('outline') && !promptLower.includes('from outline'))) {
    return 'outline';
  }

  // Content generation
  if ((promptLower.includes('generate article') && !promptLower.includes('generate outline')) ||
      systemLower.includes('article generation')) {
    return 'contentBundle';
  }

  // Validation
  if (promptLower.includes('validate') || systemLower.includes('validating')) {
    return 'validationResults';
  }

  // Revision
  if (promptLower.includes('revise') || systemLower.includes('revising')) {
    return 'revision';
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a mock SDK client for testing
 *
 * Returns a function that mimics sdkQuery behavior, returning
 * parsed objects directly (not JSON strings - matches SDK pattern).
 *
 * @param {Object} fixtures - Custom fixtures (merged with defaults)
 * @param {Object} options - Mock options
 * @param {boolean} options.recordCalls - Whether to record calls (default: true)
 * @returns {Function} Mock SDK client function with getCalls(), getLastCall(), clearCalls()
 */
function createMockSdkClient(fixtures = {}, options = {}) {
  const { recordCalls = true } = options;
  const callLog = [];

  // Merge custom fixtures with defaults
  const mergedFixtures = {
    // Default fixtures
    evidenceBundle: getDefaultEvidenceBundle(),
    arcAnalysis: getDefaultArcAnalysis(),
    weave: getDefaultWeave(),
    outline: getDefaultOutline(),
    contentBundle: getDefaultContentBundle(),
    validationResults: getDefaultValidationResults(),
    revision: getDefaultRevision(),
    photo: getDefaultPhotoAnalysis(),
    preprocess: getDefaultPreprocessedItem(),

    // Evaluator fixtures. Phase 4 (brief 4.4): the weave's fact check scores the truth
    // criteria alone, and finds no breach by default.
    weaveFactCheck: {
      ready: true,
      structuralPassed: true,
      overallScore: 1,
      issues: [],
      structuralIssues: [],
      advisoryWarnings: [],
      confidence: 'high',
      criteriaScores: { evidenceTruth: { score: 1, type: 'structural' }, verdictTruth: { score: 1, type: 'structural' } }
    },
    // Phase 4 (brief 4.7a): the article judge scores the truth criteria alone too, and
    // finds no breach by default.
    articleEvaluation: {
      ready: true,
      structuralPassed: true,
      overallScore: 1,
      issues: [],
      structuralIssues: [],
      advisoryWarnings: [],
      confidence: 'high',
      criteriaScores: { evidenceTruth: { score: 1 }, wordsTruth: { score: 1 } }
    },

    // Specialist fixtures
    financialSpecialist: {
      accountPatterns: [{ description: 'Shell company pattern', confidence: 'high' }],
      timingClusters: [],
      suspiciousFlows: [],
      financialConnections: []
    },
    behavioralSpecialist: {
      characterDynamics: [{ description: 'Alliance shift', confidence: 'high' }],
      behaviorCorrelations: [],
      zeroFootprintCharacters: [],
      behavioralInsights: []
    },
    victimizationSpecialist: {
      victims: [{ description: 'Primary victim', confidence: 'high' }],
      operators: [],
      selfBurialPatterns: [],
      targetingInsights: []
    },
    arcSynthesis: {
      arcs: [
        {
          title: 'The Hidden Alliance',
          summary: 'A secret partnership revealed',
          keyEvidence: ['evidence-1'],
          characterPlacements: { 'Alice': 'operator', 'Bob': 'victim' },
          emotionalHook: 'Betrayal of trust',
          playerEmphasis: 'high',
          storyRelevance: 'critical'
        }
      ],
      narrativeCompass: {
        coreThemes: ['Betrayal'],
        emotionalHook: 'Trust shattered'
      }
    },

    // Override with custom fixtures
    ...fixtures
  };

  async function mockSdkQuery(queryOptions) {
    if (recordCalls) {
      callLog.push({
        ...queryOptions,
        timestamp: new Date().toISOString()
      });
    }

    // Detect which fixture to use
    const fixtureKey = detectFixtureKey(queryOptions);

    if (fixtureKey && mergedFixtures[fixtureKey]) {
      const fixture = mergedFixtures[fixtureKey];
      // If fixture is a function, call it with options
      if (typeof fixture === 'function') {
        return await fixture(queryOptions);
      }
      // Return deep copy to prevent mutation
      return JSON.parse(JSON.stringify(fixture));
    }

    // Return empty object if no match (log warning for debugging)
    const promptPreview = (queryOptions.prompt || '').substring(0, 50);
    console.warn('[MockSdkClient] No fixture matched:', promptPreview);
    return {};
  }

  // Attach call tracking methods
  mockSdkQuery.getCalls = () => [...callLog];
  mockSdkQuery.getLastCall = () => callLog[callLog.length - 1] || null;
  mockSdkQuery.clearCalls = () => { callLog.length = 0; };
  mockSdkQuery.wasCalledWith = (expectedParams) => {
    return callLog.some(call => {
      for (const [key, value] of Object.entries(expectedParams)) {
        if (call[key] !== value) return false;
      }
      return true;
    });
  };

  return mockSdkQuery;
}

// Alias for compatibility
const createMockClaudeClient = createMockSdkClient;

/**
 * Create a simple mock that always returns the same response
 * @param {Object} response - Response to return
 * @returns {Function} Mock SDK client function
 */
function createSimpleMock(response) {
  const calls = [];
  const mock = async (options) => {
    calls.push(options);
    return JSON.parse(JSON.stringify(response));
  };
  mock.getCalls = () => [...calls];
  mock.getLastCall = () => calls[calls.length - 1] || null;
  mock.clearCalls = () => { calls.length = 0; };
  return mock;
}

/**
 * Mock implementation of isClaudeAvailable
 * Always returns true in tests
 */
async function isClaudeAvailable() {
  return true;
}

/**
 * Mock implementation of getModelTimeout
 */
function getModelTimeout(model) {
  const MODEL_TIMEOUTS = {
    opus: 10 * 60 * 1000,
    sonnet: 5 * 60 * 1000,
    haiku: 2 * 60 * 1000
  };
  return MODEL_TIMEOUTS[model] || MODEL_TIMEOUTS.sonnet;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // Primary factory
  createMockSdkClient,

  // Aliases
  createMockClaudeClient,
  createSimpleMock,

  // Default fixtures for customization
  DEFAULT_FIXTURES,
  detectFixtureKey,

  // Default fixture generators (for extension/customization)
  getDefaultEvidenceBundle,
  getDefaultArcAnalysis,
  getDefaultWeave,
  getDefaultOutline,
  getDefaultContentBundle,
  getDefaultValidationResults,
  getDefaultRevision,
  getDefaultEvaluation,
  getDefaultPhotoAnalysis,
  getDefaultSpecialist,
  getDefaultPreprocessedItem,

  // Compatibility exports
  isClaudeAvailable,
  getModelTimeout,
  MODEL_TIMEOUTS: {
    opus: 10 * 60 * 1000,
    sonnet: 5 * 60 * 1000,
    haiku: 2 * 60 * 1000
  },

  // For jest.mock - provide a default mock
  sdkQuery: createMockSdkClient(),
  query: createMockSdkClient()
};

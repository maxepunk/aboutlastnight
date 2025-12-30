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
 * Default outline fixture
 */
function getDefaultOutline() {
  return {
    lede: { hook: 'Test hook', keyTension: 'Test tension' },
    theStory: { arcs: [] },
    followTheMoney: { shellAccounts: [] },
    thePlayers: { exposed: [], buried: [], pullQuotes: [] },
    whatsMissing: { gaps: [], unansweredQuestions: [] },
    closing: { systemicAngle: 'Test angle', accusationHandling: 'Test handling' }
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

  // Schema-based matching (most reliable)
  if (jsonSchema?.$id === 'content-bundle') return 'contentBundle';

  // Evaluator patterns (must come BEFORE general arc/outline matches)
  // because evaluator prompts contain terms like "narrative arcs"
  if (systemLower.includes('arcs evaluator') || systemLower.includes('arcs evaluation')) {
    return 'arcsEvaluation';
  }
  if (systemLower.includes('outline evaluator') || systemLower.includes('outline evaluation')) {
    return 'outlineEvaluation';
  }
  if (systemLower.includes('article evaluator') || systemLower.includes('article evaluation')) {
    return 'articleEvaluation';
  }

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
      systemLower.includes('creating an article outline') ||
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
    outline: getDefaultOutline(),
    contentBundle: getDefaultContentBundle(),
    validationResults: getDefaultValidationResults(),
    revision: getDefaultRevision(),
    photo: getDefaultPhotoAnalysis(),
    preprocess: getDefaultPreprocessedItem(),

    // Evaluator fixtures
    arcsEvaluation: {
      ready: true,
      overallScore: 0.85,
      issues: [],
      confidence: 'high',
      criteriaScores: { coherence: 1.0, evidenceGrounding: 0.8, narrativePotential: 0.8 }
    },
    outlineEvaluation: {
      ready: true,
      overallScore: 0.80,
      issues: [],
      confidence: 'high',
      criteriaScores: { arcCoverage: 1.0, sectionBalance: 0.8, flowLogic: 0.8 }
    },
    articleEvaluation: {
      ready: true,
      overallScore: 0.82,
      issues: [],
      confidence: 'high',
      criteriaScores: { voiceConsistency: 0.9, antiPatterns: 0.8, evidenceIntegration: 0.8 }
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

/**
 * Arc Specialist Nodes - Parallel domain analysis for report generation workflow
 *
 * Handles the arc analysis sub-phases (2.1-2.2) of the pipeline:
 * - analyzeFinancialPatterns: Money flows, account naming, timing clusters
 * - analyzeBehavioralPatterns: Character dynamics, observations, relationships
 * - analyzeVictimizationPatterns: Who targeted whom, self-burial patterns
 * - synthesizeArcs: Combine specialist outputs with player focus
 *
 * Added in Commit 8.6 to address arc analysis timeout with large evidence bundles.
 * Instead of one monolithic Opus call, we use 3 parallel domain specialists
 * (Haiku/Sonnet) followed by a synthesizer.
 *
 * Scatter-Gather Pattern:
 * 1. SCATTER: Three specialists run in parallel, each focused on one domain
 * 2. GATHER: Synthesizer combines all specialist outputs into unified arcs
 *
 * All nodes follow the LangGraph pattern:
 * - Accept (state, config) parameters
 * - Return partial state updates (using mergeReducer for specialistAnalyses)
 * - Use PHASES constants for currentPhase values
 * - Support skip logic for resume
 *
 * See ARCHITECTURE_DECISIONS.md 8.6.2 for design rationale.
 */

const { PHASES, APPROVAL_TYPES } = require('../state');
const { callClaude } = require('../../claude-client');

// ═══════════════════════════════════════════════════════════════════════════
// SPECIALIST DOMAIN DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Domain definitions for each specialist
 * Each domain has specific focus areas and output structure
 */
const SPECIALIST_DOMAINS = {
  financial: {
    name: 'Financial Patterns Specialist',
    focus: [
      'Transaction patterns and timing',
      'Account naming conventions and aliases',
      'Money flow connections between characters',
      'Suspicious financial timing clusters',
      'Evidence of financial coordination'
    ],
    outputFields: ['accountPatterns', 'timingClusters', 'suspiciousFlows', 'financialConnections']
  },
  behavioral: {
    name: 'Behavioral Patterns Specialist',
    focus: [
      'Character dynamics and relationships',
      'Director observations about behavior',
      'Behavioral → transaction correlations',
      'Zero-footprint character analysis',
      'Suspicious behavioral patterns'
    ],
    outputFields: ['characterDynamics', 'behaviorCorrelations', 'zeroFootprintCharacters', 'behavioralInsights']
  },
  victimization: {
    name: 'Victimization Patterns Specialist',
    focus: [
      'Who targeted whom (memory burial)',
      'Operator identification patterns',
      'Self-burial patterns (memory drug on self)',
      'Victim identification and protection',
      'Targeting relationships and motives'
    ],
    outputFields: ['victims', 'operators', 'selfBurialPatterns', 'targetingInsights']
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get Claude client from config or use default
 * @param {Object} config - Graph config
 * @returns {Function} Claude client function
 */
function getClaudeClient(config) {
  return config?.configurable?.claudeClient || callClaude;
}

/**
 * Build system prompt for a domain specialist
 * @param {string} domain - Domain name (financial, behavioral, victimization)
 * @param {Object} playerFocus - Player focus data
 * @returns {string} System prompt
 */
function buildSpecialistSystemPrompt(domain, playerFocus) {
  const domainDef = SPECIALIST_DOMAINS[domain];
  if (!domainDef) {
    throw new Error(`Unknown specialist domain: ${domain}`);
  }

  const focusContext = playerFocus?.primaryInvestigation
    ? `The players were investigating: "${playerFocus.primaryInvestigation}".`
    : 'Analyze from a general investigative perspective.';

  const focusAreas = domainDef.focus.map((f, i) => `${i + 1}. ${f}`).join('\n');

  return `You are the ${domainDef.name} for an investigative article about "About Last Night" - a crime thriller game.

Your task is to analyze the evidence and identify patterns specific to your domain.

DOMAIN FOCUS AREAS:
${focusAreas}

CONTEXT:
${focusContext}

IMPORTANT RULES:
1. Focus ONLY on your domain - other specialists cover other areas
2. Be specific about which evidence supports each finding
3. Note confidence levels for each pattern identified
4. Flag any connections to other domains for the synthesizer
5. Use character names from the evidence (names are resolved at this phase)

OUTPUT FORMAT:
Provide your analysis as JSON with these fields:
${domainDef.outputFields.map(f => `- ${f}`).join('\n')}

Each finding should include:
- description: What you found
- evidence: Which items support this
- confidence: high/medium/low
- relevanceToPlayers: How this connects to player focus`;
}

/**
 * Build user prompt with evidence for specialist
 * @param {Object} state - Current state with evidence
 * @param {string} domain - Domain name
 * @returns {string} User prompt with evidence
 */
function buildSpecialistUserPrompt(state, domain) {
  const evidenceBundle = state.evidenceBundle || {};
  const photoAnalyses = state.photoAnalyses || { analyses: [] };
  const preprocessedEvidence = state.preprocessedEvidence || { items: [] };

  return `Analyze the following evidence for ${domain} patterns:

EVIDENCE BUNDLE:
${JSON.stringify(evidenceBundle, null, 2)}

PHOTO ANALYSES:
${JSON.stringify(photoAnalyses.analyses, null, 2)}

PREPROCESSED EVIDENCE SUMMARIES:
${JSON.stringify(preprocessedEvidence.items.slice(0, 20), null, 2)}

${preprocessedEvidence.items.length > 20 ? `... and ${preprocessedEvidence.items.length - 20} more items` : ''}

Provide your ${domain} domain analysis as JSON.`;
}

/**
 * Safely parse JSON with actionable error messages
 * @param {string} response - JSON string to parse
 * @param {string} context - Context for error messages
 * @returns {Object} Parsed JSON
 * @throws {Error} If parsing fails
 */
function safeParseJson(response, context) {
  try {
    return JSON.parse(response);
  } catch (error) {
    const preview = response.substring(0, 100);
    throw new Error(
      `Failed to parse ${context} JSON. ` +
      `Response preview: "${preview}..." ` +
      `Parse error: ${error.message}`
    );
  }
}

/**
 * Create empty specialist result
 * @param {string} domain - Domain name
 * @param {string} sessionId - Session identifier
 * @returns {Object} Empty result structure
 */
function createEmptySpecialistResult(domain, sessionId) {
  const domainDef = SPECIALIST_DOMAINS[domain];
  const result = {
    domain,
    analyzedAt: new Date().toISOString(),
    sessionId: sessionId || null,
    findings: {}
  };

  // Initialize empty arrays for each output field
  domainDef.outputFields.forEach(field => {
    result.findings[field] = [];
  });

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// SPECIALIST NODE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analyze financial patterns in evidence
 *
 * Focuses on: transaction patterns, account aliases, money flows,
 * timing clusters, financial coordination evidence.
 *
 * @param {Object} state - Current state with evidenceBundle, photoAnalyses
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with specialistAnalyses.financial
 */
async function analyzeFinancialPatterns(state, config) {
  return analyzeForDomain('financial', state, config);
}

/**
 * Analyze behavioral patterns in evidence
 *
 * Focuses on: character dynamics, director observations, behavior-transaction
 * correlations, zero-footprint analysis.
 *
 * @param {Object} state - Current state with evidenceBundle, photoAnalyses
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with specialistAnalyses.behavioral
 */
async function analyzeBehavioralPatterns(state, config) {
  return analyzeForDomain('behavioral', state, config);
}

/**
 * Analyze victimization patterns in evidence
 *
 * Focuses on: targeting relationships, operator identification,
 * self-burial patterns, victim protection.
 *
 * @param {Object} state - Current state with evidenceBundle, photoAnalyses
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with specialistAnalyses.victimization
 */
async function analyzeVictimizationPatterns(state, config) {
  return analyzeForDomain('victimization', state, config);
}

/**
 * Generic domain analysis function
 * @param {string} domain - Domain to analyze
 * @param {Object} state - Current state
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update
 */
async function analyzeForDomain(domain, state, config) {
  console.log(`[${domain}Specialist] Starting analysis`);

  // Skip if this specialist's analysis already exists
  if (state.specialistAnalyses?.[domain]) {
    console.log(`[${domain}Specialist] Skipping - analysis already exists`);
    return {
      currentPhase: PHASES.ARC_SPECIALISTS
    };
  }

  // Skip if no evidence to analyze
  if (!state.evidenceBundle && !state.preprocessedEvidence) {
    console.log(`[${domain}Specialist] Skipping - no evidence available`);
    return {
      specialistAnalyses: {
        [domain]: createEmptySpecialistResult(domain, state.sessionId)
      },
      currentPhase: PHASES.ARC_SPECIALISTS
    };
  }

  const claudeClient = getClaudeClient(config);
  const systemPrompt = buildSpecialistSystemPrompt(domain, state.playerFocus);
  const userPrompt = buildSpecialistUserPrompt(state, domain);

  try {
    const response = await claudeClient({
      systemPrompt,
      userPrompt,
      model: 'sonnet', // Specialists use Sonnet for quality analysis
      outputFormat: 'json',
      timeout: 180000 // 3 minutes per specialist
    });

    const findings = safeParseJson(response, `${domain} specialist`);

    const result = {
      domain,
      analyzedAt: new Date().toISOString(),
      sessionId: state.sessionId || null,
      findings
    };

    console.log(`[${domain}Specialist] Complete: Found ${Object.keys(findings).length} finding categories`);

    return {
      specialistAnalyses: {
        [domain]: result
      },
      currentPhase: PHASES.ARC_SPECIALISTS
    };

  } catch (error) {
    console.error(`[${domain}Specialist] Error:`, error.message);

    return {
      specialistAnalyses: {
        [domain]: {
          ...createEmptySpecialistResult(domain, state.sessionId),
          _error: error.message
        }
      },
      errors: [{
        phase: PHASES.ARC_SPECIALISTS,
        type: `${domain}-specialist-failed`,
        message: error.message,
        timestamp: new Date().toISOString()
      }],
      currentPhase: PHASES.ARC_SPECIALISTS // Continue with partial results
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SYNTHESIZER NODE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build system prompt for arc synthesizer
 * @param {Object} playerFocus - Player focus data
 * @returns {string} System prompt
 */
function buildSynthesizerSystemPrompt(playerFocus) {
  const focusContext = playerFocus?.primaryInvestigation
    ? `The players were investigating: "${playerFocus.primaryInvestigation}".`
    : 'Synthesize from a general investigative perspective.';

  const whiteboardNotes = playerFocus?.whiteboardAccusations
    ? `\n\nWHITEBOARD ACCUSATIONS (what players concluded):\n${JSON.stringify(playerFocus.whiteboardAccusations, null, 2)}`
    : '';

  return `You are the Arc Synthesizer for an investigative article about "About Last Night" - a crime thriller game.

Your task is to combine analyses from three domain specialists into unified narrative arcs for the article.

${focusContext}${whiteboardNotes}

INPUT: You will receive findings from:
1. Financial Patterns Specialist - money flows, timing, aliases
2. Behavioral Patterns Specialist - dynamics, observations, correlations
3. Victimization Patterns Specialist - targeting, operators, victims

OUTPUT: Create 3-5 narrative arcs, each with:
- title: Compelling arc title
- summary: 2-3 sentence summary
- keyEvidence: Most important evidence items
- characterPlacements: Where each roster member fits
- emotionalHook: What makes this arc compelling
- playerEmphasis: How this connects to player focus (Layer 3)
- storyRelevance: critical/supporting/contextual

SYNTHESIS RULES:
1. Cross-reference findings across domains for stronger arcs
2. Prioritize what players focused on (whiteboard = Layer 3 drives)
3. Ensure every roster member has a placement
4. Create emotionally resonant story beats
5. Flag gaps or contradictions for transparency

Provide your synthesis as JSON with: { arcs: [...], synthesisNotes: string }`;
}

/**
 * Build user prompt for arc synthesizer
 * @param {Object} state - Current state with specialistAnalyses
 * @returns {string} User prompt with all specialist findings
 */
function buildSynthesizerUserPrompt(state) {
  const specialists = state.specialistAnalyses || {};

  return `Synthesize these specialist findings into narrative arcs:

FINANCIAL SPECIALIST FINDINGS:
${JSON.stringify(specialists.financial?.findings || {}, null, 2)}

BEHAVIORAL SPECIALIST FINDINGS:
${JSON.stringify(specialists.behavioral?.findings || {}, null, 2)}

VICTIMIZATION SPECIALIST FINDINGS:
${JSON.stringify(specialists.victimization?.findings || {}, null, 2)}

PHOTO ANALYSES (for context):
${JSON.stringify((state.photoAnalyses?.analyses || []).slice(0, 5), null, 2)}

Create 3-5 unified narrative arcs that weave these findings together.`;
}

/**
 * Synthesize specialist findings into unified narrative arcs
 *
 * Combines outputs from all three domain specialists with player focus
 * to produce cohesive narrative arcs for the article.
 *
 * Skip logic: If state.narrativeArcs exists and is non-empty,
 * skip processing (resume from checkpoint case).
 *
 * @param {Object} state - Current state with specialistAnalyses
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with narrativeArcs, _arcAnalysisCache
 */
async function synthesizeArcs(state, config) {
  console.log('[synthesizeArcs] Starting arc synthesis');

  // Skip if arcs already exist
  if (state.narrativeArcs && state.narrativeArcs.length > 0) {
    console.log('[synthesizeArcs] Skipping - narrativeArcs already exist');
    return {
      currentPhase: PHASES.ARC_SYNTHESIS
    };
  }

  // Check if we have specialist analyses
  const specialists = state.specialistAnalyses || {};
  const hasAnalyses = Object.keys(specialists).length > 0;

  if (!hasAnalyses) {
    console.log('[synthesizeArcs] Warning - no specialist analyses available');
    // Continue anyway - synthesizer can work with just evidence
  }

  const claudeClient = getClaudeClient(config);
  const systemPrompt = buildSynthesizerSystemPrompt(state.playerFocus);
  const userPrompt = buildSynthesizerUserPrompt(state);

  try {
    const response = await claudeClient({
      systemPrompt,
      userPrompt,
      model: 'sonnet', // Synthesizer uses Sonnet for quality
      outputFormat: 'json',
      timeout: 180000 // 3 minutes
    });

    const result = safeParseJson(response, 'arc synthesizer');
    const arcs = result.arcs || [];

    console.log(`[synthesizeArcs] Complete: ${arcs.length} arcs synthesized`);

    return {
      narrativeArcs: arcs,
      _arcAnalysisCache: {
        synthesizedAt: new Date().toISOString(),
        specialistDomains: Object.keys(specialists),
        synthesisNotes: result.synthesisNotes || '',
        arcCount: arcs.length
      },
      currentPhase: PHASES.ARC_SYNTHESIS,
      awaitingApproval: true,
      approvalType: APPROVAL_TYPES.ARC_SELECTION
    };

  } catch (error) {
    console.error('[synthesizeArcs] Error:', error.message);

    return {
      narrativeArcs: [],
      _arcAnalysisCache: {
        synthesizedAt: new Date().toISOString(),
        _error: error.message
      },
      errors: [{
        phase: PHASES.ARC_SYNTHESIS,
        type: 'arc-synthesis-failed',
        message: error.message,
        timestamp: new Date().toISOString()
      }],
      currentPhase: PHASES.ERROR
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK FACTORIES FOR TESTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create mock specialist for testing
 * @param {string} domain - Domain name
 * @param {Object} options - Mock options
 * @returns {Function} Mock specialist function
 */
function createMockSpecialist(domain, options = {}) {
  const { findings = {}, shouldFail = false, errorMessage = 'Mock error' } = options;

  return async (state, config) => {
    if (shouldFail) {
      return {
        specialistAnalyses: {
          [domain]: {
            ...createEmptySpecialistResult(domain, state.sessionId),
            _error: errorMessage
          }
        },
        errors: [{
          phase: PHASES.ARC_SPECIALISTS,
          type: `${domain}-specialist-failed`,
          message: errorMessage,
          timestamp: new Date().toISOString()
        }],
        currentPhase: PHASES.ARC_SPECIALISTS
      };
    }

    return {
      specialistAnalyses: {
        [domain]: {
          domain,
          analyzedAt: new Date().toISOString(),
          sessionId: state.sessionId || 'mock-session',
          findings: findings[domain] || SPECIALIST_DOMAINS[domain].outputFields.reduce((acc, field) => {
            acc[field] = [{ description: `Mock ${field}`, confidence: 'medium' }];
            return acc;
          }, {})
        }
      },
      currentPhase: PHASES.ARC_SPECIALISTS
    };
  };
}

/**
 * Create mock synthesizer for testing
 * @param {Object} options - Mock options
 * @returns {Function} Mock synthesizer function
 */
function createMockSynthesizer(options = {}) {
  const { arcs = null, shouldFail = false, errorMessage = 'Mock synthesis error' } = options;

  return async (state, config) => {
    if (shouldFail) {
      return {
        narrativeArcs: [],
        _arcAnalysisCache: { _error: errorMessage },
        errors: [{
          phase: PHASES.ARC_SYNTHESIS,
          type: 'arc-synthesis-failed',
          message: errorMessage,
          timestamp: new Date().toISOString()
        }],
        currentPhase: PHASES.ERROR
      };
    }

    const mockArcs = arcs || [
      {
        title: 'Mock Arc 1',
        summary: 'A mock narrative arc for testing',
        keyEvidence: ['evidence-1'],
        characterPlacements: {},
        emotionalHook: 'Mock emotional hook',
        playerEmphasis: 'high',
        storyRelevance: 'critical'
      }
    ];

    return {
      narrativeArcs: mockArcs,
      _arcAnalysisCache: {
        synthesizedAt: new Date().toISOString(),
        specialistDomains: Object.keys(state.specialistAnalyses || {}),
        arcCount: mockArcs.length
      },
      currentPhase: PHASES.ARC_SYNTHESIS,
      awaitingApproval: true,
      approvalType: APPROVAL_TYPES.ARC_SELECTION
    };
  };
}

module.exports = {
  // Main node functions
  analyzeFinancialPatterns,
  analyzeBehavioralPatterns,
  analyzeVictimizationPatterns,
  synthesizeArcs,

  // Mock factories for testing
  createMockSpecialist,
  createMockSynthesizer,

  // Export for testing
  _testing: {
    SPECIALIST_DOMAINS,
    getClaudeClient,
    buildSpecialistSystemPrompt,
    buildSpecialistUserPrompt,
    buildSynthesizerSystemPrompt,
    buildSynthesizerUserPrompt,
    safeParseJson,
    createEmptySpecialistResult,
    analyzeForDomain
  }
};

// Self-test when run directly
if (require.main === module) {
  console.log('Arc Specialist Nodes Self-Test\n');

  // Test with mock client
  const mockClaudeClient = async (options) => {
    if (options.systemPrompt.includes('Financial')) {
      return JSON.stringify({
        accountPatterns: [{ description: 'Shell company pattern', confidence: 'high' }],
        timingClusters: [],
        suspiciousFlows: [{ description: 'Unusual transfer timing', confidence: 'medium' }],
        financialConnections: []
      });
    }
    if (options.systemPrompt.includes('Behavioral')) {
      return JSON.stringify({
        characterDynamics: [{ description: 'Alliance shift', confidence: 'high' }],
        behaviorCorrelations: [],
        zeroFootprintCharacters: [],
        behavioralInsights: []
      });
    }
    if (options.systemPrompt.includes('Victimization')) {
      return JSON.stringify({
        victims: [{ description: 'Primary victim identified', confidence: 'high' }],
        operators: [],
        selfBurialPatterns: [],
        targetingInsights: []
      });
    }
    if (options.systemPrompt.includes('Synthesizer')) {
      return JSON.stringify({
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
        synthesisNotes: 'Self-test synthesis complete'
      });
    }
    return JSON.stringify({});
  };

  const mockState = {
    sessionId: 'self-test',
    evidenceBundle: { exposed: [], buried: [] },
    preprocessedEvidence: { items: [{ id: 'test-1' }] },
    playerFocus: { primaryInvestigation: 'Who is the Valet?' }
  };

  const mockConfig = {
    configurable: { claudeClient: mockClaudeClient }
  };

  console.log('Testing specialists...');

  Promise.all([
    analyzeFinancialPatterns(mockState, mockConfig),
    analyzeBehavioralPatterns(mockState, mockConfig),
    analyzeVictimizationPatterns(mockState, mockConfig)
  ]).then(async ([financial, behavioral, victimization]) => {
    console.log('Financial findings:', Object.keys(financial.specialistAnalyses?.financial?.findings || {}));
    console.log('Behavioral findings:', Object.keys(behavioral.specialistAnalyses?.behavioral?.findings || {}));
    console.log('Victimization findings:', Object.keys(victimization.specialistAnalyses?.victimization?.findings || {}));

    // Merge specialist results
    const combinedState = {
      ...mockState,
      specialistAnalyses: {
        ...financial.specialistAnalyses,
        ...behavioral.specialistAnalyses,
        ...victimization.specialistAnalyses
      }
    };

    console.log('\nTesting synthesizer...');
    const synthesis = await synthesizeArcs(combinedState, mockConfig);
    console.log('Arcs synthesized:', synthesis.narrativeArcs?.length);
    console.log('First arc title:', synthesis.narrativeArcs?.[0]?.title);
    console.log('\nSelf-test complete.');
  }).catch(err => {
    console.error('Self-test failed:', err.message);
    process.exit(1);
  });
}

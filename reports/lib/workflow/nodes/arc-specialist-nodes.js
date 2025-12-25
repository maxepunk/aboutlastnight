/**
 * Arc Specialist Nodes - Orchestrated subagent analysis for report generation
 *
 * Commit 8.8: Replaces sequential 4-node pattern with single orchestrated node.
 * Commit 8.9: Migrated to file-based specialist agents in .claude/agents/
 *
 * Previous pattern (Commit 8.6):
 * - 3 sequential specialist nodes (financial, behavioral, victimization)
 * - 1 synthesizer node to combine results
 * - Used mergeReducer for accumulating partial results
 *
 * Pattern (Commit 8.8):
 * - 1 orchestrator node with access to 3 specialist subagents
 * - Orchestrator has rich context (game rules, voice, objectives)
 * - Orchestrator coordinates specialists intentionally
 * - Orchestrator synthesizes results cohesively
 * - Uses replaceReducer (returns complete object)
 *
 * Pattern (Commit 8.9 - Current):
 * - Specialists are file-based agents in .claude/agents/:
 *   - journalist-financial-specialist
 *   - journalist-behavioral-specialist
 *   - journalist-victimization-specialist
 * - Specialists load reference docs (character-voice.md, evidence-boundaries.md, anti-patterns.md)
 * - Orchestrator invokes specialists via Task tool
 * - File-based agents are auto-discovered by Claude Code
 *
 * Benefits:
 * - Orchestrator maintains narrative coherence
 * - Better alignment with player focus (Layer 3 drives)
 * - Parallel execution via SDK subagent Task tool
 * - Single node simplifies graph structure
 * - Specialists load reference docs at runtime (not hardcoded prompts)
 *
 * See ARCHITECTURE_DECISIONS.md 8.8/8.9 for design rationale.
 */

const { PHASES, APPROVAL_TYPES } = require('../state');
// Commit 8.9: Specialists are now file-based agents in .claude/agents/
const {
  SPECIALIST_AGENT_NAMES,
  ORCHESTRATOR_SYSTEM_PROMPT,
  ORCHESTRATOR_OUTPUT_SCHEMA,
  ARC_SPECIALIST_SUBAGENTS  // Deprecated but kept for test compatibility
} = require('../../sdk-client/subagents');

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build orchestrator prompt with all evidence and context
 * @param {Object} state - Current state with evidence, player focus, etc.
 * @returns {string} User prompt for orchestrator
 */
function buildOrchestratorPrompt(state) {
  const evidenceBundle = state.evidenceBundle || {};
  const photoAnalyses = state.photoAnalyses || { analyses: [] };
  const preprocessedEvidence = state.preprocessedEvidence || { items: [] };
  const playerFocus = state.playerFocus || {};
  const sessionConfig = state.sessionConfig || {};
  const directorNotes = state.directorNotes || {};

  // Build context about what players focused on (Layer 3 drives)
  const whiteboardContext = playerFocus.whiteboard
    ? `\n\nWHITEBOARD (Player Conclusions):
Title: ${playerFocus.whiteboard.title || 'Unknown'}
Suspects: ${JSON.stringify(playerFocus.whiteboard.suspects || [])}
Evidence Connections: ${JSON.stringify(playerFocus.whiteboard.evidenceConnections || [])}
Facts Established: ${JSON.stringify(playerFocus.whiteboard.factsEstablished || [])}`
    : '';

  const accusationContext = playerFocus.accusationContext
    ? `\n\nFINAL ACCUSATION:
Accused: ${JSON.stringify(playerFocus.accusationContext.accused || [])}
Charge: ${playerFocus.accusationContext.charge || 'Unknown'}`
    : '';

  const rosterContext = sessionConfig.roster
    ? `\n\nROSTER (Characters in this session):
${sessionConfig.roster.join(', ')}`
    : '';

  const observationsContext = directorNotes.observations
    ? `\n\nDIRECTOR OBSERVATIONS:
Behavior Patterns: ${JSON.stringify(directorNotes.observations.behaviorPatterns || [])}
Suspicious Correlations: ${JSON.stringify(directorNotes.observations.suspiciousCorrelations || [])}
Notable Moments: ${JSON.stringify(directorNotes.observations.notableMoments || [])}`
    : '';

  return `Analyze the following evidence and coordinate your specialist subagents to create narrative arcs.

PRIMARY INVESTIGATION (what players focused on):
${playerFocus.primaryInvestigation || 'General investigation'}

EMOTIONAL HOOK:
${playerFocus.emotionalHook || 'Standard mystery'}

OPEN QUESTIONS (from players):
${JSON.stringify(playerFocus.openQuestions || [], null, 2)}
${whiteboardContext}
${accusationContext}
${rosterContext}
${observationsContext}

═══════════════════════════════════════════════════════════════════════════
EVIDENCE BUNDLE (Three-Layer Model)
═══════════════════════════════════════════════════════════════════════════

EXPOSED EVIDENCE (Layer 1 - Freely available):
${JSON.stringify(evidenceBundle.exposed || [], null, 2)}

BURIED EVIDENCE (Layer 2 - Required investigation):
${JSON.stringify(evidenceBundle.buried || [], null, 2)}

CONTEXT (Additional supporting evidence):
${JSON.stringify(evidenceBundle.context || [], null, 2)}

═══════════════════════════════════════════════════════════════════════════
PHOTO ANALYSES (Visual evidence from session)
═══════════════════════════════════════════════════════════════════════════

${JSON.stringify(photoAnalyses.analyses?.slice(0, 10) || [], null, 2)}
${photoAnalyses.analyses?.length > 10 ? `... and ${photoAnalyses.analyses.length - 10} more photos` : ''}

═══════════════════════════════════════════════════════════════════════════
PREPROCESSED EVIDENCE SUMMARIES
═══════════════════════════════════════════════════════════════════════════

${JSON.stringify(preprocessedEvidence.items?.slice(0, 20) || [], null, 2)}
${preprocessedEvidence.items?.length > 20 ? `... and ${preprocessedEvidence.items.length - 20} more items` : ''}

═══════════════════════════════════════════════════════════════════════════
INSTRUCTIONS
═══════════════════════════════════════════════════════════════════════════

Use the Task tool to invoke these specialist agents (they load reference docs automatically):

1. Task(subagent_type="${SPECIALIST_AGENT_NAMES.financial}") - analyze financial patterns
2. Task(subagent_type="${SPECIALIST_AGENT_NAMES.behavioral}") - analyze behavioral patterns
3. Task(subagent_type="${SPECIALIST_AGENT_NAMES.victimization}") - analyze targeting patterns

After collecting specialist analyses, synthesize into 3-5 narrative arcs.

Remember:
- Layer 3 (player focus/whiteboard) DRIVES narrative priority
- Every roster member must have a placement
- Cross-reference specialist findings for stronger arcs
- Specialists will load character-voice.md, evidence-boundaries.md, anti-patterns.md`;
}

/**
 * Create empty analysis result for error cases
 * @param {string} sessionId - Session identifier
 * @returns {Object} Empty analysis structure
 */
function createEmptyAnalysisResult(sessionId) {
  return {
    specialistAnalyses: {
      financial: { accountPatterns: [], timingClusters: [], suspiciousFlows: [], financialConnections: [] },
      behavioral: { characterDynamics: [], behaviorCorrelations: [], zeroFootprintCharacters: [], behavioralInsights: [] },
      victimization: { victims: [], operators: [], selfBurialPatterns: [], targetingInsights: [] }
    },
    narrativeArcs: [],
    synthesisNotes: 'Empty result - no analysis performed',
    analyzedAt: new Date().toISOString(),
    sessionId
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ORCHESTRATOR NODE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analyze arcs with SDK subagents
 *
 * Single orchestrated node that replaces:
 * - analyzeFinancialPatterns
 * - analyzeBehavioralPatterns
 * - analyzeVictimizationPatterns
 * - synthesizeArcs
 *
 * The orchestrator has rich context about the game and coordinates
 * three specialist subagents to analyze evidence from different perspectives,
 * then synthesizes their findings into cohesive narrative arcs.
 *
 * Skip logic: If narrativeArcs already exist with content, skip processing.
 *
 * @param {Object} state - Current state with evidence, player focus, etc.
 * @param {Object} config - Graph config with SDK client
 * @returns {Object} Partial state update with specialistAnalyses, narrativeArcs
 */
async function analyzeArcsWithSubagents(state, config) {
  console.log('[analyzeArcsWithSubagents] Starting orchestrated arc analysis');

  // Skip if arcs already exist (resume case)
  if (state.narrativeArcs && state.narrativeArcs.length > 0) {
    console.log('[analyzeArcsWithSubagents] Skipping - narrativeArcs already exist');
    return {
      currentPhase: PHASES.ARC_SYNTHESIS
    };
  }

  // Skip if no evidence to analyze
  if (!state.evidenceBundle && !state.preprocessedEvidence) {
    console.log('[analyzeArcsWithSubagents] Skipping - no evidence available');
    return {
      specialistAnalyses: createEmptyAnalysisResult(state.sessionId).specialistAnalyses,
      narrativeArcs: [],
      _arcAnalysisCache: {
        synthesizedAt: new Date().toISOString(),
        error: 'No evidence available'
      },
      currentPhase: PHASES.ARC_SYNTHESIS,
      awaitingApproval: true,
      approvalType: APPROVAL_TYPES.ARC_SELECTION
    };
  }

  // Get SDK client - supports subagents via agents option
  const { query } = require('@anthropic-ai/claude-agent-sdk');

  const orchestratorPrompt = buildOrchestratorPrompt(state);

  try {
    console.log('[analyzeArcsWithSubagents] Invoking orchestrator with subagents');

    // Call SDK - orchestrator uses Task tool to invoke file-based specialist agents
    // Commit 8.9: Removed agents parameter - specialists are file-based in .claude/agents/
    let result = null;

    for await (const msg of query({
      prompt: orchestratorPrompt,
      options: {
        model: 'sonnet',
        systemPrompt: ORCHESTRATOR_SYSTEM_PROMPT,
        // File-based agents are auto-discovered, no agents parameter needed
        outputFormat: {
          type: 'json_schema',
          schema: ORCHESTRATOR_OUTPUT_SCHEMA
        },
        allowedTools: ['Task'],  // Task tool for invoking file-based specialist agents
        permissionMode: 'bypassPermissions'
      }
    })) {
      if (msg.type === 'result' && msg.subtype === 'success') {
        result = msg.structured_output;
        break;
      }
      if (msg.type === 'result' && msg.subtype?.includes('error')) {
        throw new Error(`SDK: ${msg.subtype} - ${msg.errors?.join(', ')}`);
      }
    }

    if (!result) {
      throw new Error('SDK: No result received from orchestrator');
    }

    const { specialistAnalyses, narrativeArcs, synthesisNotes } = result;

    console.log(`[analyzeArcsWithSubagents] Complete: ${narrativeArcs?.length || 0} arcs synthesized`);
    console.log(`[analyzeArcsWithSubagents] Specialist domains: ${Object.keys(specialistAnalyses || {}).join(', ')}`);

    return {
      specialistAnalyses: specialistAnalyses || {},
      narrativeArcs: narrativeArcs || [],
      _arcAnalysisCache: {
        synthesizedAt: new Date().toISOString(),
        specialistDomains: Object.keys(specialistAnalyses || {}),
        synthesisNotes: synthesisNotes || '',
        arcCount: narrativeArcs?.length || 0,
        orchestratorModel: 'sonnet'
      },
      currentPhase: PHASES.ARC_SYNTHESIS,
      awaitingApproval: true,
      approvalType: APPROVAL_TYPES.ARC_SELECTION
    };

  } catch (error) {
    console.error('[analyzeArcsWithSubagents] Error:', error.message);

    return {
      specialistAnalyses: createEmptyAnalysisResult(state.sessionId).specialistAnalyses,
      narrativeArcs: [],
      _arcAnalysisCache: {
        synthesizedAt: new Date().toISOString(),
        _error: error.message
      },
      errors: [{
        phase: PHASES.ARC_SYNTHESIS,
        type: 'orchestrator-failed',
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
 * Create mock orchestrator for testing
 * @param {Object} options - Mock options
 * @returns {Function} Mock orchestrator function
 */
function createMockOrchestrator(options = {}) {
  const {
    specialistAnalyses = null,
    arcs = null,
    shouldFail = false,
    errorMessage = 'Mock orchestrator error'
  } = options;

  return async (state, config) => {
    if (shouldFail) {
      return {
        specialistAnalyses: createEmptyAnalysisResult(state.sessionId).specialistAnalyses,
        narrativeArcs: [],
        _arcAnalysisCache: { _error: errorMessage },
        errors: [{
          phase: PHASES.ARC_SYNTHESIS,
          type: 'orchestrator-failed',
          message: errorMessage,
          timestamp: new Date().toISOString()
        }],
        currentPhase: PHASES.ERROR
      };
    }

    const mockSpecialistAnalyses = specialistAnalyses || {
      financial: {
        accountPatterns: [{ description: 'Shell company pattern', confidence: 'high' }],
        timingClusters: [],
        suspiciousFlows: [{ description: 'Unusual transfer timing', confidence: 'medium' }],
        financialConnections: []
      },
      behavioral: {
        characterDynamics: [{ description: 'Alliance shift observed', confidence: 'high' }],
        behaviorCorrelations: [],
        zeroFootprintCharacters: [],
        behavioralInsights: []
      },
      victimization: {
        victims: [{ description: 'Primary victim identified', confidence: 'high' }],
        operators: [],
        selfBurialPatterns: [],
        targetingInsights: []
      }
    };

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
      specialistAnalyses: mockSpecialistAnalyses,
      narrativeArcs: mockArcs,
      _arcAnalysisCache: {
        synthesizedAt: new Date().toISOString(),
        specialistDomains: Object.keys(mockSpecialistAnalyses),
        arcCount: mockArcs.length
      },
      currentPhase: PHASES.ARC_SYNTHESIS,
      awaitingApproval: true,
      approvalType: APPROVAL_TYPES.ARC_SELECTION
    };
  };
}

/**
 * Legacy mock factories for backwards compatibility
 * @deprecated Use createMockOrchestrator instead
 */
function createMockSpecialist(domain, options = {}) {
  console.warn('[DEPRECATED] createMockSpecialist - use createMockOrchestrator');
  const { findings = {}, shouldFail = false, errorMessage = 'Mock error' } = options;

  return async (state, config) => {
    if (shouldFail) {
      return {
        specialistAnalyses: { [domain]: { _error: errorMessage } },
        errors: [{
          phase: PHASES.ARC_SPECIALISTS,
          type: `${domain}-specialist-failed`,
          message: errorMessage,
          timestamp: new Date().toISOString()
        }],
        currentPhase: PHASES.ARC_SPECIALISTS
      };
    }

    const defaultFindings = {
      financial: { accountPatterns: [], timingClusters: [], suspiciousFlows: [], financialConnections: [] },
      behavioral: { characterDynamics: [], behaviorCorrelations: [], zeroFootprintCharacters: [], behavioralInsights: [] },
      victimization: { victims: [], operators: [], selfBurialPatterns: [], targetingInsights: [] }
    };

    return {
      specialistAnalyses: { [domain]: findings[domain] || defaultFindings[domain] },
      currentPhase: PHASES.ARC_SPECIALISTS
    };
  };
}

function createMockSynthesizer(options = {}) {
  console.warn('[DEPRECATED] createMockSynthesizer - use createMockOrchestrator');
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
  // Main node function (Commit 8.8)
  analyzeArcsWithSubagents,

  // Mock factory (Commit 8.8)
  createMockOrchestrator,

  // Legacy exports for backwards compatibility
  // These are deprecated but kept to avoid breaking tests during migration
  createMockSpecialist,
  createMockSynthesizer,

  // Export for testing
  _testing: {
    buildOrchestratorPrompt,
    createEmptyAnalysisResult,
    SPECIALIST_AGENT_NAMES,
    ORCHESTRATOR_SYSTEM_PROMPT,
    ORCHESTRATOR_OUTPUT_SCHEMA,
    // Deprecated but kept for test backwards compatibility
    ARC_SPECIALIST_SUBAGENTS
  }
};

// Self-test when run directly
if (require.main === module) {
  console.log('Arc Specialist Nodes Self-Test (Commit 8.8)\n');

  // Test with mock orchestrator
  const mockOrchestrator = createMockOrchestrator();

  const mockState = {
    sessionId: 'self-test',
    evidenceBundle: { exposed: [], buried: [], context: [] },
    preprocessedEvidence: { items: [{ id: 'test-1' }] },
    playerFocus: {
      primaryInvestigation: 'Who is the Valet?',
      whiteboard: { title: 'MARCUS BLACKWOOD IS DEAD', suspects: ['Victoria', 'Morgan'] }
    },
    sessionConfig: { roster: ['Alex', 'Victoria', 'Morgan'] }
  };

  const mockConfig = {};

  console.log('Testing mock orchestrator...');

  mockOrchestrator(mockState, mockConfig).then(result => {
    console.log('Specialist analyses:', Object.keys(result.specialistAnalyses || {}));
    console.log('Arcs synthesized:', result.narrativeArcs?.length);
    console.log('First arc title:', result.narrativeArcs?.[0]?.title);
    console.log('Awaiting approval:', result.awaitingApproval);
    console.log('Approval type:', result.approvalType);
    console.log('\nSelf-test complete.');
  }).catch(err => {
    console.error('Self-test failed:', err.message);
    process.exit(1);
  });
}

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
// Commit 8.10: Specialists defined programmatically for SDK (file-based not auto-discovered)
const {
  SPECIALIST_AGENT_NAMES,
  SPECIALIST_AGENTS,
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

  // Flatten evidence bundle structure
  // Curator returns: { exposed: { tokens: [], paperEvidence: [] }, buried: { transactions: [], relationships: [] } }
  const exposedData = evidenceBundle.exposed || {};
  const buriedData = evidenceBundle.buried || {};
  const exposedItems = [
    ...(Array.isArray(exposedData.tokens) ? exposedData.tokens : []),
    ...(Array.isArray(exposedData.paperEvidence) ? exposedData.paperEvidence : [])
  ];
  const buriedItems = [
    ...(Array.isArray(buriedData.transactions) ? buriedData.transactions : []),
    ...(Array.isArray(buriedData.relationships) ? buriedData.relationships : [])
  ];

  // Build context about what players focused on (Layer 3 drives)
  // NOTE: synthesizePlayerFocus produces "whiteboardContext" and "accusation" keys
  const wbCtx = playerFocus.whiteboardContext || {};
  const whiteboardContext = (wbCtx.suspectsExplored?.length > 0 || wbCtx.connections?.length > 0)
    ? `\n\nWHITEBOARD (Player Conclusions):
Suspects Explored: ${JSON.stringify(wbCtx.suspectsExplored || [])}
Connections Found: ${JSON.stringify(wbCtx.connections || [])}
Notes: ${JSON.stringify(wbCtx.notes || [])}
Names Identified: ${JSON.stringify(wbCtx.namesFound || [])}`
    : '';

  // NOTE: synthesizePlayerFocus uses "accusation" not "accusationContext"
  const accusation = playerFocus.accusation || {};
  const accusationContext = (accusation.accused?.length > 0 || accusation.charge)
    ? `\n\nFINAL ACCUSATION:
Accused: ${JSON.stringify(accusation.accused || [])}
Charge: ${accusation.charge || 'Unknown'}
Reasoning: ${accusation.reasoning || 'Not provided'}`
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

EXPOSED EVIDENCE (Layer 1 - ${exposedItems.length} items freely available):
${JSON.stringify(exposedItems.slice(0, 15), null, 2)}
${exposedItems.length > 15 ? `... and ${exposedItems.length - 15} more exposed items` : ''}

BURIED EVIDENCE (Layer 2 - ${buriedItems.length} items required investigation):
${JSON.stringify(buriedItems.slice(0, 10), null, 2)}
${buriedItems.length > 10 ? `... and ${buriedItems.length - 10} more buried items` : ''}

CONTEXT (Curator notes and investigation gaps):
${JSON.stringify(evidenceBundle.context || {}, null, 2)}

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
- Specialists will load character-voice.md, evidence-boundaries.md, anti-patterns.md
${buildRevisionContext(state)}`;
}

/**
 * Build revision context from evaluator feedback
 * @param {Object} state - State with validationResults and revision count
 * @returns {string} Revision guidance section or empty string
 */
function buildRevisionContext(state) {
  const revisionCount = state.arcRevisionCount || 0;
  const validationResults = state.validationResults;

  if (revisionCount === 0 || !validationResults) {
    return '';  // First attempt, no feedback yet
  }

  const issues = validationResults.issues || [];
  const feedback = validationResults.feedback || '';
  const criteriaScores = validationResults.criteriaScores || {};

  const issuesText = issues.length > 0
    ? issues.map((issue, i) => `  ${i + 1}. ${issue}`).join('\n')
    : '  None specified';

  const scoresText = Object.entries(criteriaScores)
    .map(([key, val]) => `  - ${key}: ${val.score} (${val.notes || 'no notes'})`)
    .join('\n');

  return `

═══════════════════════════════════════════════════════════════════════════
REVISION ${revisionCount}: Address these issues from the previous attempt
═══════════════════════════════════════════════════════════════════════════

EVALUATOR FEEDBACK:
${feedback || 'No specific feedback provided'}

ISSUES TO FIX:
${issuesText}

CRITERIA SCORES:
${scoresText || '  Not available'}

Focus on addressing the specific issues above. Do not just regenerate - IMPROVE.`;
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

  // Debug: Log key input data to verify prompt assembly
  const pf = state.playerFocus || {};
  const wbCtx = pf.whiteboardContext || {};
  const acc = pf.accusation || {};
  // Flatten evidence bundle for counting
  const exposedData = state.evidenceBundle?.exposed || {};
  const buriedData = state.evidenceBundle?.buried || {};
  const exposedCount = (Array.isArray(exposedData.tokens) ? exposedData.tokens.length : 0) +
                       (Array.isArray(exposedData.paperEvidence) ? exposedData.paperEvidence.length : 0);
  const buriedCount = (Array.isArray(buriedData.transactions) ? buriedData.transactions.length : 0) +
                      (Array.isArray(buriedData.relationships) ? buriedData.relationships.length : 0);
  console.log(`[analyzeArcsWithSubagents] Input data check:`);
  console.log(`  - primaryInvestigation: ${pf.primaryInvestigation || 'MISSING'}`);
  console.log(`  - accusation.accused: ${JSON.stringify(acc.accused || [])}`);
  console.log(`  - whiteboardContext.suspectsExplored: ${JSON.stringify(wbCtx.suspectsExplored || [])}`);
  console.log(`  - directorObservations.behaviorPatterns: ${(pf.directorObservations?.behaviorPatterns || []).length} items`);
  console.log(`  - evidenceBundle: exposed=${exposedCount}, buried=${buriedCount}`);
  console.log(`  - roster: ${JSON.stringify(state.sessionConfig?.roster || [])}`);

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

  // Import sdkQuery wrapper with timeout protection (Commit 8.9 fix)
  const { sdkQuery } = require('../../sdk-client');

  const orchestratorPrompt = buildOrchestratorPrompt(state);

  try {
    console.log('[analyzeArcsWithSubagents] Invoking orchestrator with subagents');
    const startTime = Date.now();

    // Call SDK via wrapper - orchestrator uses Task tool to invoke specialist agents
    // Commit 8.10: Pass SPECIALIST_AGENTS programmatically (SDK doesn't auto-discover .claude/agents/)
    const result = await sdkQuery({
      prompt: orchestratorPrompt,
      systemPrompt: ORCHESTRATOR_SYSTEM_PROMPT,
      model: 'sonnet',
      jsonSchema: ORCHESTRATOR_OUTPUT_SCHEMA,
      allowedTools: ['Task', 'Read'],  // Task for subagents, Read for reference docs
      agents: SPECIALIST_AGENTS,  // Programmatic agent definitions
      timeoutMs: 10 * 60 * 1000,  // 10 minutes for orchestrator with subagents
      label: 'Arc orchestrator with subagents',
      onProgress: (msg) => {
        const elapsed = msg.elapsed || ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[analyzeArcsWithSubagents] Progress: ${msg.type} (${elapsed}s)${msg.toolName ? ` - ${msg.toolName}` : ''}`);
      }
    });

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
    SPECIALIST_AGENTS,
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

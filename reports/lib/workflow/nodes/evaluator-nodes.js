/**
 * Evaluator Nodes - Per-phase quality evaluation for report generation workflow
 *
 * Handles the evaluation sub-phases (2.3, 3.2, 4.2) of the pipeline:
 * - evaluateArcs: Check arc coherence, evidence grounding, narrative potential
 * - evaluateOutline: Check arc coverage, section balance, flow logic
 * - evaluateArticle: Check voice consistency, anti-patterns, evidence integration
 *
 * Added in Commit 8.6 to implement per-phase evaluator pattern.
 * Each evaluator determines if content is READY for human review.
 * Evaluators do NOT skip human approval - they determine readiness.
 *
 * Pattern: DRY factory creates evaluators with shared logic.
 * Each phase has specific quality criteria.
 *
 * Evaluator flow:
 * 1. Check quality criteria
 * 2. If ready=true → checkpoint for human approval
 * 3. If ready=false AND under revision cap → revise
 * 4. If ready=false AND at cap → checkpoint with issues visible
 *
 * All nodes follow the LangGraph pattern:
 * - Accept (state, config) parameters
 * - Return partial state updates (add to evaluationHistory)
 * - Use PHASES constants for currentPhase values
 * - Support revision caps from REVISION_CAPS
 *
 * See ARCHITECTURE_DECISIONS.md 8.6.4-8.6.5 for design rationale.
 */

const { PHASES, APPROVAL_TYPES, REVISION_CAPS } = require('../state');
const { callClaude } = require('../../claude-client');

// ═══════════════════════════════════════════════════════════════════════════
// QUALITY CRITERIA DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Quality criteria for each phase
 * Each criterion has a description and weight
 */
const QUALITY_CRITERIA = {
  arcs: {
    coherence: {
      description: 'Do arcs tell a consistent story?',
      weight: 0.25
    },
    evidenceGrounding: {
      description: 'Are arcs supported by evidence?',
      weight: 0.25
    },
    narrativePotential: {
      description: 'Do arcs have emotional resonance?',
      weight: 0.2
    },
    rosterCoverage: {
      description: 'Does every roster member have placement?',
      weight: 0.15
    },
    playerFocusAlignment: {
      description: 'Do arcs reflect what players focused on?',
      weight: 0.15
    }
  },
  outline: {
    arcCoverage: {
      description: 'Does outline address all selected arcs?',
      weight: 0.25
    },
    sectionBalance: {
      description: 'Are sections appropriately weighted?',
      weight: 0.2
    },
    flowLogic: {
      description: 'Does narrative flow make sense?',
      weight: 0.25
    },
    photoPlacement: {
      description: 'Are photos integrated meaningfully?',
      weight: 0.15
    },
    wordBudget: {
      description: 'Is section word budget reasonable?',
      weight: 0.15
    }
  },
  article: {
    voiceConsistency: {
      description: 'Does article maintain NovaNews voice throughout?',
      weight: 0.25
    },
    antiPatterns: {
      description: 'Are anti-patterns avoided? (per validator spec)',
      weight: 0.2
    },
    evidenceIntegration: {
      description: 'Is evidence woven in naturally?',
      weight: 0.2
    },
    characterPlacement: {
      description: 'Are all roster members mentioned?',
      weight: 0.15
    },
    emotionalResonance: {
      description: 'Does article deliver the promised experience?',
      weight: 0.2
    }
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
 * Build system prompt for evaluation
 * @param {string} phase - Phase name (arcs, outline, article)
 * @param {Object} criteria - Quality criteria for phase
 * @returns {string} System prompt
 */
function buildEvaluationSystemPrompt(phase, criteria) {
  const criteriaList = Object.entries(criteria)
    .map(([key, { description, weight }]) =>
      `- ${key} (${Math.round(weight * 100)}%): ${description}`)
    .join('\n');

  return `You are the ${phase.toUpperCase()} Evaluator for an investigative article about "About Last Night" - a crime thriller game.

Your task is to evaluate if the ${phase} content is ready for human review.

QUALITY CRITERIA:
${criteriaList}

EVALUATION RULES:
1. Score each criterion as: pass (1.0), partial (0.5), fail (0.0)
2. Calculate weighted average score
3. If score >= 0.7, content is READY for human review
4. If score < 0.7, provide specific revision guidance
5. Be honest but constructive - flag real issues, not nitpicks

OUTPUT FORMAT (JSON):
{
  "ready": boolean,
  "overallScore": number (0-1),
  "criteriaScores": { "criterionName": { "score": number, "notes": string } },
  "issues": [ "specific issue 1", "specific issue 2" ],
  "revisionGuidance": "specific instructions if not ready",
  "confidence": "high" | "medium" | "low"
}

Remember: You determine READINESS for human review, not approval. Human always makes final decision.`;
}

/**
 * Build user prompt with content to evaluate
 * @param {string} phase - Phase name
 * @param {Object} state - Current state with content
 * @returns {string} User prompt
 */
function buildEvaluationUserPrompt(phase, state) {
  switch (phase) {
    case 'arcs':
      return `Evaluate these narrative arcs:

ARCS:
${JSON.stringify(state.narrativeArcs || [], null, 2)}

PLAYER FOCUS:
${JSON.stringify(state.playerFocus || {}, null, 2)}

EVIDENCE BUNDLE SUMMARY:
${JSON.stringify({
  exposed: (state.evidenceBundle?.exposed || []).length,
  buried: (state.evidenceBundle?.buried || []).length
}, null, 2)}

Are these arcs ready for human review?`;

    case 'outline':
      return `Evaluate this article outline:

OUTLINE:
${JSON.stringify(state.outline || {}, null, 2)}

SELECTED ARCS:
${JSON.stringify(state.selectedArcs || [], null, 2)}

PHOTO ANALYSES:
${JSON.stringify((state.photoAnalyses?.analyses || []).slice(0, 5), null, 2)}

Is this outline ready for human review?`;

    case 'article':
      return `Evaluate this article content:

CONTENT BUNDLE:
${JSON.stringify(state.contentBundle || {}, null, 2)}

OUTLINE:
${JSON.stringify(state.outline || {}, null, 2)}

Is this article ready for human review?`;

    default:
      throw new Error(`Unknown evaluation phase: ${phase}`);
  }
}

/**
 * Safely parse JSON with actionable error messages
 * @param {string} response - JSON string to parse
 * @param {string} context - Context for error messages
 * @returns {Object} Parsed JSON
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
 * Get revision count field name for phase
 * @param {string} phase - Phase name
 * @returns {string} State field name for revision count
 */
function getRevisionCountField(phase) {
  switch (phase) {
    case 'arcs': return 'arcRevisionCount';
    case 'outline': return 'outlineRevisionCount';
    case 'article': return 'articleRevisionCount';
    default: throw new Error(`Unknown phase: ${phase}`);
  }
}

/**
 * Get revision cap for phase
 * @param {string} phase - Phase name
 * @returns {number} Maximum revisions allowed
 */
function getRevisionCap(phase) {
  switch (phase) {
    case 'arcs': return REVISION_CAPS.ARCS;
    case 'outline': return REVISION_CAPS.OUTLINE;
    case 'article': return REVISION_CAPS.ARTICLE;
    default: return 2;
  }
}

/**
 * Get approval type for phase
 * @param {string} phase - Phase name
 * @returns {string} Approval type constant
 */
function getApprovalType(phase) {
  switch (phase) {
    case 'arcs': return APPROVAL_TYPES.ARC_SELECTION;
    case 'outline': return APPROVAL_TYPES.OUTLINE;
    case 'article': return APPROVAL_TYPES.ARTICLE;
    default: return null;
  }
}

/**
 * Get PHASES constant for evaluation phase
 * @param {string} phase - Phase name
 * @returns {string} PHASES constant value
 */
function getPhaseConstant(phase) {
  switch (phase) {
    case 'arcs': return PHASES.ARC_EVALUATION;
    case 'outline': return PHASES.OUTLINE_EVALUATION;
    case 'article': return PHASES.ARTICLE_EVALUATION;
    default: throw new Error(`Unknown phase: ${phase}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EVALUATOR FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create an evaluator function for a specific phase
 * DRY pattern: shared evaluation logic, phase-specific criteria
 *
 * @param {string} phase - Phase name (arcs, outline, article)
 * @param {Object} options - Evaluator options
 * @returns {Function} Evaluator node function
 */
function createEvaluator(phase, options = {}) {
  const { model = 'haiku' } = options;
  const criteria = QUALITY_CRITERIA[phase];

  if (!criteria) {
    throw new Error(`No quality criteria defined for phase: ${phase}`);
  }

  /**
   * Evaluator node function
   * @param {Object} state - Current state
   * @param {Object} config - Graph config
   * @returns {Object} Partial state update
   */
  return async function evaluatePhase(state, config) {
    const phaseConstant = getPhaseConstant(phase);
    const revisionCountField = getRevisionCountField(phase);
    const revisionCap = getRevisionCap(phase);
    const approvalType = getApprovalType(phase);
    const currentRevisions = state[revisionCountField] || 0;

    console.log(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] Starting evaluation (revision ${currentRevisions}/${revisionCap})`);

    const claudeClient = getClaudeClient(config);
    const systemPrompt = buildEvaluationSystemPrompt(phase, criteria);
    const userPrompt = buildEvaluationUserPrompt(phase, state);

    try {
      const response = await claudeClient({
        systemPrompt,
        userPrompt,
        model,
        outputFormat: 'json',
        timeout: 60000 // 1 minute for evaluation
      });

      const evaluation = safeParseJson(response, `${phase} evaluation`);

      // Create evaluation history entry
      const historyEntry = {
        phase,
        timestamp: new Date().toISOString(),
        ready: evaluation.ready,
        overallScore: evaluation.overallScore,
        issues: evaluation.issues || [],
        confidence: evaluation.confidence || 'medium',
        revisionNumber: currentRevisions
      };

      // Determine next action based on evaluation result
      if (evaluation.ready) {
        console.log(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] Ready for human review (score: ${evaluation.overallScore})`);

        return {
          evaluationHistory: historyEntry,
          currentPhase: phaseConstant,
          awaitingApproval: true,
          approvalType
        };
      }

      // Not ready - check revision cap
      if (currentRevisions >= revisionCap) {
        console.log(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] At revision cap - escalating to human (score: ${evaluation.overallScore})`);

        return {
          evaluationHistory: {
            ...historyEntry,
            escalatedToHuman: true,
            escalationReason: `Reached revision cap (${revisionCap}) with issues: ${evaluation.issues.join(', ')}`
          },
          currentPhase: phaseConstant,
          awaitingApproval: true,
          approvalType
        };
      }

      // Need revision
      console.log(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] Needs revision (score: ${evaluation.overallScore})`);

      return {
        evaluationHistory: historyEntry,
        [revisionCountField]: currentRevisions + 1,
        currentPhase: phaseConstant,
        // Return revision guidance in validationResults for revision nodes
        validationResults: {
          passed: false,
          feedback: evaluation.revisionGuidance,
          issues: evaluation.issues,
          criteriaScores: evaluation.criteriaScores
        }
      };

    } catch (error) {
      console.error(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] Error:`, error.message);

      return {
        evaluationHistory: {
          phase,
          timestamp: new Date().toISOString(),
          ready: false,
          _error: error.message,
          revisionNumber: currentRevisions
        },
        errors: [{
          phase: phaseConstant,
          type: `${phase}-evaluation-failed`,
          message: error.message,
          timestamp: new Date().toISOString()
        }],
        currentPhase: PHASES.ERROR
      };
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EVALUATOR NODE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Evaluate narrative arcs for quality
 * Uses haiku for fast evaluation
 */
const evaluateArcs = createEvaluator('arcs', { model: 'haiku' });

/**
 * Evaluate article outline for quality
 * Uses haiku for fast evaluation
 */
const evaluateOutline = createEvaluator('outline', { model: 'haiku' });

/**
 * Evaluate article content for quality
 * Uses haiku for fast evaluation
 */
const evaluateArticle = createEvaluator('article', { model: 'haiku' });

// ═══════════════════════════════════════════════════════════════════════════
// MOCK FACTORY FOR TESTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create mock evaluator for testing
 * @param {string} phase - Phase name
 * @param {Object} options - Mock options
 * @returns {Function} Mock evaluator function
 */
function createMockEvaluator(phase, options = {}) {
  const {
    ready = true,
    overallScore = 0.85,
    issues = [],
    shouldFail = false,
    errorMessage = 'Mock evaluation error'
  } = options;

  return async function mockEvaluator(state, config) {
    const phaseConstant = getPhaseConstant(phase);
    const revisionCountField = getRevisionCountField(phase);
    const approvalType = getApprovalType(phase);
    const currentRevisions = state[revisionCountField] || 0;

    if (shouldFail) {
      return {
        evaluationHistory: {
          phase,
          timestamp: new Date().toISOString(),
          ready: false,
          _error: errorMessage,
          revisionNumber: currentRevisions
        },
        errors: [{
          phase: phaseConstant,
          type: `${phase}-evaluation-failed`,
          message: errorMessage,
          timestamp: new Date().toISOString()
        }],
        currentPhase: PHASES.ERROR
      };
    }

    const historyEntry = {
      phase,
      timestamp: new Date().toISOString(),
      ready,
      overallScore,
      issues,
      confidence: 'high',
      revisionNumber: currentRevisions
    };

    if (ready) {
      return {
        evaluationHistory: historyEntry,
        currentPhase: phaseConstant,
        awaitingApproval: true,
        approvalType
      };
    }

    return {
      evaluationHistory: historyEntry,
      [revisionCountField]: currentRevisions + 1,
      currentPhase: phaseConstant,
      validationResults: {
        passed: false,
        feedback: 'Mock revision guidance',
        issues
      }
    };
  };
}

module.exports = {
  // Main evaluator functions
  evaluateArcs,
  evaluateOutline,
  evaluateArticle,

  // Factory for custom evaluators
  createEvaluator,

  // Mock factory for testing
  createMockEvaluator,

  // Export for testing
  _testing: {
    QUALITY_CRITERIA,
    getClaudeClient,
    buildEvaluationSystemPrompt,
    buildEvaluationUserPrompt,
    safeParseJson,
    getRevisionCountField,
    getRevisionCap,
    getApprovalType,
    getPhaseConstant
  }
};

// Self-test when run directly
if (require.main === module) {
  console.log('Evaluator Nodes Self-Test\n');

  // Test with mock client
  const mockClaudeClient = async (options) => {
    // Return different scores based on phase
    if (options.systemPrompt.includes('ARCS')) {
      return JSON.stringify({
        ready: true,
        overallScore: 0.85,
        criteriaScores: {
          coherence: { score: 0.9, notes: 'Good coherence' },
          evidenceGrounding: { score: 0.8, notes: 'Well grounded' }
        },
        issues: [],
        revisionGuidance: null,
        confidence: 'high'
      });
    }

    if (options.systemPrompt.includes('OUTLINE')) {
      return JSON.stringify({
        ready: false,
        overallScore: 0.6,
        criteriaScores: {},
        issues: ['Section 3 needs more detail'],
        revisionGuidance: 'Expand section 3 with evidence references',
        confidence: 'medium'
      });
    }

    return JSON.stringify({
      ready: true,
      overallScore: 0.75,
      criteriaScores: {},
      issues: [],
      revisionGuidance: null,
      confidence: 'medium'
    });
  };

  const mockState = {
    sessionId: 'self-test',
    narrativeArcs: [{ title: 'Test Arc', summary: 'Test summary' }],
    playerFocus: { primaryInvestigation: 'Who is the Valet?' },
    evidenceBundle: { exposed: [{ id: 'e1' }], buried: [] },
    outline: { sections: [{ title: 'Intro' }] },
    contentBundle: { headline: { main: 'Test' }, sections: [] }
  };

  const mockConfig = {
    configurable: { claudeClient: mockClaudeClient }
  };

  console.log('Testing evaluateArcs...');
  evaluateArcs(mockState, mockConfig).then(result => {
    console.log('Arcs result:', {
      ready: result.awaitingApproval,
      phase: result.currentPhase
    });

    console.log('\nTesting evaluateOutline...');
    return evaluateOutline(mockState, mockConfig);
  }).then(result => {
    console.log('Outline result:', {
      ready: result.awaitingApproval,
      needsRevision: result.validationResults?.passed === false,
      revisionCount: result.outlineRevisionCount
    });

    console.log('\nTesting evaluateArticle...');
    return evaluateArticle(mockState, mockConfig);
  }).then(result => {
    console.log('Article result:', {
      ready: result.awaitingApproval,
      phase: result.currentPhase
    });

    console.log('\nSelf-test complete.');
  }).catch(err => {
    console.error('Self-test failed:', err.message);
    process.exit(1);
  });
}

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
const { safeParseJson, getSdkClient, formatIssuesForMessage } = require('./node-helpers');

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

// getSdkClient imported from node-helpers.js

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

CRITICAL: Your feedback MUST be actionable. Include:
- SPECIFIC names (characters missing from roster coverage)
- SPECIFIC evidence (which evidence items should be referenced)
- CONCRETE fixes (not "improve grounding" but "Arc 2 should reference the Victoria Voice Memo")

OUTPUT FORMAT (JSON):
{
  "ready": boolean,
  "overallScore": number (0-1),
  "criteriaScores": {
    "criterionName": {
      "score": number,
      "notes": "specific explanation with names/evidence",
      "fix": "concrete action to improve this criterion"
    }
  },
  "issues": [ "Character X is missing from all arcs", "Arc 2 claims Y but no evidence supports this" ],
  "revisionGuidance": "Step 1: Add X to Arc 1 as [role]. Step 2: Reference [specific evidence] in Arc 2.",
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
      // Provide roster for rosterCoverage evaluation
      const roster = state.sessionConfig?.roster || [];
      // Provide evidence titles/summaries for evidenceGrounding evaluation
      // evidenceBundle has nested structure: { exposed: { tokens: [], paperEvidence: [] }, buried: { transactions: [], relationships: [] } }
      const exposedData = state.evidenceBundle?.exposed || {};
      const buriedData = state.evidenceBundle?.buried || {};
      // Flatten exposed items (tokens + paperEvidence)
      const exposedTokens = Array.isArray(exposedData.tokens) ? exposedData.tokens : [];
      const exposedPaper = Array.isArray(exposedData.paperEvidence) ? exposedData.paperEvidence : [];
      const exposedEvidence = [...exposedTokens, ...exposedPaper]
        .map(e => ({ title: e.title || e.name || e.tokenId, summary: e.summary || e.description?.substring?.(0, 100) }));
      // Flatten buried items (transactions + relationships)
      const buriedTx = Array.isArray(buriedData.transactions) ? buriedData.transactions : [];
      const buriedRel = Array.isArray(buriedData.relationships) ? buriedData.relationships : [];
      const buriedEvidence = [...buriedTx, ...buriedRel]
        .map(e => ({ title: e.title || e.name || e.tokenId, summary: e.summary || e.description?.substring?.(0, 100) }));
      // Extract key playerFocus elements for evaluation
      const playerFocusForEval = {
        primaryInvestigation: state.playerFocus?.primaryInvestigation,
        primarySuspects: state.playerFocus?.primarySuspects || [],
        accusation: state.playerFocus?.accusation,
        directorObservations: state.playerFocus?.directorObservations
      };

      return `Evaluate these narrative arcs:

ARCS:
${JSON.stringify(state.narrativeArcs || [], null, 2)}

ROSTER (every character MUST have placement in at least one arc):
${JSON.stringify(roster, null, 2)}

PLAYER FOCUS (arcs should reflect what players investigated):
${JSON.stringify(playerFocusForEval, null, 2)}

AVAILABLE EVIDENCE (arcs should reference these):
Exposed (${exposedEvidence.length}): ${JSON.stringify(exposedEvidence.slice(0, 10), null, 2)}
Buried (${buriedEvidence.length}): ${JSON.stringify(buriedEvidence.slice(0, 10), null, 2)}

EVALUATION CHECKLIST:
1. ROSTER COVERAGE: Check characterPlacements in each arc - every roster member needs a role
2. EVIDENCE GROUNDING: keyEvidence should reference actual evidence titles shown above
3. PLAYER FOCUS ALIGNMENT: Does primaryInvestigation drive the main arc?
4. COHERENCE: Do arcs tell a consistent story without contradictions?
5. NARRATIVE POTENTIAL: Do arcs have emotional hooks that would engage readers?

Be SPECIFIC in issues - name missing characters, cite ungrounded evidence claims.

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

// safeParseJson imported from node-helpers.js

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

    // Skip logic 1: If user has already approved this phase (downstream data exists)
    // For arcs: selectedArcs means user approved arc selection
    // For outline: contentBundle means user approved outline and article was generated
    // For article: assembledHtml means user approved article
    const hasUserApproved = (
      (phase === 'arcs' && state.selectedArcs && state.selectedArcs.length > 0) ||
      (phase === 'outline' && state.contentBundle) ||
      (phase === 'article' && state.assembledHtml)
    );
    if (hasUserApproved) {
      console.log(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] Skipping - user already approved (downstream data exists)`);
      // Add synthetic evaluation history entry so router knows this phase passed
      return {
        evaluationHistory: {
          phase,
          timestamp: new Date().toISOString(),
          ready: true, // Mark as ready so router proceeds to next phase
          skippedReason: 'user-already-approved',
          confidence: 'high'
        },
        currentPhase: phaseConstant,
        awaitingApproval: false // Ensure we don't pause
      };
    }

    // Skip logic 2: If this phase was already evaluated with ready=true, skip
    const existingEvals = state.evaluationHistory || [];
    const phaseEval = existingEvals.find(e => e.phase === phase && e.ready === true);
    if (phaseEval) {
      console.log(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] Skipping - already evaluated with ready=true`);
      return {
        currentPhase: phaseConstant
      };
    }

    console.log(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] Starting evaluation (revision ${currentRevisions}/${revisionCap})`);

    // Debug: Log evaluation context
    if (phase === 'arcs') {
      const pf = state.playerFocus || {};
      const roster = state.sessionConfig?.roster || [];
      const arcs = state.narrativeArcs || [];
      // Flatten evidence bundle for counting
      const exposedData = state.evidenceBundle?.exposed || {};
      const buriedData = state.evidenceBundle?.buried || {};
      const exposedCount = (Array.isArray(exposedData.tokens) ? exposedData.tokens.length : 0) +
                           (Array.isArray(exposedData.paperEvidence) ? exposedData.paperEvidence.length : 0);
      const buriedCount = (Array.isArray(buriedData.transactions) ? buriedData.transactions.length : 0) +
                          (Array.isArray(buriedData.relationships) ? buriedData.relationships.length : 0);
      console.log(`[evaluateArcs] Evaluation context check:`);
      console.log(`  - playerFocus.primaryInvestigation: "${pf.primaryInvestigation || 'MISSING'}"`);
      console.log(`  - playerFocus.primarySuspects: ${JSON.stringify(pf.primarySuspects || [])}`);
      console.log(`  - roster: ${JSON.stringify(roster)}`);
      console.log(`  - arcs count: ${arcs.length}`);
      console.log(`  - evidenceBundle: exposed=${exposedCount}, buried=${buriedCount}`);

      // Check if roster members are in arc characterPlacements
      const allPlacements = arcs.flatMap(a => Object.keys(a.characterPlacements || {}));
      const missingFromArcs = roster.filter(r => !allPlacements.some(p => p.toLowerCase().includes(r.toLowerCase())));
      if (missingFromArcs.length > 0) {
        console.log(`  - MISSING from arcs: ${JSON.stringify(missingFromArcs)}`);
      }
    }

    const sdk = getSdkClient(config);
    const systemPrompt = buildEvaluationSystemPrompt(phase, criteria);
    const prompt = buildEvaluationUserPrompt(phase, state);

    try {
      // SDK returns parsed object directly when jsonSchema is provided
      const evaluation = await sdk({
        systemPrompt,
        prompt,
        model,
        jsonSchema: {
          type: 'object',
          properties: {
            ready: { type: 'boolean' },
            overallScore: { type: 'number' },
            criteriaScores: { type: 'object' },
            issues: { type: 'array' },
            revisionGuidance: { type: 'string' },
            confidence: { type: 'string' }
          },
          required: ['ready', 'overallScore']
        }
      });

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

      // Debug: Log evaluation result details
      console.log(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] Evaluation result:`);
      console.log(`  - ready: ${evaluation.ready}, score: ${evaluation.overallScore}`);
      if (evaluation.criteriaScores) {
        Object.entries(evaluation.criteriaScores).forEach(([key, val]) => {
          console.log(`  - ${key}: ${val.score} (${val.notes || 'no notes'})`);
        });
      }
      if (evaluation.issues && evaluation.issues.length > 0) {
        console.log(`  - issues: ${JSON.stringify(evaluation.issues)}`);
      }

      // Determine next action based on evaluation result
      if (evaluation.ready) {
        console.log(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] Ready for human review (score: ${evaluation.overallScore})`);

        // Note: Don't set awaitingApproval here - that's the checkpoint's responsibility
        // The router will send us to the checkpoint based on evaluationHistory
        return {
          evaluationHistory: historyEntry,
          currentPhase: phaseConstant
        };
      }

      // Not ready - check revision cap
      if (currentRevisions >= revisionCap) {
        console.log(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] At revision cap - escalating to human (score: ${evaluation.overallScore})`);

        // Use shared helper for safe issue formatting
        const issuesText = formatIssuesForMessage(evaluation.issues);

        // Note: Don't set awaitingApproval here - the checkpoint will handle it
        return {
          evaluationHistory: {
            ...historyEntry,
            escalatedToHuman: true,
            escalationReason: `Reached revision cap (${revisionCap}) with issues: ${issuesText}`
          },
          currentPhase: phaseConstant
        };
      }

      // Need revision - increment happens in dedicated increment nodes (graph.js)
      console.log(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] Needs revision (score: ${evaluation.overallScore})`);

      return {
        evaluationHistory: historyEntry,
        // Note: revision count incremented by incrementXxxRevision nodes in graph.js
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
    getSdkClient,
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

  // Test with mock SDK client - returns parsed objects directly
  const mockSdkClient = async (options) => {
    // Return different scores based on phase
    if (options.systemPrompt.includes('ARCS')) {
      return {
        ready: true,
        overallScore: 0.85,
        criteriaScores: {
          coherence: { score: 0.9, notes: 'Good coherence' },
          evidenceGrounding: { score: 0.8, notes: 'Well grounded' }
        },
        issues: [],
        revisionGuidance: null,
        confidence: 'high'
      };
    }

    if (options.systemPrompt.includes('OUTLINE')) {
      return {
        ready: false,
        overallScore: 0.6,
        criteriaScores: {},
        issues: ['Section 3 needs more detail'],
        revisionGuidance: 'Expand section 3 with evidence references',
        confidence: 'medium'
      };
    }

    return {
      ready: true,
      overallScore: 0.75,
      criteriaScores: {},
      issues: [],
      revisionGuidance: null,
      confidence: 'medium'
    };
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
    configurable: { sdkClient: mockSdkClient }
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

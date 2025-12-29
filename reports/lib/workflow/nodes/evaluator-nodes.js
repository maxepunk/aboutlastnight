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
const { safeParseJson, getSdkClient, formatIssuesForMessage, resolveArcs } = require('./node-helpers');
const { traceNode } = require('../tracing');

// ═══════════════════════════════════════════════════════════════════════════
// QUALITY CRITERIA DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Quality criteria for each phase
 * Each criterion has a description, weight, and type (structural or advisory)
 *
 * Commit 8.15: Arc criteria updated for player-focus-guided architecture:
 * - STRUCTURAL criteria: Block if failed (rosterCoverage, evidenceIdValidity, accusationArcPresent)
 * - ADVISORY criteria: Warn but don't block (coherence, evidenceConfidenceBalance)
 *
 * The player-focus-guided architecture GUARANTEES playerFocusAlignment by design
 * (accusation arc is required, arcs are driven by player conclusions not evidence patterns)
 */
const QUALITY_CRITERIA = {
  arcs: {
    // ═══════════════════════════════════════════════════════════════════════
    // STRUCTURAL CRITERIA - Block if failed (weight sum: 0.75)
    // ═══════════════════════════════════════════════════════════════════════
    rosterCoverage: {
      description: 'Does every roster member have a placement in at least one arc?',
      weight: 0.30,
      type: 'structural'
    },
    evidenceIdValidity: {
      description: 'Are all keyEvidence IDs valid (exist in evidence bundle)?',
      weight: 0.25,
      type: 'structural'
    },
    accusationArcPresent: {
      description: 'Is there an arc with arcSource="accusation" addressing the player accusation?',
      weight: 0.20,
      type: 'structural'
    },

    // ═══════════════════════════════════════════════════════════════════════
    // ADVISORY CRITERIA - Warn but don't block (weight sum: 0.25)
    // ═══════════════════════════════════════════════════════════════════════
    coherence: {
      description: 'Do arcs tell a consistent story without contradictions?',
      weight: 0.15,
      type: 'advisory'
    },
    evidenceConfidenceBalance: {
      description: 'Are there arcs with strong/moderate evidence (not all speculative)?',
      weight: 0.10,
      type: 'advisory'
    }
  },
  outline: {
    // ═══════════════════════════════════════════════════════════════════════
    // STRUCTURAL CRITERIA - Block if failed (weight sum: 0.70)
    // ═══════════════════════════════════════════════════════════════════════
    arcCoverage: {
      description: 'Does outline address all selected arcs?',
      weight: 0.20,
      type: 'structural'
    },
    requiredSections: {
      description: 'Are all required sections present (lede, theStory, thePlayers, closing)?',
      weight: 0.20,
      type: 'structural'
    },
    // Phase 1 Fix: Arc-section flow validation
    arcSectionFlow: {
      description: 'Do arcs flow THROUGH multiple sections (not isolated to THE STORY)? Check: arcConnections in followTheMoney, thePlayers, whatsMissing, closing.',
      weight: 0.20,
      type: 'structural'
    },
    visualDistributionPlan: {
      description: 'Does outline distribute visuals across sections (not clustered)? Check visualComponentCount and section budgets.',
      weight: 0.10,
      type: 'structural'
    },

    // ═══════════════════════════════════════════════════════════════════════
    // ADVISORY CRITERIA - Warn but don't block (weight sum: 0.30)
    // ═══════════════════════════════════════════════════════════════════════
    sectionBalance: {
      description: 'Are sections appropriately weighted?',
      weight: 0.05,
      type: 'advisory'
    },
    flowLogic: {
      description: 'Does narrative flow make sense?',
      weight: 0.05,
      type: 'advisory'
    },
    photoPlacement: {
      description: 'Are photos integrated meaningfully?',
      weight: 0.05,
      type: 'advisory'
    },
    wordBudget: {
      description: 'Is section word budget reasonable?',
      weight: 0.05,
      type: 'advisory'
    },

    // ═══════════════════════════════════════════════════════════════════════
    // MOMENTUM CRITERIA - Compulsive Readability (Commit 8.24)
    // ═══════════════════════════════════════════════════════════════════════
    loopArchitecture: {
      description: 'Does each arc open AND close loops? Are there cognitive gaps that pull readers forward?',
      weight: 0.025,
      type: 'advisory'
    },
    arcInterweaving: {
      description: 'Do arcs connect through callbacks and recontextualization? Are there "wait, so THAT\'s why..." moments planned?',
      weight: 0.025,
      type: 'advisory'
    },
    visualMomentum: {
      description: 'Do visual components (evidence cards, photos, pull quotes) serve loop mechanics (CLOSER/OPENER)?',
      weight: 0.025,
      type: 'advisory'
    },
    convergence: {
      description: 'Do arcs converge at satisfying point(s) where all threads meet?',
      weight: 0.025,
      type: 'advisory'
    }
  },
  article: {
    // ═══════════════════════════════════════════════════════════════════════
    // STRUCTURAL CRITERIA - Block if failed (weight sum: 0.60)
    // ═══════════════════════════════════════════════════════════════════════
    voiceConsistency: {
      description: 'Does article maintain NovaNews first-person participatory voice (I, my, we)?',
      weight: 0.20,
      type: 'structural'
    },
    antiPatterns: {
      description: 'Are anti-patterns avoided? (em-dash, token terminology, game mechanics)',
      weight: 0.15,
      type: 'structural'
    },
    // Phase 1 Fix: Visual distribution validation
    visualDistribution: {
      description: 'Are visual components (evidence cards, photos, pull quotes) distributed across sections, not clustered? Check: no adjacent evidence cards, 3+ prose paragraphs between visuals.',
      weight: 0.15,
      type: 'structural'
    },
    arcThreading: {
      description: 'Do arcs weave through multiple sections (THE STORY → FOLLOW THE MONEY → THE PLAYERS)? Arcs should feel like conversation topics shifting, not chapter breaks.',
      weight: 0.10,
      type: 'structural'
    },

    // ═══════════════════════════════════════════════════════════════════════
    // ADVISORY CRITERIA - Warn but don't block (weight sum: 0.40)
    // ═══════════════════════════════════════════════════════════════════════
    evidenceIntegration: {
      description: 'Is evidence woven in naturally?',
      weight: 0.15,
      type: 'advisory'
    },
    characterPlacement: {
      description: 'Are all roster members mentioned?',
      weight: 0.10,
      type: 'advisory'
    },
    emotionalResonance: {
      description: 'Does article deliver the promised experience?',
      weight: 0.15,
      type: 'advisory'
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
  // Commit 8.15: Separate structural vs advisory criteria in prompt
  const structuralCriteria = Object.entries(criteria)
    .filter(([_, { type }]) => type === 'structural')
    .map(([key, { description, weight }]) =>
      `- ${key} (${Math.round(weight * 100)}%): ${description}`)
    .join('\n');

  const advisoryCriteria = Object.entries(criteria)
    .filter(([_, { type }]) => type === 'advisory' || !type)  // Default to advisory if no type
    .map(([key, { description, weight }]) =>
      `- ${key} (${Math.round(weight * 100)}%): ${description}`)
    .join('\n');

  // For arcs phase, use structural/advisory distinction
  // Commit 8.17: Added immutability guidance and NPC allowlist
  if (phase === 'arcs') {
    return `You are the ARCS Evaluator for an investigative article about "About Last Night" - a crime thriller game.

Your task is to evaluate if the arcs are ready for human review.

═══════════════════════════════════════════════════════════════════════════
IMMUTABLE INPUTS (DO NOT suggest changes to these - they are fixed upstream)
═══════════════════════════════════════════════════════════════════════════
The following inputs were approved in earlier phases and CANNOT be modified:
- evidenceBundle: The curated evidence is final (exposed/buried structure is locked)
- playerFocus: The accusation and whiteboard conclusions are immutable
- directorNotes: The director's observations are ground truth - never question them
- roster: The session roster is fixed (these are the players who attended)

Your feedback should focus on how ARCS USE these inputs, not changing the inputs themselves.
Do NOT suggest adding new evidence, changing the roster, or modifying player conclusions.

═══════════════════════════════════════════════════════════════════════════
KNOWN NPCs (Valid in characterPlacements despite NOT being on roster)
═══════════════════════════════════════════════════════════════════════════
The following NPCs are valid in arc characterPlacements:
- Marcus (the murder victim) - should appear in most arcs as the central victim
- Nova (the journalist narrator) - may appear as the article's narrator/voice
- Blake / Valet (NPC character) - may appear in relevant arcs

These are NOT roster members and should NOT be flagged as missing from roster coverage.
Do NOT remove them from characterPlacements or flag them as "non-roster characters".
Roster coverage ONLY applies to the actual player roster, not NPCs.

═══════════════════════════════════════════════════════════════════════════
STRUCTURAL CRITERIA (MUST PASS - these block if failed)
═══════════════════════════════════════════════════════════════════════════
${structuralCriteria}

═══════════════════════════════════════════════════════════════════════════
ADVISORY CRITERIA (Warn but don't block - these are quality guidance)
═══════════════════════════════════════════════════════════════════════════
${advisoryCriteria}

EVALUATION RULES:
1. Score each criterion as: pass (1.0), partial (0.5), fail (0.0)
2. STRUCTURAL criteria MUST score >= 0.8 to pass (these are hard requirements)
3. ADVISORY criteria are guidance only - low scores are warnings, not blockers
4. Content is READY if ALL structural criteria pass
5. Content is NOT READY only if a STRUCTURAL criterion fails

CRITICAL DISTINCTION:
- accusationArcPresent: Check if any arc has arcSource="accusation"
- evidenceIdValidity: Check if keyEvidence IDs exist in the evidence bundle
- rosterCoverage: Check if every roster member appears in characterPlacements of at least one arc

CRITICAL: Your feedback MUST be actionable. Include:
- SPECIFIC names (characters missing from roster coverage)
- SPECIFIC evidence IDs (which IDs are invalid)
- CONCRETE fixes (not "improve grounding" but "Arc 2 should reference evidence ID xyz123")

OUTPUT FORMAT (JSON):
{
  "ready": boolean,
  "overallScore": number (0-1),
  "structuralPassed": boolean,
  "criteriaScores": {
    "criterionName": {
      "score": number,
      "type": "structural" | "advisory",
      "notes": "specific explanation with names/evidence",
      "fix": "concrete action to improve this criterion"
    }
  },
  "structuralIssues": [ "issues that MUST be fixed" ],
  "advisoryWarnings": [ "issues that are suggestions, not blockers" ],
  "revisionGuidance": "Step 1: Fix structural issue. Step 2: Optional advisory fix.",
  "confidence": "high" | "medium" | "low"
}

Remember: STRUCTURAL issues block. ADVISORY issues are warnings for human consideration.`;
  }

  // Commit 8.21: Use structural/advisory distinction for outline and article phases too
  if (phase === 'outline') {
    return `You are the OUTLINE Evaluator for an investigative article about "About Last Night" - a crime thriller game.

Your task is to evaluate if the article outline is ready for human review.

═══════════════════════════════════════════════════════════════════════════
IMMUTABLE INPUTS (DO NOT suggest changes to these - they are fixed upstream)
═══════════════════════════════════════════════════════════════════════════
The following inputs were approved in earlier phases and CANNOT be modified:
- selectedArcs: The arcs chosen for this article are final
- photoAnalyses: The photo descriptions are ground truth
- evidenceBundle: The evidence is curated and locked

Your feedback should focus on how the OUTLINE USES these inputs, not changing the inputs.

═══════════════════════════════════════════════════════════════════════════
STRUCTURAL CRITERIA (MUST PASS - these block if failed)
═══════════════════════════════════════════════════════════════════════════
${structuralCriteria}

═══════════════════════════════════════════════════════════════════════════
ADVISORY CRITERIA (Warn but don't block - these are quality guidance)
═══════════════════════════════════════════════════════════════════════════
${advisoryCriteria}

EVALUATION RULES:
1. Score each criterion as: pass (1.0), partial (0.5), fail (0.0)
2. STRUCTURAL criteria MUST score >= 0.8 to pass (these are hard requirements)
3. ADVISORY criteria are guidance only - low scores are warnings, not blockers
4. Content is READY if ALL structural criteria pass
5. Content is NOT READY only if a STRUCTURAL criterion fails

CRITICAL CHECKS:
- arcCoverage: Every selected arc should be referenced in theStory section
- requiredSections: lede, theStory, thePlayers, closing MUST exist

CRITICAL: Your feedback MUST be actionable. Include:
- SPECIFIC arc titles that are missing coverage
- SPECIFIC section names that are missing
- CONCRETE fixes (not "add more detail" but "add section X with Y content")

OUTPUT FORMAT (JSON):
{
  "ready": boolean,
  "overallScore": number (0-1),
  "structuralPassed": boolean,
  "criteriaScores": {
    "criterionName": {
      "score": number,
      "type": "structural" | "advisory",
      "notes": "specific explanation",
      "fix": "concrete action to improve this criterion"
    }
  },
  "structuralIssues": [ "issues that MUST be fixed" ],
  "advisoryWarnings": [ "issues that are suggestions, not blockers" ],
  "revisionGuidance": "Step 1: Fix structural issue. Step 2: Optional advisory fix.",
  "confidence": "high" | "medium" | "low"
}

Remember: You determine READINESS for human review, not approval. Human always makes final decision.
STRUCTURAL issues block. ADVISORY issues are warnings for human consideration.`;
  }

  if (phase === 'article') {
    return `You are the ARTICLE Evaluator for an investigative article about "About Last Night" - a crime thriller game.

Your task is to evaluate if the article content is ready for human review.

═══════════════════════════════════════════════════════════════════════════
IMMUTABLE INPUTS (DO NOT suggest changes to these - they are fixed upstream)
═══════════════════════════════════════════════════════════════════════════
The following inputs were approved in earlier phases and CANNOT be modified:
- outline: The article structure is approved
- selectedArcs: The narrative arcs are locked
- evidenceBundle: The evidence is curated and final

Your feedback should focus on how the ARTICLE EXECUTES the outline, not changing the outline.

═══════════════════════════════════════════════════════════════════════════
STRUCTURAL CRITERIA (MUST PASS - these block if failed)
═══════════════════════════════════════════════════════════════════════════
${structuralCriteria}

═══════════════════════════════════════════════════════════════════════════
ADVISORY CRITERIA (Warn but don't block - these are quality guidance)
═══════════════════════════════════════════════════════════════════════════
${advisoryCriteria}

EVALUATION RULES:
1. Score each criterion as: pass (1.0), partial (0.5), fail (0.0)
2. STRUCTURAL criteria MUST score >= 0.8 to pass (these are hard requirements)
3. ADVISORY criteria are guidance only - low scores are warnings, not blockers
4. Content is READY if ALL structural criteria pass
5. Content is NOT READY only if a STRUCTURAL criterion fails

CRITICAL CHECKS:
- voiceConsistency: Article MUST use first-person participatory voice ("I", "my", "we")
- antiPatterns: Article MUST NOT contain em-dashes (—), "token", "Act 1/2/3", game terminology

CRITICAL: Your feedback MUST be actionable. Include:
- SPECIFIC lines with voice issues
- SPECIFIC anti-patterns found with line locations
- CONCRETE fixes (not "improve voice" but "change 'The investigation revealed' to 'I discovered'")

OUTPUT FORMAT (JSON):
{
  "ready": boolean,
  "overallScore": number (0-1),
  "structuralPassed": boolean,
  "criteriaScores": {
    "criterionName": {
      "score": number,
      "type": "structural" | "advisory",
      "notes": "specific explanation with line references",
      "fix": "concrete action to improve this criterion"
    }
  },
  "structuralIssues": [ "issues that MUST be fixed" ],
  "advisoryWarnings": [ "issues that are suggestions, not blockers" ],
  "revisionGuidance": "Step 1: Fix structural issue. Step 2: Optional advisory fix.",
  "confidence": "high" | "medium" | "low"
}

Remember: You determine READINESS for human review, not approval. Human always makes final decision.
STRUCTURAL issues block. ADVISORY issues are warnings for human consideration.`;
  }

  // Fallback for any unknown phase (shouldn't happen)
  throw new Error(`Unknown evaluation phase: ${phase}`);
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
      // Provide evidence with IDs for evidenceGrounding verification
      // evidenceBundle has nested structure: { exposed: { tokens: [], paperEvidence: [] }, buried: { transactions: [], relationships: [] } }
      const exposedData = state.evidenceBundle?.exposed || {};
      const buriedData = state.evidenceBundle?.buried || {};
      // Flatten exposed items (tokens + paperEvidence) - INCLUDE IDs for verification
      const exposedTokens = Array.isArray(exposedData.tokens) ? exposedData.tokens : [];
      const exposedPaper = Array.isArray(exposedData.paperEvidence) ? exposedData.paperEvidence : [];
      const exposedEvidence = [...exposedTokens, ...exposedPaper]
        .map(e => ({
          id: e.id || e.tokenId || e.pageId || e.name,  // Include ID for keyEvidence verification
          title: e.title || e.name || e.tokenId,
          summary: e.summary || e.description?.substring?.(0, 100)
        }));
      // Extract ALL evidence IDs for verification (no truncation)
      const allEvidenceIds = exposedEvidence.map(e => e.id).filter(Boolean);

      // Flatten buried items - INCLUDE IDs and amounts for financial verification
      const buriedTx = Array.isArray(buriedData.transactions) ? buriedData.transactions : [];
      const buriedRel = Array.isArray(buriedData.relationships) ? buriedData.relationships : [];
      const buriedEvidence = [...buriedTx, ...buriedRel]
        .map(e => ({
          id: e.id || e.tokenId || e.name,
          title: e.title || e.name || e.tokenId,
          // Include amounts for financial claim verification
          ...(e.amount && { amount: e.amount }),
          ...(e.from && { from: e.from }),
          ...(e.to && { to: e.to }),
          ...(e.accountName && { accountName: e.accountName })
        }));

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

SESSION ROSTER (${roster.length} players who were PRESENT this session):
${JSON.stringify(roster, null, 2)}

CRITICAL ROSTER vs EVIDENCE DISTINCTION:
- The ROSTER above lists the ONLY characters who need arc coverage (they were played this session)
- Evidence IDs may reference characters NOT on the roster (from the broader game universe)
- Do NOT infer roster members from evidence ID prefixes (e.g., "hos011" does NOT mean "Howie" is on roster)
- ONLY check coverage for the ${roster.length} names listed in SESSION ROSTER above

PLAYER FOCUS (arcs should reflect what players investigated):
${JSON.stringify(playerFocusForEval, null, 2)}

ALL VALID EVIDENCE IDS (${allEvidenceIds.length} total - use to verify keyEvidence references):
${JSON.stringify(allEvidenceIds, null, 2)}

EXPOSED EVIDENCE DETAILS (first 25 of ${exposedEvidence.length}):
${JSON.stringify(exposedEvidence.slice(0, 25), null, 2)}

BURIED TRANSACTIONS (${buriedEvidence.length} - for amount/account verification):
${JSON.stringify(buriedEvidence, null, 2)}

EVALUATION CHECKLIST (Commit 8.15 - Structural vs Advisory):

═══════════════════════════════════════════════════════════════════════════
STRUCTURAL CHECKS (MUST PASS)
═══════════════════════════════════════════════════════════════════════════
1. ROSTER COVERAGE: Every name in SESSION ROSTER needs a role in characterPlacements of at least one arc
2. EVIDENCE ID VALIDITY: Every keyEvidence ID should exist in ALL VALID EVIDENCE IDS list
3. ACCUSATION ARC PRESENT: At least one arc should have arcSource="accusation"

═══════════════════════════════════════════════════════════════════════════
ADVISORY CHECKS (Warn but don't block)
═══════════════════════════════════════════════════════════════════════════
4. COHERENCE: Do arcs tell a consistent story without contradictions?
5. EVIDENCE CONFIDENCE BALANCE: Are there arcs with evidenceStrength="strong" or "moderate" (not all speculative)?

IMPORTANT FOR NEW FIELDS (Commit 8.15):
- arcSource: Should be one of ["accusation", "whiteboard", "observation", "discovered"]
- evidenceStrength: Should be one of ["strong", "moderate", "weak", "speculative"]
- caveats: Array of complications/contradictions
- unansweredQuestions: Array of evidence gaps

Be SPECIFIC in issues:
- Name missing characters FROM THE ROSTER
- List invalid evidence IDs
- Note if accusation arc is missing

Are these arcs ready for human review?`;

    case 'outline':
      // Extract interweaving metadata from selected arcs for momentum evaluation
      // Resolve arc IDs (strings) to full arc objects from narrativeArcs
      const resolvedArcs = resolveArcs(state.selectedArcs, state.narrativeArcs);
      const selectedArcsWithInterweaving = resolvedArcs.map(arc => ({
        id: arc.id,
        title: arc.title,
        interweaving: arc.interweaving || {}
      }));
      // Get interweaving plan if available from arc analysis
      const interweavingPlan = state.narrativeArcsInterweavingPlan || state.interweavingPlan || null;

      return `Evaluate this article outline:

OUTLINE:
${JSON.stringify(state.outline || {}, null, 2)}

SELECTED ARCS (with interweaving metadata):
${JSON.stringify(selectedArcsWithInterweaving, null, 2)}

INTERWEAVING PLAN (from arc analysis):
${JSON.stringify(interweavingPlan, null, 2)}

PHOTO ANALYSES:
${JSON.stringify((state.photoAnalyses?.analyses || []).slice(0, 5), null, 2)}

═══════════════════════════════════════════════════════════════════════════
MOMENTUM EVALUATION (Commit 8.24 - Compulsive Readability)
═══════════════════════════════════════════════════════════════════════════

Check for narrative momentum:

1. LOOP ARCHITECTURE: Does each arc section open cognitive gaps (questions) and close them?
   - Are there unanswered questions that pull readers forward?
   - Do answers open NEW questions before fully closing?

2. ARC INTERWEAVING: Are arcs connected through callbacks, not just sequential chapters?
   - Do later sections reference and recontextualize earlier ones?
   - Are there "wait, so THAT'S why..." moments planned?
   - Does the outline use shared characters as bridges between arcs?

3. VISUAL MOMENTUM: Do evidence cards, photos, and pull quotes serve loop mechanics?
   - Is each visual component a CLOSER (proves what was hinted) or OPENER (raises new question)?
   - Are photos placed for emotional pacing (breathe before escalation)?

4. CONVERGENCE: Do arcs meet at a satisfying convergence point?
   - Where do all threads meet (the murder, the accusation)?
   - Is the convergence point given appropriate weight?

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

    const sdk = getSdkClient(config, `evaluate-${phase}`);
    const systemPrompt = buildEvaluationSystemPrompt(phase, criteria);
    const prompt = buildEvaluationUserPrompt(phase, state);

    try {
      // Commit 8.21: All phases use structural/advisory schema
      const jsonSchema = {
        type: 'object',
        properties: {
          ready: { type: 'boolean' },
          overallScore: { type: 'number' },
          structuralPassed: { type: 'boolean' },
          criteriaScores: { type: 'object' },
          structuralIssues: { type: 'array' },
          advisoryWarnings: { type: 'array' },
          revisionGuidance: { type: 'string' },
          confidence: { type: 'string' }
        },
        required: ['ready', 'overallScore', 'structuralPassed']
      };

      // SDK returns parsed object directly when jsonSchema is provided
      // Commit 8.23: disableTools prevents evaluator from using Grep/Read during evaluation
      const evaluation = await sdk({
        systemPrompt,
        prompt,
        model,
        jsonSchema,
        disableTools: true
      });

      // Commit 8.21: All phases use structuralPassed to determine readiness
      // Advisory issues become warnings, not blockers
      // Backward compat: if structuralPassed not provided, fall back to ready field
      const isReady = evaluation.structuralPassed !== undefined
        ? evaluation.structuralPassed
        : evaluation.ready;

      // Create evaluation history entry
      const historyEntry = {
        phase,
        timestamp: new Date().toISOString(),
        ready: isReady,
        overallScore: evaluation.overallScore,
        // Commit 8.15: Separate structural issues from advisory warnings
        structuralIssues: evaluation.structuralIssues || [],
        advisoryWarnings: evaluation.advisoryWarnings || [],
        issues: evaluation.issues || evaluation.structuralIssues || [],  // Backward compat
        confidence: evaluation.confidence || 'medium',
        revisionNumber: currentRevisions
      };

      // Debug: Log evaluation result details
      console.log(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] Evaluation result:`);
      console.log(`  - ready: ${isReady}, score: ${evaluation.overallScore}`);
      console.log(`  - structuralPassed: ${evaluation.structuralPassed}`);
      if (evaluation.criteriaScores) {
        Object.entries(evaluation.criteriaScores).forEach(([key, val]) => {
          const typeLabel = val.type === 'structural' ? '[STRUCTURAL]' : '[advisory]';
          console.log(`  - ${typeLabel} ${key}: ${val.score} (${val.notes || 'no notes'})`);
        });
      }
      if (evaluation.structuralIssues && evaluation.structuralIssues.length > 0) {
        console.log(`  - STRUCTURAL ISSUES: ${JSON.stringify(evaluation.structuralIssues)}`);
      }
      if (evaluation.advisoryWarnings && evaluation.advisoryWarnings.length > 0) {
        console.log(`  - Advisory warnings: ${JSON.stringify(evaluation.advisoryWarnings)}`);
      }
      if (evaluation.issues && evaluation.issues.length > 0 && !evaluation.structuralIssues) {
        console.log(`  - issues: ${JSON.stringify(evaluation.issues)}`);
      }

      // Determine next action based on evaluation result
      // Commit 8.15: Use isReady (which factors in structuralPassed for arcs)
      if (isReady) {
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
 * Uses opus for high-quality evaluation (upgraded from haiku in Commit 8.17)
 */
const evaluateArcs = createEvaluator('arcs', { model: 'opus' });

/**
 * Evaluate article outline for quality
 * Uses opus for high-quality evaluation (upgraded from haiku in Commit 8.22)
 */
const evaluateOutline = createEvaluator('outline', { model: 'opus' });

/**
 * Evaluate article content for quality
 * Uses opus for high-quality evaluation (upgraded from haiku in Commit 8.22)
 */
const evaluateArticle = createEvaluator('article', { model: 'opus' });

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
  // Main evaluator functions (wrapped with LangSmith tracing)
  evaluateArcs: traceNode(evaluateArcs, 'evaluateArcs', {
    stateFields: ['narrativeArcs', 'evaluationHistory']
  }),
  evaluateOutline: traceNode(evaluateOutline, 'evaluateOutline', {
    stateFields: ['outline', 'evaluationHistory']
  }),
  evaluateArticle: traceNode(evaluateArticle, 'evaluateArticle', {
    stateFields: ['contentBundle', 'evaluationHistory']
  }),

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

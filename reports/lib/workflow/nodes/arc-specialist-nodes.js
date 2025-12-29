/**
 * Arc Specialist Nodes - Parallel specialist analysis for report generation
 *
 * Commit 8.8: Replaces sequential 4-node pattern with single orchestrated node.
 * Commit 8.9: Migrated to file-based specialist agents in .claude/agents/
 * Commit 8.10: SDK requires programmatic agent definitions via `agents` parameter.
 * Commit 8.11: Factory function with absolute paths to fix subagent workingDirectory.
 * Commit 8.12: PARALLEL SPECIALIST ARCHITECTURE
 *   - Replaced Task tool subagents with direct parallel SDK calls
 *   - Promise.all() for concurrent specialist execution (~1.5min vs ~4.5min)
 *   - Synthesis call with full context (orchestrator pattern preserved)
 *   - Programmatic validation node for strict evidence ID matching
 *   - No evidence truncation - all IDs passed to enable strict validation
 *
 * Architecture (Commit 8.12):
 * - 3 parallel specialist SDK calls (financial, behavioral, victimization)
 * - 1 synthesis SDK call to combine findings into arcs
 * - 1 programmatic validation node for evidence/roster validation
 * - Target: 3.5 minutes total (down from 10+)
 *
 * Benefits:
 * - ~3x faster execution via parallelization
 * - 100% evidence grounding via strict ID validation
 * - 100% roster coverage via name validation with fuzzy matching
 * - Better error isolation (one specialist failure doesn't block others)
 *
 * See ARCHITECTURE_DECISIONS.md 8.12 for design rationale.
 */

const { PHASES, APPROVAL_TYPES } = require('../state');
const {
  buildValidEvidenceIds,
  validateRosterName,
  getSdkClient,
  isKnownNPC  // Commit 8.17: NPC validation (accepts NPCs from theme config)
} = require('./node-helpers');
const { getThemeNPCs } = require('../../theme-config');  // Commit 8.17: Theme-configurable NPCs
const { traceNode } = require('../tracing');

// Commit 8.13: Import centralized rules loader for evidence boundaries
// Commit 8.14: Use full reference content instead of summaries to avoid file reads
const {
  loadReferenceRules,
  getEvidenceBoundariesSummary,
  getAntiPatternsSummary
} = require('../reference-loader');

// Commit 8.15: Import player-focus-guided architecture
const {
  PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT,
  PLAYER_FOCUS_GUIDED_SCHEMA,
  // Commit 8.12: Legacy parallel architecture (kept for comparison)
  SPECIALIST_AGENT_NAMES,
  getSpecialistAgents,
  ORCHESTRATOR_SYSTEM_PROMPT,
  ORCHESTRATOR_OUTPUT_SCHEMA,
  SYNTHESIS_SYSTEM_PROMPT,
  SYNTHESIS_OUTPUT_SCHEMA,
  SPECIALIST_OUTPUT_SCHEMAS
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
// PLAYER-FOCUS-GUIDED ARCHITECTURE (Commit 8.15)
// ═══════════════════════════════════════════════════════════════════════════
//
// New architecture: Single comprehensive call with player focus FIRST.
// Replaces parallel specialists + synthesis with unified player-driven analysis.
//
// Key changes from 8.12 parallel architecture:
// - Player conclusions (accusation/whiteboard) FIRST in prompt - drives arc generation
// - Single SDK call instead of 4 (3 specialists + synthesis)
// - New arc fields: arcSource, evidenceStrength, caveats, unansweredQuestions
// - Speculative arcs allowed with explicit caveats
// - Three-lens analysis embedded in single call
//
// See plan file for design rationale.

/**
 * Build player-focus-guided comprehensive prompt for arc analysis
 *
 * Commit 8.15: NEW ARCHITECTURE - Player conclusions drive arc generation
 *
 * Prompt structure (order matters - player focus FIRST):
 * 1. PLAYER CONCLUSIONS (PRIMARY) - accusation, whiteboard, observations, roster
 * 2. ARC GENERATION RULES - priority hierarchy, required fields
 * 3. EVIDENCE RULES - three-layer model, anti-patterns
 * 4. EVIDENCE BUNDLE - all evidence with IDs for validation
 * 5. THREE-LENS REQUIREMENT - financial/behavioral/victimization analysis per arc
 *
 * @param {Object} state - Current workflow state
 * @returns {string} Comprehensive prompt for arc analysis
 */
function buildPlayerFocusGuidedPrompt(state) {
  const evidenceBundle = state.evidenceBundle || {};
  const playerFocus = state.playerFocus || {};
  const sessionConfig = state.sessionConfig || {};
  const directorNotes = state.directorNotes || {};

  // Extract evidence summary
  const evidenceSummary = extractEvidenceSummary(evidenceBundle);
  const { exposedTokens, exposedPaper, buriedTransactions, allEvidenceIds } = evidenceSummary;

  // Extract player focus data
  const accusation = playerFocus.accusation || {};
  const wbCtx = playerFocus.whiteboardContext || {};
  const observations = directorNotes.observations || {};
  const roster = sessionConfig.roster || [];

  return `# Arc Analysis: Player-Focus-Guided Investigation

You are analyzing evidence for an investigative article about "About Last Night" - a crime thriller game where players investigate the death of Marcus Blackwood.

## SECTION 1: WHAT PLAYERS CONCLUDED (PRIMARY - Your arcs must address this)

### The Accusation (REQUIRED ARC)
**Accused:** ${JSON.stringify(accusation.accused || [])}
**Charge:** ${accusation.charge || 'Not specified'}
**Players' Reasoning:** ${accusation.reasoning || 'Not documented'}

You MUST generate an arc that addresses this accusation. Even if evidence is weak, include this arc and mark it appropriately with evidenceStrength="speculative" if needed.

### Whiteboard Connections (Players drew these during investigation)
**Suspects Explored:** ${JSON.stringify(wbCtx.suspectsExplored || [])}
**Connections Found:** ${JSON.stringify(wbCtx.connections || [])}
**Notes Captured:** ${JSON.stringify(wbCtx.notes || [])}
**Names Identified:** ${JSON.stringify(wbCtx.namesFound || [])}

### Director Observations (GROUND TRUTH - Director witnessed these behaviors)
**Behavior Patterns:** ${JSON.stringify(observations.behaviorPatterns || [])}
**Suspicious Correlations:** ${JSON.stringify(observations.suspiciousCorrelations || [])}
**Notable Moments:** ${JSON.stringify(observations.notableMoments || [])}

### Primary Investigation Focus
${playerFocus.primaryInvestigation || 'General investigation'}

### Session Roster (ALL characters who need placement)
${JSON.stringify(roster)}

---

## SECTION 2: ARC GENERATION RULES

Generate 3-5 narrative arcs following this priority:

### Priority 1: ACCUSATION ARC (Required)
- Must directly address the accusation above
- arcSource: "accusation"
- Include even if evidenceStrength is "speculative"
- If evidence is thin, use caveats to acknowledge uncertainty
- Can be supported by director notes/whiteboard even with no Layer 1/2 evidence

### Priority 2: WHITEBOARD/OBSERVATION ARCS (1-3 arcs)
- Generated from significant whiteboard connections or director observations
- arcSource: "whiteboard" or "observation"
- Should have at least "weak" evidenceStrength

### Priority 3: DISCOVERED ARC (Optional, max 1)
- Only if evidence strongly supports something players completely missed
- arcSource: "discovered"
- Must have evidenceStrength "strong" or "moderate"
- Lower priority than player-focused arcs

### For EACH arc, you MUST provide:

**arcSource** - Where this arc comes from:
- "accusation": Directly from the accusation (REQUIRED to have one)
- "whiteboard": From whiteboard connections or notes
- "observation": From director observations
- "discovered": Pattern found in evidence that players missed

**evidenceStrength** - How well does Layer 1/2 evidence support this arc?
- "strong": Multiple direct evidence pieces, minimal contradictions
- "moderate": Some supporting evidence, some gaps
- "weak": Limited evidence, mostly inference
- "speculative": Supported by director notes/whiteboard but thin Layer 1/2 evidence

**caveats** - What complicates or contradicts this arc?
- Example: "Transaction timing suggests Morgan acted alone in the final hour"
- These become "But questions remain..." in the article
- BE HONEST about complications

**unansweredQuestions** - What evidence gaps exist?
- Example: "Why did ChaseT go silent after 10:30 PM?"
- These create narrative tension
- Nova can acknowledge what she doesn't know

**analysisNotes** - How each lens supports/contradicts:
- financial: Transaction patterns relevant to this arc
- behavioral: Director observations relevant to this arc
- victimization: Targeting patterns relevant to this arc

---

## SECTION 3: EVIDENCE BOUNDARIES

### Layer 1 - EXPOSED (Full Reportability)
- CAN quote full memory contents, describe what memory reveals
- CAN draw conclusions from content, name who exposed each memory
- These are the FACTS of the article

### Layer 2 - BURIED (Observable Only)
- CAN report: shell account names, dollar amounts, timing patterns, transaction counts
- CAN note: suspicious correlations (ChaseT = Taylor Chase?), timing clusters
- CAN report: who was OBSERVED at Valet (if director noted)
- CANNOT report: whose memories went to which accounts
- CANNOT report: content of buried memories
- CANNOT infer: specific content from transaction patterns
- These are the MYSTERIES of the article

### Layer 3 - DIRECTOR NOTES (Priority Hierarchy)
1. ACCUSATION = PRIMARY (what players concluded)
2. DIRECTOR OBSERVATIONS = HIGHEST NARRATIVE WEIGHT (ground truth of what happened)
3. WHITEBOARD = SUPPORTING CONTEXT (notes captured during investigation)

### Anti-Patterns
- Never use "token" (say "memory", "extracted memory", "stolen memory")
- Never use em-dashes (use periods, restructure sentences)
- Never use game mechanics language ("Act 3 unlock", "first burial", "token scan")
- Never claim to know buried memory content or ownership

---

## SECTION 4: EVIDENCE BUNDLE

### Exposed Tokens (${exposedTokens.length} items - Layer 1)
${JSON.stringify(exposedTokens, null, 2)}

### Paper Evidence (${exposedPaper.length} items - Layer 1)
${JSON.stringify(exposedPaper, null, 2)}

### Buried Transactions (${buriedTransactions.length} items - Layer 2 CONTEXT ONLY)
${JSON.stringify(buriedTransactions, null, 2)}

⚠️ BURIED TRANSACTIONS ARE FOR CONTEXT/ANALYSIS ONLY - DO NOT USE THEIR IDs IN keyEvidence!
You can DISCUSS patterns from buried transactions in analysisNotes.financial,
but keyEvidence must ONLY contain IDs from the EXPOSED evidence below.

### All Valid Evidence IDs for keyEvidence (EXPOSED LAYER 1 ONLY)
${JSON.stringify(allEvidenceIds)}

CRITICAL: keyEvidence arrays MUST contain IDs from this list ONLY.
Buried transaction IDs (vik001, mor021, etc.) are NOT valid keyEvidence - they will fail validation.
Use buried patterns in analysisNotes.financial, but cite EXPOSED evidence in keyEvidence.

---

## SECTION 5: THREE-LENS ANALYSIS REQUIREMENT

For each arc, analyze through all three lenses and document in analysisNotes:

### Financial Lens
- Transaction patterns that support this arc
- Account naming that suggests involvement
- Timing correlations with other evidence

### Behavioral Lens
- Director observations that support this arc
- Character dynamics relevant to this arc
- Behavior-transaction correlations

### Victimization Lens
- Targeting patterns that support this arc
- Victim/operator relationships
- Self-burial vs. being targeted by others

---

## OUTPUT FORMAT

Return valid JSON:
{
  "narrativeArcs": [
    {
      "id": "arc-[descriptive-slug]",
      "title": "Compelling arc title",
      "summary": "2-3 sentences describing this narrative thread",
      "arcSource": "accusation" | "whiteboard" | "observation" | "discovered",
      "keyEvidence": ["exact-id-1", "exact-id-2"],
      "characterPlacements": { "RosterName": "Role in this arc" },
      "evidenceStrength": "strong" | "moderate" | "weak" | "speculative",
      "caveats": ["What complicates this arc"],
      "unansweredQuestions": ["What gaps exist"],
      "emotionalHook": "What makes this compelling",
      "playerEmphasis": "high" | "medium" | "low",
      "storyRelevance": "critical" | "supporting" | "contextual",
      "analysisNotes": {
        "financial": "Relevant transaction patterns",
        "behavioral": "Relevant director observations",
        "victimization": "Relevant targeting patterns"
      }
    }
  ],
  "synthesisNotes": "How you addressed player conclusions and what patterns emerged",
  "rosterCoverageCheck": { "RosterName": ["arc-id-1", "arc-id-2"] }
}
${buildRevisionContext(state)}`;
}

/**
 * Analyze arcs with player-focus-guided comprehensive call
 *
 * Commit 8.15: NEW ARCHITECTURE - Single call with player focus FIRST
 *
 * Replaces parallel specialists + synthesis with:
 * - Single SDK call with comprehensive prompt (~20K tokens)
 * - Player conclusions drive arc generation (not evidence patterns)
 * - 5-minute timeout
 * - New arc fields: arcSource, evidenceStrength, caveats, unansweredQuestions
 *
 * Performance: ~4-5 minutes (down from ~7 minutes)
 * - Single call vs 4 calls (3 specialists + synthesis)
 * - No redundant context transmission
 *
 * Skip logic: If narrativeArcs already exist with content, skip processing.
 *
 * @param {Object} state - Current state with evidence, player focus, etc.
 * @param {Object} config - Graph config with SDK client
 * @returns {Object} Partial state update with narrativeArcs
 */
async function analyzeArcsPlayerFocusGuided(state, config) {
  console.log('[analyzeArcsPlayerFocusGuided] Starting player-focus-guided analysis (Commit 8.15)');
  const startTime = Date.now();

  // Debug: Log key input data to verify prompt assembly
  const pf = state.playerFocus || {};
  const wbCtx = pf.whiteboardContext || {};
  const acc = pf.accusation || {};
  const observations = state.directorNotes?.observations || {};

  // Flatten evidence bundle for counting
  const exposedData = state.evidenceBundle?.exposed || {};
  const buriedData = state.evidenceBundle?.buried || {};
  const exposedCount = (Array.isArray(exposedData.tokens) ? exposedData.tokens.length : 0) +
                       (Array.isArray(exposedData.paperEvidence) ? exposedData.paperEvidence.length : 0);
  const buriedCount = (Array.isArray(buriedData.transactions) ? buriedData.transactions.length : 0) +
                      (Array.isArray(buriedData.relationships) ? buriedData.relationships.length : 0);

  console.log(`[analyzeArcsPlayerFocusGuided] Input data check:`);
  console.log(`  - accusation.accused: ${JSON.stringify(acc.accused || [])}`);
  console.log(`  - accusation.charge: ${acc.charge || 'MISSING'}`);
  console.log(`  - whiteboard.suspectsExplored: ${JSON.stringify(wbCtx.suspectsExplored || [])}`);
  console.log(`  - director.behaviorPatterns: ${(observations.behaviorPatterns || []).length} items`);
  console.log(`  - evidenceBundle: exposed=${exposedCount}, buried=${buriedCount}`);
  console.log(`  - roster: ${JSON.stringify(state.sessionConfig?.roster || [])}`);

  // Skip if arcs already exist (resume case)
  if (state.narrativeArcs && state.narrativeArcs.length > 0) {
    console.log('[analyzeArcsPlayerFocusGuided] Skipping - narrativeArcs already exist');
    return {
      currentPhase: PHASES.ARC_SYNTHESIS
    };
  }

  // Skip if no evidence to analyze
  if (!state.evidenceBundle && !state.preprocessedEvidence) {
    console.log('[analyzeArcsPlayerFocusGuided] Skipping - no evidence available');
    return {
      narrativeArcs: [],
      _arcAnalysisCache: {
        synthesizedAt: new Date().toISOString(),
        error: 'No evidence available',
        architecture: 'player-focus-guided'
      },
      currentPhase: PHASES.ARC_SYNTHESIS,
      awaitingApproval: true,
      approvalType: APPROVAL_TYPES.ARC_SELECTION
    };
  }

  // Get SDK client (supports mock injection for testing)
  const sdkClient = getSdkClient(config, 'analyzeArcsPlayerFocusGuided');

  try {
    // Build the comprehensive player-focus-guided prompt
    const prompt = buildPlayerFocusGuidedPrompt(state);
    console.log(`[analyzeArcsPlayerFocusGuided] Prompt built: ${prompt.length} characters`);

    // Single SDK call with 5-minute timeout
    const result = await sdkClient({
      prompt,
      systemPrompt: PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT,
      model: 'sonnet',
      jsonSchema: PLAYER_FOCUS_GUIDED_SCHEMA,
      timeoutMs: 5 * 60 * 1000,  // 5 minutes
      label: 'Player-focus-guided arc analysis'
    });

    const { narrativeArcs, synthesisNotes, rosterCoverageCheck } = result || {};

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[analyzeArcsPlayerFocusGuided] Complete: ${narrativeArcs?.length || 0} arcs in ${duration}s`);

    // Log arc sources for verification
    if (narrativeArcs && narrativeArcs.length > 0) {
      const arcSourceCounts = {};
      narrativeArcs.forEach(arc => {
        arcSourceCounts[arc.arcSource] = (arcSourceCounts[arc.arcSource] || 0) + 1;
      });
      console.log(`[analyzeArcsPlayerFocusGuided] Arc sources: ${JSON.stringify(arcSourceCounts)}`);

      // Verify accusation arc exists
      const hasAccusationArc = narrativeArcs.some(arc => arc.arcSource === 'accusation');
      if (!hasAccusationArc) {
        console.warn('[analyzeArcsPlayerFocusGuided] WARNING: No accusation arc generated');
      }
    }

    return {
      narrativeArcs: narrativeArcs || [],
      _arcAnalysisCache: {
        synthesizedAt: new Date().toISOString(),
        synthesisNotes: synthesisNotes || '',
        rosterCoverageCheck: rosterCoverageCheck || {},
        arcCount: narrativeArcs?.length || 0,
        architecture: 'player-focus-guided',
        timing: {
          total: `${duration}s`
        }
      },
      currentPhase: PHASES.ARC_SYNTHESIS,
      awaitingApproval: true,
      approvalType: APPROVAL_TYPES.ARC_SELECTION
    };

  } catch (error) {
    console.error('[analyzeArcsPlayerFocusGuided] Error:', error.message);

    return {
      narrativeArcs: [],
      _arcAnalysisCache: {
        synthesizedAt: new Date().toISOString(),
        _error: error.message,
        architecture: 'player-focus-guided'
      },
      errors: [{
        phase: PHASES.ARC_SYNTHESIS,
        type: 'player-focus-guided-failed',
        message: error.message,
        timestamp: new Date().toISOString()
      }],
      currentPhase: PHASES.ERROR
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PARALLEL SPECIALIST ARCHITECTURE (Commit 8.12) - LEGACY
// ═══════════════════════════════════════════════════════════════════════════
//
// Replaced Task tool subagent invocation with direct parallel SDK calls.
// Key differences from previous orchestrator pattern:
// - All specialists run concurrently via Promise.all()
// - No evidence truncation - full data passed to each specialist
// - Evidence IDs list included for strict validation in synthesis
// - Synthesis call has all specialist findings + context
//
// NOTE: This architecture is kept for comparison. New player-focus-guided
// architecture in buildPlayerFocusGuidedPrompt() is preferred.

/**
 * Extract evidence summary with ALL IDs for specialist prompts
 * NO TRUNCATION - specialists need complete ID list for accurate references
 *
 * @param {Object} evidenceBundle - Curated evidence bundle
 * @returns {Object} Evidence summary with complete ID lists
 */
function extractEvidenceSummary(evidenceBundle) {
  const exposed = evidenceBundle?.exposed || {};
  const buried = evidenceBundle?.buried || {};

  // Get ALL exposed tokens with IDs
  const exposedTokens = (exposed.tokens || []).map(t => ({
    id: t.id || t.tokenId,
    owner: t.owner || t.ownerLogline,
    summary: t.summary,
    characterRefs: t.characterRefs || []
  }));

  // Get ALL exposed paper evidence with IDs
  const exposedPaper = (exposed.paperEvidence || []).map(p => ({
    id: p.id || p.name,
    name: p.name,
    summary: p.summary || p.description?.substring(0, 200),
    characterRefs: p.characterRefs || []
  }));

  // Get ALL buried transactions with IDs
  const buriedTransactions = (buried.transactions || []).map(t => ({
    id: t.id,
    shellAccount: t.shellAccount,
    amount: t.amount,
    time: t.time
  }));

  return {
    exposedTokens,
    exposedPaper,
    buriedTransactions,
    // Valid keyEvidence IDs: EXPOSED ONLY (Layer 1)
    // Buried transactions are shown for context but cannot be cited as keyEvidence
    // This matches the evaluator's evidenceIdValidity check
    allEvidenceIds: [
      ...exposedTokens.map(t => t.id),
      ...exposedPaper.map(p => p.id)
      // NOTE: buriedTransactions intentionally excluded - they're Layer 2
      // Arcs can DISCUSS buried patterns but cannot CITE them as evidence
    ].filter(Boolean)
  };
}

/**
 * Build financial specialist prompt with complete evidence data
 * @param {Object} state - Current workflow state
 * @param {Object} evidenceSummary - Extracted evidence summary
 * @param {Object} rules - Full reference rules from loadReferenceRules()
 * @returns {string} Financial specialist prompt
 */
function buildFinancialPrompt(state, evidenceSummary, rules) {
  const playerFocus = state.playerFocus || {};
  const directorNotes = state.directorNotes || {};

  // Commit 8.14: Inject full evidence boundaries (no file reads needed)
  const evidenceBoundaries = rules?.evidenceBoundaries || getEvidenceBoundariesSummary();

  return `Analyze the financial patterns in this session evidence.

## REFERENCE: Evidence Boundaries
${evidenceBoundaries}

PLAYER FOCUS:
${playerFocus.primaryInvestigation || 'General investigation'}
Accused: ${JSON.stringify(playerFocus.accusation?.accused || [])}

ROSTER:
${JSON.stringify(state.sessionConfig?.roster || [])}

DIRECTOR OBSERVATIONS (Financial relevance):
${JSON.stringify(directorNotes.observations?.suspiciousCorrelations || [])}

BURIED TRANSACTIONS (${evidenceSummary.buriedTransactions.length} items):
${JSON.stringify(evidenceSummary.buriedTransactions, null, 2)}

EXPOSED EVIDENCE IDs (for referencing):
${JSON.stringify(evidenceSummary.allEvidenceIds)}

CRITICAL: For buried transactions, you CAN report account names, amounts, and timing patterns.
You CANNOT report whose memories went to which accounts (that's Layer 2 private).

Analyze transaction patterns, account naming conventions, timing clusters, and financial coordination.
Return JSON with: accountPatterns, timingClusters, suspiciousFlows, financialConnections, summary`;
}

/**
 * Build behavioral specialist prompt with complete evidence data
 * @param {Object} state - Current workflow state
 * @param {Object} evidenceSummary - Extracted evidence summary
 * @param {Object} rules - Full reference rules from loadReferenceRules()
 * @returns {string} Behavioral specialist prompt
 */
function buildBehavioralPrompt(state, evidenceSummary, rules) {
  const playerFocus = state.playerFocus || {};
  const directorNotes = state.directorNotes || {};

  // Commit 8.14: Inject full evidence boundaries (no file reads needed)
  const evidenceBoundaries = rules?.evidenceBoundaries || getEvidenceBoundariesSummary();

  return `Analyze the behavioral patterns in this session evidence.

## REFERENCE: Evidence Boundaries
${evidenceBoundaries}

PLAYER FOCUS:
${playerFocus.primaryInvestigation || 'General investigation'}
Accused: ${JSON.stringify(playerFocus.accusation?.accused || [])}

ROSTER:
${JSON.stringify(state.sessionConfig?.roster || [])}

DIRECTOR OBSERVATIONS (PRIMARY AUTHORITY - ground truth):
Behavior Patterns: ${JSON.stringify(directorNotes.observations?.behaviorPatterns || [])}
Notable Moments: ${JSON.stringify(directorNotes.observations?.notableMoments || [])}
Suspicious Correlations: ${JSON.stringify(directorNotes.observations?.suspiciousCorrelations || [])}

WHITEBOARD (Supporting Context - NOT the authority):
${JSON.stringify(playerFocus.whiteboardContext || {})}

EXPOSED EVIDENCE (${evidenceSummary.exposedTokens.length + evidenceSummary.exposedPaper.length} items):
${JSON.stringify([...evidenceSummary.exposedTokens, ...evidenceSummary.exposedPaper], null, 2)}

CRITICAL: Use director observations as ground truth for behavioral claims.
Accusation is PRIMARY for arc prioritization. Whiteboard is SUPPORTING context only.

Analyze character dynamics, behavior-transaction correlations, zero-footprint characters, and suspicious patterns.
Return JSON with: characterDynamics, behaviorCorrelations, zeroFootprintCharacters, behavioralInsights, rosterCoverage`;
}

/**
 * Build victimization specialist prompt with complete evidence data
 * @param {Object} state - Current workflow state
 * @param {Object} evidenceSummary - Extracted evidence summary
 * @param {Object} rules - Full reference rules from loadReferenceRules()
 * @returns {string} Victimization specialist prompt
 */
function buildVictimizationPrompt(state, evidenceSummary, rules) {
  const playerFocus = state.playerFocus || {};
  const directorNotes = state.directorNotes || {};

  // Commit 8.14: Inject full evidence boundaries (no file reads needed)
  const evidenceBoundaries = rules?.evidenceBoundaries || getEvidenceBoundariesSummary();

  return `Analyze the victimization patterns in this session evidence.

## REFERENCE: Evidence Boundaries
${evidenceBoundaries}

PLAYER FOCUS:
${playerFocus.primaryInvestigation || 'General investigation'}
Accused: ${JSON.stringify(playerFocus.accusation?.accused || [])}

ROSTER:
${JSON.stringify(state.sessionConfig?.roster || [])}

DIRECTOR OBSERVATIONS (Valet activity):
${JSON.stringify(directorNotes.observations?.suspiciousCorrelations || [])}

EXPOSED TOKENS (Token owners - potential victims):
${JSON.stringify(evidenceSummary.exposedTokens, null, 2)}

BURIED TRANSACTIONS (Operator activity):
${JSON.stringify(evidenceSummary.buriedTransactions, null, 2)}

CRITICAL: You CAN identify who was OBSERVED at Valet (from director notes).
You CANNOT claim to know whose memories were buried to which accounts.
Token OWNER (whose memory) is different from transaction OPERATOR (who sold).

Analyze victim identification, operator identification, self-burial patterns, and targeting relationships.
Return JSON with: victims, operators, selfBurialPatterns, targetingInsights, victimizationSummary`;
}

// ═══════════════════════════════════════════════════════════════════════════
// RETRY LOGIC (Commit 8.14)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Call a specialist with retry logic
 * Retries once on failure with 2s backoff
 *
 * @param {Function} fn - Async function to call
 * @param {string} label - Label for logging
 * @param {number} maxRetries - Maximum retry attempts (default 1)
 * @returns {Promise<Object>} Specialist result or error object
 */
async function callWithRetry(fn, label, maxRetries = 1) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();

      // If success (no _error), return immediately
      if (!result._error) {
        if (attempt > 0) {
          console.log(`[${label}] Succeeded on retry attempt ${attempt}`);
        }
        return result;
      }

      // If error but more retries available, try again
      if (attempt < maxRetries) {
        console.log(`[${label}] Attempt ${attempt + 1} failed: ${result._error}, retrying in 2s...`);
        await new Promise(r => setTimeout(r, 2000)); // 2s backoff
      } else {
        // Final attempt failed
        return result;
      }
    } catch (error) {
      if (attempt < maxRetries) {
        console.log(`[${label}] Attempt ${attempt + 1} threw: ${error.message}, retrying in 2s...`);
        await new Promise(r => setTimeout(r, 2000));
      } else {
        return { _error: error.message };
      }
    }
  }
  return { _error: 'Max retries exceeded' };
}

// ═══════════════════════════════════════════════════════════════════════════
// SPECIALIST CALLERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Call financial specialist via direct SDK call
 * @param {Object} state - Current workflow state
 * @param {Object} evidenceSummary - Extracted evidence summary
 * @param {Function} sdkClient - SDK query function
 * @param {Object} rules - Full reference rules from loadReferenceRules()
 * @returns {Promise<Object>} Financial specialist findings
 */
async function callFinancialSpecialist(state, evidenceSummary, sdkClient, rules) {
  const specialists = getSpecialistAgents();
  const financialSpec = specialists[SPECIALIST_AGENT_NAMES.financial];

  try {
    const result = await sdkClient({
      prompt: buildFinancialPrompt(state, evidenceSummary, rules),
      systemPrompt: financialSpec.prompt,
      model: 'sonnet',
      jsonSchema: SPECIALIST_OUTPUT_SCHEMAS.financial,
      timeoutMs: 2.5 * 60 * 1000,  // 2.5 minutes (Commit 8.14: +30s buffer after removing file reads)
      label: 'Financial specialist'
    });

    return result || { accountPatterns: [], summary: 'No result' };
  } catch (error) {
    console.error('[callFinancialSpecialist] Error:', error.message);
    return { accountPatterns: [], summary: `Error: ${error.message}`, _error: error.message };
  }
}

/**
 * Call behavioral specialist via direct SDK call
 * @param {Object} state - Current workflow state
 * @param {Object} evidenceSummary - Extracted evidence summary
 * @param {Function} sdkClient - SDK query function
 * @param {Object} rules - Full reference rules from loadReferenceRules()
 * @returns {Promise<Object>} Behavioral specialist findings
 */
async function callBehavioralSpecialist(state, evidenceSummary, sdkClient, rules) {
  const specialists = getSpecialistAgents();
  const behavioralSpec = specialists[SPECIALIST_AGENT_NAMES.behavioral];

  try {
    const result = await sdkClient({
      prompt: buildBehavioralPrompt(state, evidenceSummary, rules),
      systemPrompt: behavioralSpec.prompt,
      model: 'sonnet',
      jsonSchema: SPECIALIST_OUTPUT_SCHEMAS.behavioral,
      timeoutMs: 3.5 * 60 * 1000,  // 3.5 minutes (Commit 8.14: +30s buffer after removing file reads)
      label: 'Behavioral specialist'
    });

    return result || { characterDynamics: [], behavioralInsights: [] };
  } catch (error) {
    console.error('[callBehavioralSpecialist] Error:', error.message);
    return { characterDynamics: [], behavioralInsights: [], _error: error.message };
  }
}

/**
 * Call victimization specialist via direct SDK call
 * @param {Object} state - Current workflow state
 * @param {Object} evidenceSummary - Extracted evidence summary
 * @param {Function} sdkClient - SDK query function
 * @param {Object} rules - Full reference rules from loadReferenceRules()
 * @returns {Promise<Object>} Victimization specialist findings
 */
async function callVictimizationSpecialist(state, evidenceSummary, sdkClient, rules) {
  const specialists = getSpecialistAgents();
  const victimSpec = specialists[SPECIALIST_AGENT_NAMES.victimization];

  try {
    const result = await sdkClient({
      prompt: buildVictimizationPrompt(state, evidenceSummary, rules),
      systemPrompt: victimSpec.prompt,
      model: 'sonnet',
      jsonSchema: SPECIALIST_OUTPUT_SCHEMAS.victimization,
      timeoutMs: 2.5 * 60 * 1000,  // 2.5 minutes (Commit 8.14: +30s buffer after removing file reads)
      label: 'Victimization specialist'
    });

    return result || { victims: [], victimizationSummary: 'No result' };
  } catch (error) {
    console.error('[callVictimizationSpecialist] Error:', error.message);
    return { victims: [], victimizationSummary: `Error: ${error.message}`, _error: error.message };
  }
}

/**
 * Build synthesis prompt with all specialist findings and context
 * @param {Object} specialistFindings - Combined findings from all specialists
 * @param {Object} state - Current workflow state
 * @param {Object} evidenceSummary - Evidence summary with ID list
 * @returns {string} Synthesis prompt
 */
function buildSynthesisPrompt(specialistFindings, state, evidenceSummary) {
  const playerFocus = state.playerFocus || {};
  const roster = state.sessionConfig?.roster || [];

  return `Synthesize these specialist findings into 3-5 narrative arcs for the investigative article.

═══════════════════════════════════════════════════════════════════════════
EVIDENCE BOUNDARIES (MUST FOLLOW)
═══════════════════════════════════════════════════════════════════════════

${getEvidenceBoundariesSummary()}

${getAntiPatternsSummary()}

═══════════════════════════════════════════════════════════════════════════
PLAYER FOCUS (Layer 3 Priority Hierarchy)
═══════════════════════════════════════════════════════════════════════════

ACCUSATION (PRIMARY - drives arc prioritization):
Accused: ${JSON.stringify(playerFocus.accusation?.accused || [])}
Charge: ${playerFocus.accusation?.charge || 'Unknown'}
Reasoning: ${playerFocus.accusation?.reasoning || 'Not provided'}

Primary Investigation: ${playerFocus.primaryInvestigation || 'General investigation'}

Whiteboard Context (SUPPORTING - NOT the authority):
${JSON.stringify(playerFocus.whiteboardContext || {}, null, 2)}

═══════════════════════════════════════════════════════════════════════════
ROSTER (Character names that MUST be used in characterPlacements)
═══════════════════════════════════════════════════════════════════════════

${JSON.stringify(roster)}

CRITICAL: characterPlacements MUST ONLY use names from this roster list.
Do not invent character names from evidence content.

═══════════════════════════════════════════════════════════════════════════
VALID EVIDENCE IDs (keyEvidence MUST use these exact IDs)
═══════════════════════════════════════════════════════════════════════════

${JSON.stringify(evidenceSummary.allEvidenceIds)}

CRITICAL: keyEvidence arrays MUST contain IDs from this list.
Invalid IDs will be removed during validation.

═══════════════════════════════════════════════════════════════════════════
FINANCIAL SPECIALIST FINDINGS
═══════════════════════════════════════════════════════════════════════════

${JSON.stringify(specialistFindings.financial, null, 2)}

═══════════════════════════════════════════════════════════════════════════
BEHAVIORAL SPECIALIST FINDINGS
═══════════════════════════════════════════════════════════════════════════

${JSON.stringify(specialistFindings.behavioral, null, 2)}

═══════════════════════════════════════════════════════════════════════════
VICTIMIZATION SPECIALIST FINDINGS
═══════════════════════════════════════════════════════════════════════════

${JSON.stringify(specialistFindings.victimization, null, 2)}

═══════════════════════════════════════════════════════════════════════════
INSTRUCTIONS
═══════════════════════════════════════════════════════════════════════════

Create 3-5 narrative arcs that:
1. Prioritize what players focused on (Layer 3 drives - whiteboard/accusation)
2. Cross-reference findings across all three specialist domains
3. Use ONLY roster names in characterPlacements
4. Use ONLY valid evidence IDs in keyEvidence
5. Ensure every roster member has a role across arcs
${buildRevisionContext(state)}`;
}

/**
 * Synthesize specialist findings into narrative arcs
 * @param {Object} specialistFindings - Combined findings from all specialists
 * @param {Object} state - Current workflow state
 * @param {Object} evidenceSummary - Evidence summary with ID list
 * @param {Function} sdkClient - SDK query function
 * @returns {Promise<Object>} Synthesized arcs
 */
async function synthesizeArcs(specialistFindings, state, evidenceSummary, sdkClient) {
  try {
    const result = await sdkClient({
      prompt: buildSynthesisPrompt(specialistFindings, state, evidenceSummary),
      systemPrompt: SYNTHESIS_SYSTEM_PROMPT,
      model: 'sonnet',
      jsonSchema: SYNTHESIS_OUTPUT_SCHEMA,
      timeoutMs: 3 * 60 * 1000,  // 3 minutes for synthesis
      label: 'Arc synthesis'
    });

    return result || { narrativeArcs: [], synthesisNotes: 'No result' };
  } catch (error) {
    console.error('[synthesizeArcs] Error:', error.message);
    return { narrativeArcs: [], synthesisNotes: `Error: ${error.message}`, _error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ORCHESTRATOR NODE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analyze arcs with parallel specialists
 *
 * Commit 8.12: PARALLEL SPECIALIST ARCHITECTURE
 *
 * Replaces orchestrator + Task tool pattern with:
 * - 3 parallel SDK calls (financial, behavioral, victimization)
 * - 1 synthesis call to combine findings into arcs
 *
 * Performance: ~3.5 minutes (down from 10+ minutes)
 * - Specialists: ~1.5 minutes (parallel)
 * - Synthesis: ~2 minutes
 *
 * Skip logic: If narrativeArcs already exist with content, skip processing.
 *
 * @param {Object} state - Current state with evidence, player focus, etc.
 * @param {Object} config - Graph config with SDK client
 * @returns {Object} Partial state update with specialistAnalyses, narrativeArcs
 */
async function analyzeArcsWithSubagents(state, config) {
  console.log('[analyzeArcsWithSubagents] Starting parallel arc analysis (Commit 8.12)');
  const startTime = Date.now();

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

  // Get SDK client (supports mock injection for testing)
  const sdkClient = getSdkClient(config, 'analyzeArcsWithSubagents');

  // Extract evidence summary with ALL IDs (no truncation)
  const evidenceSummary = extractEvidenceSummary(state.evidenceBundle);
  console.log(`[analyzeArcsWithSubagents] Evidence summary: ${evidenceSummary.allEvidenceIds.length} total IDs`);

  // Commit 8.14: Pre-load reference rules once (avoids specialists reading files)
  const rules = await loadReferenceRules();
  console.log(`[analyzeArcsWithSubagents] Reference rules loaded: ${rules.evidenceBoundaries ? 'OK' : 'FALLBACK'}`);

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 1: Call specialists in PARALLEL
    // ═══════════════════════════════════════════════════════════════════════
    console.log('[analyzeArcsWithSubagents] Phase 1: Calling 3 specialists in parallel');
    const specialistStartTime = Date.now();

    // Commit 8.14: Wrap specialist calls with retry logic (1 retry with 2s backoff)
    const [financial, behavioral, victimization] = await Promise.all([
      callWithRetry(
        () => callFinancialSpecialist(state, evidenceSummary, sdkClient, rules),
        'Financial'
      ),
      callWithRetry(
        () => callBehavioralSpecialist(state, evidenceSummary, sdkClient, rules),
        'Behavioral'
      ),
      callWithRetry(
        () => callVictimizationSpecialist(state, evidenceSummary, sdkClient, rules),
        'Victimization'
      )
    ]);

    const specialistDuration = ((Date.now() - specialistStartTime) / 1000).toFixed(1);
    console.log(`[analyzeArcsWithSubagents] Phase 1 complete: ${specialistDuration}s`);
    console.log(`  - Financial: ${financial._error ? 'ERROR' : 'OK'}`);
    console.log(`  - Behavioral: ${behavioral._error ? 'ERROR' : 'OK'}`);
    console.log(`  - Victimization: ${victimization._error ? 'ERROR' : 'OK'}`);

    // Fail fast if too many specialists errored (2+ out of 3)
    const errorCount = [financial._error, behavioral._error, victimization._error].filter(Boolean).length;
    if (errorCount >= 2) {
      throw new Error(`Too many specialist failures (${errorCount}/3): synthesis would produce low-quality arcs`);
    }

    const specialistFindings = { financial, behavioral, victimization };

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 2: Synthesize findings into arcs
    // ═══════════════════════════════════════════════════════════════════════
    console.log('[analyzeArcsWithSubagents] Phase 2: Synthesizing into narrative arcs');
    const synthesisStartTime = Date.now();

    const synthesisResult = await synthesizeArcs(specialistFindings, state, evidenceSummary, sdkClient);

    const synthesisDuration = ((Date.now() - synthesisStartTime) / 1000).toFixed(1);
    console.log(`[analyzeArcsWithSubagents] Phase 2 complete: ${synthesisDuration}s`);

    const { narrativeArcs, synthesisNotes } = synthesisResult;

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[analyzeArcsWithSubagents] Complete: ${narrativeArcs?.length || 0} arcs in ${totalDuration}s`);

    return {
      specialistAnalyses: specialistFindings,
      narrativeArcs: narrativeArcs || [],
      _arcAnalysisCache: {
        synthesizedAt: new Date().toISOString(),
        specialistDomains: Object.keys(specialistFindings),
        synthesisNotes: synthesisNotes || '',
        arcCount: narrativeArcs?.length || 0,
        architecture: 'parallel-specialists',
        timing: {
          specialists: `${specialistDuration}s`,
          synthesis: `${synthesisDuration}s`,
          total: `${totalDuration}s`
        }
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
        type: 'parallel-specialists-failed',
        message: error.message,
        timestamp: new Date().toISOString()
      }],
      currentPhase: PHASES.ERROR
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PROGRAMMATIC VALIDATION NODE (Commit 8.12, updated 8.15)
// ═══════════════════════════════════════════════════════════════════════════
//
// Validates arc structure programmatically AFTER generation.
// Strict ID matching replaces LLM semantic matching for evidence grounding.
// No LLM call required - pure programmatic validation.
//
// Commit 8.15: Added validation for new player-focus-guided fields:
// - arcSource (accusation | whiteboard | observation | discovered)
// - evidenceStrength (strong | moderate | weak | speculative)
// - accusationArcPresent structural check
// - caveats and unansweredQuestions arrays

// Valid enum values for new fields
const VALID_ARC_SOURCES = ['accusation', 'whiteboard', 'observation', 'discovered'];
const VALID_EVIDENCE_STRENGTHS = ['strong', 'moderate', 'weak', 'speculative'];

/**
 * Validate arc structure programmatically
 *
 * Commit 8.12: Programmatic validation for strict evidence/roster matching.
 * Commit 8.15: Added arcSource, evidenceStrength, and accusation arc validation.
 *
 * Runs AFTER analyzeArcsWithSubagents/analyzeArcsPlayerFocusGuided to:
 * - Validate keyEvidence IDs exist in evidence bundle
 * - Validate characterPlacements use roster names
 * - Warn on contradictory character roles
 * - Filter arcs that lost all evidence
 * - Validate arcSource and evidenceStrength enums (8.15)
 * - Check for required accusation arc (8.15)
 * - Ensure caveats/unansweredQuestions are arrays (8.15)
 *
 * @param {Object} state - Current state with narrativeArcs, evidenceBundle, sessionConfig
 * @param {Object} config - Graph config (unused)
 * @returns {Object} Partial state update with validated narrativeArcs
 */
function validateArcStructure(state, config) {
  console.log('[validateArcStructure] Starting programmatic validation (Commit 8.17)');

  const arcs = state.narrativeArcs || [];
  const roster = (state.sessionConfig?.roster || []).filter(n => typeof n === 'string');
  const rosterLower = new Set(roster.map(n => n.toLowerCase()));

  // Commit 8.17: Get theme-specific NPCs for validation
  const theme = state.theme || config?.configurable?.theme || 'journalist';
  const themeNPCs = getThemeNPCs(theme);
  console.log(`[validateArcStructure] Theme "${theme}" NPCs: ${themeNPCs.join(', ') || '(none)'}`);

  // Build valid evidence ID set using helper from node-helpers
  const validIds = buildValidEvidenceIds(state.evidenceBundle);

  console.log(`[validateArcStructure] Validating ${arcs.length} arcs against:`);
  console.log(`  - ${validIds.size} valid evidence IDs`);
  console.log(`  - ${roster.length} roster names`);

  // Early exit: Empty roster means we can't validate character placements
  // This likely indicates a data loading error upstream
  if (roster.length === 0) {
    console.error('[validateArcStructure] Empty roster - cannot validate character placements');
    return {
      narrativeArcs: arcs,  // Pass through unchanged
      _arcValidation: {
        inputCount: arcs.length,
        outputCount: arcs.length,
        error: 'Empty roster - character validation skipped',
        validatedAt: new Date().toISOString()
      },
      errors: [{
        phase: PHASES.ARC_SYNTHESIS,
        type: 'empty-roster',
        message: 'Cannot validate arcs: roster is empty (data loading error?)',
        timestamp: new Date().toISOString()
      }]
    };
  }

  let totalEvidenceRemoved = 0;
  let totalCharactersRemoved = 0;
  let totalCharactersCorrected = 0;

  const validatedArcs = arcs.map((arc, index) => {
    const issues = [];

    // ═══════════════════════════════════════════════════════════════════════
    // 1. Validate keyEvidence IDs exist in evidence bundle
    // ═══════════════════════════════════════════════════════════════════════
    const originalEvidenceCount = (arc.keyEvidence || []).length;
    // Use map+filter to enable ID correction (not just filtering)
    const validatedEvidence = (arc.keyEvidence || [])
      .map(id => {
        // Check exact match
        if (validIds.has(id)) return id;

        // Try case-insensitive match and return corrected ID
        const lowerMatch = [...validIds].find(vid =>
          vid.toLowerCase() === id.toLowerCase()
        );
        if (lowerMatch) {
          issues.push(`Evidence ID "${id}" corrected to "${lowerMatch}"`);
          return lowerMatch;  // Return corrected ID
        }

        issues.push(`Removed invalid evidence ID: ${id}`);
        totalEvidenceRemoved++;
        return null;  // Mark for removal
      })
      .filter(id => id !== null);

    // ═══════════════════════════════════════════════════════════════════════
    // 2. Validate characterPlacements use roster names
    // ═══════════════════════════════════════════════════════════════════════
    const validatedPlacements = {};
    const placementRoles = {};  // Track roles for coherence check

    Object.entries(arc.characterPlacements || {}).forEach(([name, role]) => {
      // Use fuzzy matching helper
      const matchedName = validateRosterName(name, roster);

      if (matchedName) {
        // Roster member - preserve original casing from roster
        validatedPlacements[matchedName] = role;
        placementRoles[matchedName.toLowerCase()] = role;

        if (matchedName.toLowerCase() !== name.toLowerCase()) {
          issues.push(`Character "${name}" corrected to roster name "${matchedName}"`);
          totalCharactersCorrected++;
        }
      } else if (isKnownNPC(name, themeNPCs)) {
        // Commit 8.17: Known NPC from theme config - preserve as-is
        // NPCs are valid in characterPlacements but don't count toward roster coverage
        validatedPlacements[name] = role;
        // Don't add to placementRoles - NPCs don't affect roster coverage checks
      } else {
        issues.push(`Removed non-roster character: ${name}`);
        totalCharactersRemoved++;
      }
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 3. Check for role coherence (warn on contradictions)
    // ═══════════════════════════════════════════════════════════════════════
    Object.entries(placementRoles).forEach(([name, role]) => {
      const roleLower = role.toLowerCase();
      const isVictim = roleLower.includes('victim');
      const isOperator = roleLower.includes('operator') || roleLower.includes('perpetrator');

      if (isVictim && isOperator) {
        issues.push(`Role contradiction for ${name}: "${role}" contains both victim and operator`);
      }
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 4. Validate new player-focus-guided fields (Commit 8.15)
    // ═══════════════════════════════════════════════════════════════════════

    // Validate arcSource enum (default to 'discovered' if invalid/missing)
    let validatedArcSource = arc.arcSource;
    if (!validatedArcSource || !VALID_ARC_SOURCES.includes(validatedArcSource)) {
      issues.push(`Invalid arcSource "${arc.arcSource || 'missing'}" - defaulting to "discovered"`);
      validatedArcSource = 'discovered';
    }

    // Validate evidenceStrength enum (default to 'weak' if invalid/missing)
    let validatedEvidenceStrength = arc.evidenceStrength;
    if (!validatedEvidenceStrength || !VALID_EVIDENCE_STRENGTHS.includes(validatedEvidenceStrength)) {
      issues.push(`Invalid evidenceStrength "${arc.evidenceStrength || 'missing'}" - defaulting to "weak"`);
      validatedEvidenceStrength = 'weak';
    }

    // Ensure caveats is an array (default to empty array)
    const validatedCaveats = Array.isArray(arc.caveats) ? arc.caveats : [];
    if (!Array.isArray(arc.caveats) && arc.caveats) {
      issues.push(`caveats is not an array - converted to empty array`);
    }

    // Ensure unansweredQuestions is an array (default to empty array)
    const validatedQuestions = Array.isArray(arc.unansweredQuestions) ? arc.unansweredQuestions : [];
    if (!Array.isArray(arc.unansweredQuestions) && arc.unansweredQuestions) {
      issues.push(`unansweredQuestions is not an array - converted to empty array`);
    }

    // Ensure analysisNotes is an object with expected keys
    const validatedAnalysisNotes = {
      financial: arc.analysisNotes?.financial || '',
      behavioral: arc.analysisNotes?.behavioral || '',
      victimization: arc.analysisNotes?.victimization || ''
    };

    // Build validated arc with new fields
    const validatedArc = {
      ...arc,
      keyEvidence: validatedEvidence,
      characterPlacements: validatedPlacements,
      arcSource: validatedArcSource,
      evidenceStrength: validatedEvidenceStrength,
      caveats: validatedCaveats,
      unansweredQuestions: validatedQuestions,
      analysisNotes: validatedAnalysisNotes
    };

    // Add validation metadata if there were issues
    if (issues.length > 0) {
      validatedArc._validationIssues = issues;
      console.log(`[validateArcStructure] Arc ${index + 1} "${arc.title}": ${issues.length} issues`);
      issues.forEach(issue => console.log(`    - ${issue}`));
    }

    return validatedArc;
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 5. Filter arcs and check structural requirements (Commit 8.15)
  // ═══════════════════════════════════════════════════════════════════════

  // Filter arcs that lost all evidence AND characters
  // NOTE: For speculative arcs, we allow no evidence if arcSource is 'accusation'
  const viableArcs = validatedArcs.filter(arc => {
    const hasEvidence = arc.keyEvidence.length > 0;
    const hasCharacters = Object.keys(arc.characterPlacements).length > 0;
    const isAccusationArc = arc.arcSource === 'accusation';

    // Special case: accusation arc with speculative evidence is still valid
    if (isAccusationArc && !hasEvidence) {
      console.log(`[validateArcStructure] Accusation arc "${arc.title}" has no evidence - allowed (speculative)`);
      arc._noEvidence = true;
      return hasCharacters;  // Still need characters
    }

    if (!hasEvidence && !hasCharacters) {
      console.log(`[validateArcStructure] Filtering out arc "${arc.title}" - no evidence or characters`);
      return false;
    }

    if (!hasEvidence) {
      console.log(`[validateArcStructure] Warning: Arc "${arc.title}" has no valid evidence IDs`);
      arc._noEvidence = true;
    }

    return true;
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 6. Check for required accusation arc (structural requirement)
  // ═══════════════════════════════════════════════════════════════════════
  const hasAccusationArc = viableArcs.some(arc => arc.arcSource === 'accusation');
  if (!hasAccusationArc) {
    console.warn(`[validateArcStructure] STRUCTURAL ISSUE: No accusation arc present`);
  }

  // Count arc sources for logging
  const arcSourceCounts = {};
  viableArcs.forEach(arc => {
    arcSourceCounts[arc.arcSource] = (arcSourceCounts[arc.arcSource] || 0) + 1;
  });

  // Count evidence strengths for logging
  const evidenceStrengthCounts = {};
  viableArcs.forEach(arc => {
    evidenceStrengthCounts[arc.evidenceStrength] = (evidenceStrengthCounts[arc.evidenceStrength] || 0) + 1;
  });

  console.log(`[validateArcStructure] Complete:`);
  console.log(`  - Input: ${arcs.length} arcs`);
  console.log(`  - Output: ${viableArcs.length} valid arcs`);
  console.log(`  - Evidence IDs removed: ${totalEvidenceRemoved}`);
  console.log(`  - Characters removed: ${totalCharactersRemoved}`);
  console.log(`  - Characters corrected: ${totalCharactersCorrected}`);
  console.log(`  - Arc sources: ${JSON.stringify(arcSourceCounts)}`);
  console.log(`  - Evidence strengths: ${JSON.stringify(evidenceStrengthCounts)}`);
  console.log(`  - Accusation arc present: ${hasAccusationArc}`);

  return {
    narrativeArcs: viableArcs,
    _arcValidation: {
      inputCount: arcs.length,
      outputCount: viableArcs.length,
      evidenceIdsRemoved: totalEvidenceRemoved,
      charactersRemoved: totalCharactersRemoved,
      charactersCorrected: totalCharactersCorrected,
      arcSourceCounts,
      evidenceStrengthCounts,
      hasAccusationArc,
      validatedAt: new Date().toISOString()
    }
  };
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
  // Commit 8.15: Player-focus-guided architecture (preferred)
  analyzeArcsPlayerFocusGuided: traceNode(analyzeArcsPlayerFocusGuided, 'analyzeArcsPlayerFocusGuided', {
    stateFields: ['playerFocus', 'evidenceBundle']
  }),

  // Commit 8.12: Parallel specialist architecture (legacy, kept for comparison)
  analyzeArcsWithSubagents,

  // Programmatic validation node
  validateArcStructure: traceNode(validateArcStructure, 'validateArcStructure', {
    stateFields: ['narrativeArcs']
  }),

  // Mock factory (Commit 8.8)
  createMockOrchestrator,

  // Legacy exports for backwards compatibility
  // These are deprecated but kept to avoid breaking tests during migration
  createMockSpecialist,
  createMockSynthesizer,

  // Export for testing
  _testing: {
    // Commit 8.15: Player-focus-guided
    buildPlayerFocusGuidedPrompt,
    PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT,
    PLAYER_FOCUS_GUIDED_SCHEMA,

    // Commit 8.12: Legacy parallel architecture
    buildOrchestratorPrompt,
    createEmptyAnalysisResult,
    extractEvidenceSummary,
    buildFinancialPrompt,
    buildBehavioralPrompt,
    buildVictimizationPrompt,
    buildSynthesisPrompt,
    SPECIALIST_AGENT_NAMES,
    getSpecialistAgents,
    ORCHESTRATOR_SYSTEM_PROMPT,
    ORCHESTRATOR_OUTPUT_SCHEMA,
    SYNTHESIS_SYSTEM_PROMPT,
    SYNTHESIS_OUTPUT_SCHEMA,
    SPECIALIST_OUTPUT_SCHEMAS
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

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

const { PHASES } = require('../state');
const {
  buildValidEvidenceIds,
  validateRosterName,
  getSdkClient,
  isKnownNPC,  // Commit 8.17: NPC validation (accepts NPCs from theme config)
  isNonRosterPC,  // Commit 8.xx: Non-roster PC validation (three-category model)
  getNonRosterPCs,  // Commit 8.xx: Get all non-roster PCs for a session
  buildRevisionContext: buildRevisionContextDRY  // DRY revision context helper (renamed to avoid local shadow)
} = require('./node-helpers');
const { getThemeNPCs, getThemeCharacters, getCanonicalName } = require('../../theme-config');  // Commit 8.17+: Theme-configurable NPCs and character list
const { traceNode } = require('../../observability');

// Commit 8.13: Import centralized rules loader for evidence boundaries
// Commit 8.14: Use full reference content instead of summaries to avoid file reads
// Commit 8.xx: Removed unused loadReferenceRules, getEvidenceBoundariesSummary, getAntiPatternsSummary
// (used only by deleted parallel specialist architecture)

// Commit 8.28: Import split-call architecture
const {
  // Commit 8.28: Split-call architecture (preferred)
  CORE_ARC_SYSTEM_PROMPT,
  CORE_ARC_SCHEMA,
  INTERWEAVING_SYSTEM_PROMPT,
  INTERWEAVING_SCHEMA,
  // Commit 8.15: Player-focus-guided (used by reviseArcs)
  PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT,
  PLAYER_FOCUS_GUIDED_SCHEMA
  // Commit 8.xx: Removed legacy parallel architecture imports
  // (SPECIALIST_AGENT_NAMES, getSpecialistAgents, ORCHESTRATOR_*, SYNTHESIS_*, SPECIALIST_*)
} = require('../../sdk-client/subagents');

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// DRY HELPERS (Commit 8.28)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract player focus context from state (DRY helper)
 *
 * Commit 8.28: Shared extraction used by both core arc and revision prompts
 *
 * @param {Object} state - Current workflow state
 * @returns {Object} Player focus context with accusation, whiteboard, observations, roster
 */
function extractPlayerFocusContext(state) {
  const playerFocus = state.playerFocus || {};
  const directorNotes = state.directorNotes || {};
  const sessionConfig = state.sessionConfig || {};

  return {
    accusation: playerFocus.accusation || {},
    whiteboard: playerFocus.whiteboardContext || {},
    observations: directorNotes.observations || {},
    roster: sessionConfig.roster || [],
    primaryInvestigation: playerFocus.primaryInvestigation || 'General investigation'
  };
}

/**
 * Build output format section for prompts (DRY helper)
 *
 * Commit 8.28: Placed at TOP of prompts for recency bias
 * This ensures the model remembers the wrapper structure
 *
 * @param {string} schemaDescription - Human-readable description of expected output structure
 * @returns {string} Formatted output section
 */
function buildOutputFormatSection(schemaDescription) {
  return `## OUTPUT FORMAT (CRITICAL - Follow exactly)

Return valid JSON matching this structure:
${schemaDescription}

CRITICAL: Your response MUST be a valid JSON object with the wrapper structure shown above.
Do NOT return a raw array - always use the object wrapper with "narrativeArcs" key.`;
}

/**
 * Create default interweaving for graceful degradation
 *
 * Commit 8.28: Fallback when Call 2 (interweaving enrichment) fails
 *
 * @returns {Object} Empty interweaving structure
 */
function createDefaultInterweaving() {
  return {
    sharedCharacters: [],
    bridgeOpportunities: [],
    callbackSeeds: [],
    convergenceRole: ''
  };
}

/**
 * Create default interweaving plan for graceful degradation
 *
 * @returns {Object} Empty interweaving plan
 */
function createDefaultInterweavingPlan() {
  return {
    suggestedOrder: [],
    convergencePoint: '',
    keyCallbacks: []
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SPLIT-CALL PROMPT BUILDERS (Commit 8.28)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build prompt for core arc generation (Call 1)
 *
 * Commit 8.28: OUTPUT FORMAT at TOP for recency bias
 * Excludes interweaving rules to reduce complexity
 *
 * @param {Object} state - Current workflow state
 * @returns {string} Prompt for core arc generation
 */
function buildCoreArcPrompt(state) {
  const context = extractPlayerFocusContext(state);
  const evidenceSummary = extractEvidenceSummary(state.evidenceBundle || {});

  // Commit 8.xx: Compute non-roster PCs for three-category character guidance
  const theme = state.theme || 'journalist';
  const themeNPCs = getThemeNPCs(theme);
  const themeCharacters = getThemeCharacters(theme);
  const nonRosterPCs = getNonRosterPCs(context.roster, themeCharacters, themeNPCs);

  // Output format at TOP for recency bias
  const outputFormat = buildOutputFormatSection(`{
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
  "synthesisNotes": "How you addressed player conclusions and what patterns emerged"
}`);

  return `# Core Arc Generation

${outputFormat}

---

## SECTION 1: WHAT PLAYERS CONCLUDED (PRIMARY - Your arcs must address this)

### The Accusation (REQUIRED ARC)
**Accused:** ${JSON.stringify(context.accusation.accused || [])}
**Charge:** ${context.accusation.charge || 'Not specified'}
**Players' Reasoning:** ${context.accusation.reasoning || 'Not documented'}

You MUST generate an arc that addresses this accusation. Even if evidence is weak, include this arc and mark it appropriately with evidenceStrength="speculative" if needed.

### Whiteboard Connections (Players drew these during investigation)
**Suspects Explored:** ${JSON.stringify(context.whiteboard.suspectsExplored || [])}
**Connections Found:** ${JSON.stringify(context.whiteboard.connections || [])}
**Notes Captured:** ${JSON.stringify(context.whiteboard.notes || [])}
**Names Identified:** ${JSON.stringify(context.whiteboard.namesFound || [])}

### Director Observations (GROUND TRUTH - Director witnessed these behaviors)
**Behavior Patterns:** ${JSON.stringify(context.observations.behaviorPatterns || [])}
**Suspicious Correlations:** ${JSON.stringify(context.observations.suspiciousCorrelations || [])}
**Notable Moments:** ${JSON.stringify(context.observations.notableMoments || [])}

### Primary Investigation Focus
${context.primaryInvestigation}

### Session Roster (ALL characters who need placement)
${JSON.stringify(context.roster)}

### Character Categories for characterPlacements

**ROSTER PCs** (MUST have placements - Nova observed them):
${JSON.stringify(context.roster)}

**NPCs** (valid in placements, don't count for coverage):
Marcus, Nova, Blake, Valet

**NON-ROSTER PCs** (can mention from evidence only):
${nonRosterPCs.length > 0 ? nonRosterPCs.join(', ') : '(none this session)'}
${nonRosterPCs.length > 0 ? `- These are valid game characters not playing this session
- CAN be mentioned if they appear in evidence
- Roles must be evidence-based: "Mentioned in X's memory"
- Add caveats when using: "Based on memory evidence only"` : ''}

---

## SECTION 2: ARC GENERATION RULES

Generate 3-5 narrative arcs following this priority:

### Priority 1: ACCUSATION ARC (Required)
- Must directly address the accusation above
- arcSource: "accusation"
- Include even if evidenceStrength is "speculative"
- If evidence is thin, use caveats to acknowledge uncertainty

### Priority 2: WHITEBOARD/OBSERVATION ARCS (1-3 arcs)
- Generated from significant whiteboard connections or director observations
- arcSource: "whiteboard" or "observation"
- Should have at least "weak" evidenceStrength

### Priority 3: DISCOVERED ARC (Optional, max 1)
- Only if evidence strongly supports something players completely missed
- arcSource: "discovered"
- Must have evidenceStrength "strong" or "moderate"

---

## SECTION 3: EVIDENCE BOUNDARIES

### Layer 1 - EXPOSED (Full Reportability)
- CAN quote full memory contents, describe what memory reveals
- CAN draw conclusions from content, name who exposed each memory

### Layer 2 - BURIED (Observable Only)
- CAN report: shell account names, dollar amounts, timing patterns
- CANNOT report: whose memories went to which accounts, content of buried memories

### Layer 3 - DIRECTOR NOTES (Priority Hierarchy)
1. ACCUSATION = PRIMARY (what players concluded)
2. DIRECTOR OBSERVATIONS = GROUND TRUTH
3. WHITEBOARD = SUPPORTING CONTEXT

### Anti-Patterns
- Never use "token" (say "memory")
- Never use em-dashes
- Never claim to know buried content

---

## SECTION 4: EVIDENCE BUNDLE

### Exposed Tokens (${evidenceSummary.exposedTokens.length} items - Layer 1)
${JSON.stringify(evidenceSummary.exposedTokens, null, 2)}

### Paper Evidence (${evidenceSummary.exposedPaper.length} items - Layer 1)
${JSON.stringify(evidenceSummary.exposedPaper, null, 2)}

### Buried Transactions (${evidenceSummary.buriedTransactions.length} items - Layer 2 CONTEXT ONLY)
${JSON.stringify(evidenceSummary.buriedTransactions, null, 2)}

### All Valid Evidence IDs for keyEvidence (EXPOSED LAYER 1 ONLY)
${JSON.stringify(evidenceSummary.allEvidenceIds)}

CRITICAL: keyEvidence arrays MUST contain IDs from this list ONLY.

---

## SECTION 5: THREE-LENS ANALYSIS REQUIREMENT

For each arc, analyze through all three lenses and document in analysisNotes:

### Financial Lens
- Transaction patterns that support this arc
- Account naming that suggests involvement

### Behavioral Lens
- Director observations that support this arc
- Character dynamics relevant to this arc

### Victimization Lens
- Targeting patterns that support this arc
- Victim/operator relationships
${buildArcRevisionContext(state)}`;
}

/**
 * Build prompt for interweaving enrichment (Call 2)
 *
 * Commit 8.28: Compact prompt with just arcs + roster
 * No evidence needed - interweaving is about arc relationships
 *
 * @param {Array} coreArcs - Generated arcs from Call 1 (required, non-empty)
 * @param {Array} roster - Character roster (defaults to empty array if invalid)
 * @returns {string} Prompt for interweaving enrichment
 * @throws {Error} If coreArcs is not a non-empty array
 */
function buildInterweavingPrompt(coreArcs, roster) {
  // M2: Input validation
  if (!Array.isArray(coreArcs) || coreArcs.length === 0) {
    throw new Error('buildInterweavingPrompt: coreArcs must be a non-empty array');
  }
  if (!Array.isArray(roster)) {
    console.warn('[buildInterweavingPrompt] roster is not an array, using empty array');
    roster = [];
  }

  // Compact arc representation - only fields needed for interweaving
  const compactArcs = coreArcs.map(arc => ({
    id: arc.id,
    title: arc.title,
    summary: arc.summary,
    arcSource: arc.arcSource,
    characterPlacements: arc.characterPlacements
  }));

  return `# Interweaving Enrichment

Analyze the following narrative arcs and identify how they can interweave for compulsive readability.

## GENERATED ARCS

${JSON.stringify(compactArcs, null, 2)}

## ROSTER (for identifying shared characters)

${JSON.stringify(roster)}

## YOUR TASK

For each arc, provide:

1. **sharedCharacters** - Which characters in this arc also appear in OTHER arcs?
   These are natural bridge points for transitions.

2. **bridgeOpportunities** - How can this arc connect to others?
   - shared_character: Same person appears in different context
   - causal_chain: This arc explains WHY another happened
   - temporal: Events overlap in time
   - contradiction: This arc recontextualizes another

3. **callbackSeeds** - What details in this arc could pay off later?
   Example: "Victoria's confident smile" planted early, pays off when we learn she knew all along.

4. **convergenceRole** - How does this arc contribute to the central event (murder/accusation)?

Also provide an **interweavingPlan** with:
- suggestedOrder: Optimal arc sequence for maximum payoff
- convergencePoint: Where all threads meet
- keyCallbacks: Specific [plant → payoff] opportunities

## OUTPUT FORMAT

{
  "arcInterweaving": [
    {
      "arcId": "arc-id-from-above",
      "interweaving": {
        "sharedCharacters": ["Character1", "Character2"],
        "bridgeOpportunities": [
          { "toArc": "other-arc-id", "bridgeType": "shared_character", "bridgeDetail": "..." }
        ],
        "callbackSeeds": ["Detail that can pay off later"],
        "convergenceRole": "How this arc connects to the murder/accusation"
      }
    }
  ],
  "interweavingPlan": {
    "suggestedOrder": ["arc-id-1", "arc-id-2", ...],
    "convergencePoint": "The murder revelation / accusation climax",
    "keyCallbacks": [
      { "plantIn": "arc-id-1", "payoffIn": "arc-id-3", "detail": "Specific callback opportunity" }
    ]
  }
}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// SPLIT-CALL SDK HELPERS (Commit 8.28)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate core arcs (Call 1 of split-call pattern)
 *
 * Commit 8.28: First SDK call with simplified schema
 *
 * @param {Object} state - Current workflow state
 * @param {Object} config - Graph config with SDK client
 * @returns {Promise<Object>} Core arcs result containing:
 *   - narrativeArcs: Array of arc objects (3-5 typically)
 *   - synthesisNotes: String describing synthesis approach
 * @throws {Error} If SDK call fails or result structure is invalid
 */
async function generateCoreArcs(state, config) {
  console.log('[generateCoreArcs] Starting Call 1: Core arc generation');
  const startTime = Date.now();

  const sdkClient = getSdkClient(config, 'generateCoreArcs');
  const prompt = buildCoreArcPrompt(state);

  console.log(`[generateCoreArcs] Prompt built: ${prompt.length} characters`);

  try {
    const result = await sdkClient({
      prompt,
      systemPrompt: CORE_ARC_SYSTEM_PROMPT,
      model: 'sonnet',
      jsonSchema: CORE_ARC_SCHEMA,
      timeoutMs: 3 * 60 * 1000,  // 3 minutes (reduced from 5)
      disableTools: true,  // Commit 8.xx: Pure structured output, no tool access needed
      label: 'Core arc generation (Call 1)'
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    // H2: Validate result structure before returning
    if (!result || !Array.isArray(result.narrativeArcs)) {
      console.error('[generateCoreArcs] Invalid result structure:', JSON.stringify(result, null, 2).slice(0, 500));
      throw new Error('Core arc generation returned invalid structure: narrativeArcs must be an array');
    }

    if (result.narrativeArcs.length === 0) {
      console.warn('[generateCoreArcs] Warning: No arcs generated - this may indicate prompt issues');
    }

    console.log(`[generateCoreArcs] Complete: ${result.narrativeArcs.length} arcs in ${duration}s`);

    return result;
  } catch (error) {
    console.error('[generateCoreArcs] Error:', error.message);
    throw error;  // Let caller handle error routing
  }
}

/**
 * Enrich arcs with interweaving metadata (Call 2 of split-call pattern)
 *
 * Commit 8.28: Second SDK call with compact prompt
 * Uses graceful degradation - returns null on failure instead of throwing.
 *
 * @param {Array} coreArcs - Generated arcs from Call 1 (must be non-empty)
 * @param {Array} roster - Character roster for identifying shared characters
 * @param {Object} config - Graph config with SDK client
 * @returns {Promise<Object|null>} Interweaving result on success containing:
 *   - arcInterweaving: Array of { arcId, interweaving } objects
 *   - interweavingPlan: { suggestedOrder, convergencePoint, keyCallbacks }
 *   Returns null on failure (graceful degradation - caller should use defaults)
 */
async function enrichWithInterweaving(coreArcs, roster, config) {
  console.log('[enrichWithInterweaving] Starting Call 2: Interweaving enrichment');
  const startTime = Date.now();

  const sdkClient = getSdkClient(config, 'enrichWithInterweaving');
  const prompt = buildInterweavingPrompt(coreArcs, roster);

  console.log(`[enrichWithInterweaving] Prompt built: ${prompt.length} characters`);

  try {
    const result = await sdkClient({
      prompt,
      systemPrompt: INTERWEAVING_SYSTEM_PROMPT,
      model: 'sonnet',
      jsonSchema: INTERWEAVING_SCHEMA,
      timeoutMs: 2 * 60 * 1000,  // 2 minutes
      label: 'Interweaving enrichment (Call 2)'
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[enrichWithInterweaving] Complete: ${result?.arcInterweaving?.length || 0} arcs enriched in ${duration}s`);

    return result;
  } catch (error) {
    // Graceful degradation - log but don't throw
    console.error('[enrichWithInterweaving] Error (graceful degradation):', error.message);
    return null;
  }
}

/**
 * Merge core arcs with interweaving metadata
 *
 * Commit 8.28: Combines results from both calls
 * Handles graceful degradation when Call 2 fails
 *
 * @param {Object} coreResult - Result from generateCoreArcs containing:
 *   - narrativeArcs: Array of arc objects with id, title, summary, etc.
 *   - synthesisNotes: String describing synthesis approach
 * @param {Object|null} interweavingResult - Result from enrichWithInterweaving (null on failure)
 * @returns {Object} Merged result with all arc fields including interweaving metadata
 * @throws {Error} If coreResult is invalid or narrativeArcs is not an array
 */
function mergeArcsWithInterweaving(coreResult, interweavingResult) {
  // H1: Defensive checks for coreResult
  if (!coreResult || typeof coreResult !== 'object') {
    console.error('[mergeArcsWithInterweaving] Invalid coreResult:', coreResult);
    throw new Error('mergeArcsWithInterweaving: coreResult is required');
  }

  const { narrativeArcs, synthesisNotes } = coreResult;

  // H1: Validate narrativeArcs is an array before calling .map()
  if (!Array.isArray(narrativeArcs)) {
    console.error('[mergeArcsWithInterweaving] narrativeArcs is not an array:', narrativeArcs);
    throw new Error('mergeArcsWithInterweaving: narrativeArcs must be an array');
  }

  // If interweaving failed, use defaults
  if (!interweavingResult) {
    console.log('[mergeArcsWithInterweaving] Using default interweaving (Call 2 failed)');
    return {
      narrativeArcs: narrativeArcs.map(arc => ({
        ...arc,
        interweaving: createDefaultInterweaving()
      })),
      synthesisNotes,
      interweavingPlan: createDefaultInterweavingPlan(),
      _interweavingFailed: true
    };
  }

  // Build lookup map for interweaving by arc ID
  const interMap = new Map(
    (interweavingResult.arcInterweaving || []).map(item => [item.arcId, item.interweaving])
  );

  // M1: Detect and warn about arc ID mismatches
  const coreIds = new Set(narrativeArcs.map(arc => arc.id));
  const interIds = new Set(interMap.keys());
  const missingInter = [...coreIds].filter(id => !interIds.has(id));
  const orphanedInter = [...interIds].filter(id => !coreIds.has(id));

  if (missingInter.length > 0 || orphanedInter.length > 0) {
    console.warn('[mergeArcsWithInterweaving] Arc ID mismatch detected:',
      missingInter.length > 0 ? `Missing interweaving for: ${missingInter.join(', ')}` : '',
      orphanedInter.length > 0 ? `Orphaned interweaving for: ${orphanedInter.join(', ')}` : ''
    );
  }

  // Merge interweaving into arcs
  const mergedArcs = narrativeArcs.map(arc => ({
    ...arc,
    interweaving: interMap.get(arc.id) || createDefaultInterweaving()
  }));

  return {
    narrativeArcs: mergedArcs,
    synthesisNotes,
    interweavingPlan: interweavingResult.interweavingPlan || createDefaultInterweavingPlan()
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build arc-specific revision context from evaluator feedback
 *
 * H3: Renamed from buildRevisionContext to avoid confusion with the DRY
 * buildRevisionContext imported from node-helpers.js (aliased as buildRevisionContextDRY).
 * This local version takes state directly and is used for embedding revision
 * guidance in arc-related prompts.
 *
 * @param {Object} state - State with validationResults and arcRevisionCount
 * @returns {string} Revision guidance section or empty string for first attempt
 */
function buildArcRevisionContext(state) {
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
// ═══════════════════════════════════════════════════════════════════════════
// PLAYER-FOCUS-GUIDED PROMPT (for revision flow)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build player-focus-guided comprehensive prompt for arc analysis
 *
 * Commit 8.15: NEW ARCHITECTURE - Player conclusions drive arc generation
 *
 * @deprecated Commit 8.28: Use buildCoreArcPrompt() instead for new arc generation.
 * This function is kept for backwards compatibility with the revision flow.
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
  "synthesisNotes": "How you addressed player conclusions and what patterns emerged"
}
${buildArcRevisionContext(state)}`;
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
  console.log('[analyzeArcsPlayerFocusGuided] Starting split-call analysis (Commit 8.28)');
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
        architecture: 'split-call'
      },
      currentPhase: PHASES.ARC_SYNTHESIS,
    };
  }

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // CALL 1: Core Arc Generation (3 min timeout)
    // ═══════════════════════════════════════════════════════════════════════
    const call1Start = Date.now();
    const coreResult = await generateCoreArcs(state, config);
    const call1Duration = ((Date.now() - call1Start) / 1000).toFixed(1);

    // Validate we got arcs
    if (!coreResult || !coreResult.narrativeArcs || coreResult.narrativeArcs.length === 0) {
      throw new Error('Call 1 returned no arcs');
    }

    console.log(`[analyzeArcsPlayerFocusGuided] Call 1 complete: ${coreResult.narrativeArcs.length} arcs in ${call1Duration}s`);

    // ═══════════════════════════════════════════════════════════════════════
    // CALL 2: Interweaving Enrichment (2 min timeout, graceful degradation)
    // ═══════════════════════════════════════════════════════════════════════
    const call2Start = Date.now();
    const roster = state.sessionConfig?.roster || [];
    const interweavingResult = await enrichWithInterweaving(coreResult.narrativeArcs, roster, config);
    const call2Duration = ((Date.now() - call2Start) / 1000).toFixed(1);

    if (interweavingResult) {
      console.log(`[analyzeArcsPlayerFocusGuided] Call 2 complete: interweaving added in ${call2Duration}s`);
    } else {
      console.log(`[analyzeArcsPlayerFocusGuided] Call 2 failed: using default interweaving (${call2Duration}s)`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MERGE: Combine results from both calls
    // ═══════════════════════════════════════════════════════════════════════
    const mergedResult = mergeArcsWithInterweaving(coreResult, interweavingResult);
    const { narrativeArcs, synthesisNotes, interweavingPlan } = mergedResult;

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[analyzeArcsPlayerFocusGuided] Complete: ${narrativeArcs?.length || 0} arcs in ${totalDuration}s (Call1: ${call1Duration}s, Call2: ${call2Duration}s)`);

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
        interweavingPlan: interweavingPlan || {},
        arcCount: narrativeArcs?.length || 0,
        architecture: 'split-call',
        interweavingFailed: mergedResult._interweavingFailed || false,
        timing: {
          call1: `${call1Duration}s`,
          call2: `${call2Duration}s`,
          total: `${totalDuration}s`
        }
      },
      currentPhase: PHASES.ARC_SYNTHESIS,
    };

  } catch (error) {
    console.error('[analyzeArcsPlayerFocusGuided] Error:', error.message);

    return {
      narrativeArcs: [],
      _arcAnalysisCache: {
        synthesizedAt: new Date().toISOString(),
        _error: error.message,
        architecture: 'split-call'
      },
      errors: [{
        phase: PHASES.ARC_SYNTHESIS,
        type: 'split-call-failed',
        message: error.message,
        timestamp: new Date().toISOString()
      }],
      currentPhase: PHASES.ERROR
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REVISION NODE - Targeted fixes with previous output context
// ═══════════════════════════════════════════════════════════════════════════
//
// This node handles arc revisions by providing the FULL previous output
// along with specific feedback from the evaluator. This solves the
// "whack-a-mole" problem where fixing one issue caused regression of
// previously-correct output.
//
// Data flow:
// 1. incrementArcRevision preserves arcs in _previousArcs, clears narrativeArcs
// 2. reviseArcs receives _previousArcs + validationResults
// 3. Uses buildRevisionContext helper (DRY) to format context
// 4. Makes targeted fixes, returns new arcs, clears _previousArcs

/**
 * Revise arcs with previous output context for targeted fixes
 *
 * Called after incrementArcRevision when evaluator says arcs need work.
 * Uses the centralized buildRevisionContext helper for DRY formatting.
 *
 * Key difference from analyzeArcs: receives PREVIOUS OUTPUT + FEEDBACK
 * so it can make targeted fixes instead of regenerating from scratch.
 *
 * @param {Object} state - Current state with _previousArcs, validationResults
 * @param {Object} config - Graph config with SDK client
 * @returns {Object} Partial state update with narrativeArcs, cleared _previousArcs
 */
async function reviseArcs(state, config) {
  const revisionCount = state.arcRevisionCount || 0;
  console.log(`[reviseArcs] Starting arc revision ${revisionCount}`);
  const startTime = Date.now();

  // Get previous arcs (preserved by incrementArcRevision)
  const previousArcs = state._previousArcs;
  if (!previousArcs || previousArcs.length === 0) {
    // CRITICAL: This should never happen in normal flow.
    // If we're here, incrementArcRevision ran with null/empty narrativeArcs.
    console.error('[reviseArcs] CRITICAL: No previous arcs to revise. This indicates incrementArcRevision ran with null/empty narrativeArcs.');
    return {
      narrativeArcs: [],
      _previousArcs: null,
      errors: [{
        phase: PHASES.ARC_SYNTHESIS,
        type: 'revision-no-previous-output',
        message: 'Cannot revise: no previous arcs available. Increment node may have run with null narrativeArcs.',
        timestamp: new Date().toISOString()
      }],
      currentPhase: PHASES.ERROR
    };
  }

  // Build revision context using centralized helper (DRY)
  const { contextSection, previousOutputSection } = buildRevisionContextDRY({
    phase: 'arcs',
    revisionCount,
    validationResults: state.validationResults,
    previousOutput: previousArcs
  });

  // Get SDK client
  const sdkClient = getSdkClient(config, 'reviseArcs');

  // Build revision prompt with full context
  const revisionPrompt = buildArcRevisionPrompt(state, contextSection, previousOutputSection);

  try {
    const result = await sdkClient({
      prompt: revisionPrompt,
      systemPrompt: getArcRevisionSystemPrompt(),
      model: 'sonnet',  // Same model as generation
      jsonSchema: PLAYER_FOCUS_GUIDED_SCHEMA,
      timeoutMs: 5 * 60 * 1000,  // 5 minutes
      label: `Arc revision ${revisionCount}`
    });

    const { narrativeArcs, synthesisNotes } = result || {};

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[reviseArcs] Complete: ${narrativeArcs?.length || 0} arcs in ${duration}s`);

    // Verify improvements
    if (narrativeArcs && narrativeArcs.length > 0) {
      const hasAccusationArc = narrativeArcs.some(arc => arc.arcSource === 'accusation');
      console.log(`[reviseArcs] Accusation arc present: ${hasAccusationArc}`);
    }

    return {
      narrativeArcs: narrativeArcs || [],
      _previousArcs: null,  // Clear temporary field after use
      _arcAnalysisCache: {
        synthesizedAt: new Date().toISOString(),
        synthesisNotes: synthesisNotes || '',
        arcCount: narrativeArcs?.length || 0,
        architecture: 'player-focus-guided-revision',
        revisionNumber: revisionCount,
        timing: {
          total: `${duration}s`
        }
      },
      currentPhase: PHASES.ARC_SYNTHESIS
    };

  } catch (error) {
    console.error('[reviseArcs] Error:', error.message);

    return {
      narrativeArcs: [],
      _previousArcs: null,  // Clear temporary field
      _arcAnalysisCache: {
        synthesizedAt: new Date().toISOString(),
        _error: error.message,
        architecture: 'player-focus-guided-revision',
        revisionNumber: revisionCount
      },
      errors: [{
        phase: PHASES.ARC_SYNTHESIS,
        type: 'arc-revision-failed',
        message: error.message,
        timestamp: new Date().toISOString()
      }],
      currentPhase: PHASES.ERROR
    };
  }
}

/**
 * Get system prompt for arc revision
 * Focuses on TARGETED FIXES, not regeneration
 */
function getArcRevisionSystemPrompt() {
  return `You are revising narrative arcs for an investigative article about "About Last Night".

CRITICAL REVISION RULES:
1. You are IMPROVING existing arcs, not generating from scratch
2. The previous output is provided - PRESERVE everything that's working well
3. Only modify the specific issues identified in the feedback
4. If a criterion is scoring ≥80%, do NOT change anything related to it
5. Maintain the same overall arc structure and organization
6. Output complete arcs with all required fields

Your goal is TARGETED FIXES that address the evaluator's feedback while preserving all the good work from the previous attempt.

Do NOT:
- Regenerate arcs from scratch (you lose good content)
- Change things that weren't flagged as issues
- Drop arcs that were working well
- Introduce new problems while fixing old ones

DO:
- Read the previous output carefully
- Identify exactly what needs to change
- Make minimal, surgical fixes
- Verify your changes address the feedback
- Return the complete updated arc set`;
}

/**
 * Build revision prompt with previous arcs and feedback
 *
 * @param {Object} state - Current workflow state
 * @param {string} contextSection - Formatted revision context from helper
 * @param {string} previousOutputSection - Formatted previous output from helper
 * @returns {string} Complete revision prompt
 */
function buildArcRevisionPrompt(state, contextSection, previousOutputSection) {
  const playerFocus = state.playerFocus || {};
  const sessionConfig = state.sessionConfig || {};
  const evidenceBundle = state.evidenceBundle || {};

  // Extract evidence summary for reference
  const evidenceSummary = extractEvidenceSummary(evidenceBundle);

  const accusation = playerFocus.accusation || {};
  const roster = sessionConfig.roster || [];

  return `# Arc Revision Request

${contextSection}

## SESSION CONTEXT (Reference Only - Do NOT regenerate)

### Accusation
**Accused:** ${JSON.stringify(accusation.accused || [])}
**Charge:** ${accusation.charge || 'Not specified'}
**Reasoning:** ${accusation.reasoning || 'Not documented'}

### Roster
${JSON.stringify(roster)}

### Valid Evidence IDs (for keyEvidence validation)
${JSON.stringify(evidenceSummary.allEvidenceIds)}

---

${previousOutputSection}

---

## YOUR TASK

1. Review the PREVIOUS ARCS OUTPUT above
2. Review the ISSUES TO ADDRESS in the revision context
3. Make TARGETED FIXES to address those specific issues
4. PRESERVE everything that's working well (high-scoring criteria)
5. Return the complete updated arc set in the same JSON format

Remember: You are IMPROVING, not regenerating. The previous work was valuable - preserve what's good while fixing what's broken.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// EVIDENCE SUMMARY EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY PARALLEL SPECIALIST ARCHITECTURE REMOVED (Commit 8.xx)
// ═══════════════════════════════════════════════════════════════════════════
//
// The following functions were removed as part of legacy cleanup:
// - callWithRetry, callFinancialSpecialist, callBehavioralSpecialist, callVictimizationSpecialist
// - buildSynthesisPrompt, synthesizeArcs, analyzeArcsWithSubagents
//
// Current architecture uses single-call player-focus-guided analysis.
// See analyzeArcsPlayerFocusGuided() above.
//

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
 * Build revision guidance string for programmatic validation failures
 * Commit 8.27: Short-circuit expensive evaluator for obvious structural issues
 *
 * @param {Array} issues - Array of structural issues with type/message/severity
 * @param {Array} missingRoster - Array of roster member names not covered in arcs
 * @returns {string} Formatted guidance for revision node
 */
function buildValidationRevisionGuidance(issues, missingRoster) {
  const lines = ['PROGRAMMATIC VALIDATION FAILED - Fix these structural issues:'];

  issues.forEach(issue => {
    lines.push(`\n• ${issue.message}`);
  });

  if (missingRoster.length > 0) {
    lines.push(`\nMissing roster members that MUST appear in characterPlacements:`);
    missingRoster.forEach(name => lines.push(`  - ${name}`));
    lines.push(`\nEnsure each missing member appears in at least one arc's characterPlacements.`);
  }

  return lines.join('\n');
}

/**
 * Validate arc structure programmatically
 *
 * Commit 8.12: Programmatic validation for strict evidence/roster matching.
 * Commit 8.15: Added arcSource, evidenceStrength, and accusation arc validation.
 *
 * Runs AFTER analyzeArcsPlayerFocusGuided to:
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

  // Commit 8.xx: Get all valid game characters for non-roster PC detection
  const themeCharacters = getThemeCharacters(theme);
  const nonRosterPCs = getNonRosterPCs(roster, themeCharacters, themeNPCs);
  console.log(`[validateArcStructure] Non-roster PCs: ${nonRosterPCs.join(', ') || '(none)'}`);

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
      // Use fuzzy matching helper (Commit 8.xx: now preserves canonical full names)
      const matchedName = validateRosterName(name, roster, theme);

      if (matchedName) {
        // Roster member or canonical full name - preserve as-is
        validatedPlacements[matchedName] = role;
        placementRoles[matchedName.toLowerCase()] = role;

        // Note: since validateRosterName now returns the input name unchanged,
        // this "correction" logging will rarely trigger (only for case normalization)
        if (matchedName.toLowerCase() !== name.toLowerCase()) {
          issues.push(`Character "${name}" corrected to roster name "${matchedName}"`);
          totalCharactersCorrected++;
        }
      } else if (isKnownNPC(name, themeNPCs)) {
        // Commit 8.17: Known NPC from theme config - preserve as-is
        // NPCs are valid in characterPlacements but don't count toward roster coverage
        validatedPlacements[name] = role;
        // Don't add to placementRoles - NPCs don't affect roster coverage checks
      } else if (isNonRosterPC(name, roster, themeCharacters, themeNPCs)) {
        // Commit 8.xx: Non-roster PC - valid game character not playing this session
        // They appear in evidence about them but Nova didn't observe their behavior
        // Valid in characterPlacements (evidence-based mentions) but don't count for coverage
        validatedPlacements[name] = role;
        // Track non-roster PC for logging/debugging
        arc._nonRosterPCs = arc._nonRosterPCs || [];
        arc._nonRosterPCs.push(name);
        issues.push(`Character "${name}" is non-roster PC (evidence-based mention - valid)`);
        // Don't add to placementRoles - non-roster PCs don't affect roster coverage checks
      } else {
        issues.push(`Removed unknown character: ${name}`);
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

  // ═══════════════════════════════════════════════════════════════════════
  // 7. Check roster coverage across all arcs (Commit 8.27)
  // Commit 8.xx: Accept both first names AND canonical full names for coverage
  // ═══════════════════════════════════════════════════════════════════════

  // Build mapping from canonical names to roster entries
  // e.g., "sarah blackwood" → "sarah", "sarah" → "sarah"
  const canonicalToRoster = new Map();
  roster.forEach(rosterName => {
    const nameLower = rosterName.toLowerCase();
    canonicalToRoster.set(nameLower, nameLower);
    const canonical = getCanonicalName(rosterName, theme);
    if (canonical.toLowerCase() !== nameLower) {
      canonicalToRoster.set(canonical.toLowerCase(), nameLower);
    }
  });

  const coveredRoster = new Set();
  viableArcs.forEach(arc => {
    Object.keys(arc.characterPlacements || {}).forEach(name => {
      // Check if name is a roster member OR a canonical full name
      const nameLower = name.toLowerCase();
      const mappedRoster = canonicalToRoster.get(nameLower);
      if (mappedRoster) {
        // Both "Sarah" and "Sarah Blackwood" add "sarah" to coverage
        coveredRoster.add(mappedRoster);
      }
    });
  });

  const missingRoster = roster.filter(name => !coveredRoster.has(name.toLowerCase()));
  const rosterCoverage = roster.length > 0 ? coveredRoster.size / roster.length : 1;

  if (missingRoster.length > 0) {
    console.warn(`[validateArcStructure] STRUCTURAL ISSUE: Missing roster members: ${missingRoster.join(', ')}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 8. Determine structural pass/fail (Commit 8.27: gates evaluator vs revision)
  // ═══════════════════════════════════════════════════════════════════════
  const structuralIssues = [];

  if (missingRoster.length > 0) {
    structuralIssues.push({
      type: 'missing-roster-coverage',
      message: `Missing roster members: ${missingRoster.join(', ')}`,
      severity: 'structural'
    });
  }

  if (!hasAccusationArc) {
    structuralIssues.push({
      type: 'no-accusation-arc',
      message: 'No accusation arc present - must include arc based on player accusation',
      severity: 'structural'
    });
  }

  const structuralPassed = structuralIssues.length === 0;

  // Build validationResults for revision node (same format as evaluator)
  const validationFeedback = structuralPassed ? null : {
    ready: false,
    structuralPassed: false,
    issues: structuralIssues,
    revisionGuidance: buildValidationRevisionGuidance(structuralIssues, missingRoster),
    criteriaScores: {
      rosterCoverage: rosterCoverage,
      accusationArcPresent: hasAccusationArc ? 1.0 : 0.0
    },
    source: 'programmatic-validation'
  };

  if (!structuralPassed) {
    console.log(`[validateArcStructure] Structural validation FAILED: ${structuralIssues.length} issues`);
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
  console.log(`  - Roster coverage: ${(rosterCoverage * 100).toFixed(0)}% (${missingRoster.length} missing)`);
  console.log(`  - Non-roster PCs in arcs: ${nonRosterPCs.length > 0 ? nonRosterPCs.join(', ') : '(none)'}`);
  console.log(`  - Structural passed: ${structuralPassed}`);

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
      rosterCoverage,
      missingRoster,
      nonRosterPCs,  // Commit 8.xx: Valid game characters not in roster (evidence-based mentions)
      structuralPassed,  // Commit 8.27: gates routing to evaluator vs revision
      validatedAt: new Date().toISOString()
    },
    // Commit 8.27: Only set validationResults if structural issues detected
    // This enables revision node to receive feedback without expensive evaluator
    ...(validationFeedback && { validationResults: validationFeedback })
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
    };
  };
}

// Commit 8.xx: Removed deprecated createMockSpecialist and createMockSynthesizer
// Use createMockOrchestrator instead

module.exports = {
  // Commit 8.15: Player-focus-guided architecture (preferred)
  analyzeArcsPlayerFocusGuided: traceNode(analyzeArcsPlayerFocusGuided, 'analyzeArcsPlayerFocusGuided', {
    stateFields: ['playerFocus', 'evidenceBundle']
  }),

  // Revision node - uses previous output context for targeted fixes (DRY)
  reviseArcs: traceNode(reviseArcs, 'reviseArcs', {
    stateFields: ['_previousArcs', 'validationResults']
  }),

  // Programmatic validation node
  validateArcStructure: traceNode(validateArcStructure, 'validateArcStructure', {
    stateFields: ['narrativeArcs']
  }),

  // Mock factory (Commit 8.8)
  createMockOrchestrator,

  // Export for testing
  _testing: {
    // Commit 8.28: Split-call architecture
    buildCoreArcPrompt,
    buildInterweavingPrompt,
    generateCoreArcs,
    enrichWithInterweaving,
    mergeArcsWithInterweaving,
    createDefaultInterweaving,
    createDefaultInterweavingPlan,
    extractPlayerFocusContext,
    extractEvidenceSummary,  // Used by current code
    buildOutputFormatSection,
    CORE_ARC_SYSTEM_PROMPT,
    CORE_ARC_SCHEMA,
    INTERWEAVING_SYSTEM_PROMPT,
    INTERWEAVING_SCHEMA,

    // Commit 8.15: Player-focus-guided (used by revision flow)
    buildPlayerFocusGuidedPrompt,
    PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT,
    PLAYER_FOCUS_GUIDED_SCHEMA
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
    console.log('\nSelf-test complete.');
  }).catch(err => {
    console.error('Self-test failed:', err.message);
    process.exit(1);
  });
}

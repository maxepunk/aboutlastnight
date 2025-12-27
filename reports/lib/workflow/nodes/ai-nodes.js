/**
 * AI Nodes - AI processing nodes for report generation workflow
 *
 * These nodes handle the AI-powered phases of the pipeline:
 * - curateEvidenceBundle: Curate evidence into three-layer structure (1.8)
 * - analyzeNarrativeArcs: Analyze evidence for narrative arcs (2)
 * - generateOutline: Generate article outline from selected arcs (3)
 * - generateContentBundle: Generate structured content JSON (4)
 * - validateArticle: Validate voice and anti-patterns (5.1)
 * - reviseContentBundle: Revise content based on validation feedback (4.2)
 *
 * All nodes follow the LangGraph pattern:
 * - Accept (state, config) parameters
 * - Return partial state updates
 * - Use PHASES and APPROVAL_TYPES constants
 * - Support dependency injection via config.configurable
 *
 * Testing:
 * - Use createMockClaudeClient(fixtures) for mocking AI responses
 * - Use createMockPromptBuilder() for mocking prompt generation
 * - Internal functions exported via _testing
 *
 * See ARCHITECTURE_DECISIONS.md for design rationale.
 */

const { PHASES, APPROVAL_TYPES } = require('../state');
const { SchemaValidator } = require('../../schema-validator');
const { createPromptBuilder } = require('../../prompt-builder');
const { safeParseJson, getSdkClient } = require('./node-helpers');
// Import consolidated mock from test mocks (avoids duplication)
const { createMockSdkClient, createMockClaudeClient } = require('../../../__tests__/mocks/sdk-client.mock');

/**
 * Get PromptBuilder from config or create default
 * Supports dependency injection for testing
 *
 * @param {Object} config - Graph config with optional configurable.promptBuilder
 * @returns {Object} PromptBuilder instance
 */
function getPromptBuilder(config) {
  return config?.configurable?.promptBuilder || createPromptBuilder();
}

/**
 * Get SchemaValidator from config or create default
 * Supports dependency injection for testing
 *
 * @param {Object} config - Graph config with optional configurable.schemaValidator
 * @returns {Object} SchemaValidator instance
 */
function getSchemaValidator(config) {
  return config?.configurable?.schemaValidator || new SchemaValidator();
}

/**
 * Curate evidence bundle from PREPROCESSED evidence summaries
 *
 * Performs TWO distinct tasks:
 *
 * 1. TOKEN DISPOSITION (Privacy Boundary):
 *    - EXPOSED tokens → full content in exposed.tokens
 *    - BURIED tokens → transaction data only in buried.transactions
 *    - UNKNOWN tokens → excluded entirely
 *
 * 2. PAPER EVIDENCE CURATION (Relevance Filter):
 *    - All paper evidence is UNLOCKED (director confirmed players found it)
 *    - Scores each item against criteria (roster +1, token corroboration +2,
 *      suspect relevance +2, theme alignment +1, substantive content +1)
 *    - Items scoring 2+ go to exposed.paperEvidence (CURATED)
 *    - Items below threshold go to curationReport.excluded with reason
 *    - Excluded items marked rescuable can be overridden at human checkpoint
 *
 * Uses Opus model for judgment-heavy curation decisions.
 *
 * Output structure:
 * - exposed.tokens: Full content of EXPOSED memory tokens
 * - exposed.paperEvidence: CURATED paper evidence (relevance-filtered)
 * - buried.transactions: Transaction-only data from BURIED tokens
 * - curationReport: Included/excluded paper evidence with scoring rationale
 *
 * @param {Object} state - Current state with preprocessedEvidence, playerFocus, sessionConfig
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with evidenceBundle, currentPhase, approval flags
 */
async function curateEvidenceBundle(state, config) {
  // Skip if already curated and approval cleared (resume case)
  if (state.evidenceBundle && !state.awaitingApproval) {
    console.log('[curateEvidenceBundle] Skipping - evidenceBundle already exists and approval cleared');
    return {
      currentPhase: PHASES.CURATE_EVIDENCE
    };
  }

  const sdk = getSdkClient(config);

  // Use preprocessed evidence (Commit 8.5)
  const preprocessed = state.preprocessedEvidence || {
    items: [],
    playerFocus: state.playerFocus || {}
  };

  // If no preprocessed items, create empty evidence bundle
  if (!preprocessed.items || preprocessed.items.length === 0) {
    console.log('[curateEvidenceBundle] No preprocessed evidence - creating empty bundle');
    return {
      evidenceBundle: {
        exposed: { tokens: [], paperEvidence: [] },
        buried: { transactions: [], relationships: [] },
        context: {
          timeline: {},
          playerFocus: state.playerFocus || {},
          sessionMetadata: { sessionId: state.sessionId }
        },
        curatorNotes: {
          layerRationale: 'No evidence to curate',
          characterCoverage: {}
        }
      },
      currentPhase: PHASES.CURATE_EVIDENCE,
      awaitingApproval: true,
      approvalType: APPROVAL_TYPES.EVIDENCE_AND_PHOTOS
    };
  }

  // Count items by type for logging
  const tokenCount = preprocessed.items.filter(i => i.sourceType === 'memory-token').length;
  const paperCount = preprocessed.items.filter(i => i.sourceType === 'paper-evidence').length;
  const exposedDisposition = preprocessed.items.filter(i => i.disposition === 'exposed').length;
  const buriedDisposition = preprocessed.items.filter(i => i.disposition === 'buried').length;
  const unknownDisposition = preprocessed.items.filter(i => i.disposition === 'unknown').length;
  console.log(`[curateEvidenceBundle] Starting curation of ${preprocessed.items.length} items:`);
  console.log(`  - sourceType: ${tokenCount} memory-tokens, ${paperCount} paper-evidence`);
  console.log(`  - disposition: ${exposedDisposition} exposed, ${buriedDisposition} buried, ${unknownDisposition} unknown`);

  // Extract roster and accusation context for curation
  const roster = state.sessionConfig?.roster || [];
  const rosterNames = roster.map(p => typeof p === 'string' ? p : p.name).filter(Boolean);
  const accusationContext = state.directorNotes?.accusationContext || state.playerFocus?.accusation || {};
  const suspects = accusationContext.accused || [];

  // Build curation prompt with separated concerns:
  // 1. Token Disposition (privacy boundary) - exposed/buried/unknown
  // 2. Paper Evidence Curation (relevance filter) - unlocked -> curated
  const systemPrompt = `You are curating evidence for a NovaNews investigative article about a specific game session.

You have TWO separate tasks:

═══════════════════════════════════════════════════════════════════════════════
TASK 1: MEMORY TOKEN DISPOSITION (Privacy Boundary)
═══════════════════════════════════════════════════════════════════════════════

Each memory token has a "disposition" field that determines what data is accessible:

┌─────────────┬────────────────────────────────────────────────────────────────┐
│ EXPOSED     │ Token was submitted to Detective/Reporter (public record)     │
│             │ ✓ Include: content, owner, characterRefs, narrativeTimeline   │
│             │ ✗ Exclude: who brought it (operator) - protect sources        │
├─────────────┼────────────────────────────────────────────────────────────────┤
│ BURIED      │ Token was sold to Black Market (private, discretion promised) │
│             │ ✓ Include: sessionTransactionTime, shellAccount, amount       │
│             │ ✗ Exclude: owner, content, narrativeTimeline, characterRefs   │
├─────────────┼────────────────────────────────────────────────────────────────┤
│ UNKNOWN     │ Token was not processed during session                        │
│             │ ✗ Exclude entirely - no data available                        │
└─────────────┴────────────────────────────────────────────────────────────────┘

TIMELINE DISTINCTION:
- NARRATIVE TIMELINE = when events in memory occurred (e.g., "Feb 2025", "2009")
- SESSION TIMELINE = when tokens were transacted during game night (e.g., "11:21 PM")
For BURIED tokens, only SESSION TIMELINE (transaction time) is accessible.

═══════════════════════════════════════════════════════════════════════════════
TASK 2: PAPER EVIDENCE CURATION (Relevance Filter)
═══════════════════════════════════════════════════════════════════════════════

Paper evidence has been marked UNLOCKED by the director (players found it).
Your job is to filter UNLOCKED → CURATED based on relevance to THIS session's narrative.

IMPORTANT CHARACTER DISTINCTIONS:

┌─────────────────────┬────────────────────────────────────────────────────────┐
│ ROSTER              │ Active PLAYERS this session (humans at the table)     │
│ (sessionConfig)     │ These are the perspectives we're writing FOR          │
├─────────────────────┼────────────────────────────────────────────────────────┤
│ TOKEN CHARACTERS    │ Characters the exposed tokens are ABOUT               │
│ (from exposed       │ Includes NPCs, historical figures, absent characters  │
│  token owners +     │ These are the characters whose stories were REVEALED  │
│  characterRefs)     │                                                        │
├─────────────────────┼────────────────────────────────────────────────────────┤
│ SUSPECTS            │ Characters players accused or investigated            │
│ (from playerFocus)  │ These drove the session's narrative focus             │
└─────────────────────┴────────────────────────────────────────────────────────┘

CURATION CRITERIA - Include paper evidence if it scores 2+ points:

┌─────────────────────┬─────┬──────────────────────────────────────────────────┐
│ CRITERION           │ PTS │ DESCRIPTION                                      │
├─────────────────────┼─────┼──────────────────────────────────────────────────┤
│ ROSTER CONNECTION   │ +1  │ Owned by or directly involves a ROSTER player   │
├─────────────────────┼─────┼──────────────────────────────────────────────────┤
│ TOKEN CORROBORATION │ +2  │ Provides supporting detail for an EXPOSED token │
│                     │     │ (same event, relationship, or reveals context)  │
├─────────────────────┼─────┼──────────────────────────────────────────────────┤
│ SUSPECT RELEVANCE   │ +2  │ Features a character on the suspect list or     │
│                     │     │ directly relates to the accusation              │
├─────────────────────┼─────┼──────────────────────────────────────────────────┤
│ THEME ALIGNMENT     │ +1  │ Connects to playerFocus themes (whiteboard      │
│                     │     │ conclusions, key moments, open questions)       │
├─────────────────────┼─────┼──────────────────────────────────────────────────┤
│ SUBSTANTIVE CONTENT │ +1  │ Contains quotable narrative content (emails,    │
│                     │     │ messages, documents with actual text)           │
└─────────────────────┴─────┴──────────────────────────────────────────────────┘

AUTOMATIC EXCLUSION (regardless of score):
- Paper evidence with ONLY puzzle/mechanical content (lock combos, container descriptions)
- Paper evidence with empty or minimal description
- Paper evidence that would introduce entirely NEW narrative threads not touched by
  exposed tokens, player focus, or suspects

EDGE CASES:
- Character sheets for ROSTER players: Include (context for their perspective)
- Character sheets for SUSPECTS: Include (context for accusation)
- Character sheets for others: Exclude unless token corroboration exists
- Props that CONTAIN other documents: Exclude the container, include the contents if relevant

═══════════════════════════════════════════════════════════════════════════════
OUTPUT STRUCTURE
═══════════════════════════════════════════════════════════════════════════════

{
  "exposed": {
    "tokens": [...],           // EXPOSED disposition tokens with full content
    "paperEvidence": [...]     // CURATED paper evidence only
  },
  "buried": {
    "transactions": [...],     // BURIED disposition tokens (transaction data only)
    "relationships": []
  },
  "context": {
    "narrativeTimeline": {},   // Key dates from EXPOSED tokens only
    "sessionTimeline": {},     // Transaction times from BURIED layer
    "playerFocus": {},         // Summarized themes
    "sessionMetadata": {}
  },
  "curationReport": {
    "included": [
      {
        "name": "...",
        "score": 3,
        "criteriaMatched": ["tokenCorroboration", "suspectRelevance"],
        "relevanceNote": "Why this supports the narrative"
      }
    ],
    "excluded": [
      {
        "name": "...",
        "score": 1,
        "reason": "puzzleArtifact" | "insufficientConnection" | "tangentialThread" | "minimalContent" | "containerOnly",
        "note": "Brief explanation",
        "rescuable": true | false
      }
    ],
    "curationSummary": {
      "totalUnlocked": 0,
      "totalCurated": 0,
      "totalExcluded": 0,
      "rosterPlayers": [...],
      "tokenCharacters": [...],
      "suspects": [...],
      "activeNarrativeThreads": [...]
    }
  },
  "curatorNotes": {
    "dispositionSummary": "X exposed, Y buried, Z unknown tokens",
    "curationRationale": "High-level explanation of curation decisions",
    "boundaryCheck": "Confirm no buried content leaked, no excluded items in exposed layer"
  }
}

NOTE ON RESCUABLE FLAG:
- Set rescuable: true for items excluded due to low score but with some merit
- Set rescuable: false for puzzle artifacts or empty content (no narrative value)
- Human can override rescuable items at the checkpoint`;

  const userPrompt = `Curate evidence for this session.

═══════════════════════════════════════════════════════════════════════════════
ROSTER (Active players this session)
═══════════════════════════════════════════════════════════════════════════════

${JSON.stringify(rosterNames, null, 2)}

These are the humans who played. Paper evidence owned by roster players gets +1.

═══════════════════════════════════════════════════════════════════════════════
PLAYER FOCUS (What players investigated and concluded)
═══════════════════════════════════════════════════════════════════════════════

${JSON.stringify(preprocessed.playerFocus || state.playerFocus || {}, null, 2)}

Suspects and whiteboard conclusions drive narrative priority.

═══════════════════════════════════════════════════════════════════════════════
ACCUSATION CONTEXT
═══════════════════════════════════════════════════════════════════════════════

${JSON.stringify(accusationContext, null, 2)}

Paper evidence about accused characters gets +2.

═══════════════════════════════════════════════════════════════════════════════
PREPROCESSED EVIDENCE (${preprocessed.items.length} items)
═══════════════════════════════════════════════════════════════════════════════

MEMORY TOKENS (sourceType: "memory-token"):
- Route by disposition: exposed → full content, buried → transaction only, unknown → exclude

PAPER EVIDENCE (sourceType: "paper-evidence"):
- All items are UNLOCKED (director confirmed)
- Score each item against criteria (roster +1, token corroboration +2, suspect +2, theme +1, substantive +1)
- Include if score >= 2 AND no automatic exclusion applies
- For excluded items, set rescuable: true if there's any narrative merit

ITEMS:
${JSON.stringify(preprocessed.items, null, 2)}

═══════════════════════════════════════════════════════════════════════════════
CURATION CHECKLIST
═══════════════════════════════════════════════════════════════════════════════

Before finalizing:

[ ] EXPOSED tokens have full content (no summarization)
[ ] BURIED tokens have ONLY transaction data (no owner/content)
[ ] UNKNOWN tokens excluded entirely
[ ] Paper evidence in exposed.paperEvidence scored >= 2
[ ] Excluded items have reason + rescuable flag
[ ] curationReport.curationSummary.rosterPlayers matches input roster
[ ] curationReport.curationSummary.tokenCharacters derived from exposed token owners/refs
[ ] No puzzle-only artifacts in exposed.paperEvidence
[ ] Container props excluded, their contents evaluated separately`

  // Use Opus for judgment-heavy curation task with 10-minute timeout
  const evidenceBundle = await sdk({
    prompt: userPrompt,
    systemPrompt,
    model: 'opus',
    timeoutMs: 10 * 60 * 1000, // 10 minutes for Opus curation
    label: `Curating ${preprocessed.items.length} evidence items (Opus)`,
    jsonSchema: {
      type: 'object',
      properties: {
        exposed: {
          type: 'object',
          properties: {
            tokens: { type: 'array' },
            paperEvidence: { type: 'array' }
          },
          required: ['tokens', 'paperEvidence']
        },
        buried: {
          type: 'object',
          properties: {
            transactions: { type: 'array' },
            relationships: { type: 'array' }
          },
          required: ['transactions']
        },
        context: { type: 'object' },
        curationReport: {
          type: 'object',
          properties: {
            included: { type: 'array' },
            excluded: { type: 'array' },
            curationSummary: { type: 'object' }
          },
          required: ['included', 'excluded', 'curationSummary']
        },
        curatorNotes: { type: 'object' }
      },
      required: ['exposed', 'buried', 'context', 'curationReport']
    }
  });

  // Post-processing: Ensure structure integrity
  if (evidenceBundle.exposed) {
    // Initialize arrays if missing
    if (!evidenceBundle.exposed.tokens) evidenceBundle.exposed.tokens = [];
    if (!evidenceBundle.exposed.paperEvidence) evidenceBundle.exposed.paperEvidence = [];

    // Find paper evidence items that were incorrectly placed in tokens
    const tokensToMove = evidenceBundle.exposed.tokens.filter(item =>
      item.sourceType === 'paper-evidence' || item.originalType?.includes('Paper')
    );

    if (tokensToMove.length > 0) {
      // Move them to paperEvidence
      evidenceBundle.exposed.paperEvidence.push(...tokensToMove);
      evidenceBundle.exposed.tokens = evidenceBundle.exposed.tokens.filter(item =>
        item.sourceType !== 'paper-evidence' && !item.originalType?.includes('Paper')
      );
      console.log(`[curateEvidenceBundle] Post-processing: Moved ${tokensToMove.length} paper evidence items from tokens to paperEvidence`);
    }
  }

  // Initialize curationReport if missing (safety fallback)
  if (!evidenceBundle.curationReport) {
    console.warn('[curateEvidenceBundle] Warning: curationReport missing from Opus response, creating stub');
    evidenceBundle.curationReport = {
      included: evidenceBundle.exposed?.paperEvidence?.map(item => ({
        name: item.name,
        score: 2,
        criteriaMatched: ['fallback'],
        relevanceNote: 'Included by Opus but curation details missing'
      })) || [],
      excluded: [],
      curationSummary: {
        totalUnlocked: paperCount,
        totalCurated: evidenceBundle.exposed?.paperEvidence?.length || 0,
        totalExcluded: 0,
        rosterPlayers: rosterNames,
        tokenCharacters: [],
        suspects: suspects,
        activeNarrativeThreads: []
      }
    };
  }

  // Debug logging for curation results
  const tokensCount = evidenceBundle.exposed?.tokens?.length || 0;
  const curatedCount = evidenceBundle.exposed?.paperEvidence?.length || 0;
  const excludedCount = evidenceBundle.curationReport?.excluded?.length || 0;
  const transactionsCount = evidenceBundle.buried?.transactions?.length || 0;
  const rescuableCount = evidenceBundle.curationReport?.excluded?.filter(e => e.rescuable === true)?.length || 0;

  console.log(`[curateEvidenceBundle] Complete:`);
  console.log(`  - Tokens: ${tokensCount} exposed, ${transactionsCount} buried`);
  console.log(`  - Paper Evidence: ${curatedCount} curated, ${excludedCount} excluded (${rescuableCount} rescuable)`);
  if (evidenceBundle.curationReport?.curationSummary) {
    const summary = evidenceBundle.curationReport.curationSummary;
    console.log(`  - Roster: ${summary.rosterPlayers?.join(', ') || 'unknown'}`);
    console.log(`  - Suspects: ${summary.suspects?.join(', ') || 'none'}`);
    console.log(`  - Active threads: ${summary.activeNarrativeThreads?.join(', ') || 'unknown'}`);
  }

  // Build cache of excluded items for rescue mechanism
  // Maps item name → full preprocessed item data so rescue doesn't require lookup
  const _excludedItemsCache = {};
  const excludedNames = new Set(
    (evidenceBundle.curationReport?.excluded || []).map(e => e.name)
  );

  for (const item of preprocessed.items) {
    if (item.sourceType === 'paper-evidence' && excludedNames.has(item.name)) {
      _excludedItemsCache[item.name] = item;
    }
  }

  console.log(`[curateEvidenceBundle] Built cache for ${Object.keys(_excludedItemsCache).length} excluded items`);

  return {
    evidenceBundle,
    _excludedItemsCache,
    currentPhase: PHASES.CURATE_EVIDENCE,
    awaitingApproval: true,
    approvalType: APPROVAL_TYPES.EVIDENCE_AND_PHOTOS
  };
}

/**
 * Process rescued paper evidence items after human approval
 *
 * When user approves the evidence-and-photos checkpoint, they can optionally
 * specify items to "rescue" from the excluded list. This node moves those
 * items into the curated set before arc analysis.
 *
 * Uses _excludedItemsCache (built by curateEvidenceBundle) for reliable lookup.
 * Reports warnings via _rescueWarnings for items that couldn't be rescued.
 *
 * @param {Object} state - Current state with evidenceBundle, _rescuedItems, _excludedItemsCache
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with modified evidenceBundle, cleared temp state
 */
async function processRescuedItems(state, config) {
  const rescuedItems = state._rescuedItems;

  // Skip if no rescued items
  if (!rescuedItems || !Array.isArray(rescuedItems) || rescuedItems.length === 0) {
    return {};
  }

  // Safety check: evidenceBundle must exist
  if (!state.evidenceBundle) {
    console.warn('[processRescuedItems] No evidenceBundle in state, skipping rescue');
    return {
      _rescuedItems: null,
      _excludedItemsCache: null,
      _rescueWarnings: [{ item: '*', reason: 'No evidence bundle in state' }]
    };
  }

  const { evidenceBundle, _excludedItemsCache } = state;
  const curationReport = evidenceBundle.curationReport || { included: [], excluded: [] };
  const excludedByName = new Map(
    (curationReport.excluded || []).map(e => [e.name, e])
  );

  // Track rescue outcomes
  const itemsToRescue = [];
  const remainingExcluded = [];
  const warnings = [];

  // Process each excluded item
  for (const excludedItem of (curationReport.excluded || [])) {
    if (rescuedItems.includes(excludedItem.name)) {
      // User wants to rescue this item - check if rescuable
      if (excludedItem.rescuable === true) {
        itemsToRescue.push(excludedItem);
      } else {
        // Not rescuable - add warning and keep excluded
        const reason = excludedItem.rescuable === false
          ? 'Item marked as not rescuable (no narrative value)'
          : 'Item missing rescuable flag (curation may have excluded for safety)';
        warnings.push({ item: excludedItem.name, reason });
        console.warn(`[processRescuedItems] Item "${excludedItem.name}": ${reason}`);
        remainingExcluded.push(excludedItem);
      }
    } else {
      remainingExcluded.push(excludedItem);
    }
  }

  // Check for items user requested that weren't in excluded list
  const excludedNames = new Set((curationReport.excluded || []).map(e => e.name));
  for (const requestedName of rescuedItems) {
    if (!excludedNames.has(requestedName)) {
      warnings.push({ item: requestedName, reason: 'Item not found in excluded list' });
      console.warn(`[processRescuedItems] Requested item "${requestedName}" not found in excluded list`);
    }
  }

  if (itemsToRescue.length === 0) {
    console.log('[processRescuedItems] No matching rescuable items found');
    return {
      _rescuedItems: null,
      _excludedItemsCache: null,
      _rescueWarnings: warnings.length > 0 ? warnings : null
    };
  }

  // Get full paper evidence data from cache (built by curateEvidenceBundle)
  const rescuedFullItems = [];

  for (const rescueItem of itemsToRescue) {
    // Use cache for reliable lookup (avoids name matching issues)
    const cachedItem = _excludedItemsCache?.[rescueItem.name];

    if (cachedItem) {
      // Add rescue marker to the full item
      rescuedFullItems.push({
        ...cachedItem,
        rescuedByHuman: true
      });
    } else {
      // Fallback: minimal object if cache miss (shouldn't happen)
      warnings.push({
        item: rescueItem.name,
        reason: 'Full item data not found in cache, using minimal data'
      });
      console.warn(`[processRescuedItems] Cache miss for "${rescueItem.name}", using fallback`);
      rescuedFullItems.push({
        name: rescueItem.name,
        score: rescueItem.score,
        note: rescueItem.note,
        sourceType: 'paper-evidence',
        rescuedByHuman: true,
        _incomplete: true
      });
    }
  }

  // Update evidenceBundle
  const updatedBundle = {
    ...evidenceBundle,
    exposed: {
      ...evidenceBundle.exposed,
      paperEvidence: [
        ...(evidenceBundle.exposed?.paperEvidence || []),
        ...rescuedFullItems
      ]
    },
    curationReport: {
      ...curationReport,
      included: [
        ...(curationReport.included || []),
        ...itemsToRescue.map(item => ({
          name: item.name,
          score: 5, // Human override gets high score
          criteriaMatched: ['humanOverride'],
          relevanceNote: `Rescued by human at checkpoint: ${item.note || 'No reason given'}`
        }))
      ],
      excluded: remainingExcluded,
      curationSummary: {
        ...curationReport.curationSummary,
        totalCurated: (curationReport.curationSummary?.totalCurated || 0) + itemsToRescue.length,
        totalExcluded: remainingExcluded.length,
        humanRescued: itemsToRescue.length
      }
    }
  };

  console.log(`[processRescuedItems] Rescued ${itemsToRescue.length} items: ${itemsToRescue.map(i => i.name).join(', ')}`);
  if (warnings.length > 0) {
    console.log(`[processRescuedItems] Warnings: ${warnings.length} issues encountered`);
  }

  return {
    evidenceBundle: updatedBundle,
    _rescuedItems: null,      // Clear the rescue request
    _excludedItemsCache: null, // Clear the cache
    _rescueWarnings: warnings.length > 0 ? warnings : null
  };
}

/**
 * Analyze narrative arcs based on curated evidence
 *
 * Uses Claude to identify narrative arcs weighted by player emphasis.
 * The director's observations from whiteboard drive arc priority.
 *
 * @param {Object} state - Current state with evidenceBundle, directorNotes, sessionConfig
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with narrativeArcs, currentPhase, approval flags
 */
async function analyzeNarrativeArcs(state, config) {
  // Skip if already analyzed and approval cleared (resume case)
  if (state.narrativeArcs && state.narrativeArcs.length > 0 && !state.awaitingApproval) {
    return {
      currentPhase: PHASES.ANALYZE_ARCS
    };
  }

  const sdk = getSdkClient(config);
  const promptBuilder = getPromptBuilder(config);

  // Build session data for prompt builder
  const sessionData = {
    roster: state.sessionConfig?.roster?.map(p => p.name) || [],
    accusation: state.sessionConfig?.accusation?.accused?.join(' and ') || 'Unknown',
    directorNotes: state.directorNotes || {},
    evidenceBundle: state.evidenceBundle || {}
  };

  const { systemPrompt, userPrompt } = await promptBuilder.buildArcAnalysisPrompt(sessionData);

  const arcAnalysis = await sdk({
    prompt: userPrompt,
    systemPrompt,
    model: 'sonnet',
    jsonSchema: {
      type: 'object',
      properties: {
        narrativeArcs: { type: 'array' },
        characterPlacementOpportunities: { type: 'object' },
        rosterCoverage: { type: 'object' },
        heroImageSuggestion: {}
      },
      required: ['narrativeArcs']
    }
  });

  return {
    narrativeArcs: arcAnalysis.narrativeArcs || [],
    currentPhase: PHASES.ANALYZE_ARCS,
    awaitingApproval: true,
    approvalType: APPROVAL_TYPES.ARC_SELECTION,
    // Store full analysis for outline generation
    _arcAnalysisCache: arcAnalysis
  };
}

/**
 * Generate article outline from selected arcs
 *
 * Uses Claude to create structured outline with section placement,
 * evidence cards, photo suggestions, and pull quotes.
 *
 * @param {Object} state - Current state with selectedArcs, evidenceBundle, narrativeArcs
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with outline, currentPhase, approval flags
 */
async function generateOutline(state, config) {
  // Skip if already outlined and approval cleared (resume case)
  if (state.outline && !state.awaitingApproval) {
    return {
      currentPhase: PHASES.GENERATE_OUTLINE
    };
  }

  const sdk = getSdkClient(config);
  const promptBuilder = getPromptBuilder(config);

  // Get arc analysis from cache or reconstruct from narrativeArcs
  const arcAnalysis = state._arcAnalysisCache || {
    narrativeArcs: state.narrativeArcs || [],
    characterPlacementOpportunities: {},
    rosterCoverage: { featured: [], mentioned: [], needsPlacement: [] },
    heroImageSuggestion: null
  };

  // Use first photo as hero image or default
  const heroImage = state.sessionPhotos?.[0]?.filename || 'evidence-board.png';

  const { systemPrompt, userPrompt } = await promptBuilder.buildOutlinePrompt(
    arcAnalysis,
    state.selectedArcs || [],
    heroImage,
    state.evidenceBundle || {}
  );

  const outline = await sdk({
    prompt: userPrompt,
    systemPrompt,
    model: 'sonnet',
    jsonSchema: {
      type: 'object',
      properties: {
        lede: { type: 'object' },
        theStory: { type: 'object' },
        followTheMoney: { type: 'object' },
        thePlayers: { type: 'object' },
        whatsMissing: { type: 'object' },
        closing: { type: 'object' },
        visualComponentCount: { type: 'object' }
      },
      required: ['lede', 'theStory']
    }
  });

  return {
    outline,
    currentPhase: PHASES.GENERATE_OUTLINE,
    awaitingApproval: true,
    approvalType: APPROVAL_TYPES.OUTLINE
  };
}

/**
 * Generate structured ContentBundle from approved outline
 *
 * Uses Claude with JSON schema for structured output.
 * Generates the complete article content in JSON format.
 *
 * @param {Object} state - Current state with outline, evidenceBundle
 * @param {Object} config - Graph config with optional configurable.contentBundleSchema
 * @returns {Object} Partial state update with contentBundle, currentPhase
 */
async function generateContentBundle(state, config) {
  // Skip if content bundle already exists (resume case or pre-populated)
  if (state.contentBundle) {
    return {
      currentPhase: PHASES.GENERATE_CONTENT
    };
  }

  const sdk = getSdkClient(config);
  const promptBuilder = getPromptBuilder(config);

  // Load template for context (optional - article generation can proceed without it)
  const template = await promptBuilder.theme.loadTemplate().catch(err => {
    console.warn(`[generateContentBundle] Template load failed, proceeding without template context: ${err.message}`);
    return '';
  });

  const { systemPrompt, userPrompt } = await promptBuilder.buildArticlePrompt(
    state.outline || {},
    state.evidenceBundle || {},
    template
  );

  // Get JSON schema for structured output
  const contentBundleSchema = config?.configurable?.contentBundleSchema ||
    require('../../schemas/content-bundle.schema.json');

  // SDK returns parsed object directly when jsonSchema is provided
  const generatedContent = await sdk({
    prompt: userPrompt,
    systemPrompt,
    model: 'opus',
    jsonSchema: contentBundleSchema
  });

  // Extract ContentBundle from response (may include voice_self_check)
  // State values take precedence over generated values for metadata
  const contentBundle = generatedContent.html
    ? { ...generatedContent, _voiceSelfCheck: generatedContent.voice_self_check }
    : {
        ...generatedContent,
        metadata: {
          ...generatedContent.metadata,
          sessionId: state.sessionId || generatedContent.metadata?.sessionId,
          theme: state.theme || generatedContent.metadata?.theme || 'journalist',
          generatedAt: new Date().toISOString()
        }
      };

  return {
    contentBundle,
    currentPhase: PHASES.GENERATE_CONTENT
  };
}

/**
 * Validate ContentBundle against JSON schema
 *
 * This is a deterministic validation node (no AI).
 * Uses SchemaValidator to check structure compliance.
 *
 * @param {Object} state - Current state with contentBundle
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with currentPhase, possibly errors
 */
async function validateContentBundle(state, config) {
  const validator = getSchemaValidator(config);

  const result = validator.validate('content-bundle', state.contentBundle);

  if (!result.valid) {
    return {
      currentPhase: PHASES.ERROR,
      errors: result.errors.map(e => ({
        phase: PHASES.VALIDATE_SCHEMA,
        type: 'schema-validation',
        ...e
      }))
    };
  }

  return {
    currentPhase: PHASES.VALIDATE_SCHEMA
  };
}

/**
 * Validate article against voice requirements and anti-patterns
 *
 * Uses Claude to check:
 * - First-person participatory voice
 * - No em-dashes
 * - No game mechanics language
 * - Character roster coverage
 *
 * @param {Object} state - Current state with contentBundle or assembledHtml, sessionConfig
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with validationResults, currentPhase, voiceRevisionCount
 */
async function validateArticle(state, config) {
  const sdk = getSdkClient(config);
  const promptBuilder = getPromptBuilder(config);

  // Get roster for coverage check
  const roster = state.sessionConfig?.roster?.map(p => p.name) || [];

  // Use assembled HTML if available, otherwise stringify contentBundle
  const articleContent = state.assembledHtml ||
    JSON.stringify(state.contentBundle, null, 2);

  const { systemPrompt, userPrompt } = await promptBuilder.buildValidationPrompt(
    articleContent,
    roster
  );

  const validationResults = await sdk({
    prompt: userPrompt,
    systemPrompt,
    model: 'haiku',
    jsonSchema: {
      type: 'object',
      properties: {
        passed: { type: 'boolean' },
        issues: { type: 'array' },
        voice_score: { type: 'number' },
        voice_notes: { type: 'string' },
        roster_coverage: { type: 'object' },
        systemic_critique_present: { type: 'boolean' },
        blake_handled_correctly: { type: 'boolean' }
      },
      required: ['passed', 'issues']
    }
  });

  // Determine next phase based on validation
  const passed = validationResults.passed;
  const currentRevisions = state.voiceRevisionCount || 0;
  const maxRevisions = 2;

  // Calculate new revision count first to align phase with routing logic
  const newRevisionCount = currentRevisions + (passed ? 0 : 1);

  let nextPhase;
  if (passed || newRevisionCount >= maxRevisions) {
    // Complete if passed OR max revisions reached (including this one)
    nextPhase = PHASES.COMPLETE;
  } else {
    nextPhase = PHASES.REVISE_CONTENT;
  }

  return {
    validationResults,
    currentPhase: nextPhase,
    voiceRevisionCount: newRevisionCount
  };
}

/**
 * Revise ContentBundle based on validation feedback
 *
 * Uses Claude to make targeted fixes based on validation issues.
 * Preserves structure while fixing voice/style problems.
 *
 * @param {Object} state - Current state with contentBundle, validationResults
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with contentBundle, currentPhase
 */
async function reviseContentBundle(state, config) {
  const sdk = getSdkClient(config);
  const promptBuilder = getPromptBuilder(config);

  // Build revision prompt from validation feedback
  const voiceSelfCheck = state.validationResults?.voice_notes ||
    state.contentBundle?._voiceSelfCheck ||
    'No specific feedback available';

  const articleContent = state.assembledHtml ||
    JSON.stringify(state.contentBundle, null, 2);

  const { systemPrompt, userPrompt } = await promptBuilder.buildRevisionPrompt(
    articleContent,
    voiceSelfCheck
  );

  const revised = await sdk({
    prompt: userPrompt,
    systemPrompt,
    model: 'sonnet',
    jsonSchema: {
      type: 'object',
      properties: {
        contentBundle: { type: 'object' },
        html: { type: 'string' },
        fixes_applied: { type: 'array' }
      }
    }
  });

  // Update contentBundle or assembledHtml based on response
  const updatedBundle = revised.contentBundle || state.contentBundle;

  return {
    contentBundle: {
      ...updatedBundle,
      _revisionHistory: [
        ...(state.contentBundle?._revisionHistory || []),
        {
          timestamp: new Date().toISOString(),
          fixes: revised.fixes_applied || []
        }
      ]
    },
    assembledHtml: revised.html || state.assembledHtml,
    currentPhase: PHASES.GENERATE_CONTENT
  };
}

// ═══════════════════════════════════════════════════════
// TESTING UTILITIES
// ═══════════════════════════════════════════════════════

// createMockSdkClient and createMockClaudeClient are imported from
// __tests__/mocks/sdk-client.mock.js at the top of this file.
// This consolidation removes ~150 lines of duplicate mock logic.

/**
 * Create a mock PromptBuilder for testing
 *
 * Returns an object that mimics PromptBuilder methods but returns
 * simple test prompts without loading from filesystem.
 *
 * @returns {Object} Mock PromptBuilder instance
 */
function createMockPromptBuilder() {
  const mockTheme = {
    loadTemplate: async () => '<html>{{content}}</html>',
    loadPhasePrompts: async (phase) => ({
      'character-voice': 'Test character voice prompt',
      'evidence-boundaries': 'Test evidence boundaries prompt',
      'narrative-structure': 'Test narrative structure prompt',
      'anti-patterns': 'Test anti-patterns prompt',
      'section-rules': 'Test section rules prompt',
      'editorial-design': 'Test editorial design prompt',
      'formatting': 'Test formatting prompt',
      'writing-principles': 'Test writing principles prompt'
    }),
    validate: async () => ({ valid: true, missing: [] })
  };

  return {
    theme: mockTheme,

    async buildArcAnalysisPrompt(sessionData) {
      return {
        systemPrompt: 'Mock system prompt for arc analysis',
        userPrompt: `Analyze arcs for ${sessionData.roster?.join(', ') || 'unknown roster'}`
      };
    },

    async buildOutlinePrompt(arcAnalysis, selectedArcs, heroImage, evidenceBundle) {
      return {
        systemPrompt: 'Mock system prompt for outline generation',
        userPrompt: `Generate outline for arcs: ${selectedArcs?.join(', ') || 'none selected'}`
      };
    },

    async buildArticlePrompt(outline, evidenceBundle, template) {
      return {
        systemPrompt: 'Mock system prompt for article generation',
        userPrompt: `Generate article from outline with ${Object.keys(outline).length} sections`
      };
    },

    async buildValidationPrompt(articleHtml, roster) {
      return {
        systemPrompt: 'Mock system prompt for validation',
        userPrompt: `Validate article for roster: ${roster?.join(', ') || 'unknown roster'}`
      };
    },

    async buildRevisionPrompt(articleHtml, voiceSelfCheck) {
      return {
        systemPrompt: 'Mock system prompt for revision',
        userPrompt: `Revise based on: ${voiceSelfCheck}`
      };
    }
  };
}

// Default fixture generators for mock client
function getDefaultEvidenceBundle() {
  return {
    exposed: { tokens: [], paperEvidence: [] },
    buried: { transactions: [], relationships: [] },
    context: { timeline: {}, playerFocus: {}, sessionMetadata: {} },
    curatorNotes: { layerRationale: 'Default test bundle', characterCoverage: {} }
  };
}

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

function getDefaultOutline() {
  return {
    lede: { hook: 'Test hook', keyTension: 'Test tension' },
    theStory: { arcs: [] },
    followTheMoney: { shellAccounts: [] },
    thePlayers: { exposed: [], buried: [], pullQuotes: [] },
    whatsMissing: { buriedMarkers: [] },
    closing: { systemicAngle: 'Test angle', accusationHandling: 'Test handling' },
    visualComponentCount: { evidenceCards: 0, photos: 0, pullQuotes: 0, buriedMarkers: 0 }
  };
}

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

function getDefaultRevision() {
  return {
    contentBundle: getDefaultContentBundle(),
    fixes_applied: ['Test fix applied']
  };
}

module.exports = {
  // Node functions
  curateEvidenceBundle,
  processRescuedItems,  // Commit 8.10+: Handle human-rescued paper evidence
  analyzeNarrativeArcs,
  generateOutline,
  generateContentBundle,
  validateContentBundle,
  validateArticle,
  reviseContentBundle,

  // Testing utilities
  createMockSdkClient,
  createMockClaudeClient,  // Backward compatibility alias
  createMockPromptBuilder,

  // Internal functions for testing
  _testing: {
    safeParseJson,
    getSdkClient,
    getPromptBuilder,
    getSchemaValidator,
    getDefaultEvidenceBundle,
    getDefaultArcAnalysis,
    getDefaultOutline,
    getDefaultContentBundle,
    getDefaultValidationResults,
    getDefaultRevision
  }
};

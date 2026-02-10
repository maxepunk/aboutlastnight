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
 * - Use PHASES constants and native interrupt() for checkpoints
 * - Support dependency injection via config.configurable
 *
 * Testing:
 * - Use createMockClaudeClient(fixtures) for mocking AI responses
 * - Use createMockPromptBuilder() for mocking prompt generation
 * - Internal functions exported via _testing
 *
 * See ARCHITECTURE_DECISIONS.md for design rationale.
 */

const { PHASES } = require('../state');
const { CHECKPOINT_TYPES, checkpointInterrupt } = require('../checkpoint-helpers');
const { SchemaValidator } = require('../../schema-validator');
const { createPromptBuilder } = require('../../prompt-builder');
const outlineSchema = require('../../schemas/outline.schema.json');
const contentBundleSchema = require('../../schemas/content-bundle.schema.json');
const {
  safeParseJson,
  getSdkClient,
  ensureArray,
  extractFullContent,
  routeTokensByDisposition,
  buildExposedTokenSummaries,
  buildCurationReport,
  createBatches,
  processWithConcurrency,
  resolveArc,
  buildRevisionContext: buildRevisionContextDRY  // DRY revision context helper
} = require('./node-helpers');
const { traceNode } = require('../../observability');

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

// ═══════════════════════════════════════════════════════════════════════════════
// PAPER EVIDENCE SCORING (Batched Sonnet - Commit 8.11)
// ═══════════════════════════════════════════════════════════════════════════════
//
// These constants and function support the hybrid curation approach:
// - Token routing is done programmatically (no AI needed)
// - Paper evidence scoring uses batched Sonnet calls for speed
// - Final report is assembled programmatically

const PAPER_SCORING_PROMPT = `Score paper evidence items for inclusion in the article.

SCORING CRITERIA (include if total >= 2):
- ROSTER CONNECTION (+1): Owned by or directly involves a roster player
- TOKEN CORROBORATION (+2): Provides supporting detail for an EXPOSED token (same event, relationship, or reveals context)
- SUSPECT RELEVANCE (+2): Features a character on the suspect list or directly relates to the accusation
- THEME ALIGNMENT (+1): Connects to playerFocus themes (whiteboard conclusions, key moments, open questions)
- SUBSTANTIVE CONTENT (+1): Contains quotable narrative content (emails, messages, documents with actual text)

AUTO-EXCLUDE (regardless of score):
- Paper evidence with ONLY puzzle/mechanical content (lock combos, container descriptions)
- Paper evidence with empty or minimal description
- Paper evidence that would introduce entirely NEW narrative threads not touched by exposed tokens, player focus, or suspects

For each item, return:
- id: the item's ID (must match input exactly)
- name: the item's name
- score: total points (0-7)
- include: true if score >= 2 AND no auto-exclude applies
- criteriaMatched: array of criteria names that scored (rosterConnection, tokenCorroboration, suspectRelevance, themeAlignment, substantiveContent)
- relevanceNote: 1-sentence explanation of relevance
- excludeReason: if excluded, one of: puzzleArtifact | insufficientConnection | tangentialThread | minimalContent | containerOnly
- excludeNote: brief explanation if excluded
- rescuable: true if excluded but has some narrative merit (score >= 1)`;

const PAPER_SCORING_SCHEMA = {
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'name', 'score', 'include'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          score: { type: 'integer', minimum: 0, maximum: 7 },
          include: { type: 'boolean' },
          criteriaMatched: { type: 'array', items: { type: 'string' } },
          relevanceNote: { type: 'string' },
          excludeReason: { type: 'string' },
          excludeNote: { type: 'string' },
          rescuable: { type: 'boolean' }
        }
      }
    }
  }
};

/**
 * Score paper evidence items using batched Sonnet calls
 *
 * Part of the hybrid curation approach (Commit 8.11):
 * - Processes paper evidence in batches of 8 items
 * - Runs up to 8 concurrent Sonnet calls
 * - Each batch receives context (roster, suspects, exposed token summaries)
 * - Returns scored items with include/exclude decision and rationale
 *
 * @param {Array} paperItems - Preprocessed paper evidence items
 * @param {Object} context - { roster, suspects, exposedTokenSummaries, playerFocus }
 * @param {Function} sdk - SDK query function from getSdkClient
 * @returns {Array} Scored paper evidence items with { id, name, score, include, criteriaMatched, ... }
 */
async function scorePaperEvidence(paperItems, context, sdk) {
  const { roster, suspects, exposedTokenSummaries, playerFocus } = context;

  if (!paperItems || paperItems.length === 0) {
    console.log('[scorePaperEvidence] No paper items to score');
    return [];
  }

  const batches = createBatches(paperItems, 8);
  console.log(`[scorePaperEvidence] Scoring ${paperItems.length} items in ${batches.length} batches`);

  const results = await processWithConcurrency(batches, 8, async (batch, batchIdx) => {
    // Build batch-specific prompt with context
    const prompt = `Score these ${batch.length} paper evidence items for inclusion:

═══════════════════════════════════════════════════════════════════════════════
CONTEXT FOR SCORING
═══════════════════════════════════════════════════════════════════════════════

ROSTER (Active players this session - +1 for ownership/involvement):
${roster.join(', ') || 'No roster available'}

SUSPECTS (Accused or investigated - +2 for relevance):
${suspects.join(', ') || 'No suspects specified'}

PLAYER FOCUS THEMES (from whiteboard - +1 for alignment):
${JSON.stringify({
  primaryInvestigation: playerFocus?.primaryInvestigation,
  openQuestions: playerFocus?.openQuestions?.slice(0, 5),
  whiteboardNotes: playerFocus?.whiteboardContext?.notes?.slice(0, 3)
}, null, 2)}

EXPOSED TOKEN SUMMARIES (for corroboration scoring - +2 for supporting):
${JSON.stringify(exposedTokenSummaries, null, 2)}

═══════════════════════════════════════════════════════════════════════════════
ITEMS TO SCORE (Batch ${batchIdx + 1}/${batches.length})
═══════════════════════════════════════════════════════════════════════════════

${JSON.stringify(batch.map(p => ({
  id: p.id,
  name: p.name || p.rawData?.name,
  description: (p.rawData?.description || p.summary || '').substring(0, 400),
  owners: p.rawData?.owners || [],
  narrativeThreads: p.rawData?.narrativeThreads || []
})), null, 2)}

Score each item and return the results.`;

    try {
      const response = await sdk({
        prompt,
        systemPrompt: PAPER_SCORING_PROMPT,
        model: 'sonnet',
        timeoutMs: 2 * 60 * 1000,  // 2 minutes per batch
        jsonSchema: PAPER_SCORING_SCHEMA,
        disableTools: true,
        label: `Paper evidence batch ${batchIdx + 1}/${batches.length}`
      });

      return response.items || [];
    } catch (error) {
      console.error(`[scorePaperEvidence] Batch ${batchIdx + 1} failed: ${error.message}`);
      // Return items as excluded on error (recoverable at checkpoint)
      return batch.map(p => ({
        id: p.id,
        // Fallback chain for name to prevent undefined
        name: p.name || p.rawData?.name || p.id || 'Unknown Item',
        score: 0,
        include: false,
        criteriaMatched: [],
        excludeReason: 'scoringError',
        excludeNote: `Scoring failed: ${error.message}`,
        rescuable: true
      }));
    }
  });

  // Flatten results and merge with original data
  const flatResults = results.flat();

  // Map back to original items to preserve rawData
  const mergedResults = flatResults.map(scored => {
    const original = paperItems.find(p => p.id === scored.id);
    if (!original) {
      console.warn(`[scorePaperEvidence] Scored item ID "${scored.id}" not found in original items - rawData may be missing`);
    }
    return {
      ...scored,
      rawData: original?.rawData,
      narrativeThreads: original?.rawData?.narrativeThreads || original?.narrativeThreads
    };
  });

  const includedCount = mergedResults.filter(r => r.include).length;
  const excludedCount = mergedResults.filter(r => !r.include).length;
  console.log(`[scorePaperEvidence] Complete: ${includedCount} included, ${excludedCount} excluded`);

  return mergedResults;
}

/**
 * Curate evidence bundle using hybrid programmatic + batched AI approach
 *
 * Commit 8.11: Refactored from single Opus call to hybrid approach:
 * - Step 1: Programmatic token routing (~10ms) - NO AI NEEDED
 * - Step 2: Batched Sonnet scoring (~30s) - parallel paper evidence scoring
 * - Step 3: Programmatic aggregation (~5ms) - build final report
 *
 * This replaces the previous approach that:
 * - Used single Opus call for all 100+ items
 * - Took ~9.5 minutes and risked timeout at 10 minutes
 * - Failed schema validation on first attempt 50%+ of the time
 *
 * Now completes in ~45 seconds with higher reliability.
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
  // Skip if already curated (resume case)
  if (state.evidenceBundle) {
    console.log('[curateEvidenceBundle] Skipping - evidenceBundle already exists');
    return {
      currentPhase: PHASES.CURATE_EVIDENCE
    };
  }

  const sdk = getSdkClient(config, 'curateEvidence');

  // Use preprocessed evidence (Commit 8.5)
  const preprocessed = state.preprocessedEvidence || {
    items: [],
    playerFocus: state.playerFocus || {}
  };

  // If no preprocessed items, create empty evidence bundle
  if (!preprocessed.items || preprocessed.items.length === 0) {
    console.log('[curateEvidenceBundle] No preprocessed evidence - creating empty bundle');
    const emptyBundle = {
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
    };

    // Interrupt for evidence approval - user reviews evidence bundle and photos
    checkpointInterrupt(
      CHECKPOINT_TYPES.EVIDENCE_AND_PHOTOS,
      { evidenceBundle: emptyBundle },
      null  // No skip - always pause for approval after curation
    );

    return {
      evidenceBundle: emptyBundle,
      currentPhase: PHASES.CURATE_EVIDENCE
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

  // ═══════════════════════════════════════════════════════════════════════════════
  // STEP 1: Extract context for scoring
  // ═══════════════════════════════════════════════════════════════════════════════

  const roster = state.sessionConfig?.roster || [];
  const rosterNames = roster.map(p => typeof p === 'string' ? p : p.name).filter(Boolean);
  const accusationContext = state.directorNotes?.accusationContext || state.playerFocus?.accusation || {};
  const suspects = ensureArray(accusationContext.accused);
  const playerFocus = preprocessed.playerFocus || state.playerFocus || {};

  // Split items by source type
  const tokenItems = preprocessed.items.filter(i => i.sourceType === 'memory-token');
  const paperItems = preprocessed.items.filter(i => i.sourceType === 'paper-evidence');

  console.log(`[curateEvidenceBundle] Processing: ${tokenItems.length} tokens, ${paperItems.length} paper items`);

  // ═══════════════════════════════════════════════════════════════════════════════
  // STEP 2: Programmatic token routing (NO AI - instant)
  // ═══════════════════════════════════════════════════════════════════════════════
  //
  // Token disposition is already tagged during fetchMemoryTokens.
  // This is purely mechanical filtering - no judgment needed.

  const { exposed: exposedTokens, buried: buriedTransactions } = routeTokensByDisposition(tokenItems);
  console.log(`[curateEvidenceBundle] Token routing: ${exposedTokens.length} exposed, ${buriedTransactions.length} buried`);

  // ═══════════════════════════════════════════════════════════════════════════════
  // STEP 3: Build context for paper evidence scoring
  // ═══════════════════════════════════════════════════════════════════════════════
  //
  // Exposed token summaries are included in each scoring batch to enable
  // the +2 TOKEN_CORROBORATION criterion.

  const exposedSummaries = buildExposedTokenSummaries(exposedTokens);

  // ═══════════════════════════════════════════════════════════════════════════════
  // STEP 4: Batched paper evidence scoring (Sonnet, parallel)
  // ═══════════════════════════════════════════════════════════════════════════════
  //
  // 8 items per batch × 8 concurrent = ~30 seconds for 53 items
  // Much faster than single Opus call (~9.5 minutes)

  const scoredPaper = await scorePaperEvidence(paperItems, {
    roster: rosterNames,
    suspects,
    exposedTokenSummaries: exposedSummaries,
    playerFocus
  }, sdk);

  // ═══════════════════════════════════════════════════════════════════════════════
  // STEP 5: Programmatic aggregation (NO AI - instant)
  // ═══════════════════════════════════════════════════════════════════════════════
  //
  // Build curationReport and final bundle structure programmatically.
  // This replaces Opus-generated report with faster, more reliable approach.

  const includedPaper = scoredPaper.filter(p => p.include);
  const curationReport = buildCurationReport(scoredPaper, exposedTokens, {
    roster: rosterNames,
    suspects
  });

  // Assemble final evidence bundle
  const evidenceBundle = {
    exposed: {
      tokens: exposedTokens,
      // Preserve fullContent from preprocessing (Issue 5 fix)
      // DRY: Use extractFullContent() helper for paper evidence (Commit 8.xx)
      // Paper evidence may have content in rawData.description, not fullContent directly
      paperEvidence: includedPaper.map(p => ({
        ...(p.rawData || p),  // Raw fields (name, description, notionId, owners)
        id: p.id,
        fullContent: extractFullContent(p),  // Use helper for fallback chain
        sourceType: 'paper-evidence'
      }))
    },
    buried: {
      transactions: buriedTransactions,
      relationships: []
    },
    context: {
      narrativeTimeline: {},
      sessionTimeline: {},
      playerFocus: playerFocus,
      sessionMetadata: { sessionId: state.sessionId }
    },
    curationReport,
    curatorNotes: {
      dispositionSummary: `${exposedTokens.length} exposed, ${buriedTransactions.length} buried tokens`,
      curationRationale: `Included ${includedPaper.length}/${paperItems.length} paper evidence (score >= 2)`,
      boundaryCheck: 'Programmatic routing ensures no content leakage'
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // STEP 6: Build cache and return
  // ═══════════════════════════════════════════════════════════════════════════════

  // Debug logging for curation results
  const tokensCount = exposedTokens.length;
  const curatedCount = includedPaper.length;
  const excludedCount = curationReport.excluded?.length || 0;
  const transactionsCount = buriedTransactions.length;
  const rescuableCount = curationReport.excluded?.filter(e => e.rescuable === true)?.length || 0;

  console.log(`[curateEvidenceBundle] Complete:`);
  console.log(`  - Tokens: ${tokensCount} exposed, ${transactionsCount} buried`);
  console.log(`  - Paper Evidence: ${curatedCount} curated, ${excludedCount} excluded (${rescuableCount} rescuable)`);
  if (curationReport.curationSummary) {
    const summary = curationReport.curationSummary;
    console.log(`  - Roster: ${summary.rosterPlayers?.join(', ') || 'unknown'}`);
    console.log(`  - Suspects: ${summary.suspects?.join(', ') || 'none'}`);
    console.log(`  - Active threads: ${summary.activeNarrativeThreads?.join(', ') || 'unknown'}`);
  }

  // Build cache of excluded items for rescue mechanism
  // Maps item name → full preprocessed item data so rescue doesn't require lookup
  const _excludedItemsCache = {};
  for (const item of scoredPaper.filter(p => !p.include)) {
    _excludedItemsCache[item.name] = item.rawData || item;
  }

  console.log(`[curateEvidenceBundle] Built cache for ${Object.keys(_excludedItemsCache).length} excluded items`);

  // Interrupt for evidence approval - user reviews evidence bundle and photos
  checkpointInterrupt(
    CHECKPOINT_TYPES.EVIDENCE_AND_PHOTOS,
    { evidenceBundle, _excludedItemsCache },
    null  // No skip - always pause for approval after curation
  );

  return {
    evidenceBundle,
    _excludedItemsCache,
    currentPhase: PHASES.CURATE_EVIDENCE
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
  // Skip if already analyzed (resume case)
  if (state.narrativeArcs && state.narrativeArcs.length > 0) {
    return {
      currentPhase: PHASES.ANALYZE_ARCS
    };
  }

  const sdk = getSdkClient(config, 'analyzeArcs');
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
    disableTools: true,
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
    // Store full analysis for outline generation
    _arcAnalysisCache: arcAnalysis
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ARC EVIDENCE PACKAGES (Phase 1 Fix - Data Wiring)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Helper to extract quotable excerpts from full content
 *
 * @param {string} fullContent - Full text content
 * @returns {Array<string>} Key quotable phrases (max 5)
 */
function extractQuotableExcerpts(fullContent) {
  if (!fullContent || typeof fullContent !== 'string') return [];

  // Split by sentences and filter for quotable ones (10-100 chars, contains dialogue indicators)
  const sentences = fullContent.split(/[.!?]+/).filter(s => s.trim().length >= 10 && s.trim().length <= 100);

  // Prioritize sentences with dialogue indicators or dramatic content
  const quotable = sentences.filter(s =>
    /"/.test(s) ||        // Contains quotes
    /said|told|asked|whispered|shouted/i.test(s) ||  // Dialogue verbs
    /never|always|everything|nothing/i.test(s) ||     // Absolute statements
    /must|have to|need to/i.test(s)                   // Obligation/urgency
  );

  return quotable.slice(0, 5).map(s => s.trim());
}

/**
 * Build per-arc evidence packages after arc selection
 *
 * PHASE 1 FIX: This node extracts curated, per-arc evidence packages with:
 * - Full quotable content (not just 150-char summaries)
 * - Enriched photo analyses for characters in each arc
 * - Key quotable excerpts for pull quotes
 *
 * Runs after arc selection checkpoint, before outline generation.
 *
 * @param {Object} state - Current state with selectedArcs, evidenceBundle, photoAnalyses
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with arcEvidencePackages
 */
async function buildArcEvidencePackages(state, config) {
  // Skip if already built (resume case)
  if (state.arcEvidencePackages && state.arcEvidencePackages.length > 0) {
    console.log('[buildArcEvidencePackages] Skipping - packages already exist');
    return { currentPhase: PHASES.BUILD_ARC_PACKAGES };
  }

  const selectedArcIds = state.selectedArcs || [];
  const allArcs = state.narrativeArcs || [];
  const evidenceBundle = state.evidenceBundle || { exposed: { tokens: [], paperEvidence: [] } };
  const photoAnalyses = state.photoAnalyses || { analyses: [] };

  console.log(`[buildArcEvidencePackages] Building packages for ${selectedArcIds.length} selected arcs`);

  // Resolve arc IDs to full arc objects using helper (DRY - Commit 8.25)
  const packages = selectedArcIds.map(arcIdOrObj => {
    const arc = resolveArc(arcIdOrObj, allArcs);

    if (!arc) {
      console.log(`[buildArcEvidencePackages] Warning: arc "${arcIdOrObj}" not found in narrativeArcs`);
      return null;
    }
    // Extract FULL content for this arc's keyEvidence
    // Use Array.isArray to guard against non-array truthy values
    const evidenceItems = (Array.isArray(arc.keyEvidence) ? arc.keyEvidence : []).map(evidenceId => {
      // Look in exposed tokens
      const token = (evidenceBundle.exposed?.tokens || []).find(t =>
        t.id === evidenceId || t.tokenId === evidenceId
      );

      // Look in exposed paper evidence
      const paper = (evidenceBundle.exposed?.paperEvidence || []).find(p =>
        p.id === evidenceId || p.notionId === evidenceId || p.pageId === evidenceId || p.name === evidenceId
      );

      const item = token || paper;
      if (!item) {
        console.log(`[buildArcEvidencePackages] Warning: keyEvidence ${evidenceId} not found in bundle`);
        return null;
      }

      // DRY: Use extractFullContent() helper for verbatim content
      const fullContent = extractFullContent(item);

      return {
        id: evidenceId,
        type: token ? 'memory' : 'paper',
        owner: item.owner || item.ownerLogline || item.owners?.[0] || null,
        summary: item.summary || item.description?.substring(0, 150) || '',
        fullContent: fullContent,
        quotableExcerpts: extractQuotableExcerpts(fullContent)
      };
    }).filter(Boolean);

    // Include enriched photo analyses for characters in this arc
    const arcCharacters = Object.keys(arc.characterPlacements || {});
    const relevantPhotos = (photoAnalyses.analyses || [])
      .filter(p => {
        const photoCharacters = p.identifiedCharacters || p.characterDescriptions || [];
        return photoCharacters.some(c => {
          const charName = typeof c === 'string' ? c : c?.name || c?.description || '';
          return arcCharacters.some(ac => charName?.toLowerCase().includes(ac.toLowerCase()));
        });
      })
      .map(p => ({
        filename: p.filename,
        characters: p.identifiedCharacters || p.characterDescriptions?.map(c => typeof c === 'string' ? c : c.name) || [],
        enrichedCaption: p.finalCaption || p.captionSuggestion || '',
        emotionalTone: p.emotionalTone || '',
        storyRelevance: p.storyRelevance || '',
        visualContext: p.enrichedVisualContent || p.visualContent || ''
      }));

    console.log(`[buildArcEvidencePackages] Arc "${arc.title}": ${evidenceItems.length} evidence items, ${relevantPhotos.length} photos`);

    return {
      arcId: arc.id,
      arcTitle: arc.title,
      arcSource: arc.arcSource,
      evidenceStrength: arc.evidenceStrength,
      evidenceItems,  // Named to match prompt-builder.js usage
      photos: relevantPhotos,
      characterPlacements: arc.characterPlacements || {},
      analysisNotes: arc.analysisNotes || ''
    };
  }).filter(Boolean);  // Filter out arcs that weren't found in narrativeArcs

  console.log(`[buildArcEvidencePackages] Built ${packages.length} arc evidence packages`);

  return {
    arcEvidencePackages: packages,
    currentPhase: PHASES.BUILD_ARC_PACKAGES
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
  // Skip if already outlined (resume case)
  if (state.outline) {
    return {
      currentPhase: PHASES.GENERATE_OUTLINE
    };
  }

  const sdk = getSdkClient(config, 'generateOutline');
  const promptBuilder = getPromptBuilder(config);

  // Get arc analysis from cache or reconstruct from narrativeArcs
  const arcAnalysis = state._arcAnalysisCache || {
    narrativeArcs: state.narrativeArcs || [],
    characterPlacementOpportunities: {},
    rosterCoverage: { featured: [], mentioned: [], needsPlacement: [] },
    heroImageSuggestion: null
  };

  // Helper to extract filename from photo (handles string path or object)
  const getPhotoFilename = (photo) =>
    typeof photo === 'string' ? photo.split(/[/\\]/).pop() : photo?.filename;

  // Whiteboard is Layer 3 (director) data — exclude from article photos entirely
  const whiteboardFilename = state.whiteboardPhotoPath
    ? getPhotoFilename(state.whiteboardPhotoPath)
    : null;

  // Select hero image: prefer arc analysis suggestion, fallback to first non-whiteboard photo
  // FIX: Previously hardcoded to first photo, ignoring arc analysis (Commit 8.26)
  // FIX: Skip whiteboard when selecting fallback hero
  const arcSuggestion = arcAnalysis?.heroImageSuggestion;
  const fallbackHeroPhoto = (state.sessionPhotos || []).find(
    photo => !whiteboardFilename || getPhotoFilename(photo) !== whiteboardFilename
  );
  const heroImage = arcSuggestion?.filename
    || getPhotoFilename(fallbackHeroPhoto)
    || 'evidence-board.png';

  // Build available photos list with analyses for outline generation (Commit 8.24)
  // FIX: Filter out hero to prevent duplicate usage (Commit 8.26)
  // FIX: Filter out whiteboard — director-layer evidence, not article content
  const availablePhotos = (state.sessionPhotos || [])
    .filter(photo => getPhotoFilename(photo) !== heroImage)  // Exclude hero
    .filter(photo => !whiteboardFilename || getPhotoFilename(photo) !== whiteboardFilename)  // Exclude whiteboard
    .map((photoPath, i) => {
      // Get just the filename from the full path
      const filename = getPhotoFilename(photoPath) || `photo-${i}.jpg`;
      const analysis = state.photoAnalyses?.analyses?.[i] || {};
      return {
        filename,
        fullPath: photoPath,
        characters: analysis.characterDescriptions?.map(c => typeof c === 'string' ? c : c.description) || [],
        visualContent: analysis.visualContent || ''
      };
    });

  // PHASE 1 FIX: Pass arcEvidencePackages with full content and enriched photos
  const arcEvidencePackages = state.arcEvidencePackages || [];

  const { systemPrompt, userPrompt } = await promptBuilder.buildOutlinePrompt(
    arcAnalysis,
    state.selectedArcs || [],
    heroImage,
    state.evidenceBundle || {},
    availablePhotos,  // Available photos
    arcEvidencePackages  // NEW: per-arc curated evidence with fullContent and photos
  );

  const outline = await sdk({
    prompt: userPrompt,
    systemPrompt,
    model: 'opus',  // Commit 8.25: Upgraded from sonnet for quality
    disableTools: true,
    jsonSchema: outlineSchema  // Extracted to lib/schemas/outline.schema.json (Commit 8.25)
  });

  return {
    outline,
    heroImage,  // Persist resolved hero image for article generation
    currentPhase: PHASES.GENERATE_OUTLINE
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REVISION NODE - Targeted outline fixes with previous output context
// ═══════════════════════════════════════════════════════════════════════════════
//
// This node handles outline revisions by providing the FULL previous output
// along with specific feedback from the evaluator. This solves the
// "whack-a-mole" problem where fixing one issue caused regression of
// previously-correct output.
//
// Data flow:
// 1. incrementOutlineRevision preserves outline in _previousOutline, clears outline
// 2. reviseOutline receives _previousOutline + validationResults
// 3. Uses buildRevisionContextDRY helper (DRY) to format context
// 4. Makes targeted fixes, returns new outline, clears _previousOutline

/**
 * Revise outline with previous output context for targeted fixes
 *
 * Called after incrementOutlineRevision when evaluator says outline needs work.
 * Uses the centralized buildRevisionContext helper for DRY formatting.
 *
 * Key difference from generateOutline: receives PREVIOUS OUTPUT + FEEDBACK
 * so it can make targeted fixes instead of regenerating from scratch.
 *
 * @param {Object} state - Current state with _previousOutline, validationResults
 * @param {Object} config - Graph config with SDK client
 * @returns {Object} Partial state update with outline, cleared _previousOutline
 */
async function reviseOutline(state, config) {
  const revisionCount = state.outlineRevisionCount || 0;
  console.log(`[reviseOutline] Starting outline revision ${revisionCount}`);
  const startTime = Date.now();

  // Get previous outline (preserved by incrementOutlineRevision)
  const previousOutline = state._previousOutline;
  if (!previousOutline) {
    // CRITICAL: This should never happen in normal flow.
    // If we're here, incrementOutlineRevision ran with null outline.
    console.error('[reviseOutline] CRITICAL: No previous outline to revise. This indicates incrementOutlineRevision ran with null outline.');
    return {
      outline: null,
      _previousOutline: null,
      _outlineFeedback: null,  // Clear human feedback after consumption
      errors: [{
        phase: PHASES.GENERATE_OUTLINE,
        type: 'revision-no-previous-output',
        message: 'Cannot revise: no previous outline available. Increment node may have run with null outline.',
        timestamp: new Date().toISOString()
      }],
      currentPhase: PHASES.ERROR
    };
  }

  // Build revision context using centralized helper (DRY)
  const { contextSection, previousOutputSection } = buildRevisionContextDRY({
    phase: 'outline',
    revisionCount,
    validationResults: state.validationResults,
    previousOutput: previousOutline,
    humanFeedback: state._outlineFeedback || null
  });

  // Get SDK client and prompt builder
  const sdk = getSdkClient(config, 'reviseOutline');
  const promptBuilder = getPromptBuilder(config);

  // Build revision prompt
  const revisionPrompt = buildOutlineRevisionPrompt(state, contextSection, previousOutputSection, promptBuilder);

  try {
    const result = await sdk({
      prompt: revisionPrompt,
      systemPrompt: getOutlineRevisionSystemPrompt(),
      model: 'opus',  // Same as generateOutline
      jsonSchema: outlineSchema,
      timeoutMs: 5 * 60 * 1000,  // 5 minutes
      disableTools: true,
      label: `Outline revision ${revisionCount}`
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[reviseOutline] Complete: ${result?.theStory?.arcs?.length || 0} arcs in ${duration}s`);

    return {
      outline: result || {},
      _previousOutline: null,  // Clear temporary field after use
      _outlineFeedback: null,  // Clear human feedback after consumption
      currentPhase: PHASES.GENERATE_OUTLINE
    };

  } catch (error) {
    console.error('[reviseOutline] Error:', error.message);

    return {
      outline: null,
      _previousOutline: null,  // Clear temporary field
      _outlineFeedback: null,  // Clear human feedback after consumption
      errors: [{
        phase: PHASES.GENERATE_OUTLINE,
        type: 'outline-revision-failed',
        message: error.message,
        timestamp: new Date().toISOString()
      }],
      currentPhase: PHASES.ERROR
    };
  }
}

/**
 * Get system prompt for outline revision
 * Focuses on TARGETED FIXES, not regeneration
 */
function getOutlineRevisionSystemPrompt() {
  return `You are revising an article outline for an investigative article about "About Last Night".

CRITICAL REVISION RULES:
1. You are IMPROVING an existing outline, not generating from scratch
2. The previous outline is provided - PRESERVE everything that's working well
3. Only modify the specific issues identified in the feedback
4. If a criterion is scoring ≥80%, do NOT change anything related to it
5. Maintain the same overall structure and organization
6. Output complete outline with all required sections

Your goal is TARGETED FIXES that address the evaluator's feedback while preserving all the good work from the previous attempt.

Do NOT:
- Regenerate the outline from scratch (you lose good content)
- Change sections that weren't flagged as issues
- Drop content that was working well
- Introduce new problems while fixing old ones

DO:
- Read the previous outline carefully
- Identify exactly what needs to change
- Make minimal, surgical fixes
- Verify your changes address the feedback
- Return the complete updated outline`;
}

/**
 * Build revision prompt with previous outline and feedback
 *
 * @param {Object} state - Current workflow state
 * @param {string} contextSection - Formatted revision context from helper
 * @param {string} previousOutputSection - Formatted previous output from helper
 * @param {Object} promptBuilder - PromptBuilder instance (unused but kept for consistency)
 * @returns {string} Complete revision prompt
 */
function buildOutlineRevisionPrompt(state, contextSection, previousOutputSection, promptBuilder) {
  const selectedArcs = state.selectedArcs || [];
  const evidenceBundle = state.evidenceBundle || {};
  const arcEvidencePackages = state.arcEvidencePackages || [];

  return `# Outline Revision Request

${contextSection}

## SESSION CONTEXT (Reference Only - Do NOT regenerate)

### Selected Arcs
${JSON.stringify(selectedArcs, null, 2)}

### Evidence Summary
- Exposed tokens: ${evidenceBundle.exposed?.tokens?.length || 0}
- Paper evidence: ${evidenceBundle.exposed?.paperEvidence?.length || 0}
- Arc packages: ${arcEvidencePackages.length}

---

${previousOutputSection}

---

## YOUR TASK

1. Review the PREVIOUS OUTLINE OUTPUT above
2. Review the ISSUES TO ADDRESS in the revision context
3. Make TARGETED FIXES to address those specific issues
4. PRESERVE everything that's working well (high-scoring criteria)
5. Return the complete updated outline in the same JSON format

Remember: You are IMPROVING, not regenerating. The previous work was valuable - preserve what's good while fixing what's broken.`;
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

  const sdk = getSdkClient(config, 'generateContent');
  const promptBuilder = getPromptBuilder(config);

  // Load template for context (optional - article generation can proceed without it)
  const template = await promptBuilder.theme.loadTemplate().catch(err => {
    console.warn(`[generateContentBundle] Template load failed, proceeding without template context: ${err.message}`);
    return '';
  });

  // PHASE 1 FIX: Pass arcEvidencePackages with fullContent for verbatim quoting
  const arcEvidencePackages = state.arcEvidencePackages || [];

  // Phase 3.2: Pre-generation logging - verify fullContent availability
  console.log(`[generateContentBundle] Pre-generation: arcEvidencePackages summary:`);
  arcEvidencePackages.forEach(pkg => {
    const itemCount = pkg.evidenceItems?.length || 0;
    const withFullContent = (pkg.evidenceItems || []).filter(item => item.fullContent && item.fullContent.length > 0).length;
    console.log(`  Arc "${pkg.arcTitle || pkg.arcId}": ${itemCount} items, ${withFullContent} with fullContent`);
    if (withFullContent < itemCount) {
      console.warn(`    ⚠ ${itemCount - withFullContent} items missing fullContent - evidence cards may not render`);
    }
  });

  const { systemPrompt, userPrompt } = await promptBuilder.buildArticlePrompt(
    state.outline || {},
    state.evidenceBundle || {},
    template,
    arcEvidencePackages,  // NEW: per-arc curated evidence with fullContent and photos
    state.heroImage  // Hero image filename (prevents duplicate in photos array)
  );

  // Get JSON schema for structured output
  const contentBundleSchema = config?.configurable?.contentBundleSchema ||
    require('../../schemas/content-bundle.schema.json');

  // SDK returns parsed object directly when jsonSchema is provided
  // Commit 8.23: disableTools prevents tool use during pure generation
  const generatedContent = await sdk({
    prompt: userPrompt,
    systemPrompt,
    model: 'opus',
    jsonSchema: contentBundleSchema,
    disableTools: true
  });

  // Phase 3.2: Post-generation logging - verify visual component counts
  const inlineEvidenceCards = (generatedContent.sections || []).flatMap(s =>
    (s.content || []).filter(c => c.type === 'evidence-card')
  );
  const pullQuoteCount = (generatedContent.pullQuotes || []).length;
  const sidebarCardCount = (generatedContent.evidenceCards || []).length;
  console.log(`[generateContentBundle] Post-generation: Visual components generated:`);
  console.log(`  Inline evidence-cards: ${inlineEvidenceCards.length} (minimum 3 required)`);
  console.log(`  Sidebar evidence cards: ${sidebarCardCount}`);
  console.log(`  Pull quotes: ${pullQuoteCount} (minimum 2 required)`);
  if (inlineEvidenceCards.length < 3) {
    console.warn(`  ⚠ INSUFFICIENT inline evidence-cards - validation will trigger revision loop`);
  }
  if (pullQuoteCount < 2) {
    console.warn(`  ⚠ INSUFFICIENT pull quotes - validation will trigger revision loop`);
  }

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
  const sdk = getSdkClient(config, 'validateArticle');
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
    disableTools: true,
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
 * Called after incrementArticleRevision when evaluator says article needs work.
 * Uses the centralized buildRevisionContext helper for DRY formatting.
 *
 * Key difference from generateContentBundle: receives PREVIOUS OUTPUT + FEEDBACK
 * so it can make targeted fixes instead of regenerating from scratch.
 *
 * @param {Object} state - Current state with _previousContentBundle, validationResults
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with contentBundle, cleared _previousContentBundle
 */
async function reviseContentBundle(state, config) {
  const revisionCount = state.articleRevisionCount || 0;
  console.log(`[reviseContentBundle] Starting article revision ${revisionCount}`);
  const startTime = Date.now();

  // Get previous content bundle (preserved by incrementArticleRevision)
  const previousContentBundle = state._previousContentBundle;
  if (!previousContentBundle) {
    // CRITICAL: This should never happen in normal flow.
    // If we're here, incrementArticleRevision ran with null contentBundle.
    console.error('[reviseContentBundle] CRITICAL: No previous contentBundle to revise. This indicates incrementArticleRevision ran with null contentBundle.');
    return {
      contentBundle: null,
      _previousContentBundle: null,
      _articleFeedback: null,  // Clear human feedback after consumption
      errors: [{
        phase: PHASES.GENERATE_CONTENT,
        type: 'revision-no-previous-output',
        message: 'Cannot revise: no previous contentBundle available. Increment node may have run with null contentBundle.',
        timestamp: new Date().toISOString()
      }],
      currentPhase: PHASES.ERROR
    };
  }

  // Build revision context using centralized helper (DRY)
  const { contextSection, previousOutputSection } = buildRevisionContextDRY({
    phase: 'article',
    revisionCount,
    validationResults: state.validationResults,
    previousOutput: previousContentBundle,
    humanFeedback: state._articleFeedback || null
  });

  const sdk = getSdkClient(config, 'reviseContent');
  const promptBuilder = getPromptBuilder(config);

  // Build revision prompt with full context
  const revisionPrompt = buildArticleRevisionPrompt(state, contextSection, previousOutputSection, promptBuilder);

  try {
    const revised = await sdk({
      prompt: revisionPrompt,
      systemPrompt: getArticleRevisionSystemPrompt(),
      model: 'opus',  // Commit 8.25: Upgraded from sonnet for quality
      disableTools: true,
      jsonSchema: contentBundleSchema,  // Use full schema (Fix 3)
      timeoutMs: 10 * 60 * 1000,  // 10 minutes for Opus
      label: `Article revision ${revisionCount}`
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[reviseContentBundle] Complete in ${duration}s`);

    // Update contentBundle with revision history
    const updatedBundle = revised || previousContentBundle;

    return {
      contentBundle: {
        ...updatedBundle,
        _revisionHistory: [
          ...(previousContentBundle?._revisionHistory || []),
          {
            timestamp: new Date().toISOString(),
            revisionNumber: revisionCount,
            duration: `${duration}s`
          }
        ]
      },
      _previousContentBundle: null,  // Clear temporary field after use
      _articleFeedback: null,  // Clear human feedback after consumption
      currentPhase: PHASES.GENERATE_CONTENT
    };

  } catch (error) {
    console.error('[reviseContentBundle] Error:', error.message);

    return {
      contentBundle: null,
      _previousContentBundle: null,  // Clear temporary field
      _articleFeedback: null,  // Clear human feedback after consumption
      errors: [{
        phase: PHASES.GENERATE_CONTENT,
        type: 'article-revision-failed',
        message: error.message,
        timestamp: new Date().toISOString()
      }],
      currentPhase: PHASES.ERROR
    };
  }
}

/**
 * Get system prompt for article revision
 * Focuses on TARGETED FIXES, not regeneration
 */
function getArticleRevisionSystemPrompt() {
  return `You are revising an investigative article for "About Last Night".

CRITICAL REVISION RULES:
1. You are IMPROVING an existing article, not generating from scratch
2. The previous output represents significant work - PRESERVE what's good
3. Focus ONLY on the specific issues listed in the revision context
4. High-scoring criteria (0.8+) should be left unchanged
5. Low-scoring criteria need targeted fixes

WHAT TO PRESERVE:
- Article structure and flow that's working
- Narrative arcs that are properly developed
- Evidence integration that's accurate
- Voice elements that score well

WHAT TO FIX:
- Only the specific issues mentioned in the feedback
- Low-scoring criteria in the evaluation
- Any anti-patterns flagged by the evaluator

Return the complete revised article in the same JSON format.`;
}

/**
 * Build revision prompt for article with full context
 * @param {Object} state - Current state
 * @param {string} contextSection - Formatted revision context
 * @param {string} previousOutputSection - Formatted previous output
 * @param {Object} promptBuilder - PromptBuilder instance
 * @returns {string} Complete revision prompt
 */
function buildArticleRevisionPrompt(state, contextSection, previousOutputSection, promptBuilder) {
  return `## REVISION CONTEXT

${contextSection}

---

## PREVIOUS ARTICLE OUTPUT (to revise)

${previousOutputSection}

---

## YOUR TASK

1. Review the PREVIOUS ARTICLE OUTPUT above
2. Review the ISSUES TO ADDRESS in the revision context
3. Make TARGETED FIXES to address those specific issues
4. PRESERVE everything that's working well (high-scoring criteria)
5. Return the complete updated article in the same JSON format

Remember: You are IMPROVING, not regenerating. The previous work was valuable - preserve what's good while fixing what's broken.`;
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

module.exports = {
  // Node functions (wrapped with LangSmith tracing)
  curateEvidenceBundle: traceNode(curateEvidenceBundle, 'curateEvidenceBundle', {
    stateFields: ['preprocessedEvidence', 'selectedPaperEvidence']
  }),
  processRescuedItems: traceNode(processRescuedItems, 'processRescuedItems'),
  analyzeNarrativeArcs: traceNode(analyzeNarrativeArcs, 'analyzeNarrativeArcs'),
  buildArcEvidencePackages: traceNode(buildArcEvidencePackages, 'buildArcEvidencePackages', {
    stateFields: ['selectedArcs', 'evidenceBundle', 'photoAnalyses']
  }),
  generateOutline: traceNode(generateOutline, 'generateOutline', {
    stateFields: ['selectedArcs', 'playerFocus']
  }),
  // Revision node - uses previous output context for targeted fixes (DRY)
  reviseOutline: traceNode(reviseOutline, 'reviseOutline', {
    stateFields: ['_previousOutline', 'validationResults']
  }),
  generateContentBundle: traceNode(generateContentBundle, 'generateContentBundle', {
    stateFields: ['outline', 'selectedArcs']
  }),
  validateContentBundle: traceNode(validateContentBundle, 'validateContentBundle'),
  validateArticle: traceNode(validateArticle, 'validateArticle'),
  reviseContentBundle: traceNode(reviseContentBundle, 'reviseContentBundle'),

  // Testing utilities
  createMockPromptBuilder,

  // Internal functions for testing
  _testing: {
    safeParseJson,
    getSdkClient,
    getPromptBuilder,
    scorePaperEvidence,  // Batched Sonnet scoring (Commit 8.11)
    getSchemaValidator
  }
};

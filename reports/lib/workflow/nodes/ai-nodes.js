/**
 * AI Nodes - AI processing nodes for report generation workflow
 *
 * These nodes handle the AI-powered phases of the pipeline:
 * - curateEvidenceBundle: Curate evidence into three-layer structure (1.8)
 * - generateOutline: Generate article outline from selected arcs (3)
 * - generateContentBundle: Generate structured content JSON (4)
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
const { SchemaValidator } = require('../../schema-validator');
const {
  createPromptBuilder,
  buildDirectorGuidanceSection,
  filterGateNotes,
  THEME_SYSTEM_PROMPTS,
  THEME_CONSTRAINTS
} = require('../../prompt-builder');
const { scopeKeys, changedScopes } = require('../../hand-edit-diff');
const outlineSchema = require('../../schemas/outline.schema.json');
const detectiveOutlineSchema = require('../../schemas/detective-outline.schema.json');
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
  pairRepliesWithBatch,  // residual item 8: scored items keyed to their inputs
  resolveArc,
  findUncoveredRosterNames,  // F1 invariant guard: roster names with no canonical match
  buildRevisionContext: buildRevisionContextDRY  // DRY revision context helper
} = require('./node-helpers');
const { traceNode } = require('../../observability');
const { directorAccusationText } = require('../../accusation-verdict');

/**
 * Get PromptBuilder from config or create default
 * Supports dependency injection for testing
 *
 * @param {Object} config - Graph config with optional configurable.promptBuilder
 * @param {Object} state - Graph state with optional theme field
 * @returns {Object} PromptBuilder instance
 */
function getPromptBuilder(config, state) {
  if (config?.configurable?.promptBuilder) return config.configurable.promptBuilder;
  const theme = state?.theme || 'journalist';
  const sessionConfig = state?.sessionConfig || {};
  const canonicalCharacters = state?.canonicalCharacters || null;
  const characterData = state?.characterData?.characters || null;
  return createPromptBuilder({ theme, sessionConfig, canonicalCharacters, characterData });
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
          excludeReason: {
            type: 'string',
            enum: ['puzzleArtifact', 'insufficientConnection', 'tangentialThread', 'minimalContent', 'containerOnly']
          },
          excludeNote: { type: 'string' },
          rescuable: { type: 'boolean' }
        }
      }
    }
  }
};

/**
 * A paper item's name, from the input record: what the scoring prompt shows the model,
 * what the curation report lists and the rescue cache is keyed on.
 *
 * @param {Object} item - a preprocessed paper item
 * @returns {string}
 */
function paperNameOf(item) {
  return item.name || item.rawData?.name || item.rawData?.title || item.id;
}

/** The fields a scoring reply may set: the schema's, less the item's own id and name. */
const PAPER_SCORE_FIELDS = Object.keys(PAPER_SCORING_SCHEMA.properties.items.items.properties)
  .filter(field => field !== 'id' && field !== 'name');

/**
 * A scored paper item: the input's id, name, record and text, with only the scoring
 * fields taken from the model's reply (residual item 8). A reply that echoes another
 * id, name, record or text changes none of them.
 *
 * @param {Object} input - a preprocessed paper item
 * @param {Object|null} reply - the reply placed on it, or null when none was
 * @returns {Object}
 */
function scoredPaperItem(input, reply) {
  const base = {
    id: input.id,
    name: paperNameOf(input),
    rawData: input.rawData,
    // C3: preserve fullContent set by preprocessor for non-buried items.
    // Without this, evidenceBundle.exposed.paperEvidence ends up with empty
    // fullContent and arc evidence cards render with no quotable content.
    fullContent: input.fullContent,
    narrativeThreads: input.rawData?.narrativeThreads || input.narrativeThreads
  };
  if (!reply) {
    // Not scored: the reply named nothing that could be placed on this item. It is
    // kept, not included, and offered for rescue under the reason the evidence stop
    // already shows as "never evaluated — recommend rescue" (EvidenceBundle.js).
    // Before, it vanished from the bundle and from the rescue list.
    return {
      ...base,
      score: null,
      include: false,
      notScored: true,
      rescuable: true,
      excludeReason: 'scoringError',
      excludeNote: 'Not scored: the scoring reply named no item that could be matched to this one.'
    };
  }
  const scoring = {};
  for (const field of PAPER_SCORE_FIELDS) {
    if (reply[field] !== undefined) scoring[field] = reply[field];
  }
  return { ...base, ...scoring };
}

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
  name: paperNameOf(p),
  description: (p.rawData?.description || p.summary || '').substring(0, 400),
  owners: p.rawData?.owners || [],
  narrativeThreads: p.rawData?.narrativeThreads || []
})), null, 2)}

Score each item and return the results.`;

    async function attemptBatch() {
      return await sdk({
        prompt,
        systemPrompt: PAPER_SCORING_PROMPT,
        model: 'sonnet',
        jsonSchema: PAPER_SCORING_SCHEMA,
        disableTools: true,
        label: `Paper evidence batch ${batchIdx + 1}/${batches.length}`,
        loadProjectSettings: false
      });
    }

    // N5 fail-loud + SINGLE retry layer (TRC-2): do NOT swallow a persistent batch
    // failure into scoringError placeholders (that silently drops real exposed
    // evidence and disguises it as "low relevance" at the rescue checkpoint), and do
    // NOT retry in-node — curateEvidenceBundle's graph retryPolicy is the SOLE
    // retrier, so a transient batch failure throws and re-runs the node against the
    // pre-node snapshot (avoids the in-node × graph attempt multiplication). One
    // attempt; on failure it propagates out of the Promise.all and the node throws.
    const response = await attemptBatch();

    // Residual item 8: each reply is placed on this batch's inputs by the
    // preprocessor's rule (by id, else by position, else by elimination), never merged
    // by the id the model echoed. On 092026 Sonnet answered the rescued email's id
    // with "583f-" missing; the old find-by-echoed-id merge kept the model's id and
    // dropped rawData and fullContent, so every <RECORD> printed the email with no text.
    const { replyFor, rejected } = pairRepliesWithBatch(batch, response.items);
    if (rejected.length > 0) {
      console.warn(`[scorePaperEvidence] Batch ${batchIdx + 1}: rejected ${rejected.length} score(s) whose id matched no item unambiguously: ${rejected.map(r => JSON.stringify(r.id)).join(', ')}`);
    }
    const unscored = replyFor.filter(reply => reply === null).length;
    if (unscored > 0) {
      console.warn(`[scorePaperEvidence] Batch ${batchIdx + 1}: ${unscored} item(s) got no score; kept as not scored and rescuable`);
    }
    return batch.map((input, i) => scoredPaperItem(input, replyFor[i]));
  });

  // One scored item per input, in the input order.
  const mergedResults = results.flat();

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

  // N3 fail-loud: empty preprocessed evidence means an upstream fetch/preprocess
  // failure, NOT a legitimate empty session. Returning a polished empty three-layer
  // bundle masks the hole and the generator authors an article with zero grounding.
  // Throw so retryPolicy/operator recovery handles it against the pre-node snapshot.
  if (!preprocessed.items || preprocessed.items.length === 0) {
    throw new Error(
      '[curateEvidenceBundle] No preprocessed evidence to curate — upstream ' +
      'fetch/preprocess produced zero items. Refusing to emit an empty bundle.'
    );
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

  const exposedSummaries = buildExposedTokenSummaries(exposedTokens, state.canonicalCharacters || {});

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
        sourceType: 'paper-evidence',
        temporalContext: 'BACKGROUND'
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
  // Maps item name → full preprocessed item data so rescue doesn't require lookup.
  // Keyed on the INPUT item's own name, the one the curation report lists and the
  // rescue sends back (residual item 8): scoredPaperItem never takes a name the
  // model echoed.
  const _excludedItemsCache = {};
  for (const item of scoredPaper.filter(p => !p.include)) {
    _excludedItemsCache[item.name] = item.rawData || item;
  }

  console.log(`[curateEvidenceBundle] Built cache for ${Object.keys(_excludedItemsCache).length} excluded items`);

  return {
    evidenceBundle,
    _excludedItemsCache,
    memoryTokens: null,          // Prune: data now in evidenceBundle.exposed.tokens
    paperEvidence: null,          // Prune: data now in evidenceBundle.exposed.paperEvidence
    preprocessedEvidence: null,   // Prune: consumed to build evidenceBundle
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
        temporalContext: 'BACKGROUND',
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

  // C5 / H18: an empty selection here means the run has lost its arcs — either an
  // old-graph thread resumed into the new edge chain, or a state clear went wrong.
  // Emitting `arcEvidencePackages: []` let generateOutline (guarded only on
  // state.outline) spend a Sonnet call and evaluateOutline an Opus call on an
  // outline for no arcs. Brief 1.4 removed the one exception this guard carried:
  // the arc stop's forced forward at the fourth send back, which existed only to
  // end the director's rounds and which paid for exactly that outline.
  if (!state.selectedArcs?.length) {
    throw new Error(
      '[buildArcEvidencePackages] No selected arcs. Refusing to package zero arcs and pay for ' +
      'an outline about nothing. Roll back to arc-selection and choose arcs.'
    );
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

  // C3 invariant: every evidence item routed to an arc package should have
  // fullContent populated. If any are empty, surface loudly so we can trace
  // back to which preserve-merge point failed.
  let emptyContentCount = 0;
  for (const pkg of packages) {
    for (const item of pkg.evidenceItems || []) {
      if (!item.fullContent || item.fullContent.length === 0) {
        emptyContentCount++;
      }
    }
  }
  if (emptyContentCount > 0) {
    console.error(
      `[buildArcEvidencePackages] INVARIANT VIOLATION: ${emptyContentCount} evidence items routed to arcs lack fullContent. ` +
      `Evidence cards will render empty. Check preprocessor and scorePaperEvidence merge for field stripping.`
    );
  }

  console.log(`[buildArcEvidencePackages] Built ${packages.length} arc evidence packages`);

  return {
    arcEvidencePackages: packages,
    // C5: prune consumed state to reduce checkpoint size and LangSmith trace pressure.
    // preprocessedEvidence is consumed by curateEvidenceBundle (already pruned there)
    // but we re-prune defensively in case state was rehydrated from an older checkpoint.
    // Note: photoAnalyses.analyses is INTENTIONALLY not pruned here — evaluateOutline
    // reads state.photoAnalyses?.analyses downstream (see evaluator-nodes.js).
    preprocessedEvidence: null,
    currentPhase: PHASES.BUILD_ARC_PACKAGES
  };
}

/**
 * The previous stage's advisory findings, for the next writer (brief 1.3).
 *
 * The evaluation's advisory warnings used to die where they were computed: the
 * outline evaluation's two warnings about frontloading never reached the article
 * writer, and the arc evaluation's never reached the outline writer. They travel as
 * suggestions, in their own <SHOULD_CONSIDER> section, never as must-fix items.
 *
 * validationResults is one channel shared by all three phases, so the phase stamp is
 * the guard: a block left behind by another stage is ignored rather than handed to a
 * writer it was not written about.
 *
 * @param {Object} state - Current state
 * @param {string} previousPhase - The phase whose evaluation feeds this writer
 * @returns {string[]} advisoryWarnings, or [] when the stamp does not match
 */
function advisoriesFromPreviousStage(state, previousPhase) {
  const results = state.validationResults;
  if (!results || results.phase !== previousPhase) return [];
  return Array.isArray(results.advisoryWarnings) ? results.advisoryWarnings : [];
}

/**
 * SESSION_FACTS for the outline and article writers (RC3 guardrail; phase 2, brief 2.2).
 *
 * One builder for both writers: the two copies this replaced printed only
 * `ACCUSATION: <accused>`, so an overdose verdict reached the writers as
 * `ACCUSATION: Marcus`, with no charge. The facts now carry the parsed accusation
 * whole (accused, charge, verdict kind, and since phase 3 (brief 3.5) a split final
 * vote), the director's accusation word for word, and the whiteboard parse;
 * renderSessionFactsVerdict (director-words-renderer.js) prints them.
 *
 * @param {Object} state
 * @returns {Object|null} null when there is no roster
 */
function buildSessionFacts(state) {
  const roster = state.sessionConfig?.roster || [];
  const canonicalChars = state.canonicalCharacters || {};
  // F1 invariant: every roster PC must resolve to a canonicalCharacters entry, or
  // generateRosterSection silently drops their pronoun + canonical surname (they/them).
  // This holds ONLY because fetchMemoryTokens fetches ALL tokens (scannedTokens is never
  // set). If that ever changes — or a director enters a non-character name — warn loudly.
  const uncoveredRoster = findUncoveredRosterNames(roster, canonicalChars);
  if (uncoveredRoster.length > 0) {
    console.warn(`[F1] roster names with no canonical match (pronoun/surname will default to they/them): ${uncoveredRoster.join(', ')}`);
  }
  if (roster.length === 0) return null;
  const accusation = state.sessionConfig?.accusation || {};
  return {
    roster: roster.map(p => {
      const name = p.name || p;
      return canonicalChars[name] || name;
    }),
    accusation: {
      accused: ensureArray(accusation.accused),
      charge: accusation.charge || '',
      ...(accusation.verdictKind && { verdictKind: accusation.verdictKind }),
      ...(Array.isArray(accusation.votes) && { votes: accusation.votes })
    },
    accusationText: directorAccusationText(state),
    whiteboard: state.playerFocus?.whiteboardContext || null,
    playerCount: roster.length
  };
}

/**
 * The photos the outline writer may place, beyond the hero (phase 2, brief 2.2).
 *
 * Each carries its filename and the names the director identified in it. The
 * writer's text about the photo is the director's own description, which the prompt
 * builder joins by filename (options.photoDescriptions); Haiku's pre-identification
 * descriptions no longer go to the writer.
 *
 * @param {Object} state
 * @param {string} heroImage - excluded (it has its own slot)
 * @param {string|null} whiteboardFilename - excluded (director-layer evidence)
 * @returns {Array<{filename: string, fullPath: string, identifiedCharacters: string[]}>}
 */
function buildAvailablePhotos(state, heroImage, whiteboardFilename) {
  const getPhotoFilename = (photo) =>
    typeof photo === 'string' ? photo.split(/[/\\]/).pop() : photo?.filename;
  // FIX (brief 1.6): join the analyses by FILENAME, not by array position. The two
  // filters below remove the hero (always) and the whiteboard (usually), so
  // analyses[i] read the wrong analysis for every photo after the first removal.
  // Basename, case-insensitive, the way the console's photoUrl matches.
  const analysisByFilename = new Map(
    (state.photoAnalyses?.analyses || [])
      .filter(a => a?.filename)
      .map(a => [String(a.filename).split(/[/\\]/).pop().toLowerCase(), a])
  );
  return (state.sessionPhotos || [])
    .filter(photo => getPhotoFilename(photo) !== heroImage)  // Exclude hero
    .filter(photo => !whiteboardFilename || getPhotoFilename(photo) !== whiteboardFilename)  // Exclude whiteboard
    .map((photoPath, i) => {
      const filename = getPhotoFilename(photoPath) || `photo-${i}.jpg`;
      const analysis = analysisByFilename.get(filename.toLowerCase()) || {};
      return {
        filename,
        fullPath: photoPath,
        identifiedCharacters: Array.isArray(analysis.identifiedCharacters) ? analysis.identifiedCharacters : []
      };
    });
}

/** A photo's filename, from a path string or a photo object. */
function photoFilenameOf(photo) {
  return typeof photo === 'string' ? photo.split(/[/\\]/).pop() : photo?.filename;
}

/**
 * The whiteboard photo's filename, or null. The whiteboard is Layer 3 (director)
 * data and is excluded from the article photos entirely.
 *
 * @param {Object} state
 * @returns {string|null}
 */
function whiteboardFilenameOf(state) {
  return state.whiteboardPhotoPath ? photoFilenameOf(state.whiteboardPhotoPath) : null;
}

/**
 * The hero image the outline writer is given: the photo with the most identified
 * characters, else the first non-whiteboard photo.
 *
 * generateOutline selects it and stores it in state.heroImage. The outline reworker
 * reads that (phase 2, 2.3) and selects again only when it is missing.
 *
 * @param {Object} state
 * @returns {string} filename
 */
function selectHeroImage(state) {
  const getPhotoFilename = photoFilenameOf;
  const whiteboardFilename = whiteboardFilenameOf(state);

  // Select hero image: prefer largest group photo, fallback to first non-whiteboard photo
  // Group photos better represent the ensemble cast as hero images
  const nonWhiteboardPhotos = (state.sessionPhotos || []).filter(
    photo => !whiteboardFilename || getPhotoFilename(photo) !== whiteboardFilename
  );

  let heroImage;
  const analyses = state.photoAnalyses?.analyses || [];
  if (analyses.length > 0 && nonWhiteboardPhotos.length > 0) {
    // Score each photo by number of identified characters (more = better group photo)
    // Uses identifiedCharacters (post-enrichment) with characterDescriptions as fallback
    const scored = nonWhiteboardPhotos.map(photo => {
      const filename = getPhotoFilename(photo);
      const analysis = analyses.find(a => a.filename === filename);
      // identifiedCharacters = enriched name strings, characterDescriptions = pre-enrichment objects
      const characterCount = analysis?.identifiedCharacters?.length
        || analysis?.characterDescriptions?.length
        || 0;
      return { photo, filename, characterCount };
    });
    // Sort by character count descending, take first
    scored.sort((a, b) => b.characterCount - a.characterCount);
    heroImage = scored[0]?.filename || getPhotoFilename(nonWhiteboardPhotos[0]) || 'evidence-board.png';
    console.log(`[generateOutline] Hero image selected: ${heroImage} (${scored[0]?.characterCount || 0} characters identified)`);
  } else {
    heroImage = getPhotoFilename(nonWhiteboardPhotos[0]) || 'evidence-board.png';
    console.log(`[generateOutline] Hero image fallback: ${heroImage} (no photo analyses available)`);
  }
  return heroImage;
}

/**
 * The outline writer's inputs, read from state: buildOutlinePrompt's arguments, in
 * order (phase 2, brief 2.3).
 *
 * One function for the writer and its reworker, so the reworker's prompt is built
 * from exactly what the writer's was. Two of these are computed and never stored,
 * the available photos and the session facts; both are recomputed here from the
 * same state by the writer's own builders (buildAvailablePhotos, buildSessionFacts).
 *
 * @param {Object} state
 * @param {string} heroImage - the writer's hero image
 * @returns {Array} [arcAnalysis, selectedArcs, heroImage, availablePhotos,
 *   arcEvidencePackages, shellAccounts, sessionFacts, options]
 */
function outlineWriterInputs(state, heroImage) {
  // Arc metadata for the outline prompt. The cache carries the ANALYSIS
  // (synthesisNotes, interweavingPlan); the arcs live in their own channel and
  // were never in the cache, so the old `state._arcAnalysisCache || {...}`
  // fallback never fired and <arc-metadata> rendered [] in every real session.
  // `timing`, `architecture` and `interweavingFromPreviousRound` (reviseArcs's note
  // that it kept the previous plan) are our own bookkeeping and are not the model's
  // business (<arc-analysis> dumped them verbatim).
  const { timing, architecture, interweavingFromPreviousRound, ...cache } = state._arcAnalysisCache || {};
  const arcAnalysis = { ...cache, narrativeArcs: state.narrativeArcs || [] };

  // Build available photos list for outline generation (Commit 8.24)
  // FIX: Filter out hero to prevent duplicate usage (Commit 8.26)
  // FIX: Filter out whiteboard — director-layer evidence, not article content
  // Brief 2.2: filename + identified names; the prompt adds the director's description.
  const availablePhotos = buildAvailablePhotos(state, heroImage, whiteboardFilenameOf(state));

  return [
    arcAnalysis,
    state.selectedArcs || [],
    heroImage,
    availablePhotos,  // Available photos
    state.arcEvidencePackages || [],  // per-arc document ids, quotable excerpts and photos
    state.shellAccounts || [],  // Deterministic shell account data for financial summary
    // Session facts: one builder for the outline and the article (RC3 guardrail, brief 2.2)
    buildSessionFacts(state),
    // Q2: arc-selection emphasis; spec 2026-09-19 §5.3: the standing gate notes;
    // brief 1.5: the director's raw notes, which only the article writer used to see;
    // brief 1.3: the arc evaluation's advisory findings; brief 2.2: the director's
    // input-review corrections and photo descriptions.
    {
      directorGuidance: state._outlineGuidance || null,
      gateNotes: state.directorGateNotes || [],
      directorNotes: state.directorNotes || null,
      shouldConsider: advisoriesFromPreviousStage(state, 'arcs'),
      evidenceBundle: state.evidenceBundle || null,  // brief 2.1: the record view
      directorCorrections: state.inputReviewCorrections || [],
      photoDescriptions: state.photoDescriptions || null
    }
  ];
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
  const promptBuilder = getPromptBuilder(config, state);

  const heroImage = selectHeroImage(state);

  const { systemPrompt, userPrompt } = await promptBuilder.buildOutlinePrompt(...outlineWriterInputs(state, heroImage));

  const theme = config?.configurable?.theme || 'journalist';
  const activeOutlineSchema = theme === 'detective' ? detectiveOutlineSchema : outlineSchema;

  const outline = await sdk({
    prompt: userPrompt,
    systemPrompt,
    model: 'opus',  // Commit 8.25: Upgraded from sonnet for quality
    disableTools: true,
    jsonSchema: activeOutlineSchema
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

  // Spec 2026-09-19 §4.3: the director's hand edits ride along on EVERY pass of the
  // round. This node never clears them (C3) — the gate does, on approve.
  const handEdits = state._outlineHandEdits || null;
  const theme = config?.configurable?.theme || 'journalist';

  // Build revision context using centralized helper (DRY)
  const { contextSection, previousOutputSection } = buildRevisionContextDRY({
    phase: 'outline',
    revisionCount,
    // Brief 2.3: a send back's banner names the round it opens, as the stop shows it.
    round: (state.humanOutlineRevisionCount || 0) + 1,
    validationResults: state.validationResults,
    previousOutput: previousOutline,
    humanFeedback: state._outlineFeedback || null,
    handEdits,
    theme
  });

  // Get SDK client and prompt builder
  const sdk = getSdkClient(config, 'reviseOutline');
  const promptBuilder = getPromptBuilder(config, state);

  // Spec §5.3 [I10]: the note being acted on is already in the prompt as HUMAN
  // FEEDBACK; on an evaluator-driven pass the slot is null and nothing is excluded.
  // The gate narrows the match to THIS stop's rejection note (phase 1 brief 1.1):
  // an approval note reusing the same sentence must survive.
  const gateNotes = filterGateNotes(state.directorGateNotes, state._outlineFeedback, 'outline');

  const activeOutlineSchema = theme === 'detective' ? detectiveOutlineSchema : outlineSchema;

  try {
    // INSIDE the try: buildOutlineRevisionPrompt loads the writer's craft files and
    // THROWS if any are missing. Outside, that throw escaped as a graph-level
    // rejection instead of this node's error-contract return, which is what clears
    // _previousOutline / _outlineFeedback and leaves the run resumable.
    const revisionPrompt = await buildOutlineRevisionPrompt(state, contextSection, previousOutputSection, promptBuilder, gateNotes, theme);
    const systemPrompt = await buildOutlineRevisionSystemPrompt(promptBuilder, theme);

    const result = await sdk({
      prompt: revisionPrompt,
      systemPrompt,
      model: 'opus',  // Same as generateOutline
      jsonSchema: activeOutlineSchema,
      disableTools: true,
      label: `Outline revision ${revisionCount}`
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const outlineTheme = config?.configurable?.theme || state?.theme || 'journalist';
    const arcCount = outlineTheme === 'detective'
      ? result?.evidenceLocker?.evidenceGroups?.length || 0
      : result?.theStory?.arcs?.length || 0;
    console.log(`[reviseOutline] Complete: ${arcCount} ${outlineTheme === 'detective' ? 'evidence groups' : 'arcs'} in ${duration}s`);

    return {
      outline: result || {},
      _previousOutline: null,  // Clear temporary field after use
      _outlineFeedback: null,  // Clear human feedback after consumption
      // Spec §4.4 (C3): verify on EVERY pass and rewrite the report; never clear
      // _outlineHandEdits here — the checkpoint clears it on approve, the server on reject.
      _outlineHandEditReport: handEdits
        ? { checked: scopeKeys(handEdits), changed: changedScopes(handEdits, result || {}) }
        : null,
      currentPhase: PHASES.GENERATE_OUTLINE
    };

  } catch (error) {
    console.error('[reviseOutline] Error:', error.message);

    // _outlineHandEdits / _outlineHandEditReport are deliberately NOT returned: this
    // routes to ERROR and never reaches a gate, so the previous pass's report is read
    // by nobody, and clearing it would lose it for a rollback that replays from here.
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
 * A reworker's system prompt starts with its writer's (phase 2, 2.3). The two
 * rework composers below used to take a theme name, so an old call would now
 * compose a prompt that opens with the word "journalist": fail loud instead.
 *
 * @param {*} writerSystemPrompt
 * @param {string} caller - the composing function, for the message
 * @param {string} builder - the PromptBuilder method that builds the writer's
 */
function assertWriterSystemPrompt(writerSystemPrompt, caller, builder) {
  if (typeof writerSystemPrompt !== 'string' || !writerSystemPrompt.includes('\n')) {
    throw new Error(
      `${caller} takes the writer's system prompt (PromptBuilder.${builder}()), ` +
      'not a theme name: a reworker is its writer\'s prompt plus the rework rules (brief 2.3)'
    );
  }
}

/**
 * The rules the outline reworker's system prompt adds after its writer's: the
 * journalist's (phase 3, brief 3.3; TH7). Its first line names the task the
 * revision context gives the rework; how much of the previous outline the rework
 * keeps is the revision context's to say, from the director's note
 * (buildRevisionContext), so no fixed "preserve" text is here.
 */
const OUTLINE_REVISION_RULES = 'You are reworking the outline you wrote, for the reason the revision context in the prompt gives: the director\'s note when the director sent it back, or what an automatic check or evaluation found.';

/**
 * The detective's outline rework rules, today's text, parked with its theme (D13).
 */
const DETECTIVE_OUTLINE_REVISION_RULES = `You are REVISING that outline, not writing it from scratch.

CRITICAL REVISION RULES:
1. You are IMPROVING an existing outline, not generating from scratch
2. The previous outline is provided - PRESERVE everything that's working well
3. Only modify the specific issues identified in the feedback
4. Maintain the same overall structure and organization
5. Output complete outline with all required sections

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

/**
 * Get system prompt for outline revision: the outline writer's system prompt, then
 * the rework rules (phase 2, 2.3).
 *
 * The writer's system prompt brings the identity line, the reporting-mode block in
 * its place right after it (brief 1.5: a rework is where a remote outline gets
 * "corrected" back into an on-site one), and the section rules and editorial
 * design the reworker used to go without.
 *
 * @param {string} writerSystemPrompt - PromptBuilder.buildOutlineSystemPrompt()
 * @param {string} [theme='journalist'] - selects the rework rules (outlineRevisionRules)
 * @returns {string}
 */
function getOutlineRevisionSystemPrompt(writerSystemPrompt, theme = 'journalist') {
  assertWriterSystemPrompt(writerSystemPrompt, 'getOutlineRevisionSystemPrompt', 'buildOutlineSystemPrompt');
  return `${writerSystemPrompt}\n\n${outlineRevisionRules(theme)}`;
}

/**
 * The outline rework rules for a theme: the detective keeps today's (D13).
 *
 * @param {string} [theme='journalist']
 * @returns {string}
 */
function outlineRevisionRules(theme = 'journalist') {
  return theme === 'detective' ? DETECTIVE_OUTLINE_REVISION_RULES : OUTLINE_REVISION_RULES;
}

/**
 * The outline reworker's system prompt, built from its writer's builder.
 *
 * @param {Object} promptBuilder - the PromptBuilder the writer used
 * @param {string} [theme='journalist']
 * @returns {Promise<string>}
 */
async function buildOutlineRevisionSystemPrompt(promptBuilder, theme = 'journalist') {
  return getOutlineRevisionSystemPrompt(await promptBuilder.buildOutlineSystemPrompt(), theme);
}

/**
 * The hero image a rework was written against: the one generateOutline stored,
 * else the one it would select.
 */
function reworkHeroImage(state) {
  return state.heroImage || selectHeroImage(state);
}

/**
 * Build revision prompt with previous outline and feedback
 *
 * Phase 2 (2.3): the outline writer's user prompt (every section but its
 * <SHOULD_CONSIDER> and <DIRECTOR_GUIDANCE>), built by the writer's own builder from
 * the writer's own inputs, then the revision block, then <DIRECTOR_GUIDANCE> last.
 * The reworker used to see the selected arc ids and three evidence counts; it now
 * sees the record, the arcs, the photos, the director's notes and the writer's
 * rules, and a later change to the writer reaches it without a second copy.
 *
 * The writer's <SHOULD_CONSIDER> is the arc evaluation's advisories, which the
 * outline evaluation has overwritten by the time a rework runs; the revision
 * context carries the outline evaluation's own.
 *
 * @param {Object} state - Current workflow state
 * @param {string} contextSection - Formatted revision context from helper
 * @param {string} previousOutputSection - Formatted previous output from helper
 * @param {Object} promptBuilder - the PromptBuilder the writer used
 * @param {Array} [gateNotes] - Standing director notes, already filtered (spec §5.3)
 * @param {string} [theme='journalist'] - selects the task (reworkTask)
 * @returns {Promise<string>} Complete revision prompt
 * @throws {Error} when one of the writer's craft files did not load
 */
async function buildOutlineRevisionPrompt(state, contextSection, previousOutputSection, promptBuilder, gateNotes = [], theme = 'journalist') {
  await promptBuilder.requirePhasePrompts('outlineGeneration');
  const writerSections = await promptBuilder.buildOutlineUserSections(
    ...outlineWriterInputs(state, reworkHeroImage(state))
  );
  const guidanceSection = buildDirectorGuidanceSection(state._outlineGuidance, gateNotes);

  return `${writerSections}

---

# Outline Revision Request

${contextSection}

---

${previousOutputSection}

---

${reworkTask('outline', theme)}${guidanceSection ? `\n\n${guidanceSection}` : ''}`;
}

/**
 * The outline and article reworks' task, the last section before <DIRECTOR_GUIDANCE>.
 *
 * The journalist's (phase 3, brief 3.3; TH7) defers to the revision context for what
 * the rework changes and how far; the detective's keeps today's fixed text (D13).
 *
 * @param {'outline'|'article'} phase
 * @param {string} [theme='journalist']
 * @returns {string}
 */
function reworkTask(phase, theme = 'journalist') {
  const PHASE = phase.toUpperCase();
  if (theme !== 'detective') {
    return `## YOUR TASK

1. Rework the PREVIOUS ${PHASE} OUTPUT as the revision context above directs.
2. Return the whole ${phase} in the same JSON format.`;
  }
  return `## YOUR TASK

1. Review the PREVIOUS ${PHASE} OUTPUT above
2. Review the ISSUES TO ADDRESS in the revision context
3. Make TARGETED FIXES to address those specific issues
4. PRESERVE everything that's working well
5. Return the complete updated ${phase} in the same JSON format

Remember: You are IMPROVING, not regenerating. The previous work was valuable - preserve what's good while fixing what's broken.`;
}

/**
 * The article writer's inputs, read from state: buildArticlePrompt's arguments, in
 * order (phase 2, brief 2.3). One function for the writer and its reworker. The
 * session facts are computed and never stored; they are recomputed here by the
 * writer's own builder.
 *
 * @param {Object} state
 * @returns {Array} [outline, arcEvidencePackages, heroImage, shellAccounts,
 *   sessionFacts, directorNotes, narrativeTensions, options]
 */
function articleWriterInputs(state) {
  return [
    state.outline || {},
    state.arcEvidencePackages || [],  // per-arc document ids, quotable excerpts and photos
    state.heroImage,  // Hero image filename (prevents duplicate in photos array)
    state.shellAccounts || [],  // Deterministic shell account data for financial summary
    // Session facts for the non-roster character guardrail (RC3) and the verdict (brief 2.2)
    buildSessionFacts(state),
    state.directorNotes || null,  // RC5: director observations for article grounding
    state.narrativeTensions || null,  // Task F: programmatic contradictions for narrative weaving
    // Q2: arc-selection emphasis; spec 2026-09-19 §5.3: the standing gate notes;
    // brief 1.3: the outline evaluation's advisory findings; brief 2.2: the director's
    // input-review corrections and photo descriptions.
    {
      directorGuidance: state._outlineGuidance || null,
      gateNotes: state.directorGateNotes || [],
      shouldConsider: advisoriesFromPreviousStage(state, 'outline'),
      evidenceBundle: state.evidenceBundle || null,  // brief 2.1: the record view
      directorCorrections: state.inputReviewCorrections || [],
      photoDescriptions: state.photoDescriptions || null
    }
  ];
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
  const promptBuilder = getPromptBuilder(config, state);

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

  const { systemPrompt, userPrompt } = await promptBuilder.buildArticlePrompt(...articleWriterInputs(state));

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

  // Phase 3.2: Post-generation logging — theme-aware visual component checks
  const { getThemeConfig } = require('../../theme-config');
  const articleTheme = config?.configurable?.theme || state.theme || 'journalist';
  const themeDisplay = getThemeConfig(articleTheme)?.display?.postGenValidation || {};
  const minInlineCards = themeDisplay.minInlineEvidenceCards ?? 3;

  const inlineEvidenceCards = (generatedContent.sections || []).flatMap(s =>
    (s.content || []).filter(c => c.type === 'evidence-card')
  );
  const sidebarCardCount = (generatedContent.evidenceCards || []).length;

  console.log(`[generateContentBundle] Post-generation: Visual components generated:`);
  console.log(`  Inline evidence-cards: ${inlineEvidenceCards.length}${minInlineCards > 0 ? ` (minimum ${minInlineCards} required)` : ''}`);
  console.log(`  Sidebar evidence cards: ${sidebarCardCount}`);

  if (minInlineCards > 0 && inlineEvidenceCards.length < minInlineCards) {
    console.warn(`  ⚠ INSUFFICIENT inline evidence-cards — does not meet the inline-card minimum`);
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

  // Populate storyDate from theme config (RC4: in-world date)
  const themeConfig = getThemeConfig(state.theme || 'journalist');
  if (themeConfig?.display?.storyDate) {
    contentBundle.metadata = contentBundle.metadata || {};
    contentBundle.metadata.storyDate = themeConfig.display.storyDate;
  }

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

  // Sanitize: remove empty/whitespace-only paragraph blocks (common AI generation artifact)
  const bundle = state.contentBundle;
  if (bundle?.sections) {
    for (const section of bundle.sections) {
      if (Array.isArray(section.content)) {
        section.content = section.content.filter(block => {
          if (block.type === 'paragraph' && (!block.text || !block.text.trim())) {
            console.log(`[validateContentBundle] Removed empty paragraph from section "${section.id || section.heading}"`);
            return false;
          }
          return true;
        });
      }
    }
  }

  const result = validator.validate('content-bundle', bundle);

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

  // Spec 2026-09-19 §4.3: the director's hand edits ride along on EVERY pass of the
  // round. This node never clears them (C3) — the gate does, on approve.
  const handEdits = state._articleHandEdits || null;
  const theme = config?.configurable?.theme || state?.theme || 'journalist';

  // Build revision context using centralized helper (DRY)
  const { contextSection, previousOutputSection } = buildRevisionContextDRY({
    phase: 'article',
    revisionCount,
    // Brief 2.3: a send back's banner names the round it opens, as the stop shows it.
    round: (state.humanArticleRevisionCount || 0) + 1,
    validationResults: state.validationResults,
    previousOutput: previousContentBundle,
    humanFeedback: state._articleFeedback || null,
    handEdits,
    theme
  });

  const sdk = getSdkClient(config, 'reviseContent');
  const promptBuilder = getPromptBuilder(config, state);

  // Spec §5.3 [I10]: the note being acted on is already in the prompt as HUMAN
  // FEEDBACK; on an evaluator-driven pass the slot is null and nothing is excluded.
  // The gate narrows the match to THIS stop's rejection note (phase 1 brief 1.1):
  // an approval note reusing the same sentence must survive.
  const gateNotes = filterGateNotes(state.directorGateNotes, state._articleFeedback, 'article');

  try {
    // INSIDE the try: buildArticleRevisionPrompt loads the writer's craft files and
    // THROWS if any are missing. Outside, that throw escaped as a graph-level
    // rejection instead of this node's error-contract return, which is what clears
    // _previousContentBundle / _articleFeedback and leaves the run resumable.
    const revisionPrompt = await buildArticleRevisionPrompt(state, contextSection, previousOutputSection, promptBuilder, gateNotes, theme);
    const systemPrompt = await buildArticleRevisionSystemPrompt(promptBuilder, theme);

    const revised = await sdk({
      prompt: revisionPrompt,
      systemPrompt,
      model: 'opus',  // Commit 8.25: Upgraded from sonnet for quality
      disableTools: true,
      jsonSchema: contentBundleSchema,  // Use full schema (Fix 3)
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
      // Spec §4.4 (C3): verify on EVERY pass and rewrite the report; never clear
      // _articleHandEdits here — the checkpoint clears it on approve, the server on reject.
      _articleHandEditReport: handEdits
        ? { checked: scopeKeys(handEdits), changed: changedScopes(handEdits, updatedBundle) }
        : null,
      currentPhase: PHASES.GENERATE_CONTENT
    };

  } catch (error) {
    console.error('[reviseContentBundle] Error:', error.message);

    // _articleHandEdits / _articleHandEditReport are deliberately NOT returned: this
    // routes to ERROR and never reaches a gate, so the previous pass's report is read
    // by nobody, and clearing it would lose it for a rollback that replays from here.
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
 * The rules the article reworker's system prompt adds after its writer's: the
 * theme's revision framing, its revision voice, and the rework rules.
 *
 * The journalist's (phase 3, brief 3.3; TH7): the framing (THEME_SYSTEM_PROMPTS
 * revision, 3.2's string) is the rework's first line and names its task, and the
 * voice follows it. The fixed "preserve" lists and the "WHAT TO FIX" list, which made
 * every low-scoring criterion and every flagged anti-pattern a defect though most
 * criteria are advisory, are gone: the revision context says what the rework changes
 * (buildRevisionContext). The detective keeps today's rules (D13).
 *
 * @param {string} [theme]
 * @returns {string}
 */
function articleRevisionRules(theme = 'journalist') {
  const framing = THEME_SYSTEM_PROMPTS[theme] || THEME_SYSTEM_PROMPTS.journalist;
  const constraints = THEME_CONSTRAINTS[theme] || THEME_CONSTRAINTS.journalist;
  if (theme !== 'detective') {
    return `${framing.revision || framing.articleGeneration}

${constraints.revisionVoice}`;
  }
  return `${framing.revision || framing.articleGeneration}

${constraints.revisionVoice}

CRITICAL REVISION RULES:
1. You are IMPROVING an existing article, not generating from scratch
2. The previous output represents significant work - PRESERVE what's good
3. Focus ONLY on the specific issues listed in the revision context
4. Low-scoring criteria need targeted fixes

WHAT TO PRESERVE:
- Article structure and flow that's working
- Narrative arcs that are properly developed
- Evidence integration that's accurate
- Voice elements that are working

WHAT TO FIX:
- Only the specific issues mentioned in the feedback
- Low-scoring criteria in the evaluation
- Any anti-patterns flagged by the evaluator

Return the complete revised article in the same JSON format.`;
}

/**
 * Get system prompt for article revision: the article writer's system prompt, then
 * the rework rules (phase 2, 2.3).
 *
 * The writer's system prompt brings the identity, the reporting-mode block in its
 * place (phase 1: a remote session's rework must not be the one writer left able
 * to put the reporter back in the room), the roster with pronouns, the hard
 * constraints and the evidence boundaries, none of which the reworker had.
 *
 * @param {string} writerSystemPrompt - PromptBuilder.buildArticleSystemPrompt()
 * @param {string} [theme] - selects the revision framing and voice
 * @returns {string}
 */
function getArticleRevisionSystemPrompt(writerSystemPrompt, theme = 'journalist') {
  assertWriterSystemPrompt(writerSystemPrompt, 'getArticleRevisionSystemPrompt', 'buildArticleSystemPrompt');
  return `${writerSystemPrompt}

${articleRevisionRules(theme)}`;
}

/**
 * The article reworker's system prompt, built from its writer's builder.
 *
 * @param {Object} promptBuilder - the PromptBuilder the writer used
 * @param {string} [theme]
 * @returns {Promise<string>}
 */
async function buildArticleRevisionSystemPrompt(promptBuilder, theme = 'journalist') {
  return getArticleRevisionSystemPrompt(await promptBuilder.buildArticleSystemPrompt(), theme);
}

/**
 * Build revision prompt for article with full context
 *
 * Phase 2 (2.3): the article writer's user prompt (every section but its
 * <SHOULD_CONSIDER> and <DIRECTOR_GUIDANCE>), built by the writer's own builder from
 * the writer's own inputs, then the revision block, then <DIRECTOR_GUIDANCE> last.
 * On 092026 the reworker saw no document text and deleted four correct evidence
 * cards; it now has the approved outline, the record, the packages, the money
 * figures, the director's notes and the writer's whole rule set (which replaces the
 * three-file <RULES> it used to carry, and whose <SCHEMA> replaces its own copy).
 *
 * The writer's <SHOULD_CONSIDER> is the outline evaluation's advisories, which the
 * article evaluation has overwritten by the time a rework runs; the revision
 * context carries the article evaluation's own.
 *
 * @param {Object} state - Current state
 * @param {string} contextSection - Formatted revision context
 * @param {string} previousOutputSection - Formatted previous output
 * @param {Object} promptBuilder - the PromptBuilder the writer used
 * @param {Array} [gateNotes] - Standing director notes, already filtered (spec §5.3)
 * @param {string} [theme='journalist'] - selects the task (reworkTask)
 * @returns {Promise<string>} Complete revision prompt
 * @throws {Error} when one of the writer's craft files did not load
 */
async function buildArticleRevisionPrompt(state, contextSection, previousOutputSection, promptBuilder, gateNotes = [], theme = 'journalist') {
  await promptBuilder.requirePhasePrompts('articleGeneration');
  const writerSections = await promptBuilder.buildArticleUserSections(...articleWriterInputs(state));
  const guidanceSection = buildDirectorGuidanceSection(state._outlineGuidance, gateNotes);
  return `${writerSections}

---

## REVISION CONTEXT

${contextSection}

---

## PREVIOUS ARTICLE OUTPUT (to revise)

${previousOutputSection}

---

${reworkTask('article', theme)}${guidanceSection ? `

${guidanceSection}` : ''}`;
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

    // Brief 2.3: the reworkers check their writer's craft files and build from the
    // writer's section builders. The mock's files always load.
    async requirePhasePrompts() {},

    async buildOutlineSystemPrompt() {
      return 'Mock system prompt for outline generation\n\nMock outline craft rules';
    },

    async buildOutlineUserSections(arcAnalysis, selectedArcs) {
      return `Generate outline for arcs: ${selectedArcs?.join(', ') || 'none selected'}`;
    },

    async buildArticleSystemPrompt() {
      return 'Mock system prompt for article generation\n\nMock article craft rules';
    },

    async buildArticleUserSections(outline) {
      return `Generate article from outline with ${Object.keys(outline || {}).length} sections`;
    },

    async buildOutlinePrompt(arcAnalysis, selectedArcs, heroImage, availablePhotos, arcEvidencePackages, shellAccounts, sessionFacts) {
      return {
        systemPrompt: 'Mock system prompt for outline generation',
        userPrompt: `Generate outline for arcs: ${selectedArcs?.join(', ') || 'none selected'}`
      };
    },

    async buildArticlePrompt(outline, arcEvidencePackages, heroImage, shellAccounts, sessionFacts, directorNotes, narrativeTensions) {
      return {
        systemPrompt: 'Mock system prompt for article generation',
        userPrompt: `Generate article from outline with ${Object.keys(outline).length} sections`
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
  reviseContentBundle: traceNode(reviseContentBundle, 'reviseContentBundle'),

  // Testing utilities
  createMockPromptBuilder,

  // The writers' builders the judges share, by name (final fix wave): the
  // PromptBuilder factory (its roster section), the writers' SESSION_FACTS, the
  // outline writer's inputs and photo list, and the hero the writer and its
  // reworker used.
  getPromptBuilder,
  buildSessionFacts,
  buildAvailablePhotos,
  outlineWriterInputs,
  reworkHeroImage,

  // Internal functions for testing
  _testing: {
    safeParseJson,
    getSdkClient,
    getPromptBuilder,
    getOutlineRevisionSystemPrompt,
    getArticleRevisionSystemPrompt,
    buildOutlineRevisionPrompt,
    buildArticleRevisionPrompt,
    // Brief 2.3: each reworker is built from its writer's builders and inputs.
    // scripts/render-prompts.js renders the rework system prompts through these.
    buildOutlineRevisionSystemPrompt,
    buildArticleRevisionSystemPrompt,
    OUTLINE_REVISION_RULES,
    outlineRevisionRules,
    reworkTask,
    articleRevisionRules,
    outlineWriterInputs,
    articleWriterInputs,
    selectHeroImage,
    scorePaperEvidence,  // Batched Sonnet scoring (Commit 8.11)
    getSchemaValidator,
    // Brief 2.2: the writers' SESSION_FACTS and available photos, one builder each.
    // scripts/render-prompts.js renders through these when the tree has them.
    buildSessionFacts,
    buildAvailablePhotos
  }
};

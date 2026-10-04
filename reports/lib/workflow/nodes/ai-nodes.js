/**
 * AI Nodes - AI processing nodes for report generation workflow
 *
 * These nodes handle the AI-powered phases of the pipeline:
 * - curateEvidenceBundle: Curate evidence into three-layer structure (1.8)
 * - generateOutline: the map writer, the settled weave laid across the sections (3)
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
  filterGateNotes
} = require('../../prompt-builder');
const {
  carriedEdits, settleEdits, standingAfterSendBack, SEND_BACK_PASS, CHANGED_EDITS_KEY, MAP_TOP_PHOTO, isCut
} = require('../../hand-edit-diff');
const contentBundleSchema = require('../../schemas/content-bundle.schema.json');
// Phase 4 (brief 4.6): the map's schema for the theme (its slots), and the hero its top
// photo names; the settled weave, which the map writer reads first, as its task.
const { mapSchemaFor, topPhotoOf } = require('../../map');
const { settledWeaveOf } = require('../../prompt-renderers/settled-weave');
// Brief 4.13: the map's and the article's reworks open with their theme's rework identity.
const { identityLineOf } = require('../../theme-config');
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
  findUncoveredRosterNames,  // F1 invariant guard: roster names with no canonical match
  buildRevisionContext: buildRevisionContextDRY  // DRY revision context helper
} = require('./node-helpers');
const { traceNode } = require('../../observability');
const { directorAccusationText } = require('../../accusation-verdict');
const { photoKey } = require('../../prompt-renderers/director-words-renderer');
// Brief 4.2b: a photo's mapping, the one lookup isPhotoExcluded shares with the photo nodes
const { photoMappingOf } = require('../../photo-leave-out');

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
 * Whether the director excluded a photo (T13: every photo the director has not excluded
 * appears, and an excluded photo never does). The one rule (the 4b fix batch; the
 * integrator's ruling) for every list a writer or judge may place photos from:
 * buildAvailablePhotos (the outline writer, its reworker, the outline judge, and the
 * article writer's and judge's PHOTOS) and the hero entry (heroPhotoEntry). It also
 * decides the hero choice (selectHeroImage) and the fact check's usable photos
 * (evaluator-nodes.js buildFactCheckArgs).
 *
 * The director leaves a photo out at the character-IDs stop with its "leave this photo
 * out" box (phase 4, brief 4.2), and the parse writes an explicit decision into the
 * mapping of every photo the stop showed, characterIdMappings[<filename>].exclude
 * (lib/photo-leave-out.js). That decision is read first, so the box decides for every
 * photo the director saw. The analysis's `excluded` mark, which finalizePhotoAnalyses
 * sets from the mapping, is the fallback for a photo no mapping names: after a rollback
 * to character-ids the analyses are kept and finalizePhotoAnalyses skips, so the mark can
 * be stale. Both are matched by photoKey (basename, case-insensitive), as the parse's
 * keys need not match a filename's case. The photo's mapping is the one photoMappingOf
 * finds, the lookup finalizePhotoAnalyses and the explicit mark read too (brief 4.2b).
 *
 * @param {Object} state
 * @param {string} filename - a photo's filename or path
 * @returns {boolean}
 */
function isPhotoExcluded(state, filename) {
  const key = photoKey(filename);
  if (!key) return false;
  const mapping = photoMappingOf(state.characterIdMappings, filename);
  if (mapping) return Boolean(mapping.exclude);
  const analysis = (state.photoAnalyses?.analyses || []).find(a => a?.filename && photoKey(a.filename) === key);
  return analysis?.excluded === true;
}

/**
 * The hero image as a photo entry: its filename, the names identified in it, and
 * `hero: true`; null when there is no hero or the director excluded it (T13). The
 * builder of the article writer's hero entry (articleWriterInputs), its analysis found by
 * photoKey (the 4b fix batch).
 *
 * @param {Object} state
 * @param {string|null} heroImage - the hero's filename
 * @returns {{filename: string, identifiedCharacters: string[], hero: true}|null}
 */
function heroPhotoEntry(state, heroImage) {
  if (!heroImage || isPhotoExcluded(state, heroImage)) return null;
  const key = photoKey(heroImage);
  const analysis = (state.photoAnalyses?.analyses || []).find(a => a?.filename && photoKey(a.filename) === key);
  return {
    filename: heroImage,
    identifiedCharacters: Array.isArray(analysis?.identifiedCharacters) ? analysis.identifiedCharacters : [],
    hero: true
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
 * The 4b fix batch (T13): a photo the director excluded is left out (isPhotoExcluded).
 * The outline writer, its reworker and the outline judge build their lists here, and so
 * do the article writer's and judge's PHOTOS (articleWriterInputs).
 *
 * Brief 4.6b: the hero is found by the one join key (photoKey). Since phase 4 the hero is
 * the map's top photo, a name the writer or the director typed, so a top photo whose name
 * differs from the session photo's in case is still left out here, and a list that puts the
 * hero first names it once.
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
    .filter(photo => !heroImage || photoKey(getPhotoFilename(photo)) !== photoKey(heroImage))  // Exclude hero, by its key
    .filter(photo => !whiteboardFilename || getPhotoFilename(photo) !== whiteboardFilename)  // Exclude whiteboard
    .filter(photo => !isPhotoExcluded(state, getPhotoFilename(photo)))  // T13: the director's exclusions
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
 * Task 4c-fix (T13): the fact check reads the same filename (evaluator-nodes.js
 * buildFactCheckArgs), so a printed whiteboard is an invalid reference and no fix line
 * offers it.
 *
 * @param {Object} state
 * @returns {string|null}
 */
function whiteboardFilenameOf(state) {
  return state.whiteboardPhotoPath ? photoFilenameOf(state.whiteboardPhotoPath) : null;
}

/**
 * The photos kept for the article, as the map checks and the map's stop count them (phase
 * 4, brief 4.6; T13): the map's top photo, when it is a session photo the director kept,
 * then buildAvailablePhotos with that photo as its hero, each photo once. Which photos the
 * director left out is isPhotoExcluded's one rule, and the whiteboard is never among them.
 *
 * @param {Object} state
 * @param {string|null} topPhoto - the map's top photo
 * @returns {string[]} filenames
 */
function keptPhotoFilenames(state, topPhoto) {
  const whiteboard = whiteboardFilenameOf(state);
  const isSessionPhoto = Boolean(topPhoto) && (state.sessionPhotos || []).some((photo) => photoKey(photoFilenameOf(photo)) === photoKey(topPhoto));
  const keptTop = isSessionPhoto && !(whiteboard && photoKey(topPhoto) === photoKey(whiteboard)) && heroPhotoEntry(state, topPhoto) ? [topPhoto] : [];
  const seen = new Set();
  return [...keptTop, ...buildAvailablePhotos(state, topPhoto, whiteboard).map((photo) => photo.filename)].filter((filename) => {
    const key = photoKey(filename);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Code's pick for the top photo: the photo with the most identified characters, else the
 * first non-whiteboard photo; none when the director kept no photo but the whiteboard.
 *
 * Phase 4 (brief 4.6): the map writer and its rework are offered it as the top photo's
 * starting point, first in their photo list (outlineWriterInputs). The map names the top
 * photo, and code writes the hero from it (lib/map.js topPhotoOf).
 *
 * The 4b fix batch (T13): it never picks a photo the director excluded (isPhotoExcluded).
 * An excluded photo's analysis still counts its character descriptions, so it could top
 * the count.
 *
 * Task 4c-fix (T13): with no kept photo there is no hero. It fell back to the
 * placeholder 'evidence-board.png', which is no session photo: the article judge then
 * required it as the hero and the fact check flagged it in print, a loop no rework could
 * end. The outline and article writers' HERO IMAGE lines say when there is none.
 *
 * @param {Object} state
 * @returns {string|null} filename, or null when the director kept no photo but the whiteboard
 */
function selectHeroImage(state) {
  const getPhotoFilename = photoFilenameOf;
  const whiteboardFilename = whiteboardFilenameOf(state);

  // Select hero image: prefer largest group photo, fallback to first non-whiteboard photo
  // Group photos better represent the ensemble cast as hero images
  const nonWhiteboardPhotos = (state.sessionPhotos || []).filter(
    photo => (!whiteboardFilename || getPhotoFilename(photo) !== whiteboardFilename)
      && !isPhotoExcluded(state, getPhotoFilename(photo))
  );
  if (nonWhiteboardPhotos.length === 0) {
    console.log('[generateOutline] No hero image: the director kept no photo but the whiteboard');
    return null;
  }

  let heroImage;
  const analyses = state.photoAnalyses?.analyses || [];
  if (analyses.length > 0) {
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
    heroImage = scored[0]?.filename || getPhotoFilename(nonWhiteboardPhotos[0]) || null;
    console.log(`[generateOutline] Hero image selected: ${heroImage} (${scored[0]?.characterCount || 0} characters identified)`);
  } else {
    heroImage = getPhotoFilename(nonWhiteboardPhotos[0]) || null;
    console.log(`[generateOutline] Hero image fallback: ${heroImage} (no photo analyses available)`);
  }
  return heroImage;
}

/**
 * The map writer's inputs, read from state: buildOutlinePrompt's arguments, in order (phase
 * 2, brief 2.3; phase 4, brief 4.6). One function for the writer and its rework, so the
 * rework's prompt is built from exactly what the writer's was:
 * - the settled weave (settledWeaveOf), which the writer reads first, as its task;
 * - the photos: code's pick for the top photo (selectHeroImage) first, marked as the hero,
 *   then every other photo the director kept (buildAvailablePhotos), as the article writer's
 *   PHOTOS list them;
 * - the money figures and the session facts, which the writers' own builders recompute;
 * - the options: the standing notes, the director's notes and corrections, the record and
 *   the photo descriptions.
 * The arc stage's advisories (<SHOULD_CONSIDER>) and the arc selection's emphasis went with
 * the arc selection, and the arcs with their channels (R4).
 *
 * @param {Object} state
 * @returns {Array} [settledWeave, photos, shellAccounts, sessionFacts, options]
 */
function outlineWriterInputs(state) {
  const heroImage = selectHeroImage(state);
  const hero = heroPhotoEntry(state, heroImage);
  return [
    settledWeaveOf(state),
    [...(hero ? [hero] : []), ...buildAvailablePhotos(state, heroImage, whiteboardFilenameOf(state))],
    state.shellAccounts || [],
    buildSessionFacts(state),
    {
      gateNotes: state.directorGateNotes || [],
      directorNotes: state.directorNotes || null,
      evidenceBundle: state.evidenceBundle || null,  // brief 2.1: the record view
      directorCorrections: state.inputReviewCorrections || [],
      photoDescriptions: state.photoDescriptions || null
    }
  ];
}

/**
 * The map writer (phase 4, brief 4.6; spec 5.1 and 5.2): lays the settled weave across the
 * article's sections in about 450 words. Skips when the thread already holds a map (a
 * replay).
 *
 * It reads the settled weave first, as its task, then what the outline writer read: the
 * record and the morning timeline, the director's notes and accusation, the photos with the
 * director's descriptions, the roster with pronouns and its rule files
 * (outlineWriterInputs). The map it returns is the writer's last map (`_mapBaseline`), which
 * the director's edits at the stop are made against, and is unchecked (`_mapCheck: null`):
 * the map checks run on it next. Code writes the hero from the map's top photo (R7), so the
 * article writer's PHOTOS and the page name the photo the map chose.
 *
 * It stamps the map writer's phase, OUTLINE_GENERATION, on a replay too (brief 4.6b): the
 * map's resource endpoint (server.js RESOURCE_ENDPOINTS) reads the map as available from it.
 *
 * @param {Object} state - Current state: the settled weave, the record, the photos
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update
 */
async function generateOutline(state, config) {
  if (state.outline) {
    return { currentPhase: PHASES.OUTLINE_GENERATION };
  }

  const sdk = getSdkClient(config, 'generateOutline');
  const promptBuilder = getPromptBuilder(config, state);
  const theme = config?.configurable?.theme || state.theme || 'journalist';
  const { systemPrompt, userPrompt } = await promptBuilder.buildOutlinePrompt(...outlineWriterInputs(state));

  const map = await sdk({
    prompt: userPrompt,
    systemPrompt,
    model: 'opus',  // Commit 8.25: Upgraded from sonnet for quality
    disableTools: true,
    jsonSchema: mapSchemaFor(theme)
  });

  return {
    outline: map,
    _mapBaseline: map,
    _mapCheck: null,
    heroImage: topPhotoOf(map),
    currentPhase: PHASES.OUTLINE_GENERATION
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// THE MAP'S REWORK - a check rework or the director's send-back
// ═══════════════════════════════════════════════════════════════════════════════
//
// Data flow:
// 1. incrementOutlineRevision keeps the map in _previousOutline and clears outline
// 2. reviseOutline reads _previousOutline with the map checks' lines (validationResults)
//    or the director's note, and the director's standing edits
// 3. buildRevisionContextDRY formats the context
// 4. The rework returns the whole map; code holds it to the director's edits

/**
 * The list a send-back's rework returns of the director's edits it changed (F1, spec
 * 2026-10-02 section 7): each by its id in <HAND_EDITS>, with one sentence on why. The
 * <HAND_EDITS> block asks for it by this key (node-helpers.js).
 */
const CHANGED_EDITS_PROPERTY = {
  type: 'array',
  description: "Each of the director's edits in HAND_EDITS that this rework changed or removed, and each cut or removed sentence it brought back, with one sentence on why the structural change the director's note asks for meant it no longer fit. Empty when every edit stays as written and every cut and removed sentence stays out.",
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'reason'],
    properties: {
      id: { type: 'string', description: "The edit's id in HAND_EDITS, such as E3" },
      reason: { type: 'string', description: 'One sentence on why the edit no longer fit' }
    }
  }
};

/** The rework call's schemas, built once per stored schema. */
const reworkSchemas = new WeakMap();

/**
 * The rework call's schema on a send-back that carries the director's edits: the stored
 * schema with the required changed-edits list added, built in code so lib/schemas/*.json
 * stay as they are (F1). Every other rework call takes the stored schema itself.
 *
 * @param {Object} schema - the writer's stored schema (the theme's)
 * @returns {Object}
 */
function reworkSchemaWithChangedEdits(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  if (!reworkSchemas.has(schema)) {
    const copy = JSON.parse(JSON.stringify(schema));
    copy.properties = { ...(copy.properties || {}), [CHANGED_EDITS_KEY]: JSON.parse(JSON.stringify(CHANGED_EDITS_PROPERTY)) };
    copy.required = [...(Array.isArray(copy.required) ? copy.required : []), CHANGED_EDITS_KEY];
    reworkSchemas.set(schema, copy);
  }
  return reworkSchemas.get(schema);
}

/**
 * The rework's output without its changed-edits list, and the list (F1). The node
 * stores only the output, so no later prompt, check, console view, template or approved
 * bundle meets the list; its reasons reach the stop through the report.
 *
 * @param {*} result - what the rework call returned
 * @returns {{output: *, reasons: Array}}
 */
function takeChangedEdits(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result) || !(CHANGED_EDITS_KEY in result)) {
    return { output: result, reasons: [] };
  }
  const { [CHANGED_EDITS_KEY]: list, ...output } = result;
  return { output, reasons: Array.isArray(list) ? list : [] };
}

/**
 * The map's rework (phase 4, brief 4.6): one pass on the map, built from the writer's own
 * sections (buildOutlineRevisionPrompt), with the map's schema for the theme. An automatic
 * pass runs after a failed map check and fixes what the check's lines name; the director's
 * send-back takes the note as its task, and may change one of the director's edits only
 * where the note's structural change means it no longer fits, saying why (the changed-edits
 * list its schema adds).
 *
 * Every pass but a send-back is held to the director's standing edits: code puts back each
 * line it changed and strikes again, by id, each beat it brought back (lib/hand-edit-diff.js
 * settleEdits), and the round's report (`_outlineHandEditReport`) records each change and
 * each restore. The map a pass leaves is the writer's last map (`_mapBaseline`), unchecked
 * (`_mapCheck: null`), and its top photo is the hero. It stamps the map writer's phase,
 * OUTLINE_GENERATION, as the writer does (brief 4.6b).
 *
 * @param {Object} state - Current state with _previousOutline, validationResults, the note
 * @param {Object} config - Graph config with SDK client
 * @returns {Object} Partial state update
 */
async function reviseOutline(state, config) {
  const revisionCount = state.outlineRevisionCount || 0;
  console.log(`[reviseOutline] Starting map revision ${revisionCount}`);
  const startTime = Date.now();

  // The map the rework starts from (kept by incrementOutlineRevision)
  const previousOutline = state._previousOutline;
  if (!previousOutline) {
    console.error('[reviseOutline] CRITICAL: No previous map to rework. This indicates incrementOutlineRevision ran with no map.');
    return {
      outline: null,
      _previousOutline: null,
      _outlineFeedback: null,  // Clear human feedback after consumption
      errors: [{
        phase: PHASES.GENERATE_OUTLINE,
        type: 'revision-no-previous-output',
        message: 'Cannot revise: no previous map available. Increment node may have run with no map.',
        timestamp: new Date().toISOString()
      }],
      currentPhase: PHASES.ERROR
    };
  }

  const sdk = getSdkClient(config, 'reviseOutline');
  const promptBuilder = getPromptBuilder(config, state);
  const theme = config?.configurable?.theme || state.theme || 'journalist';

  try {
    // INSIDE the try: the builders throw on a missing rule file or a theme with no map, and
    // this node's error contract is what clears _previousOutline / _outlineFeedback.
    const call = await mapReworkCall(state, promptBuilder, theme);

    // F1: a send-back that carries the director's edits returns the edits it changed,
    // through a schema built from the stored one; the list is taken out before storing.
    const { output: result, reasons } = takeChangedEdits(await sdk({
      prompt: call.prompt,
      systemPrompt: call.systemPrompt,
      model: 'opus',  // Same as generateOutline
      jsonSchema: call.jsonSchema,
      disableTools: true,
      label: call.label
    }));

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const sections = Array.isArray(result?.sections) ? result.sections : [];
    const beats = sections.reduce((n, section) => n + (Array.isArray(section?.beats) ? section.beats.length : 0), 0);
    console.log(`[reviseOutline] Complete: ${sections.length} sections, ${beats} beats in ${duration}s`);

    // FA (spec 2026-10-02 section 7): after an automatic pass, code puts back any of the
    // director's edits the pass changed; a send-back's rework is left as it is, with its
    // reasons. The report adds this pass's changes and restores to the round's.
    const settled = settleEdits(state._outlineHandEditReport, {
      edits: call.edits, before: call.before, after: result || {},
      pass: call.sendBack ? SEND_BACK_PASS : revisionCount, reasons
    });
    return {
      outline: settled.output,
      _mapBaseline: settled.output,
      _mapCheck: null,
      heroImage: topPhotoOf(settled.output),
      _previousOutline: null,  // Clear temporary field after use
      _outlineFeedback: null,  // Clear human feedback after consumption
      _outlineHandEditReport: settled.report,
      currentPhase: PHASES.OUTLINE_GENERATION
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
 * The map's rework call, the one place it is built (phase 4, brief 4.6), as the arc rework's
 * is (arc-specialist-nodes.js arcReworkCall): reviseOutline sends it, and
 * scripts/render-prompts.js renders it. From the map the rework starts from
 * (`_previousOutline`), the director's standing edits it carries, the map checks' lines or
 * the director's note, the round, and the standing notes without the note being acted on.
 *
 * @param {Object} state
 * @param {Object} promptBuilder - the PromptBuilder the writer used
 * @param {string} [theme] - the session's theme (default: the state's)
 * @returns {Promise<{prompt: string, systemPrompt: string, jsonSchema: Object, edits: Object[],
 *   before: Object, sendBack: boolean, label: string}>}
 */
async function mapReworkCall(state, promptBuilder, theme = state.theme || 'journalist') {
  const revisionCount = state.outlineRevisionCount || 0;
  const before = state._previousOutline;
  // Spec 2026-09-19 §4.3: the director's edits ride along on EVERY pass of the round. F1:
  // the edits the version this pass starts from carries, by id.
  const edits = carriedEdits(state._outlineHandEdits, before);
  const sendBack = Boolean(state._outlineFeedback);
  const { contextSection, previousOutputSection } = buildRevisionContextDRY({
    phase: 'outline',
    outputName: 'map',
    revisionCount,
    // Brief 2.3: a send back's banner names the round it opens, as the stop shows it.
    round: (state.humanOutlineRevisionCount || 0) + 1,
    validationResults: state.validationResults,
    previousOutput: before,
    humanFeedback: state._outlineFeedback || null,
    handEdits: edits
  });
  // Spec §5.3 [I10]: the note being acted on is already in the prompt as HUMAN FEEDBACK.
  const gateNotes = filterGateNotes(state.directorGateNotes, state._outlineFeedback, 'outline');
  const prompt = await buildOutlineRevisionPrompt(state, contextSection, previousOutputSection, promptBuilder, gateNotes);
  const systemPrompt = await buildOutlineRevisionSystemPrompt(promptBuilder);
  const mapSchema = mapSchemaFor(theme);
  return {
    prompt,
    systemPrompt,
    jsonSchema: sendBack && edits.length > 0 ? reworkSchemaWithChangedEdits(mapSchema) : mapSchema,
    edits,
    before,
    sendBack,
    label: `Map revision ${revisionCount}`
  };
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
 * The map rework's task, the clause its first line gives after the theme's rework identity
 * (lib/theme-config.js identityLineOf, the call `outline-rework`; brief 4.13): it names the
 * task the revision context gives the rework (phase 3, brief 3.3; TH7; phase 4, brief 4.6),
 * and how much of the previous map the rework keeps is the revision context's to say, from
 * the director's note or the map checks' lines (buildRevisionContext). The detective's
 * outline rules went with its outline stage (R1). It opens with the mark that joins it to
 * the identity.
 */
const OUTLINE_REWORK_CLAUSE = ', for the reason the revision context in the prompt gives: the director\'s note when the director sent it back, or what the map checks found.';

/**
 * The rules the map's rework adds to its writer's system prompt: the theme's rework identity
 * with the rework's task.
 *
 * @param {string} theme - the theme the rework holds
 * @returns {string}
 * @throws {Error} for a theme with no rework identity line, naming it
 */
function outlineRevisionRules(theme) {
  return `${identityLineOf(theme, 'outline-rework')}${OUTLINE_REWORK_CLAUSE}`;
}

/**
 * The map's rework system prompt: the map writer's system prompt, then the rework rules
 * (phase 2, 2.3). The writer's brings the theme's identity line, the reporting-mode block
 * right after it, and the world and the truth rules.
 *
 * @param {string} writerSystemPrompt - PromptBuilder.buildOutlineSystemPrompt()
 * @param {string} theme - the writer's theme, whose rework identity opens the rules
 * @returns {string}
 */
function getOutlineRevisionSystemPrompt(writerSystemPrompt, theme) {
  assertWriterSystemPrompt(writerSystemPrompt, 'getOutlineRevisionSystemPrompt', 'buildOutlineSystemPrompt');
  return `${writerSystemPrompt}\n\n${outlineRevisionRules(theme)}`;
}

/**
 * The map's rework system prompt, built from its writer's builder, for the builder's theme.
 *
 * @param {Object} promptBuilder - the PromptBuilder the writer used
 * @returns {Promise<string>}
 */
async function buildOutlineRevisionSystemPrompt(promptBuilder) {
  return getOutlineRevisionSystemPrompt(await promptBuilder.buildOutlineSystemPrompt(), promptBuilder.themeName);
}

/**
 * The map's rework prompt (phase 2, 2.3; phase 4, brief 4.6): the map writer's user prompt
 * (every section but its <DIRECTOR_GUIDANCE>), built by the writer's own builder from the
 * writer's own inputs, the settled weave first among them, then the revision block, then
 * <DIRECTOR_GUIDANCE> last. A later change to the writer reaches its rework without a second
 * copy.
 *
 * @param {Object} state - Current workflow state
 * @param {string} contextSection - Formatted revision context from helper
 * @param {string} previousOutputSection - Formatted previous output from helper
 * @param {Object} promptBuilder - the PromptBuilder the writer used
 * @param {Array} [gateNotes] - Standing director notes, already filtered (spec §5.3)
 * @returns {Promise<string>} Complete revision prompt
 * @throws {Error} when one of the writer's rule files did not load
 */
async function buildOutlineRevisionPrompt(state, contextSection, previousOutputSection, promptBuilder, gateNotes = []) {
  await promptBuilder.requirePhasePrompts('outlineGeneration');
  const writerSections = await promptBuilder.buildOutlineUserSections(...outlineWriterInputs(state));
  const guidanceSection = buildDirectorGuidanceSection(gateNotes);

  return `${writerSections}

---

# Map Revision Request

${contextSection}

---

${previousOutputSection}

---

${reworkTask('map')}${guidanceSection ? `\n\n${guidanceSection}` : ''}`;
}

/**
 * The map's and the article's reworks' task, the last section before <DIRECTOR_GUIDANCE>.
 *
 * It defers to the revision context for what the rework changes and how far (phase 3,
 * brief 3.3; TH7). The detective's fixed text went with its article rework (phase 4,
 * brief 4.7b; R1), as its outline rework's had (brief 4.6).
 *
 * @param {'map'|'article'} phase - what the rework returns
 * @returns {string}
 */
function reworkTask(phase) {
  const PHASE = phase.toUpperCase();
  return `## YOUR TASK

1. Rework the PREVIOUS ${PHASE} OUTPUT as the revision context above directs.
2. Return the whole ${phase} in the same JSON format.`;
}

/**
 * The story map as the article writer and its rework read it (brief 4.7b): the map as the
 * director left it (state.outline, R9), less each photo the director has left out since the
 * map (isPhotoExcluded), from its sections and as its top photo. A photo deleted at the desk
 * joins the leave-out list at the approve or send-back that carries the delete (server.js,
 * the article arms), so after a send-back the rework is never told to place it. Nothing else
 * of the map changes, and the stored map is untouched.
 *
 * @param {Object} state
 * @returns {Object|null} a copy of the map, or null when the thread holds none
 */
function articleMapOf(state) {
  const stored = state && state.outline;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return null;
  const map = JSON.parse(JSON.stringify(stored));
  const leftOut = (filename) => typeof filename === 'string' && isPhotoExcluded(state, filename);
  if (leftOut(map.topPhoto)) delete map.topPhoto;
  if (Array.isArray(map.sections)) {
    map.sections = map.sections.map((section) => (section && Array.isArray(section.photos)
      ? { ...section, photos: section.photos.filter((photo) => !(photo && leftOut(photo.filename))) }
      : section));
  }
  return map;
}

/**
 * The article writer's inputs, read from state: buildArticlePrompt's arguments, in
 * order (phase 2, brief 2.3). One function for the writer and its reworker. The
 * settled weave and the session facts are computed and never stored; they are
 * recomputed here by their own builders.
 *
 * Brief 4.7b (spec 6.1): the settled weave first (settledWeaveOf, 4.5's renderer), then the
 * map as the article reads it (articleMapOf), where the approved outline was passed until
 * phase 4. The arc selection's guidance (`_outlineGuidance`) went with its last readers,
 * the writer and its rework (R4).
 *
 * Phase 3 (3.9; T13, the integrator's ruling): `options.photos` is every photo the
 * article places, every session photo less the photos the director excluded: the hero
 * image first (`hero: true`, with the names identified in it), then
 * buildAvailablePhotos, every other session photo without the whiteboard. The article
 * judge's PHOTOS is built from this same list (evaluator-nodes.js
 * renderArticleJudgePhotos), which reads the options as the last argument.
 *
 * T13 (3.9 fix round 1): an excluded photo never appears. A hero the director excluded
 * is no hero. The 4b fix batch: which photos the director excluded is the one rule's
 * (isPhotoExcluded, which articleMapOf, buildAvailablePhotos and the hero entry read too).
 *
 * Phase 4 (brief 4.6; R5): no arc packages; the article writer reads the record whole.
 * Brief 4.7b (R1): the parked detective's stored hero went with its article writer.
 *
 * Brief 4.7c (R7): the hero is the map's top photo, read from the map these inputs pass
 * (topPhotoOf on articleMapOf's copy, so a top photo the director has left out since is no
 * hero): the one reading the writer's PHOTOS, its instruction (prompt-builder.js), the stamp
 * (stampFromMap) and the judge's PHOTOS (renderArticleJudgePhotos) share. The stored
 * `heroImage` is the map's writer's and the map's stop's to write.
 *
 * @param {Object} state
 * @returns {Array} [settledWeave, map, shellAccounts, sessionFacts, directorNotes,
 *   narrativeTensions, options]
 */
function articleWriterInputs(state) {
  const map = articleMapOf(state);
  const heroImage = topPhotoOf(map);
  const hero = heroPhotoEntry(state, heroImage);
  const photos = [
    ...(hero ? [hero] : []),
    ...buildAvailablePhotos(state, heroImage, whiteboardFilenameOf(state))
  ];
  return [
    settledWeaveOf(state),
    map,
    state.shellAccounts || [],  // Deterministic shell account data for financial summary
    // Session facts for the non-roster character guardrail (RC3) and the verdict (brief 2.2)
    buildSessionFacts(state),
    state.directorNotes || null,  // RC5: director observations for article grounding
    state.narrativeTensions || null,  // Task F: programmatic contradictions for narrative weaving
    // Spec 2026-09-19 §5.3: the standing gate notes; brief 2.2: the director's input-review
    // corrections and photo descriptions; phase 3 (3.9): every photo the article places.
    {
      gateNotes: state.directorGateNotes || [],
      evidenceBundle: state.evidenceBundle || null,  // brief 2.1: the record view
      directorCorrections: state.inputReviewCorrections || [],
      photoDescriptions: state.photoDescriptions || null,
      photos
    }
  ];
}

/**
 * The article writer's first draft (phase 4, brief 4.7b; spec 6.1): one call, its prompt
 * built from the writer's own inputs (articleWriterInputs: the settled weave, the map as
 * the article reads it, the money, the session facts, the director's notes, the narrative
 * tensions, and the standing notes, the record, the input-review corrections, the photo
 * descriptions and the photos it places), its output held to the content bundle's schema.
 * Code stamps the map's headline, deck and top photo into the draft (stampFromMap; R7). A
 * thread that already holds a bundle (a resume) passes through with no call.
 *
 * @param {Object} state - the writer's inputs, and the director's standing edits on the map,
 *   which the stamp reads
 * @param {Object} config - Graph config: the SDK client, the PromptBuilder and an optional
 *   configurable.contentBundleSchema
 * @returns {Object} the stamped draft (contentBundle), the director's lines the stamp
 *   records as the article stop's standing edits (_articleHandEdits, null when the map
 *   carries none of them), and currentPhase; currentPhase alone when a bundle is in hand
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

  const { systemPrompt, userPrompt } = await promptBuilder.buildArticlePrompt(...articleWriterInputs(state));

  // SDK returns parsed object directly when jsonSchema is provided
  // Commit 8.23: disableTools prevents tool use during pure generation
  const generatedContent = await sdk({
    prompt: userPrompt,
    systemPrompt,
    model: 'opus',
    jsonSchema: config?.configurable?.contentBundleSchema || contentBundleSchema,
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

  // R7 (brief 4.7b): the map's headline, deck and top photo, stamped into the first draft,
  // and the director's lines among them recorded as the director's at the article stop.
  const stamped = stampFromMap(contentBundle, state);

  return {
    contentBundle: stamped.contentBundle,
    _articleHandEdits: stamped.edits,
    currentPhase: PHASES.GENERATE_CONTENT
  };
}

/**
 * The stamp (R7; brief 4.7b): the map's headline, deck and top photo, stamped into the
 * article writer's first draft, where the writer was told to print them as the map gives
 * them. The writer's kicker stays, and its hero caption when it captioned the map's top
 * photo; a caption written for another photo goes with that photo. A map with no top photo,
 * or one the director has left out since, prints no hero (articleMapOf).
 *
 * Where the director wrote one of them or chose the top photo on the map (a standing edit
 * the map carries, `_outlineHandEdits`), the stamp records it as the director's line at the
 * article stop: the article stop's standing edits, as a send-back records them
 * (standingAfterSendBack), each a field with no writer's text before it. So the fixes'
 * machinery reads it as the director's: an automatic pass that changes it gets it put back
 * (settleEdits), and a judge's finding located in it is a concern (guardDirectorEdits). At
 * the desk the director edits the headline, the deck and the hero's caption. A line the map
 * writer wrote is stamped and stays the writer's.
 *
 * Brief 4.7d: the stamp records no cut. The director takes the top photo off the map by
 * moving it into a section (the console's movePhoto), which leaves the map with no top photo:
 * the writer was told to print no hero, the draft prints none, and the desk shows any hero a
 * later pass adds. A cut of `heroImage` would be carried by its text wherever the page prints
 * it (lib/hand-edit-diff.js), and T13 prints that photo in its section.
 *
 * @param {Object} bundle - the writer's first draft
 * @param {Object} state - reads the map, the director's edits on it and the leave-out list
 * @returns {{contentBundle: Object, edits: Object|null}} the stamped draft, and the article
 *   stop's standing edits (null when the director wrote none of the three)
 */
function stampFromMap(bundle, state) {
  const map = articleMapOf(state);
  if (!map) return { contentBundle: bundle, edits: null };
  const stamped = { ...bundle, headline: { ...(bundle.headline || {}) } };
  if (typeof map.headline === 'string') stamped.headline.main = map.headline;
  if (typeof map.deck === 'string') stamped.headline.deck = map.deck;
  const topPhoto = topPhotoOf(map);
  if (topPhoto) {
    const writers = bundle.heroImage && typeof bundle.heroImage === 'object' ? bundle.heroImage : null;
    const sameKey = writers && photoKey(writers.filename) === photoKey(topPhoto);
    stamped.heroImage = { ...(sameKey ? writers : {}), filename: topPhoto };
  } else {
    delete stamped.heroImage;
  }

  // The director's lines on the map: the map's standing edits at its headline, its deck
  // and its top photo that the map as left carries. A cut there is no line to stamp.
  const theirs = new Set(carriedEdits(state._outlineHandEdits, state.outline)
    .filter((edit) => !isCut(edit) && Array.isArray(edit.at) && edit.at.length === 1)
    .map((edit) => edit.at[0].key));
  // The draft with the director's lines taken out: the stamp's diff against it records
  // each of them as the director's, with no writer's text before it.
  const without = { ...stamped, headline: { ...stamped.headline } };
  if (theirs.has('headline')) delete without.headline.main;
  if (theirs.has('deck')) delete without.headline.deck;
  if (theirs.has(MAP_TOP_PHOTO) && stamped.heroImage) {
    const { filename: _chosen, ...rest } = stamped.heroImage;
    without.heroImage = rest;
  }
  return { contentBundle: stamped, edits: standingAfterSendBack(null, without, stamped, 'bundle') };
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

  // Spec 2026-09-19 §4.3: the director's edits ride along on EVERY pass of the round.
  // This node never clears them; the gate does, on approve. F1 (spec 2026-10-02
  // section 7): the edits the version this pass starts from carries, by id.
  const handEdits = carriedEdits(state._articleHandEdits, previousContentBundle);
  const sendBack = Boolean(state._articleFeedback);

  // Build revision context using centralized helper (DRY)
  const { contextSection, previousOutputSection } = buildRevisionContextDRY({
    phase: 'article',
    revisionCount,
    // Brief 2.3: a send back's banner names the round it opens, as the stop shows it.
    round: (state.humanArticleRevisionCount || 0) + 1,
    validationResults: state.validationResults,
    previousOutput: previousContentBundle,
    humanFeedback: state._articleFeedback || null,
    handEdits
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
    const revisionPrompt = await buildArticleRevisionPrompt(state, contextSection, previousOutputSection, promptBuilder, gateNotes);
    const systemPrompt = await buildArticleRevisionSystemPrompt(promptBuilder);

    // The full schema (Fix 3). F1: a send-back that carries the director's edits returns
    // the edits it changed, through a schema built from the stored one; the list is taken
    // out before storing.
    const { output: revised, reasons } = takeChangedEdits(await sdk({
      prompt: revisionPrompt,
      systemPrompt,
      model: 'opus',  // Commit 8.25: Upgraded from sonnet for quality
      disableTools: true,
      jsonSchema: sendBack && handEdits.length > 0 ? reworkSchemaWithChangedEdits(contentBundleSchema) : contentBundleSchema,
      label: `Article revision ${revisionCount}`
    }));

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[reviseContentBundle] Complete in ${duration}s`);

    // FA (spec 2026-10-02 section 7): after an automatic pass, code puts back any of the
    // director's edits the pass changed, field by field; a send-back's rework is left as
    // it is, with its reasons. Spec §4.4: verify on EVERY pass. F1: the report adds this
    // pass's changes and restores to the round's (the server resets it at a send-back);
    // the edits stay, for the gate to clear on approve. Brief 4.7b: the article carries no
    // writers' questions (spec section 10), so the rework carries none forward.
    const settled = settleEdits(state._articleHandEditReport, {
      edits: handEdits, before: previousContentBundle, after: revised || previousContentBundle,
      pass: sendBack ? SEND_BACK_PASS : revisionCount, reasons
    });

    return {
      contentBundle: {
        ...settled.output,
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
      _articleHandEditReport: settled.report,
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
 * The article rework's task, the clause its one line gives after the theme's rework
 * identity (lib/theme-config.js identityLineOf, the call `article-rework`; brief 4.13):
 * it names the task the revision context gives the rework and points at WHAT THIS REWORK
 * DOES, the one section of that context that states the task (R23), so it states no scope
 * of its own (phase 3, brief 3.3; TH7). The fixed "preserve" lists and the "WHAT TO FIX"
 * list, which made every low-scoring criterion and every flagged anti-pattern a defect
 * though most criteria are advisory, are gone: the revision context says what the rework
 * changes (buildRevisionContext). It opens with the space that joins it to the identity.
 *
 * Phase 3 (3.10, fix round 1): the line used to be the theme's revision framing
 * (THEME_SYSTEM_PROMPTS.journalist.revision, 3.2's string), which named the automatic
 * task "the evaluation's findings": every finding the context lists, the SHOULD
 * CONSIDER items and the suggestions among them. At the gate an automatic article
 * rework changed 20 of 27 paragraphs to fix one pronoun. The 4b fix batch removed that
 * string, which nothing read.
 *
 * Phase 4 (brief 4.7b; R1): the theme's revision voice that followed the line, an empty
 * slot for the journalist, went with the detective's article rework, whose framing,
 * voice and fixed rules were the slot's one use.
 */
const ARTICLE_REWORK_CLAUSE = " after the director's note on a send back, or after an automatic check or evaluation. The task is the one the REVISION CONTEXT in the user prompt gives, under WHAT THIS REWORK DOES.";

/**
 * The article rework's rules, which its system prompt adds after its writer's: the theme's
 * rework identity with the rework's task, one line.
 *
 * @param {string} theme - the theme the rework holds
 * @returns {string}
 * @throws {Error} for a theme with no rework identity line, naming it
 */
function articleRevisionRules(theme) {
  return `${identityLineOf(theme, 'article-rework')}${ARTICLE_REWORK_CLAUSE}`;
}

/**
 * Get system prompt for article revision: the article writer's system prompt, then
 * the rework rules (phase 2, 2.3).
 *
 * The writer's system prompt brings the theme's identity line, the reporting-mode block in
 * its place (phase 1: a remote session's rework must not be the one writer left able
 * to put the reporter back in the room), the world, the truth rules and the roster
 * with pronouns.
 *
 * @param {string} writerSystemPrompt - PromptBuilder.buildArticleSystemPrompt()
 * @param {string} theme - the writer's theme, whose rework identity opens the rules
 * @returns {string}
 */
function getArticleRevisionSystemPrompt(writerSystemPrompt, theme) {
  assertWriterSystemPrompt(writerSystemPrompt, 'getArticleRevisionSystemPrompt', 'buildArticleSystemPrompt');
  return `${writerSystemPrompt}

${articleRevisionRules(theme)}`;
}

/**
 * The article reworker's system prompt, built from its writer's builder, for the builder's
 * theme.
 *
 * @param {Object} promptBuilder - the PromptBuilder the writer used
 * @returns {Promise<string>}
 * @throws {Error} for a theme with no story map, such as the parked detective (R1)
 */
async function buildArticleRevisionSystemPrompt(promptBuilder) {
  return getArticleRevisionSystemPrompt(await promptBuilder.buildArticleSystemPrompt(), promptBuilder.themeName);
}

/**
 * Build revision prompt for article with full context
 *
 * Phase 2 (2.3): the article writer's user prompt (every section but its
 * <DIRECTOR_GUIDANCE>), built by the writer's own builder from the writer's own inputs,
 * then the revision block, then <DIRECTOR_GUIDANCE> last. On 092026 the reworker saw no
 * document text and deleted four correct evidence cards; it now has what the writer has:
 * the settled weave and the map as the director left it (brief 4.7b), the record, the
 * money figures, the director's notes and the writer's whole rule set (which replaces the
 * three-file <RULES> it used to carry, and whose <SCHEMA> replaces its own copy). The arc
 * packages it carried went in phase 4 (brief 4.6; R5).
 *
 * Neither the writer nor the rework reads a <SHOULD_CONSIDER> (phase 4, briefs 4.6 and
 * 4.7b): the revision context carries the article evaluation's own advisories. The arc
 * selection's guidance went with them, its last readers (R4): the standing notes are the
 * guidance's whole content.
 *
 * @param {Object} state - Current state
 * @param {string} contextSection - Formatted revision context
 * @param {string} previousOutputSection - Formatted previous output
 * @param {Object} promptBuilder - the PromptBuilder the writer used
 * @param {Array} [gateNotes] - Standing director notes, already filtered (spec §5.3)
 * @returns {Promise<string>} Complete revision prompt
 * @throws {Error} when one of the writer's craft files did not load
 */
async function buildArticleRevisionPrompt(state, contextSection, previousOutputSection, promptBuilder, gateNotes = []) {
  await promptBuilder.requirePhasePrompts('articleGeneration');
  const writerSections = await promptBuilder.buildArticleUserSections(...articleWriterInputs(state));
  const guidanceSection = buildDirectorGuidanceSection(gateNotes);
  return `${writerSections}

---

## REVISION CONTEXT

${contextSection}

---

## PREVIOUS ARTICLE OUTPUT (to revise)

${previousOutputSection}

---

${reworkTask('article')}${guidanceSection ? `

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
    // Brief 4.13: the theme a real builder holds, whose rework identity lines the map's
    // and the article's reworks open their rules with.
    themeName: 'journalist',

    // Brief 2.3: the reworkers check their writer's craft files and build from the
    // writer's section builders. The mock's files always load.
    async requirePhasePrompts() {},

    async buildOutlineSystemPrompt() {
      return 'Mock system prompt for the map writer\n\nMock map craft rules';
    },

    async buildOutlineUserSections(settledWeave) {
      return `Lay out the map from ${settledWeave ? 'the settled weave' : 'no weave'}`;
    },

    async buildArticleSystemPrompt() {
      return 'Mock system prompt for article generation\n\nMock article craft rules';
    },

    // Brief 4.7b: the article writer writes from the settled weave and the map.
    async buildArticleUserSections(settledWeave, map) {
      return `Generate article from ${settledWeave ? 'the settled weave' : 'no weave'} and a map with ${(map && Array.isArray(map.sections) ? map.sections : []).length} sections`;
    },

    async buildOutlinePrompt(settledWeave) {
      return {
        systemPrompt: 'Mock system prompt for the map writer',
        userPrompt: `Lay out the map from ${settledWeave ? 'the settled weave' : 'no weave'}`
      };
    },

    async buildArticlePrompt(settledWeave, map) {
      return {
        systemPrompt: 'Mock system prompt for article generation',
        userPrompt: `Generate article from ${settledWeave ? 'the settled weave' : 'no weave'} and a map with ${(map && Array.isArray(map.sections) ? map.sections : []).length} sections`
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
  generateOutline: traceNode(generateOutline, 'generateOutline', {
    stateFields: ['weave', 'playerFocus']
  }),
  // Revision node - uses previous output context for targeted fixes (DRY)
  reviseOutline: traceNode(reviseOutline, 'reviseOutline', {
    stateFields: ['_previousOutline', 'validationResults']
  }),
  generateContentBundle: traceNode(generateContentBundle, 'generateContentBundle', {
    stateFields: ['outline', 'weave']
  }),
  validateContentBundle: traceNode(validateContentBundle, 'validateContentBundle'),
  reviseContentBundle: traceNode(reviseContentBundle, 'reviseContentBundle'),

  // Testing utilities
  createMockPromptBuilder,

  // The writers' builders the judges share, by name (final fix wave): the
  // PromptBuilder factory (its roster section), the writers' SESSION_FACTS, the
  // outline writer's inputs and photo list, and the hero the writer and its
  // reworker used. Phase 3 (3.9): the article writer's inputs, its photos among them.
  // The 4b fix batch: the one rule for a kept photo (the fact check's arguments read
  // it) and the one hero entry (the map writer's and the article's photo lists print it).
  // Task 4c-fix: the whiteboard's filename, which the fact check's arguments read too.
  getPromptBuilder,
  buildSessionFacts,
  buildAvailablePhotos,
  outlineWriterInputs,
  articleWriterInputs,
  // Brief 4.7b: the map as the article writer, its rework and its stamp read it
  articleMapOf,
  isPhotoExcluded,
  // Brief 4.6: the photos kept for the article, which the map checks and the stop count
  keptPhotoFilenames,
  heroPhotoEntry,
  whiteboardFilenameOf,
  // Brief 4.5: the send-back's changed-edits list, which the weave's send-back asks for
  // too (arc-specialist-nodes.js reviseArcs): one schema rule and one strip.
  reworkSchemaWithChangedEdits,
  takeChangedEdits,

  // Internal functions for testing
  _testing: {
    safeParseJson,
    getSdkClient,
    getPromptBuilder,
    getOutlineRevisionSystemPrompt,
    getArticleRevisionSystemPrompt,
    buildOutlineRevisionPrompt,
    buildArticleRevisionPrompt,
    // Brief 4.6: the map's rework call, which scripts/render-prompts.js renders
    mapReworkCall,
    // Brief 2.3: each reworker is built from its writer's builders and inputs.
    // scripts/render-prompts.js renders the rework system prompts through these.
    buildOutlineRevisionSystemPrompt,
    buildArticleRevisionSystemPrompt,
    // Brief 4.13: each rework's rules, the theme's rework identity with the rework's task
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

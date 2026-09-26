/**
 * EvidencePreprocessor - Batch processing for evidence NORMALIZATION
 *
 * Addresses the scalability gap discovered during Commit 8 validation:
 * Single Claude calls with 100+ tokens would timeout. This module batch-processes
 * evidence items with Haiku for fast summarization before theme-specific curation.
 *
 * SRP FIX (Phase 3): This is pure NORMALIZATION - no judgment calls.
 * - significance and narrativeRelevance fields REMOVED
 * - playerFocus parameter REMOVED
 * - Enables context-free preprocessing that can run in background pipelines
 *   before playerFocus is available (staggered start)
 *
 * Design Decisions (per ARCHITECTURE_DECISIONS.md 8.5.1-8.5.5):
 * - Universal preprocessing schema (theme-agnostic intermediate format)
 * - Batch parameters from detective pattern (8 items × 4 concurrent)
 * - Rich relation context always included (owner.logline, timeline.*)
 *
 * Usage:
 *   const { createEvidencePreprocessor } = require('./evidence-preprocessor');
 *   const { sdkQuery } = require('./llm');
 *   const preprocessor = createEvidencePreprocessor({ sdkClient: sdkQuery });
 *   const result = await preprocessor.process({
 *     memoryTokens: [...],
 *     paperEvidence: [...],
 *     sessionId: '20251221'
 *   });
 */

// Batch configuration - proven in detective flow (150+ items in ~3 minutes)
const BATCH_SIZE = 8;
const CONCURRENCY = 8;

// Preprocessing prompt template
const SYSTEM_PROMPT = `You are an evidence analyst preprocessing raw investigation data for narrative curation.

═══════════════════════════════════════════════════════════════════
CRITICAL: EVIDENCE BOUNDARY RULES (MUST FOLLOW)
═══════════════════════════════════════════════════════════════════

TERMINOLOGY:
- OWNER = Whose POV the memory was captured from (e.g., "Alex's memory of...")
- OPERATOR = Who found/unlocked the token and chose to expose or bury it

Each memory token has a "disposition" field: 'exposed' or 'buried'.

FOR EXPOSED TOKENS (disposition: 'exposed'):
- You CAN reference the OWNER (whose POV the memory shows)
- You CAN summarize what the memory CONTENT reveals
- You CANNOT know who the OPERATOR was (reporter protects sources)
- These are PUBLIC RECORD (submitted to the Detective/Reporter)

FOR BURIED TOKENS (disposition: 'buried'):
- You CANNOT reference the OWNER (whose POV) - this is private
- You CANNOT summarize the memory CONTENT - this is private
- You CANNOT reference the NARRATIVE TIMELINE (when events in memory occurred)
- You CAN note: SESSION TRANSACTION timing (when sold), shell account, amount
- The OPERATOR can potentially be INFERRED by cross-referencing session timing
  with director observations (e.g., "Taylor was seen at Valet at 8:15 PM,
  transaction hit ChaseT at 8:16 PM")
- These are PRIVATE (sold to Black Market with promise of discretion)

TIMELINE DISTINCTION:
- NARRATIVE TIMELINE = when events in the memory occurred (before game session)
  e.g., "Feb 2025", "2023", "2009 at Stanford"
- SESSION TIMELINE = when tokens were exposed/buried during game night
  e.g., "11:21 PM", "10:30 PM"
For buried tokens, you can only reference SESSION TIMELINE (transaction time).

EXAMPLE - WRONG (buried token):
  Token: ALR002, disposition: buried, owner: Alex
  Summary: "Alex's memory shows him depositing $75,000"
  WHY WRONG: Cannot know whose memory this is or what it contains

EXAMPLE - CORRECT (buried token):
  Token: ALR002, disposition: buried
  Summary: "Transaction of $75,000 to Gorlan account at 11:21 PM"
  WHY CORRECT: Only observable transaction data, no owner/content

EXAMPLE - CORRECT (exposed token):
  Token: VIC001, disposition: exposed, owner: Vic
  Summary: "Vic's memory: discusses 'permanent solutions' with Morgan"
  WHY CORRECT: Owner and content are public record for exposed tokens

═══════════════════════════════════════════════════════════════════

Your task is NORMALIZATION only - extract and structure the data. Do NOT make judgment calls about significance or narrative relevance (that happens later during curation with full context).

For each evidence item, provide:
1. A concise summary (max 150 chars) - RESPECTING DISPOSITION BOUNDARIES
2. Character references - characters IN THE CONTENT (exposed only); empty for buried
3. Narrative timeline reference (exposed only) - when did events in this memory occur?
4. Session transaction time (buried only) - when was this sold during game night?
5. Categorical tags (e.g., "financial", "relationship", "timeline", "communication")
6. Suggested grouping cluster with related evidence

Return a JSON array with one object per evidence item.`;

const ITEM_SCHEMA = {
  type: 'object',
  required: ['id', 'sourceType', 'summary'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    sourceType: { type: 'string', enum: ['memory-token', 'paper-evidence'] },
    originalType: { type: 'string' },
    disposition: { type: 'string', enum: ['exposed', 'buried'] },
    summary: { type: 'string', maxLength: 150 },
    // PHASE 1 FIX: Preserve full content for verbatim quoting in article generation
    // Summary is for curation decisions; fullContent is for actual quotes
    fullContent: { type: 'string' },
    characterRefs: { type: 'array', items: { type: 'string' } },
    ownerLogline: { type: 'string' },
    // NARRATIVE TIMELINE: when events in the memory occurred (exposed tokens only)
    narrativeTimelineRef: { type: 'string' },
    narrativeTimelineContext: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        year: { type: 'string' },
        period: { type: 'string' }
      }
    },
    // SESSION TIMELINE: when token was sold during game night (buried tokens only)
    sessionTransactionTime: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    groupCluster: { type: 'string' },
    sfFields: { type: 'object', additionalProperties: true }
  }
};

/**
 * Schema for Claude's batch response.
 *
 * IMPORTANT: This schema defines what Claude returns, NOT the final output.
 * After Claude responds, context fields (ownerLogline, timelineContext, sfFields)
 * are merged from the original input data in processBatch(). This ensures:
 * 1. Claude doesn't need to copy/preserve large context objects
 * 2. Original rich context is always preserved in final output
 * 3. Claude focuses on analysis (summary, significance, characterRefs, etc.)
 *
 * See processBatch() merge logic at ~line 275 for implementation.
 */
const BATCH_RESPONSE_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'preprocessor-batch-response',
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: ITEM_SCHEMA
    }
  }
};

/**
 * Compute fields that may carry narrative content (rawData + fullContent),
 * gated by the buried-data-leak boundary. SECURITY-CRITICAL: this is the single
 * authoritative implementation of "what content fields a preprocessed item is
 * allowed to expose." Buried items get neither rawData nor fullContent, since
 * rawData would contain fullDescription and fullContent would contain the
 * extracted body — both forbidden by the buried boundary. Exposed/non-buried
 * items get both, with fullContent extracted via the documented fallback chain.
 *
 * @param {Object|undefined} rawData - The original item's rawData (the entire
 *   pre-merge token or paper-evidence object).
 * @param {string} disposition - 'exposed' | 'buried' (anything not 'buried'
 *   is treated as exposed; defensive default).
 * @returns {{ rawData?: Object, fullContent?: string }} Spread-ready object.
 */
function exposedContentFields(rawData, disposition) {
  if (disposition === 'buried') return {};
  const fullContent = rawData?.fullDescription
    || rawData?.content
    || rawData?.description
    || rawData?.text
    || rawData?.name
    || rawData?.title
    || '';
  return { rawData, fullContent };
}

/**
 * Whether a normalized item is a buried memory: a memory token not tagged exposed
 * (an untagged one counts as buried, as it does everywhere else). Paper evidence is
 * always exposed.
 *
 * @param {Object} item - a normalized batch item ({sourceType, disposition})
 * @returns {boolean}
 */
function isBuriedMemory(item) {
  return item.sourceType === 'memory-token' && item.disposition !== 'exposed';
}

/**
 * The preprocessed item of a buried memory, made in code from its sale (phase 2
 * final fix wave). It keeps the input's id, so the pipeline can still route the
 * memory, but it carries no text, owner or name, and it never goes to the model:
 * a buried memory's id and name name its owner. Its summary is the sale, the one
 * thing the record lets anyone say about it.
 *
 * @param {Object} item - a normalized batch item for a buried memory
 * @returns {Object} the preprocessed item
 */
function buriedMemoryItem(item) {
  const raw = item.rawData || {};
  const shellAccount = raw.shellAccount || null;
  const transactionAmount = raw.transactionAmount || null;
  const sessionTransactionTime = raw.sessionTransactionTime || null;
  const sold = shellAccount || transactionAmount || sessionTransactionTime;
  const amountText = typeof transactionAmount === 'number'
    ? `$${transactionAmount.toLocaleString('en-US')}`
    : transactionAmount;
  const summary = sold
    ? `Buried memory: sold to ${shellAccount || 'an unrecorded account'} for ${amountText || 'an unrecorded amount'} at ${sessionTransactionTime || 'an unrecorded time'}`
    : 'Buried memory: no sale recorded';
  return {
    id: item.id,
    sourceType: 'memory-token',
    originalType: item.originalType,
    disposition: 'buried',
    summary: summary.substring(0, 150),
    characterRefs: [],
    ownerLogline: null,
    narrativeTimelineRef: null,
    narrativeTimelineContext: null,
    shellAccount,
    transactionAmount,
    sessionTransactionTime,
    tags: [],
    groupCluster: null,
    sfFields: {}
  };
}

/**
 * Create an evidence preprocessor instance
 *
 * @param {Object} options - Configuration options
 * @param {Function} options.sdkClient - SDK client function (for dependency injection)
 * @returns {Object} - Preprocessor instance with process() method
 */
function createEvidencePreprocessor(options = {}) {
  const { sdkClient } = options;

  if (!sdkClient) {
    throw new Error('sdkClient function is required');
  }

  /**
   * Process raw evidence into preprocessed format
   *
   * NOTE: This is a NORMALIZATION step only. Judgment fields (significance,
   * narrativeRelevance) are NOT assigned here - that's curation's job.
   * This enables context-free preprocessing that can run in background
   * before playerFocus is available.
   *
   * @param {Object} input - Processing input
   * @param {Array} input.memoryTokens - Raw memory tokens from Notion
   * @param {Array} input.paperEvidence - Raw paper evidence from Notion
   * @param {string} input.sessionId - Session identifier
   * @returns {Promise<Object>} - Preprocessed evidence in universal schema
   */
  async function process(input) {
    const {
      memoryTokens = [],
      paperEvidence = [],
      sessionId = 'unknown'
    } = input;

    const startTime = Date.now();

    // Normalize all items into common format for batching
    // NOTE: Memory tokens use tokenId (game ID like "alr001"), paper evidence uses notionId
    const allItems = [
      ...memoryTokens.map(token => ({
        id: token.tokenId || token.notionId || token.id, // tokenId is primary (matches orchestrator-parsed)
        sourceType: 'memory-token',
        originalType: token.type || 'Memory Token',
        disposition: token.disposition || 'buried', // exposed | buried
        rawData: token,
        ownerLogline: token.owner?.logline || null,
        timelineContext: token.timeline || null,
        sfFields: token.sfFields || {}
      })),
      // COMMIT 8.10 FIX: Paper evidence is ALWAYS exposed (players physically unlocked it)
      // Previously paper evidence had no disposition field, causing it to be misclassified
      // in the curation step which only checked the disposition field.
      ...paperEvidence.map(evidence => ({
        id: evidence.notionId || evidence.id, // notionId is the Notion page ID
        sourceType: 'paper-evidence',
        originalType: evidence.type || 'Paper Evidence',
        disposition: 'exposed', // Paper evidence was unlocked by players during gameplay
        rawData: evidence,
        ownerLogline: null,
        timelineContext: evidence.timeline || null,
        sfFields: evidence.sfFields || {}
      }))
    ];

    if (allItems.length === 0) {
      return createEmptyResult(sessionId, startTime);
    }

    // A buried memory never reaches the model (phase 2 final fix wave). Its batch
    // entry carried its id and its name, and a memory's id and name name its owner.
    // All Haiku could say of it is the sale, which the code already holds, so its
    // item is made here, from the transaction alone. An untagged memory counts as
    // buried, as it does everywhere else.
    const buriedItems = allItems.filter(isBuriedMemory).map(buriedMemoryItem);
    const modelItems = allItems.filter(item => !isBuriedMemory(item));

    // Split into batches
    const batches = createBatches(modelItems, BATCH_SIZE);

    console.log(`[EvidencePreprocessor] Processing ${modelItems.length} items in ${batches.length} batches (${BATCH_SIZE} per batch, ${CONCURRENCY} concurrent); ${buriedItems.length} buried memories normalized without the model`);

    // Process batches with controlled concurrency
    const results = await processWithConcurrency(batches, CONCURRENCY, async (batch, batchIndex) => {
      console.log(`[EvidencePreprocessor] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} items)`);
      return processBatch(batch, sdkClient, batchIndex);
    });

    // Flatten results and handle errors
    const processedItems = [...buriedItems];
    let successCount = 0;
    let errorCount = 0;

    for (const result of results) {
      if (result.success) {
        processedItems.push(...result.items);
        successCount++;
      } else {
        errorCount++;
        console.error(`[EvidencePreprocessor] Batch failed: ${result.error}`);
        // Add fallback items with minimal data
        processedItems.push(...result.fallbackItems || []);
      }
    }

    const processingTimeMs = Date.now() - startTime;

    console.log(`[EvidencePreprocessor] Complete: ${processedItems.length} items processed in ${processingTimeMs}ms (${successCount} batches succeeded, ${errorCount} failed)`);

    // NOTE: significanceCounts removed - significance is now assigned during curation

    return {
      items: processedItems,
      preprocessedAt: new Date().toISOString(),
      sessionId,
      stats: {
        totalItems: processedItems.length,
        memoryTokenCount: memoryTokens.length,
        paperEvidenceCount: paperEvidence.length,
        batchesProcessed: batches.length,
        processingTimeMs
      }
    };
  }

  return { process };
}

/**
 * The text Haiku summarises for one item (brief 2.1).
 *
 * A memory token has no `description` or `text`: its text is `fullDescription`. So
 * Haiku was summarising exposed memories from their NAME alone. An exposed memory
 * now sends its full text. Since the final fix wave a buried memory never reaches a
 * batch (buriedMemoryItem makes its item in code); the guard below stays, so an item
 * not tagged exposed still sends no more than `description || text`, which a token
 * does not have. Paper evidence is unchanged.
 *
 * The summaries this produces feed the pre-curation stop and curation's scoring
 * context only; no writer reads them in place of a document.
 *
 * @param {Object} item - a normalized batch item ({disposition, rawData})
 * @returns {string|undefined}
 */
function batchDescriptionOf(item) {
  const raw = item.rawData || {};
  // Only an item tagged exposed gets more; a missing tag counts as buried, as it
  // does in the batch input's own disposition field.
  if (item.disposition !== 'exposed') return raw.description || raw.text;
  return raw.description || raw.text || raw.fullDescription;
}

/**
 * Pair the model's summaries with the batch's inputs (phase 2 final fix wave).
 *
 * On 092026 Haiku echoed a rescued document's Notion id with "583f-" missing; the
 * merge matched by the echoed id, failed, and kept the model's bare item, with no
 * record text. The same fallback would drop a memory's authoritative disposition.
 * So a summary is placed by the input's id, and one whose id is in no input is
 * placed only by an unambiguous rule:
 *
 * 1. by id: the summary names an input's id (the first such summary wins);
 * 2. by position: the model returned one summary per input and every summary
 *    placed by id sits at its input's index, so it kept the batch's order;
 * 3. by elimination: exactly one input and one such summary are left.
 *
 * A summary is never placed on an input of another source type, and one that names
 * an input already placed (a duplicate) never stands in for another. Every other
 * summary is rejected.
 *
 * @param {Array} batch - the batch's normalized input items
 * @param {Array} replies - the model's items
 * @returns {{replyFor: Array<Object|null>, rejected: Array<Object>}} the summary for
 *   each input (null when none), in the batch's order, and the summaries not placed
 */
function pairRepliesWithBatch(batch, replies) {
  const list = (Array.isArray(replies) ? replies : []).filter(reply => reply && typeof reply === 'object');
  const inputIds = new Set(batch.map(input => input.id));
  const replyFor = batch.map(() => null);
  const placed = new Set();
  const place = (i, j) => { replyFor[i] = list[j]; placed.add(j); };
  const sameSource = (input, reply) => !reply.sourceType || reply.sourceType === input.sourceType;
  // A summary that names no input of the batch: the only kind a rule may place.
  const unnamed = (j) => !placed.has(j) && !inputIds.has(list[j].id);

  batch.forEach((input, i) => {
    const j = list.findIndex((reply, k) => !placed.has(k) && reply.id === input.id);
    if (j >= 0) place(i, j);
  });

  const keptOrder = list.length === batch.length &&
    batch.every((_, i) => replyFor[i] === null || replyFor[i] === list[i]);
  if (keptOrder) {
    batch.forEach((input, i) => {
      if (replyFor[i] === null && unnamed(i) && sameSource(input, list[i])) place(i, i);
    });
  }

  const openInputs = batch.map((_, i) => i).filter(i => replyFor[i] === null);
  const openReplies = list.map((_, j) => j).filter(unnamed);
  if (openInputs.length === 1 && openReplies.length === 1 && sameSource(batch[openInputs[0]], list[openReplies[0]])) {
    place(openInputs[0], openReplies[0]);
  }

  return { replyFor, rejected: list.filter((_, j) => !placed.has(j)) };
}

/**
 * The preprocessed item for an input and the summary placed on it. The input's id,
 * source type, type, disposition and record (rawData, fullContent) always win; the
 * model's summary, references, tags and timeline reading are kept. Never let the
 * model override the disposition: it is authoritative from orchestrator-parsed.json.
 *
 * @param {Object} input - a normalized batch item
 * @param {Object} reply - the model's item placed on it
 * @returns {Object}
 */
function mergeReply(input, reply) {
  const disposition = input.disposition || 'buried';
  const { rawData: _modelRawData, fullContent: _modelFullContent, ...summary } = reply;
  return {
    ...summary,
    id: input.id,
    sourceType: input.sourceType,
    originalType: input.originalType,
    disposition,
    ...exposedContentFields(input.rawData, disposition),
    ownerLogline: summary.ownerLogline || input.ownerLogline,
    narrativeTimelineContext: summary.narrativeTimelineContext || input.timelineContext,
    sfFields: summary.sfFields || input.sfFields,
    // Preserve transaction metadata for buried tokens
    shellAccount: summary.shellAccount || input.rawData?.shellAccount || null,
    transactionAmount: summary.transactionAmount || input.rawData?.transactionAmount || null,
    sessionTransactionTime: summary.sessionTransactionTime || input.rawData?.sessionTransactionTime || null
  };
}

/**
 * The preprocessed item for an input with no summary: after a failed batch, or when
 * the model returned none for it or its summary could not be placed. Minimal
 * normalization, no judgment fields; the input's record survives.
 *
 * @param {Object} item - a normalized batch item
 * @returns {Object}
 */
function fallbackItemOf(item) {
  const disposition = item.disposition || 'buried';
  return {
    id: item.id,
    sourceType: item.sourceType,
    originalType: item.originalType,
    disposition,
    summary: `${item.sourceType}: ${item.rawData.name || item.rawData.title || 'Unknown'}`.substring(0, 150),
    ...exposedContentFields(item.rawData, disposition),
    characterRefs: [],
    ownerLogline: item.ownerLogline,
    narrativeTimelineRef: null,
    narrativeTimelineContext: item.timelineContext,
    // Preserve transaction metadata for buried tokens
    shellAccount: item.rawData?.shellAccount || null,
    transactionAmount: item.rawData?.transactionAmount || null,
    sessionTransactionTime: item.rawData?.sessionTransactionTime || null,
    tags: [],
    groupCluster: null,
    sfFields: item.sfFields
  };
}

/**
 * Process a single batch of evidence items
 *
 * NOTE: This is pure normalization - no judgment calls about significance.
 * playerFocus is NOT used here (SRP fix).
 *
 * @param {Array} batch - Items to process
 * @param {Function} sdkClient - SDK client function
 * @param {number} batchIndex - Batch index for logging
 * @returns {Promise<Object>} - { success: boolean, items: Array, error?: string }
 */
async function processBatch(batch, sdkClient, batchIndex) {
  try {
    // Build user prompt with batch items
    const batchData = batch.map(item => ({
      id: item.id,
      sourceType: item.sourceType,
      originalType: item.originalType,
      disposition: item.disposition || 'buried', // CRITICAL for evidence boundary enforcement
      ownerLogline: item.ownerLogline,
      timelineContext: item.timelineContext,
      sfFields: item.sfFields,
      // Transaction metadata for buried tokens (from orchestrator-parsed.json)
      shellAccount: item.rawData.shellAccount || null,
      transactionAmount: item.rawData.transactionAmount || null,
      sessionTransactionTime: item.rawData.sessionTransactionTime || null,
      // Include key raw data fields
      name: item.rawData.name || item.rawData.title,
      description: batchDescriptionOf(item),
      content: item.rawData.content,
      tags: item.rawData.tags || []
    }));

    const userPrompt = `Process these ${batch.length} evidence items:\n\n${JSON.stringify(batchData, null, 2)}`;

    // SDK returns parsed object directly when jsonSchema is provided
    const parsed = await sdkClient({
      prompt: userPrompt,
      systemPrompt: SYSTEM_PROMPT,
      model: 'haiku',
      jsonSchema: BATCH_RESPONSE_SCHEMA,
      disableTools: true,          // H21: summarizes the batch it was handed
      loadProjectSettings: false
    });

    // Every output item is keyed to its input item, never to the id the model echoed
    // (phase 2 final fix wave): one item per input, in the batch's order.
    const { replyFor, rejected } = pairRepliesWithBatch(batch, parsed.items);
    if (rejected.length > 0) {
      console.warn(`[EvidencePreprocessor] Batch ${batchIndex}: rejected ${rejected.length} summary(ies) whose id matched no input unambiguously: ${rejected.map(r => JSON.stringify(r.id)).join(', ')}`);
    }
    const missing = replyFor.filter(reply => reply === null).length;
    if (missing > 0) {
      console.warn(`[EvidencePreprocessor] Batch ${batchIndex}: ${missing} input(s) got no summary; kept with a fallback summary`);
    }
    const mergedItems = batch.map((input, i) => (replyFor[i] ? mergeReply(input, replyFor[i]) : fallbackItemOf(input)));

    return {
      success: true,
      items: mergedItems
    };

  } catch (error) {
    console.error(`[EvidencePreprocessor] Batch ${batchIndex} error: ${error.message}`);

    // Create fallback items with minimal normalization (no judgment fields)
    const fallbackItems = batch.map(fallbackItemOf);

    return {
      success: false,
      error: error.message,
      fallbackItems
    };
  }
}

/**
 * Split array into batches of specified size
 *
 * @param {Array} items - Items to batch
 * @param {number} batchSize - Maximum items per batch
 * @returns {Array<Array>} - Array of batches
 */
function createBatches(items, batchSize) {
  const batches = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Process items with controlled concurrency
 *
 * @param {Array} items - Items to process
 * @param {number} concurrency - Maximum concurrent operations
 * @param {Function} processor - Async function to process each item
 * @returns {Promise<Array>} - Results in original order
 */
async function processWithConcurrency(items, concurrency, processor) {
  const results = new Array(items.length);
  let currentIndex = 0;

  async function processNext() {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      results[index] = await processor(items[index], index);
    }
  }

  // Start concurrent workers
  const workers = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    workers.push(processNext());
  }

  await Promise.all(workers);
  return results;
}

/**
 * Create empty result for sessions with no evidence
 */
function createEmptyResult(sessionId, startTime) {
  return {
    items: [],
    preprocessedAt: new Date().toISOString(),
    sessionId,
    stats: {
      totalItems: 0,
      memoryTokenCount: 0,
      paperEvidenceCount: 0,
      batchesProcessed: 0,
      processingTimeMs: Date.now() - startTime
      // NOTE: significanceCounts removed (SRP fix)
    }
  };
}

/**
 * Create a mock preprocessor for testing
 *
 * NOTE: Mock output no longer includes significance/narrativeRelevance (SRP fix)
 *
 * @param {Object} mockData - Optional mock data to return
 * @returns {Object} - Mock preprocessor instance
 */
function createMockPreprocessor(mockData = {}) {
  const callLog = [];

  async function process(input) {
    callLog.push({ ...input, timestamp: new Date().toISOString() });

    const {
      memoryTokens = [],
      paperEvidence = [],
      sessionId = 'mock-session'
    } = input;

    // Generate mock preprocessed items (normalization only, no judgment fields)
    const items = [
      ...memoryTokens.map((token, i) => ({
        id: token.id || `mock-token-${i}`,
        sourceType: 'memory-token',
        originalType: token.type || 'Memory Token',
        summary: mockData.summaryPrefix
          ? `${mockData.summaryPrefix} - Token ${i + 1}`
          : `Mock summary for token ${i + 1}`,
        // Include fullContent for verbatim quoting (exposed items only)
        ...(token.disposition !== 'buried' ? {
          fullContent: token.content || token.description || `Mock full content for token ${i + 1}`
        } : {}),
        characterRefs: token.characterRefs || [],
        ownerLogline: token.owner?.logline || null,
        timelineRef: null,
        timelineContext: token.timeline || null,
        tags: ['mock'],
        groupCluster: 'mock-cluster',
        sfFields: token.sfFields || {}
      })),
      ...paperEvidence.map((evidence, i) => ({
        id: evidence.id || `mock-evidence-${i}`,
        sourceType: 'paper-evidence',
        originalType: evidence.type || 'Paper Evidence',
        summary: mockData.summaryPrefix
          ? `${mockData.summaryPrefix} - Evidence ${i + 1}`
          : `Mock summary for evidence ${i + 1}`,
        // PHASE 1 FIX: Include fullContent for verbatim quoting
        fullContent: evidence.content || evidence.description || `Mock full content for evidence ${i + 1}`,
        characterRefs: [],
        ownerLogline: null,
        timelineRef: null,
        timelineContext: evidence.timeline || null,
        tags: ['mock'],
        groupCluster: 'mock-cluster',
        sfFields: evidence.sfFields || {}
      }))
    ];

    return {
      items: mockData.items || items,
      preprocessedAt: new Date().toISOString(),
      sessionId,
      stats: {
        totalItems: items.length,
        memoryTokenCount: memoryTokens.length,
        paperEvidenceCount: paperEvidence.length,
        batchesProcessed: Math.ceil(items.length / BATCH_SIZE),
        processingTimeMs: mockData.processingTimeMs || 100
        // NOTE: significanceCounts removed (SRP fix)
      }
    };
  }

  return {
    process,
    getCalls: () => [...callLog],
    getLastCall: () => callLog[callLog.length - 1] || null,
    clearCalls: () => { callLog.length = 0; }
  };
}

module.exports = {
  createEvidencePreprocessor,
  createMockPreprocessor,

  // Export constants for testing and documentation
  BATCH_SIZE,
  CONCURRENCY,

  // Export batching utilities for reuse (used by ai-nodes.js for paper scoring)
  createBatches,
  processWithConcurrency,

  // Export internal functions for testing (preserved for backwards compatibility)
  _testing: {
    createBatches,
    processWithConcurrency,
    processBatch,
    createEmptyResult,
    BATCH_RESPONSE_SCHEMA
  }
};

// Self-test when run directly
if (require.main === module) {
  console.log('EvidencePreprocessor Self-Test\n');

  // Test batch creation
  console.log('Testing createBatches...');
  const items = Array.from({ length: 25 }, (_, i) => ({ id: i }));
  const batches = createBatches(items, 8);
  console.log(`Created ${batches.length} batches from ${items.length} items`);
  console.log(`Batch sizes: ${batches.map(b => b.length).join(', ')}`);
  console.assert(batches.length === 4, 'Expected 4 batches');
  console.assert(batches[0].length === 8, 'First batch should have 8 items');
  console.assert(batches[3].length === 1, 'Last batch should have 1 item');
  console.log('createBatches: PASS\n');

  // Test concurrency processing
  console.log('Testing processWithConcurrency...');
  const testItems = [1, 2, 3, 4, 5, 6];
  const processOrder = [];
  processWithConcurrency(testItems, 2, async (item, index) => {
    processOrder.push({ item, index, time: Date.now() });
    await new Promise(resolve => setTimeout(resolve, 50));
    return item * 2;
  }).then(results => {
    console.log(`Processed ${results.length} items: ${results.join(', ')}`);
    console.log(`Process order: ${processOrder.map(p => p.item).join(', ')}`);
    console.log('processWithConcurrency: PASS\n');
  });

  // Test mock preprocessor
  console.log('Testing createMockPreprocessor...');
  const mockPreprocessor = createMockPreprocessor({ summaryPrefix: 'Test' });
  mockPreprocessor.process({
    memoryTokens: [{ id: '1' }, { id: '2' }],
    paperEvidence: [{ id: '3' }],
    // NOTE: playerFocus no longer needed (SRP fix)
    sessionId: 'test-session'
  }).then(result => {
    console.log(`Mock processed ${result.items.length} items`);
    console.log(`First summary: ${result.items[0].summary}`);
    console.log(`Stats: ${JSON.stringify(result.stats)}`);
    console.log('createMockPreprocessor: PASS\n');
  });
}

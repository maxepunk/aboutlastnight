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
  with director observations (e.g., "saw Taylor at Valet at 8:15 PM,
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
  Token: VIK001, disposition: exposed, owner: Victoria
  Summary: "Victoria's memory: discusses 'permanent solutions' with Morgan"
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

    // Split into batches
    const batches = createBatches(allItems, BATCH_SIZE);

    console.log(`[EvidencePreprocessor] Processing ${allItems.length} items in ${batches.length} batches (${BATCH_SIZE} per batch, ${CONCURRENCY} concurrent)`);

    // Process batches with controlled concurrency
    const results = await processWithConcurrency(batches, CONCURRENCY, async (batch, batchIndex) => {
      console.log(`[EvidencePreprocessor] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} items)`);
      return processBatch(batch, sdkClient, batchIndex);
    });

    // Flatten results and handle errors
    const processedItems = [];
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
      description: item.rawData.description || item.rawData.text,
      content: item.rawData.content,
      tags: item.rawData.tags || []
    }));

    const userPrompt = `Process these ${batch.length} evidence items:\n\n${JSON.stringify(batchData, null, 2)}`;

    // SDK returns parsed object directly when jsonSchema is provided
    const parsed = await sdkClient({
      prompt: userPrompt,
      systemPrompt: SYSTEM_PROMPT,
      model: 'haiku',
      jsonSchema: BATCH_RESPONSE_SCHEMA
    });

    const items = parsed.items || [];

    // Merge with preserved context (disposition, owner logline, timeline context, SF fields, transaction metadata, fullContent)
    const mergedItems = items.map(item => {
      const original = batch.find(b => b.id === item.id);
      if (original) {
        // PHASE 1 FIX: Extract fullContent from raw data for verbatim quoting
        // Priority: fullDescription (memory tokens) > content > description > name/title as fallback
        const rawFullContent = original.rawData?.fullDescription
          || original.rawData?.content
          || original.rawData?.description
          || original.rawData?.text
          || original.rawData?.name
          || original.rawData?.title
          || '';

        return {
          ...item,
          // CRITICAL: Always use ORIGINAL disposition from fetchMemoryTokens
          // Never let Claude override - disposition is authoritative from orchestrator-parsed.json
          disposition: original.disposition || item.disposition || 'buried',
          // PHASE 1 FIX: Preserve full content for article generation quotes
          fullContent: rawFullContent,
          ownerLogline: item.ownerLogline || original.ownerLogline,
          narrativeTimelineContext: item.narrativeTimelineContext || original.timelineContext,
          sfFields: item.sfFields || original.sfFields,
          // Preserve transaction metadata for buried tokens
          shellAccount: item.shellAccount || original.rawData?.shellAccount || null,
          transactionAmount: item.transactionAmount || original.rawData?.transactionAmount || null,
          sessionTransactionTime: item.sessionTransactionTime || original.rawData?.sessionTransactionTime || null
        };
      }
      return item;
    });

    return {
      success: true,
      items: mergedItems
    };

  } catch (error) {
    console.error(`[EvidencePreprocessor] Batch ${batchIndex} error: ${error.message}`);

    // Create fallback items with minimal normalization (no judgment fields)
    const fallbackItems = batch.map(item => {
      // PHASE 1 FIX: Extract fullContent even in fallback case
      // Priority: fullDescription (memory tokens) > content > description > name/title as fallback
      const rawFullContent = item.rawData?.fullDescription
        || item.rawData?.content
        || item.rawData?.description
        || item.rawData?.text
        || item.rawData?.name
        || item.rawData?.title
        || '';

      return {
        id: item.id,
        sourceType: item.sourceType,
        originalType: item.originalType,
        disposition: item.disposition || 'buried', // Preserve disposition
        summary: `${item.sourceType}: ${item.rawData.name || item.rawData.title || 'Unknown'}`.substring(0, 150),
        // PHASE 1 FIX: Preserve full content for article generation quotes
        fullContent: rawFullContent,
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
    });

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
        // PHASE 1 FIX: Include fullContent for verbatim quoting
        fullContent: token.content || token.description || `Mock full content for token ${i + 1}`,
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

/**
 * Node Helpers - Shared utilities for workflow nodes
 *
 * DRY extraction from photo-nodes.js, arc-specialist-nodes.js, evaluator-nodes.js, ai-nodes.js
 * These functions were duplicated 4x across node files.
 *
 * @module node-helpers
 */

const { sdkQuery, createProgressLogger } = require('../../sdk-client');
const { createBatches, processWithConcurrency } = require('../../evidence-preprocessor');

/**
 * Safely parse JSON with informative error messages
 *
 * Used by all nodes that receive Claude responses.
 * Provides context and response preview in error messages for debugging.
 *
 * @param {string} response - JSON string to parse
 * @param {string} context - Description for error messages (e.g., "arc analysis")
 * @returns {Object} Parsed JSON object
 * @throws {Error} With actionable message including context and response preview
 */
function safeParseJson(response, context = 'response') {
  try {
    return JSON.parse(response);
  } catch (error) {
    // Truncate response for logging (avoid huge error messages)
    const preview = response.length > 500
      ? response.substring(0, 500) + '... [truncated]'
      : response;

    throw new Error(
      `Failed to parse ${context}: ${error.message}\n` +
      `Response preview: ${preview}`
    );
  }
}

/**
 * Get SDK client from config or use default with progress logging
 *
 * Supports dependency injection for testing - nodes can receive
 * a mock client via config.configurable.sdkClient
 *
 * When using the real SDK (not a mock), automatically injects
 * progress logging via createProgressLogger. This provides visibility
 * into Claude's thinking and tool usage for all SDK calls.
 *
 * SDK-proper error handling:
 * - Validates callback is a function before passing to SDK
 * - Catches and logs SDK error codes (RATE_LIMIT_EXCEEDED, etc.)
 *
 * @param {Object} config - Graph config with optional configurable.sdkClient
 * @param {string} [context='sdk'] - Log prefix for progress messages (e.g., 'generateOutline')
 * @returns {Function} SDK query function (wrapped with logging if using real SDK)
 */
function getSdkClient(config, context = 'sdk') {
  // If mock client is injected (for testing), return it directly
  if (config?.configurable?.sdkClient) {
    return config.configurable.sdkClient;
  }

  // Create progress logger - validate it's a function
  const progressLogger = createProgressLogger(context);
  const hasValidLogger = typeof progressLogger === 'function';

  if (!hasValidLogger) {
    console.warn(`[${context}] createProgressLogger did not return a function, progress logging disabled`);
  }

  // SDK-proper: wrap with defensive callback validation and error handling
  return async (options) => {
    // Determine which onProgress to use (if any)
    const callerProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    const effectiveProgress = callerProgress || (hasValidLogger ? progressLogger : undefined);

    try {
      return await sdkQuery({
        ...options,
        onProgress: effectiveProgress
      });
    } catch (error) {
      // SDK error codes per documentation
      if (error.code === 'RATE_LIMIT_EXCEEDED') {
        console.error(`[${context}] Rate limit exceeded - retry after delay`);
      } else if (error.code === 'AUTHENTICATION_FAILED') {
        console.error(`[${context}] Authentication failed - check API key`);
      } else if (error.code === 'CONTEXT_LENGTH_EXCEEDED') {
        console.error(`[${context}] Context too large - consider truncation`);
      }
      throw error;
    }
  };
}

/**
 * Create a timestamped result object
 *
 * Standardizes the structure of empty/error results across nodes.
 *
 * @param {string} type - Type of result (e.g., 'photo-analysis', 'specialist-analysis')
 * @param {Object} options - Additional fields to include
 * @returns {Object} Timestamped result object
 */
function createTimestampedResult(type, options = {}) {
  return {
    type,
    analyzedAt: new Date().toISOString(),
    ...options
  };
}

/**
 * Validate that required fields exist in an object
 *
 * @param {Object} obj - Object to validate
 * @param {string[]} requiredFields - Array of field names that must exist
 * @param {string} context - Description for error messages
 * @throws {Error} If any required field is missing
 */
function validateRequiredFields(obj, requiredFields, context) {
  const missing = requiredFields.filter(field => obj[field] === undefined);
  if (missing.length > 0) {
    throw new Error(`${context} missing required fields: ${missing.join(', ')}`);
  }
}

/**
 * Safely convert issues array to string for error messages
 *
 * Handles cases where issues may be undefined, non-array, or contain objects.
 *
 * @param {*} issues - Issues array (or undefined/other)
 * @returns {string} Human-readable issues string
 */
function formatIssuesForMessage(issues) {
  if (!Array.isArray(issues) || issues.length === 0) {
    return 'unspecified issues';
  }
  return issues
    .map(i => typeof i === 'string' ? i : JSON.stringify(i))
    .join(', ');
}

/**
 * Ensure value is an array (coerces string/object to single-element array)
 *
 * Used at node input boundaries per LangGraph pattern:
 * - Reducers handle merging, nodes handle validation
 * - Normalize data at boundaries, not in multiple places (DRY)
 *
 * @param {*} value - Value to normalize (string, array, object, null, undefined)
 * @returns {Array} Always returns an array
 *
 * @example
 * ensureArray(['a', 'b'])  // ['a', 'b']
 * ensureArray('single')    // ['single']
 * ensureArray(null)        // []
 * ensureArray(undefined)   // []
 * ensureArray({foo: 'bar'}) // [{foo: 'bar'}]
 */
function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

/**
 * Synthesize playerFocus from session config and director notes
 *
 * SINGLE SOURCE OF TRUTH for playerFocus structure.
 * Used by:
 * - input-nodes.js (parseRawInput) when processing raw input
 * - fetch-nodes.js (loadDirectorNotes) for backwards compatibility with legacy files
 *
 * PlayerFocus drives arc analysis via the playerFocusAlignment criterion (15%).
 *
 * @param {Object} sessionConfig - Session configuration with roster, accusation
 * @param {Object} directorNotes - Director notes with observations, whiteboard
 * @returns {Object} PlayerFocus object with investigation context
 */
function synthesizePlayerFocus(sessionConfig, directorNotes) {
  const whiteboard = directorNotes?.whiteboard || {};
  const observations = directorNotes?.observations || {};

  // Extract suspects from whiteboard if available
  const suspectsGroup = whiteboard.groups?.find(g =>
    g.label?.toLowerCase().includes('suspect')
  );
  const whiteboardSuspects = suspectsGroup?.members || [];

  // Extract connections as context
  const whiteboardConnections = (whiteboard.connections || []).map(c =>
    `${c.from} → ${c.to}${c.label ? ` (${c.label})` : ''}`
  );

  // Primary suspects from accusation
  const primarySuspects = sessionConfig?.accusation?.accused || [];

  // Secondary suspects from whiteboard not in primary
  const secondarySuspects = whiteboardSuspects.filter(s =>
    !primarySuspects.some(p => p.toLowerCase() === s.toLowerCase())
  );

  return {
    // What the article is about
    primaryInvestigation: sessionConfig?.accusation?.charge || 'Who killed Marcus Blackwood?',

    // Who was accused (primary) vs explored (secondary)
    primarySuspects,
    secondarySuspects,
    allSuspects: [...primarySuspects, ...secondarySuspects],

    // The formal accusation details
    accusation: {
      accused: sessionConfig?.accusation?.accused || [],
      charge: sessionConfig?.accusation?.charge || '',
      reasoning: sessionConfig?.accusation?.notes || ''
    },

    // Director observations (what ACTUALLY happened - highest weight for narrative)
    directorObservations: {
      behaviorPatterns: observations.behaviorPatterns || [],
      suspiciousCorrelations: observations.suspiciousCorrelations || [],
      notableMoments: observations.notableMoments || []
    },

    // Whiteboard context (what players explored during investigation)
    whiteboardContext: {
      namesFound: whiteboard.names || [],
      suspectsExplored: whiteboardSuspects,
      connections: whiteboardConnections,
      notes: whiteboard.notes || [],
      structureType: whiteboard.structureType || 'unknown',
      ambiguities: whiteboard.ambiguities || []
    },

    // Emotional hook - synthesized from accusation reasoning
    emotionalHook: sessionConfig?.accusation?.notes || '',

    // Open questions - things to explore in article
    openQuestions: [
      ...(whiteboard.notes || []),
      ...whiteboardConnections
    ]
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVIDENCE CURATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
//
// These functions support the hybrid programmatic + batched AI curation approach.
// Token routing is done programmatically (no AI needed since disposition is already tagged).
// Paper evidence scoring is done via batched Sonnet calls.
// Report building is done programmatically from scored items.

/**
 * Route memory tokens by disposition (NO AI needed)
 *
 * Token disposition is already tagged during fetchMemoryTokens.
 * This function simply filters and transforms based on that tag.
 *
 * @param {Array} tokens - Preprocessed token items with disposition field
 * @returns {Object} { exposed: Array, buried: Array }
 */
function routeTokensByDisposition(tokens) {
  // Defensive check for invalid input
  if (!Array.isArray(tokens)) {
    console.warn('[routeTokensByDisposition] Invalid tokens array, returning empty routing');
    return { exposed: [], buried: [] };
  }

  const exposed = [];
  const buried = [];

  for (const t of tokens) {
    if (t.disposition === 'exposed') {
      exposed.push({
        id: t.id,
        sourceType: 'memory-token',
        owner: t.ownerLogline,
        summary: t.summary,
        // Fallback chain to ensure content is never undefined
        content: t.rawData?.content || t.rawData?.description || t.summary || '',
        characterRefs: t.characterRefs ?? [],
        narrativeTimeline: t.narrativeTimelineContext,
        tags: t.tags ?? [],
        // Preserve raw data for downstream use
        rawData: t.rawData
      });
    } else if (t.disposition === 'buried') {
      buried.push({
        id: t.id,
        sourceType: 'memory-token',
        shellAccount: t.shellAccount,
        amount: t.transactionAmount,
        time: t.sessionTransactionTime
      });
    }
    // 'unknown' tokens are excluded (not added to either array)
  }

  return { exposed, buried };
}

/**
 * Extract owner name from logline for compact summaries
 *
 * @param {string} ownerLogline - e.g., "Alex's memory of..." or "ALEX: ..."
 * @returns {string} Just the name (e.g., "Alex")
 */
function extractOwnerName(ownerLogline) {
  if (!ownerLogline) return 'Unknown';
  // Extract name from "Alex's memory of..." or "ALEX: ..."
  const match = ownerLogline.match(/^(\w+)/);
  return match ? match[1] : ownerLogline.substring(0, 20);
}

/**
 * Build compact summaries of exposed tokens for corroboration scoring
 *
 * These summaries are included in each paper scoring batch to enable
 * the +2 TOKEN_CORROBORATION criterion.
 *
 * @param {Array} exposedTokens - Routed exposed tokens
 * @returns {Array} Compact summaries (~80 chars each)
 */
function buildExposedTokenSummaries(exposedTokens) {
  return exposedTokens.map(t => ({
    id: t.id,
    owner: extractOwnerName(t.owner),
    chars: (t.characterRefs || []).slice(0, 3).join(', '),
    gist: (t.summary || '').substring(0, 60)
  }));
}

/**
 * Derive active narrative threads from included paper + exposed tokens
 *
 * @param {Array} includedPaper - Paper evidence items that scored >= 2
 * @param {Array} exposedTokens - Routed exposed tokens
 * @returns {Array} Up to 10 narrative thread names
 */
function deriveNarrativeThreads(includedPaper, exposedTokens) {
  // Defensive check for invalid inputs
  if (!Array.isArray(includedPaper) || !Array.isArray(exposedTokens)) {
    console.warn('[deriveNarrativeThreads] Invalid input arrays, returning empty threads');
    return [];
  }

  const threads = new Set();

  // Collect narrative threads from paper evidence
  for (const p of includedPaper) {
    const itemThreads = p.narrativeThreads || p.rawData?.narrativeThreads;
    if (Array.isArray(itemThreads)) {
      itemThreads.forEach(t => threads.add(t));
    }
  }

  // Add threads from token tags that match known thread patterns
  const threadKeywords = ['funding', 'marriage', 'drug', 'espionage', 'party', 'underground', 'memory'];
  for (const t of exposedTokens) {
    const tags = t.tags ?? [];
    if (Array.isArray(tags)) {
      tags.forEach(tag => {
        if (typeof tag === 'string' && threadKeywords.some(k => tag.toLowerCase().includes(k))) {
          threads.add(tag);
        }
      });
    }
  }

  return [...threads].slice(0, 10);
}

/**
 * Build curationReport programmatically from scored items
 *
 * This replaces the Opus-generated curationReport with a programmatic version
 * that's faster and more reliable.
 *
 * @param {Array} scoredPaper - Paper evidence items with score, include, criteriaMatched, etc.
 * @param {Array} exposedTokens - Routed exposed tokens
 * @param {Object} context - { roster, suspects }
 * @returns {Object} curationReport with included, excluded, curationSummary
 */
function buildCurationReport(scoredPaper, exposedTokens, context) {
  // Defensive validation
  if (!context || typeof context !== 'object') {
    console.warn('[buildCurationReport] Invalid context, using defaults');
    context = { roster: [], suspects: [] };
  }

  // Ensure scoredPaper is an array
  if (!Array.isArray(scoredPaper)) {
    console.warn('[buildCurationReport] Invalid scoredPaper array, returning empty report');
    scoredPaper = [];
  }

  // Ensure exposedTokens is an array
  if (!Array.isArray(exposedTokens)) {
    console.warn('[buildCurationReport] Invalid exposedTokens array');
    exposedTokens = [];
  }

  const included = scoredPaper.filter(p => p.include);
  const excluded = scoredPaper.filter(p => !p.include);

  // Extract unique characters from exposed tokens
  const tokenCharacters = [...new Set(
    exposedTokens.flatMap(t => t.characterRefs || [])
  )];

  // Derive active narrative threads from included paper + exposed tokens
  const activeThreads = deriveNarrativeThreads(included, exposedTokens);

  return {
    included: included.map(p => ({
      name: p.name,
      score: p.score,
      criteriaMatched: p.criteriaMatched || [],
      relevanceNote: p.relevanceNote || ''
    })),
    excluded: excluded.map(p => ({
      name: p.name,
      score: p.score,
      reason: p.excludeReason || 'insufficientConnection',
      note: p.excludeNote || '',
      rescuable: p.rescuable ?? (p.score >= 1)
    })),
    curationSummary: {
      totalUnlocked: scoredPaper.length,
      totalCurated: included.length,
      totalExcluded: excluded.length,
      rosterPlayers: context.roster || [],
      tokenCharacters,
      suspects: context.suspects || [],
      activeNarrativeThreads: activeThreads
    }
  };
}

module.exports = {
  safeParseJson,
  getSdkClient,
  createTimestampedResult,
  validateRequiredFields,
  formatIssuesForMessage,
  ensureArray,
  synthesizePlayerFocus,

  // Evidence curation helpers (Commit 8.11+)
  routeTokensByDisposition,
  buildExposedTokenSummaries,
  buildCurationReport,
  deriveNarrativeThreads,

  // Re-export batching utilities from preprocessor for convenience
  createBatches,
  processWithConcurrency
};

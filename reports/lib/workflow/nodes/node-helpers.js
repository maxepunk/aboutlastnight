/**
 * Node Helpers - Shared utilities for workflow nodes
 *
 * DRY extraction from photo-nodes.js, arc-specialist-nodes.js, evaluator-nodes.js, ai-nodes.js
 * These functions were duplicated 4x across node files.
 *
 * @module node-helpers
 */

const { sdkQuery, createProgressLogger } = require('../../llm');
const { createBatches, processWithConcurrency, pairRepliesWithBatch } = require('../../evidence-preprocessor');
const { getCanonicalName, getThemeNPCs } = require('../../theme-config');
const { carriedEdits, formatEditLines, CHANGED_EDITS_KEY } = require('../../hand-edit-diff');
const { SHOULD_CONSIDER_PREAMBLE } = require('../../prompt-builder');

// ═══════════════════════════════════════════════════════════════════════════
// NPC VALIDATION
// Commit 8.17: Theme-configurable NPC allowlist for arc validation
// NPCs are defined in lib/theme-config.js (DRY/SOLID - single source of truth)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a character name is a known NPC
 * NPCs are valid in characterPlacements but don't count toward roster coverage.
 *
 * Uses word-boundary matching to avoid false positives:
 * - "Marcus" matches "Marcus", "Marcus Blackwood" ✓
 * - "Nova" matches "Nova", "Leyla Nova" ✓
 * - "Renovated" does NOT match "Nova" ✓
 *
 * @param {string} name - Character name to check
 * @param {string[]} npcs - Array of NPC names from theme config
 * @returns {boolean} True if known NPC
 */
function isKnownNPC(name, npcs = []) {
  if (!name || !Array.isArray(npcs) || npcs.length === 0) return false;
  const normalized = name.toLowerCase().trim();

  return npcs.some(npc => {
    const npcLower = npc.toLowerCase();
    // Exact match
    if (normalized === npcLower) return true;

    // Word-boundary match (handles "Leyla Nova", "Marcus Blackwood", etc.)
    // Matches if NPC name appears as a complete word
    const wordBoundaryRegex = new RegExp(`\\b${npcLower}\\b`, 'i');
    return wordBoundaryRegex.test(name);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// NON-ROSTER PC VALIDATION (Commit 8.xx)
// Three-category character model: Roster PCs, NPCs, Non-Roster PCs
// Non-roster PCs = valid game characters NOT in session roster and NOT NPCs
// They can appear in arcs (evidence-based mentions) but don't count for coverage
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a character is a non-roster PC
 *
 * Non-roster PCs are valid game characters (in canonicalCharacters) who:
 * - Are NOT in this session's roster (weren't present at investigation)
 * - Are NOT NPCs (Marcus, Nova, Blake, Valet)
 *
 * They CAN appear in arcs because evidence mentions them, but Nova didn't
 * observe their behavior directly. Their roles must be evidence-based.
 *
 * Uses word-boundary matching consistent with isKnownNPC().
 *
 * @param {string} name - Character name to check
 * @param {string[]} roster - Session roster (characters present at investigation)
 * @param {string[]} allCharacters - All valid PC names from theme config
 * @param {string[]} npcs - NPC names from theme config
 * @returns {boolean} True if non-roster PC (valid game character not in roster/npcs)
 */
function isNonRosterPC(name, roster = [], allCharacters = [], npcs = []) {
  if (!name) return false;

  // If it's an NPC, it's not a non-roster PC
  if (isKnownNPC(name, npcs)) return false;

  // Normalize roster for comparison
  const rosterLower = new Set(roster.map(n => n.toLowerCase().trim()));

  // Check if name matches any roster member (case-insensitive)
  const normalizedName = name.toLowerCase().trim();
  if (rosterLower.has(normalizedName)) return false;

  // Also check word-boundary match against roster (handles "Alex Reeves" vs "Alex")
  for (const r of roster) {
    const regex = new RegExp(`\\b${r.toLowerCase().trim()}\\b`, 'i');
    if (regex.test(name)) return false;
  }

  // Check if it's a valid game character with word-boundary matching
  return allCharacters.some(char => {
    const charLower = char.toLowerCase();
    // Exact match
    if (normalizedName === charLower) return true;
    // Word-boundary match (handles "Sofia Francisco" matching "Sofia")
    const regex = new RegExp(`\\b${charLower}\\b`, 'i');
    return regex.test(name);
  });
}

/**
 * Get all non-roster PCs for a session
 *
 * Computes: allCharacters - roster - npcs
 *
 * Used by arc generation prompts to provide the LLM with the list of
 * valid non-roster characters that can be mentioned (evidence-based only).
 *
 * @param {string[]} roster - Session roster (characters present at investigation)
 * @param {string[]} allCharacters - All valid PC names from theme config
 * @param {string[]} npcs - NPC names from theme config
 * @returns {string[]} Array of non-roster PC first names
 */
function getNonRosterPCs(roster = [], allCharacters = [], npcs = []) {
  const rosterLower = new Set(roster.map(n => n.toLowerCase().trim()));
  const npcLower = new Set(npcs.map(n => n.toLowerCase().trim()));

  return allCharacters.filter(name => {
    const nameLower = name.toLowerCase().trim();
    return !rosterLower.has(nameLower) && !npcLower.has(nameLower);
  });
}

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
 * Commit 8.16: Extracts sessionId from config and passes to createProgressLogger
 * for SSE progress streaming. If sessionId is present, progress events are
 * emitted to progressEmitter for client consumption.
 *
 * SDK-proper error handling:
 * - Validates callback is a function before passing to SDK
 * - Catches and logs SDK error codes (RATE_LIMIT_EXCEEDED, etc.)
 *
 * @param {Object} config - Graph config with optional configurable.sdkClient and configurable.sessionId
 * @param {string} [context='sdk'] - Log prefix for progress messages (e.g., 'generateOutline')
 * @returns {Function} SDK query function (wrapped with logging if using real SDK)
 */
function getSdkClient(config, context = 'sdk') {
  // If mock client is injected (for testing), return it directly
  if (config?.configurable?.sdkClient) {
    return config.configurable.sdkClient;
  }

  // Extract sessionId for SSE streaming (Commit 8.16)
  const sessionId = config?.configurable?.sessionId || null;

  // Create progress logger with sessionId for SSE emission
  const progressLogger = createProgressLogger(context, sessionId);
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
 * Extract full content from evidence item with comprehensive fallback chain
 *
 * DRY extraction from routeTokensByDisposition and buildArcEvidencePackages.
 * Used to ensure evidence cards and pull quotes have verbatim content available.
 *
 * Fallback priority:
 * 1. fullContent (preprocessed field)
 * 2. fullDescription (memory tokens from Notion)
 * 3. rawData.fullDescription (nested memory token data)
 * 4. content (paper evidence)
 * 5. rawData.content (nested paper evidence data)
 * 6. rawData.description (legacy field)
 * 7. description (legacy field)
 * 8. summary (last resort)
 *
 * @param {Object} item - Evidence item (token or paper evidence)
 * @returns {string} Full content string (never null/undefined)
 */
function extractFullContent(item) {
  if (!item) return '';
  return item.fullContent ||
         item.fullDescription ||
         item.rawData?.fullDescription ||
         item.content ||
         item.rawData?.content ||
         item.rawData?.description ||
         item.description ||
         item.summary ||
         '';
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
 * Phase 3 (brief 3.5):
 * - The whiteboard is read as its regions, each under the heading the players
 *   wrote. The suspect list that took the first group whose model-written label held
 *   "suspect" is gone, with the secondary and combined suspect lists built from it
 *   (nothing read them). An older parse's `groups` read as regions.
 * - A split final vote travels with the accusation (`votes`).
 * - With no charge, the investigation focus is the room's verdict on Marcus
 *   Blackwood's death; it no longer assumes a killing.
 *
 * @param {Object} sessionConfig - Session configuration with roster, accusation
 * @param {Object} directorNotes - Director notes with observations, whiteboard
 * @returns {Object} PlayerFocus object with investigation context
 */
function synthesizePlayerFocus(sessionConfig, directorNotes) {
  const whiteboard = directorNotes?.whiteboard || {};
  const rawProse = directorNotes?.rawProse || '';
  const quotes = directorNotes?.quotes || [];
  const postInvestigationDevelopments = directorNotes?.postInvestigationDevelopments || [];
  const accusation = sessionConfig?.accusation || {};

  // Each region of the whiteboard under the players' own heading. A parse from
  // before phase 3 has groups ({label, members}) in their place.
  const regions = Array.isArray(whiteboard.regions)
    ? whiteboard.regions
    : (Array.isArray(whiteboard.groups) ? whiteboard.groups : []).map(g => ({
      label: g?.label || '',
      location: '',
      entries: Array.isArray(g?.members) ? g.members : []
    }));

  // Extract connections as context
  const whiteboardConnections = (whiteboard.connections || []).map(c =>
    `${c.from} → ${c.to}${c.label ? ` (${c.label})` : ''}`
  );

  // Primary suspects from accusation
  const primarySuspects = accusation.accused || [];

  return {
    // What the article is about
    primaryInvestigation: accusation.charge || "How the room reached its verdict on Marcus Blackwood's death",

    // Who the group statement accused
    primarySuspects,

    // The formal accusation details. Brief 2.2: verdictKind travels with them, so a
    // verdict with no culprit (empty accused) reads as that and not as "not parsed".
    // Absent on a parse written before verdict kinds existed. Phase 3 (3.5): so does a
    // split final vote.
    accusation: {
      accused: accusation.accused || [],
      charge: accusation.charge || '',
      reasoning: accusation.notes || '',
      ...(accusation.verdictKind && { verdictKind: accusation.verdictKind }),
      ...(Array.isArray(accusation.votes) && { votes: accusation.votes })
    },

    // Director observations (what ACTUALLY happened - highest weight for narrative)
    // Enriched schema (2026-04): raw prose + quote bank + post-investigation news
    directorObservations: {
      rawProse,
      quotes,
      postInvestigationDevelopments
    },

    // The whiteboard parse: a model's reading of the photo of the room's working
    // notes, context for how the room reasoned (renderWhiteboardConnections labels it so)
    whiteboardContext: {
      namesFound: whiteboard.names || [],
      regions,
      connections: whiteboardConnections,
      notes: whiteboard.notes || [],
      structureType: whiteboard.structureType || 'unknown',
      ambiguities: whiteboard.ambiguities || []
    },

    // Emotional hook - synthesized from accusation reasoning
    emotionalHook: accusation.notes || '',

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
        // DRY: Use extractFullContent() helper for verbatim quoting
        fullContent: extractFullContent(t),
        // Legacy content field kept for backwards compatibility
        content: extractFullContent(t),
        characterRefs: t.characterRefs ?? [],
        narrativeTimeline: t.narrativeTimelineContext,
        temporalContext: 'PARTY',
        tags: t.tags ?? [],
        // Preserve raw data for downstream use
        rawData: t.rawData
      });
    } else if (t.disposition === 'buried') {
      buried.push({
        // id intentionally omitted — token IDs like "sam004" leak whose memory was buried
        // Evidence boundaries: Nova CANNOT know whose memories went to which accounts
        sourceType: 'memory-token',
        shellAccount: t.shellAccount,
        amount: t.transactionAmount,
        time: t.sessionTransactionTime,
        temporalContext: 'INVESTIGATION'
      });
    }
    // All tokens are now either 'exposed' or 'buried' — no unknown disposition
  }

  return { exposed, buried };
}

/**
 * Extract owner name from logline for compact summaries
 *
 * Returns canonical full name (e.g., "Alex Reeves" instead of "Alex")
 * to ensure consistent character attribution across the pipeline.
 *
 * @param {string} ownerLogline - e.g., "Alex's memory of..." or "ALEX: ..."
 * @param {Object} canonicalCharacters - Notion-derived map of firstName -> fullName
 * @returns {string} Canonical full name (e.g., "Alex Reeves") or first name if not found
 */
function extractOwnerName(ownerLogline, canonicalCharacters = {}) {
  if (!ownerLogline) return 'Unknown';
  // Extract first name from "Alex's memory of..." or "ALEX: ..."
  const match = ownerLogline.match(/^(\w+)/);
  const firstName = match ? match[1] : ownerLogline.substring(0, 20);
  // Map to canonical full name using Notion-derived map
  return getCanonicalName(firstName, canonicalCharacters);
}

/**
 * Build compact summaries of exposed tokens for corroboration scoring
 *
 * These summaries are included in each paper scoring batch to enable
 * the +2 TOKEN_CORROBORATION criterion.
 *
 * @param {Array} exposedTokens - Routed exposed tokens
 * @param {Object} canonicalCharacters - Notion-derived map of firstName -> fullName
 * @returns {Array} Compact summaries (~80 chars each)
 */
function buildExposedTokenSummaries(exposedTokens, canonicalCharacters = {}) {
  return exposedTokens.map(t => ({
    id: t.id,
    owner: extractOwnerName(t.owner, canonicalCharacters),
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

// ═══════════════════════════════════════════════════════════════════════════════
// ARC VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
//
// These functions support programmatic validation of arc generation output.
// Strict ID matching replaces LLM semantic matching for evidence grounding.

/**
 * Extract all valid evidence IDs from evidence bundle
 *
 * Used for strict programmatic validation of arc keyEvidence references.
 * Arcs can only reference evidence IDs that exist in this set.
 *
 * Commit 8.12: Created for arc validation - evidence grounding must be strict.
 *
 * @param {Object} evidenceBundle - Curated evidence bundle from Phase 1.8
 * @returns {Set<string>} Set of all valid evidence IDs
 */
function buildValidEvidenceIds(evidenceBundle) {
  const ids = new Set();

  if (!evidenceBundle) {
    console.warn('[buildValidEvidenceIds] No evidence bundle provided');
    return ids;
  }

  // Exposed tokens - use both id and tokenId as valid references
  const exposedTokens = evidenceBundle.exposed?.tokens || [];
  for (const t of exposedTokens) {
    if (t.id) ids.add(t.id);
    if (t.tokenId) ids.add(t.tokenId);
  }

  // Exposed paper evidence - use id, notionId, name, and pageId as valid references.
  // notionId (brief 2.1): a rescued item has no `id`, and the record view names it
  // by its Notion id, so an arc citing the id it was shown must pass this check.
  const exposedPaper = evidenceBundle.exposed?.paperEvidence || [];
  for (const p of exposedPaper) {
    if (p.id) ids.add(p.id);
    if (p.notionId) ids.add(p.notionId);
    if (p.name) ids.add(p.name);  // Some arcs reference by name
    if (p.pageId) ids.add(p.pageId);  // Notion page ID
  }

  // NOTE: Buried transactions and relationships are intentionally EXCLUDED from valid IDs
  // They are Layer 2 evidence - can be discussed in analysisNotes but NOT cited in keyEvidence
  // This matches the prompt guidance in buildCoreArcPrompt() and the evaluator's check
  // See: evidenceIdValidity criterion in evaluator-nodes.js

  console.log(`[buildValidEvidenceIds] Extracted ${ids.size} valid evidence IDs`);
  return ids;
}

/**
 * Validate roster name with fuzzy matching
 *
 * Used to validate characterPlacements in arcs reference actual roster members.
 * Returns the ORIGINAL name if a match is found (preserving canonical full names),
 * or null if no match.
 *
 * Matching order:
 * 1. Exact match with roster entry (case-insensitive)
 * 2. Canonical full name match (e.g., "Sarah Blackwood" matches roster "Sarah")
 * 3. Substring match with tie-breaking:
 *    - Prefer exact length match
 *    - Prefer shortest match (most specific)
 * 4. No match → returns null
 *
 * Commit 8.12: Added tie-breaking for ambiguous substring matches
 * Commit 8.xx: Preserves canonical full names (DRY fix with theme-config.js)
 *
 * @param {string} name - Character name from arc characterPlacements
 * @param {string[]} roster - Array of roster names (typically first names)
 * @param {Object} canonicalCharacters - Notion-derived map of firstName -> fullName
 * @returns {string|null} Original name (preserved) if valid, or null
 */
function validateRosterName(name, roster, canonicalCharacters = {}) {
  if (!name || !Array.isArray(roster) || roster.length === 0) {
    return null;
  }

  const normalizedInput = name.toLowerCase().trim();

  // 1. Exact match with roster entry (case-insensitive)
  const exactMatch = roster.find(r => r.toLowerCase().trim() === normalizedInput);
  if (exactMatch) return name;  // Return original name (preserves casing)

  // 2. Check if input IS a canonical full name for any roster entry
  // Example: input "Sarah Blackwood" should match roster entry "Sarah"
  for (const rosterName of roster) {
    const canonical = getCanonicalName(rosterName, canonicalCharacters);
    if (canonical.toLowerCase().trim() === normalizedInput) {
      return name;  // Return original name (preserves canonical full name)
    }
  }

  // 3. Substring matches with tie-breaking
  const substringMatches = roster.filter(r => {
    const normalizedRoster = r.toLowerCase().trim();
    return normalizedRoster.includes(normalizedInput) ||
           normalizedInput.includes(normalizedRoster);
  });

  if (substringMatches.length === 0) {
    return null;  // No match
  }

  if (substringMatches.length === 1) {
    return name;  // Match found - return original name to preserve formatting
  }

  // Multiple matches - apply tie-breaking
  // First: prefer exact length match (name length equals roster name length)
  const exactLengthMatch = substringMatches.find(r =>
    r.toLowerCase().trim().length === normalizedInput.length
  );
  if (exactLengthMatch) return name;  // Return original name

  // Second: prefer shortest match (most specific - "Jon" over "Jonathan")
  // Match found - return original name to preserve formatting
  return name;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ARC RESOLUTION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
//
// selectedArcs contains string IDs, but many nodes need full arc objects.
// These helpers resolve string IDs to arc objects from state.narrativeArcs.
// DRY extraction from ai-nodes.js and evaluator-nodes.js.

/**
 * Resolve arc ID (string) or arc object to full arc object
 *
 * Used when selectedArcs may contain either string IDs or arc objects.
 * This handles the contract where API passes string IDs but code expects objects.
 *
 * @param {string|Object} arcIdOrObj - Arc ID string or arc object
 * @param {Array} availableArcs - Array of arc objects to search (state.narrativeArcs)
 * @returns {Object|null} - Resolved arc object or null if not found
 *
 * @example
 * resolveArc('murder-accusation', arcs)     // Returns matching arc object
 * resolveArc({ id: 'arc-1' }, arcs)         // Returns the object as-is
 * resolveArc('nonexistent', arcs)           // Returns null
 * resolveArc(null, arcs)                    // Returns null
 */
function resolveArc(arcIdOrObj, availableArcs) {
  if (!arcIdOrObj) return null;
  if (typeof arcIdOrObj !== 'string') return arcIdOrObj;
  if (!Array.isArray(availableArcs)) return null;

  return availableArcs.find(a =>
    a.id === arcIdOrObj || a.title === arcIdOrObj
  ) || null;
}

/**
 * Resolve array of arc IDs/objects to arc objects
 *
 * Filters out nulls (arcs not found in availableArcs).
 * Safe to use with undefined/null input.
 *
 * @param {Array} arcs - Array of arc IDs (strings) or arc objects
 * @param {Array} availableArcs - Array of arc objects to search (state.narrativeArcs)
 * @returns {Array} - Array of resolved arc objects (nulls filtered out)
 */
function resolveArcs(arcs, availableArcs) {
  if (!Array.isArray(arcs)) return [];
  return arcs
    .map(arc => resolveArc(arc, availableArcs))
    .filter(Boolean);
}

// ═══════════════════════════════════════════════════════════════════════════════
// REVISION CONTEXT HELPER (DRY)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Centralized helper for building revision context across all revision loops.
// Addresses the "whack-a-mole" problem where fixing one issue causes regression
// of previously-correct output. By providing the full previous output + specific
// feedback, the revision prompt enables TARGETED fixes instead of full regeneration.
//
// SOLID: Single Responsibility - this helper only formats revision context
// SOLID: Open/Closed - extensible for new phases without modification
// SOLID: Dependency Inversion - nodes depend on this abstraction, not vice versa

/**
 * The bar a structural criterion must reach, as every judge prompt states it: a
 * criterion scored below it failed. One constant for the judges (evaluator-nodes.js
 * imports it from here, since it already requires this file) and for the revision
 * context, which prints a criterion's notes and fix only when the criterion failed
 * (phase 3, 3.10).
 */
const STRUCTURAL_PASS_SCORE = 0.8;

/**
 * The journalist rework's line under SHOULD CONSIDER (phase 3, 3.10): where the items
 * came from, and no rule for them. What a rework does with a suggestion is WHAT THIS
 * REWORK DOES's to say, once (R23). The generation prompts' preamble
 * (SHOULD_CONSIDER_PREAMBLE) adds "Apply them where they serve the piece", which in a
 * rework is a second, wider scope.
 */
const REWORK_SHOULD_CONSIDER_LINE = 'These came from the evaluation that ran before this pass.';

/**
 * The journalist revision context's line above CRITERIA SCORES: who computed the
 * scores. A model evaluation's scores are the judge's own and uncalibrated (phase 7
 * calibrates them).
 */
const MODEL_SCORES_LINE = "The scores below are the evaluating model's own and uncalibrated: no one has yet checked them against the director's approvals and send-backs.";

/**
 * The code checks that write validationResults, keyed by the `source` each stamps on
 * it, with what the journalist revision context says of each: who computed its scores
 * (in place of MODEL_SCORES_LINE), and the label its revision guidance prints under.
 *
 * The 4b fix batch (the integrator's ruling): a code check's guidance reaches an
 * automatic rework too. It is written in code with must-fix steps only, and the arc
 * check's carries fix 3.7b's coverage line ("Give each one a placement ... or ... a
 * writerQuestions entry of kind "player""), which reaches a rework only through it. Only
 * a judge's revisionGuidance is left out of an automatic pass.
 */
const CODE_CHECKS = {
  // validateArcStructure (arc-specialist-nodes.js): rosterCoverage and accusationArcPresent
  'programmatic-validation': {
    scoresLine: "The scores below are the arc check's, computed in code from the arcs.",
    guidanceLabel: 'ARC CHECK GUIDANCE'
  }
};

/** The code check that wrote these results, by its own `source` key, or null for a judge. */
function codeCheckOf(validationResults) {
  const source = validationResults?.source;
  return typeof source === 'string' && Object.prototype.hasOwnProperty.call(CODE_CHECKS, source) ? CODE_CHECKS[source] : null;
}

/**
 * Build revision context for any phase (DRY helper)
 *
 * This solves the "whack-a-mole" revision problem by providing:
 * 1. The FULL previous output that was evaluated (not just a summary)
 * 2. Specific feedback on what needs to change
 * 3. Criteria scores to understand what's working vs needs work
 *
 * The revision prompt should instruct: "Keep everything that's working,
 * only modify the specific issues identified below."
 *
 * @param {Object} options - Revision context options
 * @param {string} options.phase - Phase name ('arcs', 'outline', 'article')
 * @param {number} options.revisionCount - Current revision attempt number
 * @param {Object} options.validationResults - The evaluation's own record of what it
 *   found: `phase`, `passed`, `criteriaScores`, `structuralIssues` (must fix),
 *   `advisoryWarnings` (should consider), `revisionGuidance`. All three of
 *   evaluatePhase's post-SDK returns write one — pass, fail under the cap, fail
 *   at the cap — as does the fact-check short-circuit, so a rework that follows
 *   an evaluation never reads a stale verdict. (Its error branch and its two
 *   skip branches return no record at all, leaving whatever the channel held.)
 * @param {Object|Array} options.previousOutput - The full previous output to improve
 * @param {string|null} [options.humanFeedback] - Human reviewer feedback (highest priority in revision prompt)
 * @param {Object|Array|null} [options.handEdits] - the director's standing edits at this stop
 *   (lib/hand-edit-diff.js: the state channel, a list of edits, or a diff stored before the
 *   edits had ids); those `previousOutput` carries are rendered as <HAND_EDITS> (F1)
 * @param {number} [options.round] - the director's round a send back opens (the stop's
 *   "Round N"); named in the banner of a send-back rework (brief 2.3)
 * @param {string} [options.theme='journalist'] - the session's theme. The journalist's
 *   context (phase 3, brief 3.3; TH7) has no fixed "preserve" text: the director's note
 *   sets how much a send back keeps, an advisory criterion is a suggestion, and a model
 *   evaluation's scores are said to be uncalibrated (a code check's are named as the
 *   check's). Phase 3 (3.10; R23): an automatic pass fixes the must-fix items and takes
 *   up a suggestion only where it touches a line it is already changing for one;
 *   everything else stays word for word, for the reason the context gives with it (the
 *   4b fix batch). Only a criterion that failed (scored below STRUCTURAL_PASS_SCORE)
 *   prints its notes and fix, on either kind of rework. An automatic pass carries no
 *   EVALUATOR FEEDBACK, the judge's guidance; a code check's guidance prints under the
 *   check's own label (CODE_CHECKS) on either kind. The detective keeps today's text (D13).
 * @returns {Object} { contextSection, previousOutputSection }
 *
 * @example
 * const { contextSection, previousOutputSection } = buildRevisionContext({
 *   phase: 'arcs',
 *   revisionCount: 1,
 *   validationResults: state.validationResults,
 *   previousOutput: state._previousArcs
 * });
 */
function buildRevisionContext(options) {
  const { phase, revisionCount, validationResults, previousOutput, humanFeedback, handEdits, round, theme = 'journalist' } = options;
  const parkedDetective = theme === 'detective';

  // ─────────────────────────────────────────────────────────────────────────────
  // Build context section (feedback, issues, criteria)
  // ─────────────────────────────────────────────────────────────────────────────

  // ───────────────────────────────────────────────────────────────────────────
  // PROMPT-REVIEW B4: the evaluator's feedback has to arrive in a form the
  // reviser can act on.
  //
  // The evaluator emits criteriaScores as {score, type, notes, fix} objects and
  // splits its findings into structuralIssues/advisoryWarnings. This builder used
  // to interpolate the objects directly (`[object Object]`) and only read a legacy
  // `issues` array (absent from the current schema, so every revision prompt said
  // "(no specific issues listed)"). Measured on five consecutive sessions: the
  // reviser was told to make targeted fixes with nothing to target.
  //
  // Shared-channel half: validationResults is ONE channel for all three phases,
  // so the outline reviser consumed the arc evaluator's leftovers. A mismatched
  // stamp now drops the block entirely — no feedback beats wrong feedback.
  // ───────────────────────────────────────────────────────────────────────────

  /** Accept both the current {score,...} object and the legacy bare number. */
  const scoreOf = v => typeof v === 'number' ? v : (v && typeof v.score === 'number' ? v.score : null);

  const stamped = validationResults?.phase;
  const phaseMismatch = !!(stamped && stamped !== phase);

  const criteria = phaseMismatch ? {} : (validationResults?.criteriaScores || {});

  // Brief 1.3: must-fix and should-consider are two lists, not one. Concatenated,
  // an advisory suggestion arrived at the writer as a defect it had to fix.
  // `issues` when a legacy writer supplied it; otherwise the evaluator's own split.
  const rawIssues = phaseMismatch
    ? []
    : (Array.isArray(validationResults?.issues) && validationResults.issues.length > 0
        ? validationResults.issues
        : (validationResults?.structuralIssues || []));

  const advisories = phaseMismatch ? [] : (validationResults?.advisoryWarnings || []);

  const feedback = phaseMismatch
    ? ''
    : (validationResults?.revisionGuidance || validationResults?.feedback || '');

  const confidence = phaseMismatch ? null : validationResults?.confidence;
  // Brief 1.3: `passed` is the field every evaluator branch writes. This read was
  // `.ready`, which nothing writes, so the line below said "NO (must address issues)"
  // on every rework prompt ever sent — including the ones that followed a pass.
  const passed = phaseMismatch ? false : validationResults?.passed === true;

  // `passed === true` counts on its own: a clean evaluation that found nothing to
  // say is still the answer to "what did the evaluation think", and it is exactly
  // the case a send-back after a pass lands in.
  const hasEvaluation = !phaseMismatch && (
    passed || Object.keys(criteria).length > 0 || rawIssues.length > 0 ||
    advisories.length > 0 || !!feedback
  );

  const formatIssue = (i) => {
    if (typeof i === 'string') return `  - ${i}`;
    if (i && i.message) return `  - ${i.message}${i.severity ? ` (${i.severity})` : ''}`;
    return `  - ${JSON.stringify(i)}`;
  };

  const issuesList = rawIssues.length > 0
    ? rawIssues.map(formatIssue).join('\n')
    : '  (none reported)';

  // Brief 1.3: the suggestions, under their own heading. Omitted entirely when there
  // are none. The detective keeps the two lines of preamble a generation prompt gives
  // them (D13); the journalist's says only where they came from (phase 3, 3.10), since
  // WHAT THIS REWORK DOES states what a rework does with a suggestion.
  const shouldConsiderBlock = advisories.length > 0
    ? `

SHOULD CONSIDER:
${parkedDetective ? SHOULD_CONSIDER_PREAMBLE : REWORK_SHOULD_CONSIDER_LINE}

${advisories.map(formatIssue).join('\n')}`
    : '';

  // Phase 3 (3.10; R23, final review rules-writers[0]): which criteria failed. A stored
  // verdict carries a fix on a passing criterion too (the gate's first arc rework had
  // four, "Optionally ..." among them), and a "fix:" line reads as must-fix, so only a
  // failed criterion's notes and fix reach a journalist rework; a passing criterion
  // prints its score alone, whatever the judge wrote.
  //
  // The 4b fix batch (the integrator's ruling): a criterion failed only when it scored
  // below the bar. Counting a criterion as failed when a must-fix issue named its key
  // matched the key as a whole word anywhere, so a plain-English key (convergence,
  // coherence) read as failing whenever an issue used the word. A breach the judge lists
  // under a criterion it scored as passing is in ISSUES TO ADDRESS, with its own fix.
  const failed = (score) => score !== null && score < STRUCTURAL_PASS_SCORE;

  // Per-criterion: score, structural/advisory label, and the evaluator's own
  // notes + concrete fix. The notes and fix are the actionable part. Phase 3 (3.3):
  // an advisory criterion's fix is a suggestion, and the journalist's line says so.
  let hasFixLines = false;
  let hasSuggestionLines = false;
  const criteriaList = Object.keys(criteria).length > 0
    ? Object.entries(criteria)
        .map(([name, value]) => {
          const score = scoreOf(value);
          const scoreText = score === null ? 'unscored' : score.toFixed(2);
          const kind = (value && typeof value === 'object' && value.type) ? ` [${value.type}]` : '';
          const lines = [`  - ${name}: ${scoreText}${kind}`];
          if (value && typeof value === 'object' && (parkedDetective || failed(score))) {
            const fixLabel = (!parkedDetective && value.type === 'advisory') ? 'suggestion' : 'fix';
            if (value.notes && String(value.notes).trim()) lines.push(`      notes: ${value.notes}`);
            if (value.fix && String(value.fix).trim()) {
              lines.push(`      ${fixLabel}: ${value.fix}`);
              if (fixLabel === 'fix') hasFixLines = true; else hasSuggestionLines = true;
            }
          }
          return lines.join('\n');
        })
        .join('\n')
    : '  (no criteria scores available)';

  const scored = Object.entries(criteria)
    .map(([name, value]) => [name, scoreOf(value)])
    .filter(([, score]) => score !== null);

  // How to read the scores. The detective keeps today's two lists (D13). The
  // journalist's (phase 3, 3.3) drops them: "PRESERVE THESE" listed every criterion at
  // 0.8 or more, which after a pass is every criterion, so it outranked the director's
  // note (TH7); and "need improvement" listed every criterion under 0.7, an advisory
  // one included, as a defect.
  //
  // The journalist's line says only who computed the scores (post-merge fix, 3.3
  // review findings 1 and 2). A model evaluation's are the judge's own, uncalibrated;
  // the arc check computes its two in code (validateArcStructure), and the fact check
  // that runs before the article judge writes none, so neither gets the model's line.
  // What to do with each kind of finding is WHAT THIS REWORK DOES's to say, once.
  let scoresGuide;
  if (parkedDetective) {
    const workingWell = scored.filter(([, score]) => score >= 0.8).map(([name]) => name);
    const workingWellText = workingWell.length > 0
      ? `These aspects are working well, PRESERVE THESE: ${workingWell.join(', ')}`
      : 'Focus on the issues identified below.';

    const needsWork = scored.filter(([, score]) => score < 0.7).map(([name]) => name);
    const needsWorkText = needsWork.length > 0
      ? `These aspects need improvement: ${needsWork.join(', ')}`
      : '';
    scoresGuide = `${workingWellText}\n${needsWorkText}`;
  } else if (scored.length === 0) {
    scoresGuide = '';
  } else {
    scoresGuide = codeCheckOf(validationResults)?.scoresLine || MODEL_SCORES_LINE;
  }
  const scoresGuideBlock = scoresGuide ? `${scoresGuide}\n\n` : '';

  // Confidence is a string ('high'|'medium'|'low') in the current schema and a
  // number in the legacy one; the old code multiplied both by 100 -> "NaN%".
  const confidenceText = typeof confidence === 'number'
    ? `${(confidence * 100).toFixed(0)}%`
    : (confidence || 'unknown');

  // Brief 1.3: when the evaluation passed and the director sent the work back
  // anyway, say so. Without this line a "Ready: YES" summary sitting above a list
  // of demands reads as a contradiction the writer has to guess its way out of.
  const sendBackLine = (passed && humanFeedback)
    ? '\n\nThis evaluation passed. The director sent the work back anyway; their note below\nis the reason for this rework.'
    : '';

  // Phase 3 (3.10; the integrator's ruling): an automatic journalist pass carries no
  // EVALUATOR FEEDBACK. The judge's guidance repeats ISSUES TO ADDRESS in its must-fix
  // steps, and its optional steps read as instructions; a stored verdict keeps its old
  // guidance, so it is left out whole rather than filtered by its wording. A send back
  // keeps it, and the detective keeps it on both (D13).
  //
  // The 4b fix batch (the integrator's ruling): a code check's guidance is not a
  // judge's. It prints on every journalist pass under the check's own label
  // (CODE_CHECKS), so the arc check's coverage line still reaches an automatic rework.
  const codeCheck = parkedDetective ? null : codeCheckOf(validationResults);
  let feedbackBlock = '';
  if (codeCheck) {
    feedbackBlock = feedback ? `

${codeCheck.guidanceLabel}:
${feedback}` : '';
  } else if (parkedDetective || humanFeedback) {
    feedbackBlock = `

EVALUATOR FEEDBACK:
${feedback || '(no specific feedback provided)'}`;
  }

  const evaluationBlock = hasEvaluation
    ? `EVALUATION SUMMARY:
  Confidence: ${confidenceText}
  Ready: ${passed ? 'YES' : 'NO (must address issues)'}${sendBackLine}

${scoresGuideBlock}CRITERIA SCORES:
${criteriaList}

ISSUES TO ADDRESS:
${issuesList}${shouldConsiderBlock}${feedbackBlock}`
    : '(no evaluator feedback for this phase)';

  // Spec 2026-09-19 §4.3: the director's edits, after HUMAN FEEDBACK and before the
  // instructions. Present on EVERY pass of the round, not only the first.
  //
  // F1 (spec 2026-10-02 section 7): the edits stand at the stop by id, and the block
  // lists those the version this rework starts from carries, each with its section and
  // the director's text. Its rule depends on the kind of rework. An automatic pass fixes
  // the writer's text, so every edit stays as written. A send-back may change an edit
  // only where the structural change the note asks for means it no longer fits, and
  // returns each one it changed, with why (CHANGED_EDITS_KEY, which the rework call's
  // schema carries; ai-nodes.js). The old block's line that the evaluator's notes
  // predate the edits went: the judge now reads them (evaluator-nodes.js).
  const standingEdits = carriedEdits(handEdits, previousOutput);
  const handEditsRule = humanFeedback
    ? `An edit is the final word on its text, so each edit stays exactly as written and each cut stays out, unless the structural change the director's note asks for means it no longer fits. List each edit this rework changes, removes or brings back in ${CHANGED_EDITS_KEY}, with its id and one sentence on why.`
    : 'This automatic pass fixes the writer\'s text. An edit is the final word on its text, so each edit stays exactly as written and each cut stays out.';
  const handEditsBlock = standingEdits.length > 0
    ? `<HAND_EDITS>
The director's edits, by id: text the director wrote into the previous version, or cut from it (marked cut).
${handEditsRule}

${formatEditLines(standingEdits)}
</HAND_EDITS>

`
    : '';

  // Brief 2.3: which pass this is. A send back is the director's round, not an
  // automated pass: the send back resets the automated counter, so its banner used
  // to read "automated pass 0" above the director's own note. The discriminator is
  // the one the increment nodes use, the feedback slot.
  const passLabel = humanFeedback
    ? (Number.isInteger(round) && round > 0 ? `round ${round}: the director's send back` : "the director's send back")
    : `automated pass ${revisionCount}`;

  // Brief 1.3: the instruction "if a criterion is scoring well (>=80%), do NOT
  // change anything related to it" used to sit at item 3. On session 091826 every
  // criterion scored above 0.8, so it told the writer to change nothing, and the
  // director's "rethink the closing" came back as a relabel.
  //
  // Phase 3 (3.3, TH7): the journalist's instructions carry no fixed "preserve" or
  // "do not regenerate" text. On a send back the director's note sets how much the
  // rework keeps. Every reworker carries this section, so the rethink rule and the
  // must-fix / suggestion rule are stated here and nowhere else in a rework (3.3
  // review, finding 2). The detective keeps today's four lines (D13).
  //
  // Phase 3 (3.10): an automatic pass states R23 once. It fixes the must-fix items,
  // takes up a suggestion only where it touches a line it is already changing for one,
  // and leaves everything else word for word. The line it replaces let a rework take a
  // suggestion up wherever it made the output "truer to the record": at the gate the
  // automatic arc reworks kept 53% and 62% of their sentences, and one article rework
  // changed 20 of 27 paragraphs to fix one pronoun. Each part names only the lists
  // this context carries.
  //
  // The 4b fix batch (3.10 review minor 3; the plan's rule for model-facing text: each
  // rule once, with its reason): the scope carries its reason, which lets a rework decide
  // the edge case, such as a suggestion that half-touches a line it is fixing. The lines
  // no finding names passed what ran before the pass, and at the gate the new errors that
  // reached the director were in lines rewritten with no finding behind them. Every
  // automatic rework is evaluated again (graph.js), so the reason says where the errors
  // came from, not that the next evaluation never reads the line.
  const suggestionSources = [
    advisories.length > 0 && 'a SHOULD CONSIDER item',
    hasSuggestionLines && 'a suggestion in CRITERIA SCORES'
  ].filter(Boolean).join(' or ');
  const automaticScope = [
    `This rework fixes the must-fix items: the ISSUES TO ADDRESS${hasFixLines ? ' and the fixes in CRITERIA SCORES' : ''}.`,
    suggestionSources && `Take up ${suggestionSources} only where it touches a line this rework is already changing for a must-fix item.`,
    `Everything else in the previous ${phase} stays word for word.`,
    'Those lines passed the check or evaluation that ran before this pass, and in past reworks the new errors that reached the director were in lines rewritten with no finding behind them.'
  ].filter(Boolean).join(' ');
  const instructionsSection = parkedDetective
    ? `═══════════════════════════════════════════════════════════════════════════════
CRITICAL REVISION INSTRUCTIONS:
═══════════════════════════════════════════════════════════════════════════════

1. PRESERVE EVERYTHING THAT'S WORKING - Do NOT regenerate from scratch
2. Make TARGETED FIXES only for the specific issues identified above
3. Output the complete revised ${phase} with all original content plus fixes
4. Maintain consistency with the original structure and organization`
    : `═══════════════════════════════════════════════════════════════════════════════
WHAT THIS REWORK DOES:
═══════════════════════════════════════════════════════════════════════════════

${humanFeedback
    ? `The director's note above is the task, and it sets how much of the previous ${phase} this rework keeps: change what the note asks, as far as it asks, so a note that asks for a rethink gets a rethink. What the note leaves alone stays as it was, unless an issue to address needs it changed.`
    : automaticScope}`;

  const contextSection = `
═══════════════════════════════════════════════════════════════════════════════
REVISION CONTEXT: ${phase.toUpperCase()} (${passLabel})
═══════════════════════════════════════════════════════════════════════════════

${evaluationBlock}

${humanFeedback ? `HUMAN FEEDBACK (HIGHEST PRIORITY):
${humanFeedback}

NOTE: The human reviewer has explicitly requested these changes.
Address human feedback FIRST, then address any remaining evaluator issues.
` : ''}${handEditsBlock}${instructionsSection}
`.trim();

  // ─────────────────────────────────────────────────────────────────────────────
  // Build previous output section (the full output to improve)
  // ─────────────────────────────────────────────────────────────────────────────

  let previousOutputText;

  if (previousOutput === null || previousOutput === undefined) {
    previousOutputText = '(No previous output available - this appears to be the first generation attempt)';
  } else if (Array.isArray(previousOutput)) {
    previousOutputText = JSON.stringify(previousOutput, null, 2);
  } else if (typeof previousOutput === 'object') {
    previousOutputText = JSON.stringify(previousOutput, null, 2);
  } else {
    previousOutputText = String(previousOutput);
  }

  // Phase 3 (3.3): the journalist's header says what the version is, not how little
  // to change it (TH7).
  const previousLabel = parkedDetective ? '(to improve, not regenerate)' : '(the version this rework starts from)';
  const previousOutputSection = `
═══════════════════════════════════════════════════════════════════════════════
PREVIOUS ${phase.toUpperCase()} OUTPUT ${previousLabel}:
═══════════════════════════════════════════════════════════════════════════════

${previousOutputText}

═══════════════════════════════════════════════════════════════════════════════
END PREVIOUS OUTPUT
═══════════════════════════════════════════════════════════════════════════════
`.trim();

  return {
    contextSection,
    previousOutputSection
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CANONICAL CHARACTER EXTRACTION (RC2)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Extracts canonical character map from Notion token owner data at fetch time.
// Stored in state.canonicalCharacters for downstream PromptBuilder use.

/**
 * Extract canonical character map from Notion token owner data
 *
 * Builds a first-name -> full-name map directly from Notion owner strings.
 * No hardcoded character list required — Notion is the sole source of truth.
 *
 * Owner strings from Notion are already canonical full names (e.g., "Sarah Blackwood")
 * via resolveRelationNames. This function derives the firstName -> fullName mapping.
 *
 * @param {Array} tokens - Fetched tokens with `owners` arrays
 * @param {string} theme - Theme name (unused, kept for signature compatibility)
 * @param {Array} [paperEvidence] - Optional paper evidence with character references
 * @returns {Object} Map of firstName -> fullName (e.g., { "Sarah": "Sarah Blackwood" })
 */
function extractCanonicalCharacters(tokens, theme = 'journalist', paperEvidence = []) {
  const characters = {};

  for (const token of tokens) {
    for (const ownerRaw of (token.owners || [])) {
      if (!ownerRaw) continue;
      // Trim once so BOTH the key derivation and the stored canonical value
      // are whitespace-clean (Notion full names can carry trailing spaces, e.g. "Riley Torres ").
      const owner = String(ownerRaw).trim();
      if (!owner) continue;
      // Derive first name from Notion's canonical full name
      const firstName = owner.includes(' ') ? owner.split(' ')[0] : owner;
      const firstNameKey = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
      // First occurrence wins (preserves Notion's canonical form)
      if (!characters[firstNameKey]) {
        characters[firstNameKey] = owner;
      }
    }
  }

  return characters;
}

/**
 * Resolve the session roster from wherever it currently lives (CODE-REVIEW H4).
 *
 * The roster arrives at the `await-roster` checkpoint, which the graph reaches at
 * 1.51 -- BEFORE parseRawInput stamps it onto sessionConfig at 0.1. Nodes that
 * read only `state.sessionConfig?.roster` therefore saw NOTHING during the whole
 * photo branch: the character-ID parser had no valid-name list to disambiguate
 * against and the caption writer had no names to use.
 *
 * The incremental channel wins when it has entries; sessionConfig is the
 * fallback for a from-files run, where there is no await-roster capture.
 *
 * @param {Object|null} state - workflow state
 * @returns {string[]} roster names (possibly empty)
 */
function resolveRoster(state) {
  return state?.roster?.length ? state.roster : (state?.sessionConfig?.roster || []);
}

/**
 * Normalize a director-typed rosterPronouns map to canonical first-name keys (F1 / X-1).
 *
 * generateRosterSection iterates state.canonicalCharacters (Notion-derived,
 * title-cased first-name keys) and resolves pronouns by that key. The director,
 * however, types pronouns keyed by whatever roster string they entered
 * ("victoria", "Victoria Kingsley", "Vic"). Without re-keying, any case- or
 * form-divergence silently falls through to they/them. This re-keys each typed
 * entry to its canonical first name when a match exists, preserving the value;
 * unmatched entries are kept under their original key so nothing is dropped.
 *
 * Match order per typed entry:
 *   1. exact canonical key (case-insensitive)
 *   2. typed string equals a canonical FULL name (case-insensitive) -> that key
 *   3. no match -> keep original key
 *
 * @param {Object|null} rosterPronouns - director-typed map: typedName -> pronouns
 * @param {Object|null} canonicalCharacters - Notion map: canonicalFirstName -> fullName
 * @returns {Object} pronouns re-keyed by canonical first name where resolvable
 */
function normalizeRosterPronounsToCanonical(rosterPronouns, canonicalCharacters) {
  const pronouns = rosterPronouns || {};
  const canonical = canonicalCharacters || {};
  const canonicalKeys = Object.keys(canonical);
  const out = {};

  for (const [typedName, value] of Object.entries(pronouns)) {
    const typedLower = String(typedName).toLowerCase().trim();

    // 1. Case-insensitive canonical key match.
    let resolvedKey = canonicalKeys.find(k => k.toLowerCase() === typedLower);

    // 2. Typed string equals a canonical full name -> map to its first-name key.
    if (!resolvedKey) {
      resolvedKey = canonicalKeys.find(
        k => String(canonical[k]).toLowerCase().trim() === typedLower
      );
    }

    // 3. Fall back to the original typed key (preserve, don't drop).
    out[resolvedKey || typedName] = value;
  }

  return out;
}

/**
 * F1 invariant guard: roster names with NO match in canonicalCharacters.
 * A roster PC absent from canonicalCharacters loses their pronoun + canonical
 * surname in generateRosterSection (silent they/them). Matching mirrors
 * normalizeRosterPronounsToCanonical: canonical first-name key (case-insensitive)
 * OR canonical full-name value (case-insensitive, trimmed).
 * @param {Array|null} roster - roster entries (strings or {name})
 * @param {Object|null} canonicalCharacters - firstName -> fullName map
 * @returns {string[]} uncovered roster names (empty = invariant holds)
 */
function findUncoveredRosterNames(roster, canonicalCharacters) {
  const canonical = canonicalCharacters || {};
  const keys = Object.keys(canonical);
  const keyLower = new Set(keys.map(k => k.toLowerCase().trim()));
  const fullLower = new Set(keys.map(k => String(canonical[k]).toLowerCase().trim()));
  const uncovered = [];
  for (const entry of (roster || [])) {
    const name = (entry && entry.name) || entry;
    if (!name) continue;
    const lower = String(name).toLowerCase().trim();
    if (!keyLower.has(lower) && !fullLower.has(lower)) uncovered.push(name);
  }
  return uncovered;
}

module.exports = {
  safeParseJson,
  getSdkClient,
  createTimestampedResult,
  validateRequiredFields,
  formatIssuesForMessage,
  ensureArray,
  extractFullContent,
  synthesizePlayerFocus,

  // Evidence curation helpers (Commit 8.11+)
  routeTokensByDisposition,
  buildExposedTokenSummaries,
  buildCurationReport,
  deriveNarrativeThreads,

  // Arc validation helpers (Commit 8.12+)
  buildValidEvidenceIds,
  validateRosterName,

  // Arc resolution helpers (Commit 8.25)
  resolveArc,
  resolveArcs,

  // NPC validation (Commit 8.17) - NPCs defined in lib/theme-config.js
  isKnownNPC,

  // Non-roster PC validation (Commit 8.xx) - Three-category character model
  isNonRosterPC,
  getNonRosterPCs,
  resolveRoster,

  // Canonical character extraction (RC2)
  extractCanonicalCharacters,

  // F1 invariant guard: roster names with no canonicalCharacters match
  findUncoveredRosterNames,

  // Revision context helper (DRY)
  buildRevisionContext,

  // The bar a criterion must reach: the judges' and the revision context's one constant
  // (phase 3, 3.10; evaluator-nodes.js imports it)
  STRUCTURAL_PASS_SCORE,

  // Re-export batching utilities from preprocessor for convenience
  createBatches,
  processWithConcurrency,
  pairRepliesWithBatch,  // the one rule for pairing a batch's replies with its inputs

  // F1 (X-1): canonical-key normalization for director-typed pronouns
  normalizeRosterPronounsToCanonical
};

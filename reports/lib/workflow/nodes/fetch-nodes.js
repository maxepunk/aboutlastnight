/**
 * Fetch Nodes - Data fetching nodes for report generation workflow
 *
 * These nodes handle the data fetching phase (1.1-1.4) of the pipeline:
 * - initializeSession: Set up session context from config
 * - loadDirectorNotes: Load director notes and session config from filesystem
 * - fetchMemoryTokens: Fetch memory tokens from Notion
 * - fetchPaperEvidence: Fetch paper evidence from Notion
 *
 * All nodes follow the LangGraph pattern:
 * - Accept (state, config) parameters
 * - Return partial state updates
 * - Use PHASES constants for currentPhase values
 *
 * See ARCHITECTURE_DECISIONS.md for design rationale.
 */

const fs = require('fs').promises;
const path = require('path');
const { PHASES } = require('../state');
const { createNotionClient } = require('../../notion-client');
const { createCachedNotionClient } = require('../../cache');
const { synthesizePlayerFocus } = require('./node-helpers');
const { traceNode } = require('../../observability');

/**
 * Default data directory for session files
 * Can be overridden via config.configurable.dataDir
 */
const DEFAULT_DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');

/**
 * Get NotionClient from config or create cached instance
 * Supports dependency injection for testing
 *
 * Priority:
 * 1. Injected mock client (for testing)
 * 2. Global cached singleton (default - uses SQLite cache)
 *
 * @param {Object} config - Graph config with optional configurable.notionClient
 * @returns {Object} NotionClient or CachedNotionClient instance
 */
function getNotionClient(config) {
  // Allow injected mock client for testing
  if (config?.configurable?.notionClient) {
    return config.configurable.notionClient;
  }
  // Use global cached singleton by default
  return createCachedNotionClient();
}

/**
 * Tag tokens with disposition based on orchestratorParsed data (shared helper)
 *
 * Builds exposed/buried lookup maps and tags each token with:
 * - disposition: 'exposed' | 'buried' | 'unknown'
 * - Transaction metadata for buried tokens (shellAccount, transactionAmount, sessionTransactionTime)
 *
 * @param {Array} tokens - Raw tokens to tag
 * @param {Object} orchestratorParsed - Parsed orchestrator data with exposedTokens/buriedTokens
 * @returns {Object} { taggedTokens, exposedCount, buriedCount, unknownCount }
 * @private
 */
function tagTokensWithDisposition(tokens, orchestratorParsed) {
  const exposedTokenIds = new Set(
    (orchestratorParsed.exposedTokens || []).map(id => id.toLowerCase())
  );

  // Build a map for buried tokens to include transaction metadata
  const buriedTokensMap = new Map();
  for (const t of (orchestratorParsed.buriedTokens || [])) {
    // Null safety: handle both string tokens and objects with/without tokenId
    const tokenId = (typeof t === 'string' ? t : (t.tokenId || t.id || '')).toLowerCase();
    if (tokenId) {
      buriedTokensMap.set(tokenId, {
        shellAccount: t.shellAccount || null,
        amount: t.amount || null,
        sessionTransactionTime: t.time || null
      });
    }
  }

  // Tag each token with its disposition and transaction metadata (for buried tokens)
  const taggedTokens = tokens.map(token => {
    const tokenIdLower = (token.tokenId || token.id || '').toLowerCase();

    if (exposedTokenIds.has(tokenIdLower)) {
      return { ...token, disposition: 'exposed' };
    }

    const buriedMeta = buriedTokensMap.get(tokenIdLower);
    if (buriedMeta) {
      return {
        ...token,
        disposition: 'buried',
        shellAccount: buriedMeta.shellAccount,
        transactionAmount: buriedMeta.amount,
        sessionTransactionTime: buriedMeta.sessionTransactionTime
      };
    }

    // Tokens not in either list were never submitted — Nova can't access them,
    // so they are effectively buried (no content, no transaction data)
    return { ...token, disposition: 'buried' };
  });

  const exposedCount = taggedTokens.filter(t => t.disposition === 'exposed').length;
  const buriedCount = taggedTokens.filter(t => t.disposition === 'buried').length;

  return { taggedTokens, exposedCount, buriedCount, unknownCount: 0 };
}

/**
 * Initialize session from config
 *
 * Extracts sessionId and theme from state or config.configurable.
 * This is the entry point node for the workflow.
 *
 * Supports two invocation patterns:
 * 1. Server API: sessionId in config.configurable (traditional)
 * 2. LangSmith Studio: sessionId in state input (Studio passes input to state)
 *
 * @param {Object} state - Current state with optional sessionId, theme
 * @param {Object} config - Graph config with optional configurable.sessionId and configurable.theme
 * @returns {Object} Partial state update with sessionId, theme, currentPhase
 */
async function initializeSession(state, config) {
  // Support both Studio (state input) and server API (config.configurable) patterns
  const sessionId = state?.sessionId || config?.configurable?.sessionId;
  const theme = state?.theme || config?.configurable?.theme || 'journalist';

  if (!sessionId) {
    throw new Error('sessionId is required (via state input or config.configurable)');
  }

  return {
    sessionId,
    theme,
    currentPhase: PHASES.LOAD_DIRECTOR_NOTES
  };
}

/**
 * Load director notes and session config from filesystem
 *
 * Reads from the session's inputs directory:
 * - director-notes.json: Observations, whiteboard, accusation context
 * - session-config.json: Roster, session metadata
 * - orchestrator-parsed.json: Exposed/buried token lists (for disposition tagging)
 *
 * Extracts playerFocus from director notes for downstream arc analysis.
 * If playerFocus is missing (legacy files), synthesizes it from available data.
 *
 * COMMIT 8.10 FIX: Also loads orchestrator-parsed.json and populates _parsedInput
 * so that fetchMemoryTokens can access exposed/buried token lists for disposition
 * tagging. Previously this data was only available when parseRawInput ran (fresh mode),
 * causing all tokens to be tagged 'unknown' on resume.
 *
 * @param {Object} state - Current state with sessionId
 * @param {Object} config - Graph config with optional configurable.dataDir
 * @returns {Object} Partial state update with directorNotes, sessionConfig, playerFocus, _parsedInput, currentPhase
 */
async function loadDirectorNotes(state, config) {
  const dataDir = config?.configurable?.dataDir || DEFAULT_DATA_DIR;
  const sessionPath = path.join(dataDir, state.sessionId, 'inputs');

  // Always load orchestrator-parsed for disposition data
  // This is needed by fetchMemoryTokens regardless of whether we skip other loading
  // Files are the source of truth (survives server restart, works for both fresh and resume)
  let orchestratorParsed = {};
  const orchestratorPath = path.join(sessionPath, 'orchestrator-parsed.json');
  try {
    const orchestratorContent = await fs.readFile(orchestratorPath, 'utf-8');
    orchestratorParsed = JSON.parse(orchestratorContent);
    console.log(`[loadDirectorNotes] Loaded orchestratorParsed: ${orchestratorParsed.exposedTokens?.length || 0} exposed, ${orchestratorParsed.buriedTokens?.length || 0} buried`);
  } catch (err) {
    // File doesn't exist - that's okay, disposition will be 'unknown' for all tokens
    console.log(`[loadDirectorNotes] No orchestrator-parsed.json found (optional)`);
  }

  // Skip full loading if already loaded (resume case or pre-populated by parseRawInput)
  // But still return _parsedInput for fetchMemoryTokens disposition tagging
  if (state.directorNotes && Object.keys(state.directorNotes).length > 0) {
    console.log('[loadDirectorNotes] Skipping full load - directorNotes already in state');
    return {
      _parsedInput: {
        orchestratorParsed
      },
      currentPhase: PHASES.FETCH_TOKENS
    };
  }

  console.log('[loadDirectorNotes] Loading from files...');

  // Load director notes (optional for incremental input)
  let directorNotes = {};
  const notesPath = path.join(sessionPath, 'director-notes.json');
  try {
    const notesContent = await fs.readFile(notesPath, 'utf-8');
    directorNotes = JSON.parse(notesContent);
  } catch (err) {
    // File doesn't exist - that's okay for incremental input
    console.log('[loadDirectorNotes] No director-notes.json found (incremental input mode)');
  }

  // Load session config (optional for incremental input)
  let sessionConfig = {};
  const configPath = path.join(sessionPath, 'session-config.json');
  try {
    const configContent = await fs.readFile(configPath, 'utf-8');
    sessionConfig = JSON.parse(configContent);
  } catch (err) {
    // File doesn't exist - that's okay for incremental input
    console.log('[loadDirectorNotes] No session-config.json found (incremental input mode)');
  }

  // Extract player focus (Layer 3 drives narrative per plan)
  // If missing, synthesize from available data (backwards compatibility)
  let playerFocus = directorNotes.playerFocus;

  if (!playerFocus || Object.keys(playerFocus).length === 0) {
    // Only synthesize if we have enough data
    if (Object.keys(sessionConfig).length > 0 || Object.keys(directorNotes).length > 0) {
      console.log('[loadDirectorNotes] Synthesizing playerFocus from existing data');
      playerFocus = synthesizePlayerFocus(sessionConfig, directorNotes);
    } else {
      console.log('[loadDirectorNotes] No data for playerFocus (incremental input mode)');
      playerFocus = null;
    }
  }

  return {
    directorNotes: Object.keys(directorNotes).length > 0 ? directorNotes : null,
    sessionConfig: Object.keys(sessionConfig).length > 0 ? sessionConfig : null,
    playerFocus,
    // Store orchestratorParsed for fetchMemoryTokens disposition tagging
    _parsedInput: {
      orchestratorParsed
    },
    currentPhase: PHASES.FETCH_TOKENS
  };
}

/**
 * Fetch memory tokens from Notion
 *
 * Uses NotionClient to fetch tokens specified in directorNotes.scannedTokens.
 * If no scanned tokens are specified, fetches all available tokens.
 *
 * EVIDENCE BOUNDARY ENFORCEMENT (Commit 8.9.x):
 * Each token is tagged with `disposition: 'exposed' | 'buried'` based on
 * whether it was submitted to the Detective (exposed) or sold to Black Market (buried).
 * This disposition is used by downstream nodes to enforce evidence boundaries:
 * - EXPOSED tokens: full data accessible including owner
 * - BURIED tokens: owner field exists but is NOT ACCESSIBLE for reporting
 *
 * The disposition is determined from orchestrator-parsed.json which contains
 * the exposedTokens and buriedTokens lists from session report parsing.
 *
 * @param {Object} state - Current state with directorNotes, _parsedInput
 * @param {Object} config - Graph config with optional configurable.dataDir
 * @returns {Object} Partial state update with memoryTokens, currentPhase
 */
async function fetchMemoryTokens(state, config) {
  // Skip if already fetched (resume case or pre-populated)
  // Use null check, not truthy/length check:
  // - null/undefined = not yet fetched (run fetch)
  // - array (even empty) = already fetched (skip)
  if (state.memoryTokens !== null && state.memoryTokens !== undefined) {
    console.log(`[fetchMemoryTokens] Skipping - already set (${state.memoryTokens.length} tokens)`);
    return {
      currentPhase: PHASES.FETCH_EVIDENCE
    };
  }

  const client = getNotionClient(config);

  // Get token IDs to fetch from director notes
  const tokenIds = state.directorNotes?.scannedTokens || [];

  // Fetch tokens from Notion
  const result = await client.fetchMemoryTokens(tokenIds);
  const tokens = result.tokens || [];

  // ─────────────────────────────────────────────────────
  // PERSIST: Save raw fetched tokens to disk for debugging and resume
  // ─────────────────────────────────────────────────────
  const dataDir = config?.configurable?.dataDir || DEFAULT_DATA_DIR;
  if (state.sessionId) {
    try {
      const fetchedDir = path.join(dataDir, state.sessionId, 'fetched');
      await fs.mkdir(fetchedDir, { recursive: true });
      await fs.writeFile(
        path.join(fetchedDir, 'tokens.json'),
        JSON.stringify({ tokens, fetchedAt: result.fetchedAt, totalCount: result.totalCount }, null, 2)
      );
      console.log(`[fetchMemoryTokens] Saved ${tokens.length} tokens to fetched/tokens.json`);
    } catch (err) {
      console.warn(`[fetchMemoryTokens] Failed to save tokens to disk: ${err.message}`);
    }
  }

  // ─────────────────────────────────────────────────────
  // EVIDENCE BOUNDARY: Tag each token with disposition
  // ─────────────────────────────────────────────────────

  // Load orchestrator-parsed.json directly from files
  // Files are the source of truth (LangGraph doesn't persist _parsedInput)
  const orchestratorPath = path.join(dataDir, state.sessionId, 'inputs', 'orchestrator-parsed.json');
  let orchestratorParsed = {};
  try {
    const orchestratorContent = await fs.readFile(orchestratorPath, 'utf-8');
    orchestratorParsed = JSON.parse(orchestratorContent);
  } catch (err) {
    // File doesn't exist - that's okay, disposition will be 'unknown' for all tokens
    console.log(`[fetchMemoryTokens] No orchestrator-parsed.json found`);
  }

  // Use shared helper for tagging
  const { taggedTokens, exposedCount, buriedCount, unknownCount } = tagTokensWithDisposition(tokens, orchestratorParsed);

  console.log(`[fetchMemoryTokens] Tagged ${taggedTokens.length} tokens: ${exposedCount} exposed, ${buriedCount} buried, ${unknownCount} unknown`);

  return {
    memoryTokens: taggedTokens,
    currentPhase: PHASES.FETCH_EVIDENCE
  };
}

/**
 * Tag memory tokens with disposition (exposed/buried/unknown)
 *
 * This runs AFTER orchestrator-parsed.json exists (created by parseRawInput).
 * Reads the file to get exposed/buried token lists and tags each token accordingly.
 *
 * Disposition determines evidence boundary enforcement:
 * - EXPOSED: Full data accessible, owner field usable
 * - BURIED: Only transaction data accessible, owner field is private
 *
 * @param {Object} state - Current state with memoryTokens, sessionId
 * @param {Object} config - Graph config with optional configurable.dataDir
 * @returns {Object} Partial state update with memoryTokens (tagged)
 */
async function tagTokenDispositions(state, config) {
  // Skip if no tokens to tag
  if (!state.memoryTokens || state.memoryTokens.length === 0) {
    console.log('[tagTokenDispositions] No tokens to tag');
    return {};
  }

  // Skip if ALL tokens already have a disposition set
  const allTagged = state.memoryTokens.every(t => t.disposition);
  if (allTagged) {
    console.log('[tagTokenDispositions] All tokens already tagged, skipping');
    return {};
  }

  // Load orchestrator-parsed.json
  const dataDir = config?.configurable?.dataDir || DEFAULT_DATA_DIR;
  const orchestratorPath = path.join(dataDir, state.sessionId, 'inputs', 'orchestrator-parsed.json');

  let orchestratorParsed = {};
  try {
    const content = await fs.readFile(orchestratorPath, 'utf-8');
    orchestratorParsed = JSON.parse(content);
    console.log(`[tagTokenDispositions] Loaded orchestrator-parsed: ${orchestratorParsed.exposedTokens?.length || 0} exposed, ${orchestratorParsed.buriedTokens?.length || 0} buried`);
  } catch (err) {
    console.log('[tagTokenDispositions] No orchestrator-parsed.json found, all tokens default to buried');
    // No session report means Nova has no access — treat all as buried
    const buriedTokens = state.memoryTokens.map(token => ({
      ...token,
      disposition: 'buried'
    }));
    return { memoryTokens: buriedTokens };
  }

  // Use shared helper for tagging
  const { taggedTokens, exposedCount, buriedCount, unknownCount } = tagTokensWithDisposition(state.memoryTokens, orchestratorParsed);

  console.log(`[tagTokenDispositions] Tagged ${taggedTokens.length} tokens: ${exposedCount} exposed, ${buriedCount} buried, ${unknownCount} unknown`);

  return { memoryTokens: taggedTokens };
}

/**
 * Fetch paper evidence from Notion (pure data fetch, no checkpoint)
 *
 * Pure data-fetching node for use in parallel branches.
 * Checkpoint is handled by dedicated checkpointPaperEvidence node.
 *
 * @param {Object} state - Current state with sessionId
 * @param {Object} config - Graph config with optional configurable.includeAttachments
 * @returns {Object} Partial state update with paperEvidence, currentPhase
 */
async function fetchPaperEvidence(state, config) {
  // Skip if already fetched (resume case or pre-populated)
  if (state.paperEvidence !== null && state.paperEvidence !== undefined) {
    console.log(`[fetchPaperEvidence] Skipping - already set (${state.paperEvidence.length} items)`);
    return {
      currentPhase: PHASES.FETCH_EVIDENCE
    };
  }

  const client = getNotionClient(config);
  const includeAttachments = config?.configurable?.includeAttachments ?? true;

  console.log('[fetchPaperEvidence] Fetching paper evidence from Notion...');
  const result = await client.fetchPaperEvidence(includeAttachments);
  const paperEvidence = result.evidence || [];

  console.log(`[fetchPaperEvidence] Fetched ${paperEvidence.length} items`);

  // Persist to disk for debugging and resume
  if (state.sessionId) {
    const dataDir = config?.configurable?.dataDir || DEFAULT_DATA_DIR;
    try {
      const fetchedDir = path.join(dataDir, state.sessionId, 'fetched');
      await fs.mkdir(fetchedDir, { recursive: true });
      await fs.writeFile(
        path.join(fetchedDir, 'paper-evidence.json'),
        JSON.stringify({ evidence: paperEvidence, fetchedAt: result.fetchedAt, totalCount: result.totalCount }, null, 2)
      );
      console.log(`[fetchPaperEvidence] Saved ${paperEvidence.length} items to fetched/paper-evidence.json`);
    } catch (err) {
      console.warn(`[fetchPaperEvidence] Failed to save paper evidence to disk: ${err.message}`);
    }
  }

  return {
    paperEvidence,
    currentPhase: PHASES.FETCH_EVIDENCE
  };
}

/**
 * Fetch session photos from filesystem
 *
 * Loads photo paths from the session's inputs directory.
 * Photos are analyzed in the next phase (analyzePhotos) using Haiku vision.
 *
 * @param {Object} state - Current state with sessionId
 * @param {Object} config - Graph config with optional configurable.dataDir
 * @returns {Object} Partial state update with sessionPhotos, currentPhase
 */
async function fetchSessionPhotos(state, config) {
  // Skip if already fetched (resume case or pre-populated)
  if (state.sessionPhotos !== null && state.sessionPhotos !== undefined) {
    console.log(`[fetchSessionPhotos] Skipping - already set (${state.sessionPhotos.length} photos)`);
    return {
      currentPhase: PHASES.ANALYZE_PHOTOS
    };
  }

  // Use custom photosPath from rawSessionInput or sessionConfig if provided
  // Priority: rawSessionInput (incremental input) > sessionConfig (file-based) > default
  const dataDir = config?.configurable?.dataDir || DEFAULT_DATA_DIR;
  const photosDir = state.rawSessionInput?.photosPath
    || state.sessionConfig?.photosPath
    || path.join(dataDir, state.sessionId, 'inputs', 'photos');

  try {
    // Check if photos directory exists
    await fs.access(photosDir);

    // List all image files in the directory
    const files = await fs.readdir(photosDir);
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const photos = files
      .filter(file => imageExtensions.includes(path.extname(file).toLowerCase()))
      .map(file => path.join(photosDir, file));

    console.log(`[fetchSessionPhotos] Found ${photos.length} photos in ${photosDir}`);

    return {
      sessionPhotos: photos,
      currentPhase: PHASES.ANALYZE_PHOTOS
    };
  } catch (error) {
    // Photos directory doesn't exist or is inaccessible - that's okay
    console.log(`[fetchSessionPhotos] No photos directory found at ${photosDir}`);
    return {
      sessionPhotos: [],
      currentPhase: PHASES.ANALYZE_PHOTOS
    };
  }
}

/**
 * Create a mock NotionClient for testing
 *
 * Returns an object with the same interface as NotionClient
 * but returns provided mock data instead of calling Notion API.
 *
 * Mock data structure must match actual NotionClient return format:
 *
 * tokens: [{
 *   notionId, tokenId, name, fullDescription, summary,
 *   valueRating, memoryType, group, basicType, owners[]
 * }]
 *
 * evidence: [{
 *   notionId, name, basicType, description,
 *   narrativeThreads[], owners[], containers[], files[]?
 * }]
 *
 * @param {Object} mockData - Mock data to return
 * @param {Array} mockData.tokens - Mock memory tokens (matches NotionClient.fetchMemoryTokens output)
 * @param {Array} mockData.evidence - Mock paper evidence (matches NotionClient.fetchPaperEvidence output)
 * @returns {Object} Mock client with fetchMemoryTokens and fetchPaperEvidence
 */
function createMockNotionClient(mockData = {}) {
  return {
    fetchMemoryTokens: async (tokenIds) => {
      const tokens = mockData.tokens || [];
      // Filter by tokenIds if provided (matches real client behavior - lowercase comparison)
      const filtered = tokenIds?.length
        ? tokens.filter(t => {
            const filterSet = new Set(tokenIds.map(id => id.toLowerCase()));
            return filterSet.has(t.tokenId?.toLowerCase());
          })
        : tokens;
      return {
        tokens: filtered,
        fetchedAt: new Date().toISOString(),
        totalCount: filtered.length
      };
    },
    fetchPaperEvidence: async (includeAttachments) => {
      const evidence = mockData.evidence || [];
      // If includeAttachments is false, strip files from response
      const processed = includeAttachments
        ? evidence
        : evidence.map(e => {
            const { files, ...rest } = e;
            return rest;
          });
      return {
        evidence: processed,
        fetchedAt: new Date().toISOString(),
        totalCount: processed.length
      };
    }
  };
}

module.exports = {
  // Node functions (wrapped with LangSmith tracing)
  initializeSession: traceNode(initializeSession, 'initializeSession'),
  loadDirectorNotes: traceNode(loadDirectorNotes, 'loadDirectorNotes'),
  fetchMemoryTokens: traceNode(fetchMemoryTokens, 'fetchMemoryTokens'),
  tagTokenDispositions: traceNode(tagTokenDispositions, 'tagTokenDispositions'),
  fetchPaperEvidence: traceNode(fetchPaperEvidence, 'fetchPaperEvidence'),
  fetchSessionPhotos: traceNode(fetchSessionPhotos, 'fetchSessionPhotos'),

  // Testing utilities
  createMockNotionClient,

  // Constants for testing
  _testing: {
    DEFAULT_DATA_DIR,
    getNotionClient
  }
};

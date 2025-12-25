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
const { synthesizePlayerFocus } = require('./node-helpers');

/**
 * Default data directory for session files
 * Can be overridden via config.configurable.dataDir
 */
const DEFAULT_DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');

/**
 * Get NotionClient from config or create default instance
 * Supports dependency injection for testing
 *
 * @param {Object} config - Graph config with optional configurable.notionClient
 * @returns {Object} NotionClient instance
 */
function getNotionClient(config) {
  return config?.configurable?.notionClient || createNotionClient();
}

/**
 * Initialize session from config
 *
 * Extracts sessionId and theme from the graph's configurable object.
 * This is the entry point node for the workflow.
 *
 * @param {Object} state - Current state (typically empty/default)
 * @param {Object} config - Graph config with configurable.sessionId and configurable.theme
 * @returns {Object} Partial state update with sessionId, theme, currentPhase
 */
async function initializeSession(state, config) {
  const { sessionId, theme = 'journalist' } = config?.configurable || {};

  if (!sessionId) {
    throw new Error('sessionId is required in config.configurable');
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
 *
 * Extracts playerFocus from director notes for downstream arc analysis.
 * If playerFocus is missing (legacy files), synthesizes it from available data.
 *
 * @param {Object} state - Current state with sessionId
 * @param {Object} config - Graph config with optional configurable.dataDir
 * @returns {Object} Partial state update with directorNotes, sessionConfig, playerFocus, currentPhase
 */
async function loadDirectorNotes(state, config) {
  // Skip if already loaded (resume case or pre-populated)
  if (state.directorNotes && Object.keys(state.directorNotes).length > 0) {
    console.log('[loadDirectorNotes] Skipping - directorNotes already loaded');
    return {
      currentPhase: PHASES.FETCH_TOKENS
    };
  }

  console.log('[loadDirectorNotes] Loading from files...');

  const dataDir = config?.configurable?.dataDir || DEFAULT_DATA_DIR;
  const sessionPath = path.join(dataDir, state.sessionId, 'inputs');

  // Load director notes
  const notesPath = path.join(sessionPath, 'director-notes.json');
  const notesContent = await fs.readFile(notesPath, 'utf-8');
  const directorNotes = JSON.parse(notesContent);

  // Load session config
  const configPath = path.join(sessionPath, 'session-config.json');
  const configContent = await fs.readFile(configPath, 'utf-8');
  const sessionConfig = JSON.parse(configContent);

  // Extract player focus (Layer 3 drives narrative per plan)
  // If missing, synthesize from available data (backwards compatibility)
  let playerFocus = directorNotes.playerFocus;

  if (!playerFocus || Object.keys(playerFocus).length === 0) {
    console.log('[loadDirectorNotes] Synthesizing playerFocus from existing data');
    playerFocus = synthesizePlayerFocus(sessionConfig, directorNotes);
  }

  return {
    directorNotes,
    sessionConfig,
    playerFocus,
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
  if (state.memoryTokens && state.memoryTokens.length > 0) {
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
  // EVIDENCE BOUNDARY: Tag each token with disposition
  // ─────────────────────────────────────────────────────

  // Get exposed/buried token lists from parsed input
  // These come from orchestrator-parsed.json created by parseRawInput
  const orchestratorParsed = state._parsedInput?.orchestratorParsed || {};
  const exposedTokenIds = new Set(
    (orchestratorParsed.exposedTokens || []).map(id => id.toLowerCase())
  );
  const buriedTokenIds = new Set(
    (orchestratorParsed.buriedTokens || []).map(t =>
      (typeof t === 'string' ? t : t.tokenId).toLowerCase()
    )
  );

  // Tag each token with its disposition
  const taggedTokens = tokens.map(token => {
    const tokenIdLower = (token.tokenId || token.id || '').toLowerCase();

    let disposition = 'unknown';
    if (exposedTokenIds.has(tokenIdLower)) {
      disposition = 'exposed';
    } else if (buriedTokenIds.has(tokenIdLower)) {
      disposition = 'buried';
    }

    return {
      ...token,
      disposition
    };
  });

  const exposedCount = taggedTokens.filter(t => t.disposition === 'exposed').length;
  const buriedCount = taggedTokens.filter(t => t.disposition === 'buried').length;
  const unknownCount = taggedTokens.filter(t => t.disposition === 'unknown').length;

  console.log(`[fetchMemoryTokens] Tagged ${taggedTokens.length} tokens: ${exposedCount} exposed, ${buriedCount} buried, ${unknownCount} unknown`);

  return {
    memoryTokens: taggedTokens,
    currentPhase: PHASES.FETCH_EVIDENCE
  };
}

/**
 * Fetch paper evidence from Notion
 *
 * Uses NotionClient to fetch all paper evidence documents.
 * Optionally includes file attachments based on config.
 *
 * @param {Object} state - Current state (unused for fetch)
 * @param {Object} config - Graph config with optional configurable.includeAttachments
 * @returns {Object} Partial state update with paperEvidence, currentPhase
 */
async function fetchPaperEvidence(state, config) {
  // Skip if already fetched (resume case or pre-populated)
  if (state.paperEvidence && state.paperEvidence.length > 0) {
    return {
      currentPhase: PHASES.FETCH_PHOTOS
    };
  }

  const client = getNotionClient(config);

  // Whether to include file attachments (defaults to true for full evidence)
  const includeAttachments = config?.configurable?.includeAttachments ?? true;

  // Fetch evidence from Notion
  const result = await client.fetchPaperEvidence(includeAttachments);

  return {
    paperEvidence: result.evidence || [],
    currentPhase: PHASES.FETCH_PHOTOS
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
  if (state.sessionPhotos && state.sessionPhotos.length > 0) {
    return {
      currentPhase: PHASES.ANALYZE_PHOTOS
    };
  }

  // Use custom photosPath from sessionConfig if provided, otherwise use default
  const dataDir = config?.configurable?.dataDir || DEFAULT_DATA_DIR;
  const photosDir = state.sessionConfig?.photosPath
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
  // Node functions
  initializeSession,
  loadDirectorNotes,
  fetchMemoryTokens,
  fetchPaperEvidence,
  fetchSessionPhotos,

  // Testing utilities
  createMockNotionClient,

  // Constants for testing
  _testing: {
    DEFAULT_DATA_DIR,
    getNotionClient
  }
};

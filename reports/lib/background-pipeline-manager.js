/**
 * BackgroundPipelineManager - Orchestrates parallel background processing
 *
 * Manages evidence and photo pipelines that run in the background while
 * users work on checkpoints. Pipelines continue during user think time,
 * and nodes wait for results only when data is actually needed.
 *
 * Key features:
 * - Fire-and-forget pipeline starts (staggered: evidence at session start, photos after parseRawInput)
 * - In-memory caching of results for fast access
 * - File persistence for restart resilience
 * - Status tracking for debugging
 * - Graceful timeout/failure handling
 *
 * Usage:
 *   backgroundPipelineManager.startEvidencePipeline(sessionId, sessionData, config);
 *   backgroundPipelineManager.startPhotoPipeline(sessionId, sessionData, config);
 *   const result = backgroundPipelineManager.getResult(sessionId, 'rawTokens');
 *   const result = await backgroundPipelineManager.awaitResult(sessionId, 'rawTokens', 60000);
 */

const fs = require('fs').promises;
const path = require('path');

const DEFAULT_DATA_DIR = path.join(__dirname, '..', 'data');

// Pipeline status constants
const STATUS = {
  NONE: 'none',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

// Result types
const RESULT_TYPES = {
  RAW_TOKENS: 'rawTokens',  // Raw tokens from Notion (no disposition tagging)
  TOKENS: 'tokens',          // Tagged tokens (with disposition) - legacy, for non-background path
  PAPER_EVIDENCE: 'paperEvidence',
  PREPROCESSED_PAPER: 'preprocessedPaperEvidence',  // Paper evidence only (preprocessed in background)
  PREPROCESSED: 'preprocessedEvidence',  // Full preprocessed (tokens + paper)
  PHOTOS: 'sessionPhotos',
  PHOTO_ANALYSES: 'photoAnalyses'
};

class BackgroundPipelineManager {
  constructor() {
    // sessionId -> { evidence: { promise, status, error }, photos: { promise, status, error } }
    this.pipelines = new Map();
    // sessionId:resultType -> result data
    this.results = new Map();
  }

  // ─────────────────────────────────────────────────────────────
  // Pipeline Control
  // ─────────────────────────────────────────────────────────────

  /**
   * Initialize pipeline state for a session (DRY helper)
   * @private
   */
  _initializePipelineState(sessionId) {
    if (!this.pipelines.has(sessionId)) {
      this.pipelines.set(sessionId, {
        evidence: { promise: null, status: STATUS.NONE, error: null },
        photos: { promise: null, status: STATUS.NONE, error: null }
      });
    }
    return this.pipelines.get(sessionId);
  }

  /**
   * Start ONLY the evidence pipeline (tokens → evidence)
   * This is fire-and-forget - pipeline runs in background
   *
   * Use this for staggered start: evidence pipeline can start at session start
   * because it only fetches raw tokens (no disposition tagging needed).
   * Disposition tagging happens later in the main workflow after orchestrator-parsed.json exists.
   *
   * @param {string} sessionId - Session identifier
   * @param {Object} sessionData - Session state snapshot (sessionId required)
   * @param {Object} config - Graph config
   */
  startEvidencePipeline(sessionId, sessionData, config) {
    // Guard: Prevent duplicate starts
    const existing = this.pipelines.get(sessionId);
    if (existing?.evidence?.status === STATUS.RUNNING) {
      console.warn(`[BG:${sessionId}] Evidence pipeline already running, skipping`);
      return;
    }

    console.log(`[BG:${sessionId}] Starting evidence pipeline`);

    const pipelineState = this._initializePipelineState(sessionId);
    pipelineState.evidence.status = STATUS.RUNNING;

    // Start evidence pipeline (tokens → evidence, NO preprocessing - deferred to main workflow)
    pipelineState.evidence.promise = this._runEvidencePipeline(sessionId, sessionData, config)
      .then(() => {
        pipelineState.evidence.status = STATUS.COMPLETED;
        console.log(`[BG:${sessionId}:evidence] Pipeline completed`);
      })
      .catch(error => {
        pipelineState.evidence.status = STATUS.FAILED;
        pipelineState.evidence.error = error.message;
        console.error(`[BG:${sessionId}:evidence] Pipeline failed:`, error.message);
        if (error.stack) {
          console.error(`[BG:${sessionId}:evidence] Stack:`, error.stack);
        }
      });
  }

  /**
   * Start ONLY the photo pipeline (fetch → analyze)
   * This is fire-and-forget - pipeline runs in background
   *
   * Use this for staggered start: photo pipeline must wait for parseRawInput
   * because it needs sessionConfig.photosPath.
   *
   * @param {string} sessionId - Session identifier
   * @param {Object} sessionData - Session state snapshot (sessionConfig required)
   * @param {Object} config - Graph config
   */
  startPhotoPipeline(sessionId, sessionData, config) {
    // Guard: Prevent duplicate starts
    const existing = this.pipelines.get(sessionId);
    if (existing?.photos?.status === STATUS.RUNNING) {
      console.warn(`[BG:${sessionId}] Photo pipeline already running, skipping`);
      return;
    }

    console.log(`[BG:${sessionId}] Starting photo pipeline`);

    const pipelineState = this._initializePipelineState(sessionId);
    pipelineState.photos.status = STATUS.RUNNING;

    // Start photo pipeline (fetch → analyze)
    pipelineState.photos.promise = this._runPhotoPipeline(sessionId, sessionData, config)
      .then(() => {
        pipelineState.photos.status = STATUS.COMPLETED;
        console.log(`[BG:${sessionId}:photos] Pipeline completed`);
      })
      .catch(error => {
        pipelineState.photos.status = STATUS.FAILED;
        pipelineState.photos.error = error.message;
        console.error(`[BG:${sessionId}:photos] Pipeline failed:`, error.message);
        if (error.stack) {
          console.error(`[BG:${sessionId}:photos] Stack:`, error.stack);
        }
      });
  }

  /**
   * Run the evidence pipeline: raw tokens → paper evidence
   *
   * NOTE: This fetches RAW tokens (no disposition tagging) and paper evidence only.
   * Disposition tagging and preprocessing are deferred to the main workflow after
   * orchestrator-parsed.json exists (created by parseRawInput).
   *
   * @private
   */
  async _runEvidencePipeline(sessionId, sessionData, config) {
    // Import nodes dynamically to avoid circular dependencies
    const { fetchMemoryTokensRaw, fetchPaperEvidence } = require('./workflow/nodes/fetch-nodes');

    const dataDir = config?.configurable?.dataDir || DEFAULT_DATA_DIR;

    // CRITICAL: Tell node functions we're the background pipeline - don't wait for ourselves
    // Without this, fetchMemoryTokensRaw calls getBackgroundResultOrWait which sees
    // isRunning(sessionId) === true and waits forever (deadlock)
    const pipelineConfig = {
      ...config,
      configurable: {
        ...config?.configurable,
        skipBackgroundCheck: true
      }
    };

    // Build state for node execution
    // Nodes expect state with sessionId and directorNotes
    let state = {
      sessionId,
      directorNotes: sessionData.directorNotes,
      sessionConfig: sessionData.sessionConfig,
      // Set to null so nodes know to fetch (not skip)
      memoryTokens: null,
      paperEvidence: null
    };

    // Step 1: Fetch raw tokens (NO disposition tagging - file doesn't exist yet)
    console.log(`[BG:${sessionId}:evidence] Fetching raw tokens...`);
    const tokenResult = await fetchMemoryTokensRaw(state, pipelineConfig);
    state = { ...state, ...tokenResult };
    this._setResult(sessionId, RESULT_TYPES.RAW_TOKENS, tokenResult.memoryTokens);
    await this._saveToFile(sessionId, 'raw-tokens.json', tokenResult.memoryTokens, dataDir);

    // Step 2: Fetch paper evidence
    console.log(`[BG:${sessionId}:evidence] Fetching paper evidence...`);
    const evidenceResult = await fetchPaperEvidence(state, pipelineConfig);
    this._setResult(sessionId, RESULT_TYPES.PAPER_EVIDENCE, evidenceResult.paperEvidence);
    await this._saveToFile(sessionId, 'paper-evidence.json', evidenceResult.paperEvidence, dataDir);

    // Step 3: Preprocess paper evidence (NEW - Phase 4a)
    // Paper evidence is ALWAYS 'exposed' (players physically unlocked it) - no dependency on
    // orchestrator-parsed.json or token disposition. Can preprocess immediately!
    // See evidence-preprocessor.js line 214: disposition: 'exposed'
    if (evidenceResult.paperEvidence?.length > 0) {
      console.log(`[BG:${sessionId}:evidence] Preprocessing ${evidenceResult.paperEvidence.length} paper evidence items...`);
      try {
        const { createEvidencePreprocessor } = require('./evidence-preprocessor');
        const { sdkQuery } = require('./sdk-client');
        const preprocessor = createEvidencePreprocessor({ sdkClient: sdkQuery });

        const preprocessedPaperEvidence = await preprocessor.process({
          memoryTokens: [],  // Empty - only preprocessing paper evidence
          paperEvidence: evidenceResult.paperEvidence,
          sessionId
        });

        this._setResult(sessionId, RESULT_TYPES.PREPROCESSED_PAPER, preprocessedPaperEvidence);
        await this._saveToFile(sessionId, 'preprocessed-paper-evidence.json', preprocessedPaperEvidence, dataDir);
        console.log(`[BG:${sessionId}:evidence] Preprocessed ${preprocessedPaperEvidence.items.length} paper evidence items in ${preprocessedPaperEvidence.stats.processingTimeMs}ms`);
      } catch (error) {
        // Non-fatal - main workflow will preprocess if background fails
        console.warn(`[BG:${sessionId}:evidence] Paper preprocessing failed: ${error.message}`);
      }
    }

    // NOTE: Token disposition tagging still happens in main workflow after parseRawInput
    // creates orchestrator-parsed.json

    console.log(`[BG:${sessionId}:evidence] Evidence fetch complete (token tagging deferred)`);
  }

  /**
   * Run the photo pipeline: fetch → analyze
   * @private
   */
  async _runPhotoPipeline(sessionId, sessionData, config) {
    const { fetchSessionPhotos } = require('./workflow/nodes/fetch-nodes');
    const { analyzePhotos } = require('./workflow/nodes/photo-nodes');

    const dataDir = config?.configurable?.dataDir || DEFAULT_DATA_DIR;

    // CRITICAL: Tell node functions we're the background pipeline - don't wait for ourselves
    const pipelineConfig = {
      ...config,
      configurable: {
        ...config?.configurable,
        skipBackgroundCheck: true
      }
    };

    // Build state for node execution
    let state = {
      sessionId,
      sessionConfig: sessionData.sessionConfig,
      playerFocus: sessionData.playerFocus,
      directorNotes: sessionData.directorNotes,
      // Set to null so nodes know to fetch (not skip)
      sessionPhotos: null,
      photoAnalyses: null
    };

    // Step 1: Fetch photos
    console.log(`[BG:${sessionId}:photos] Fetching photos...`);
    const photoResult = await fetchSessionPhotos(state, pipelineConfig);
    state = { ...state, ...photoResult };
    this._setResult(sessionId, RESULT_TYPES.PHOTOS, photoResult.sessionPhotos);

    // Step 2: Analyze photos (if any)
    if (photoResult.sessionPhotos && photoResult.sessionPhotos.length > 0) {
      console.log(`[BG:${sessionId}:photos] Analyzing ${photoResult.sessionPhotos.length} photos...`);
      const analysisResult = await analyzePhotos(state, pipelineConfig);
      this._setResult(sessionId, RESULT_TYPES.PHOTO_ANALYSES, analysisResult.photoAnalyses);
      await this._saveToFile(sessionId, 'photo-analyses.json', analysisResult.photoAnalyses, dataDir);
    } else {
      console.log(`[BG:${sessionId}:photos] No photos to analyze`);
      this._setResult(sessionId, RESULT_TYPES.PHOTO_ANALYSES, []);
    }

    console.log(`[BG:${sessionId}:photos] Photo pipeline complete`);
  }

  // ─────────────────────────────────────────────────────────────
  // Result Access
  // ─────────────────────────────────────────────────────────────

  /**
   * Get result immediately (non-blocking)
   * Returns null if not yet available
   *
   * @param {string} sessionId
   * @param {string} resultType - One of RESULT_TYPES
   * @returns {any|null}
   */
  getResult(sessionId, resultType) {
    const key = `${sessionId}:${resultType}`;
    // Use explicit undefined check to preserve empty arrays
    const value = this.results.get(key);
    return value !== undefined ? value : null;
  }

  /**
   * Wait for result with timeout
   *
   * @param {string} sessionId
   * @param {string} resultType
   * @param {number} timeoutMs - Maximum wait time
   * @returns {Promise<any|null>} - Result or null on timeout
   */
  async awaitResult(sessionId, resultType, timeoutMs = 60000) {
    const startTime = Date.now();
    const pollInterval = 500; // Check every 500ms

    while (Date.now() - startTime < timeoutMs) {
      const result = this.getResult(sessionId, resultType);
      if (result !== null) {
        return result;
      }

      // Check if pipeline failed
      const status = this._getResultStatus(sessionId, resultType);
      if (status === STATUS.FAILED) {
        console.warn(`[BG:${sessionId}] Pipeline failed for ${resultType}, returning null`);
        return null;
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    console.warn(`[BG:${sessionId}] Timeout waiting for ${resultType}`);
    return null;
  }

  /**
   * Get status of a specific pipeline
   *
   * @param {string} sessionId
   * @param {string} pipelineType - 'evidence' or 'photos'
   * @returns {string} - STATUS value
   */
  getStatus(sessionId, pipelineType) {
    const pipeline = this.pipelines.get(sessionId);
    if (!pipeline) return STATUS.NONE;
    return pipeline[pipelineType]?.status || STATUS.NONE;
  }

  /**
   * Get full status for debugging
   *
   * @param {string} sessionId
   * @returns {Object}
   */
  getFullStatus(sessionId) {
    const pipeline = this.pipelines.get(sessionId);
    if (!pipeline) {
      return {
        evidence: { status: STATUS.NONE },
        photos: { status: STATUS.NONE },
        results: {}
      };
    }

    const results = {};
    for (const type of Object.values(RESULT_TYPES)) {
      const key = `${sessionId}:${type}`;
      results[type] = this.results.has(key);
    }

    return {
      evidence: {
        status: pipeline.evidence.status,
        error: pipeline.evidence.error
      },
      photos: {
        status: pipeline.photos.status,
        error: pipeline.photos.error
      },
      results
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Internal Helpers
  // ─────────────────────────────────────────────────────────────

  /**
   * Set a result value
   * @private
   */
  _setResult(sessionId, resultType, value) {
    const key = `${sessionId}:${resultType}`;
    this.results.set(key, value);
  }

  /**
   * Get the pipeline name that produces a given result type
   * @private
   * @param {string} resultType - One of RESULT_TYPES
   * @returns {string} - 'evidence' or 'photos'
   */
  _getPipelineForResult(resultType) {
    return [
      RESULT_TYPES.RAW_TOKENS,
      RESULT_TYPES.TOKENS,
      RESULT_TYPES.PAPER_EVIDENCE,
      RESULT_TYPES.PREPROCESSED_PAPER,
      RESULT_TYPES.PREPROCESSED
    ].includes(resultType) ? 'evidence' : 'photos';
  }

  /**
   * Get status for a specific result type
   * @private
   */
  _getResultStatus(sessionId, resultType) {
    const pipelineType = this._getPipelineForResult(resultType);
    return this.getStatus(sessionId, pipelineType);
  }

  /**
   * Check if the pipeline that produces a specific result type is running
   *
   * Unlike isRunning() which returns true if ANY pipeline is running,
   * this method only returns true if the RELEVANT pipeline is running.
   * This prevents unnecessary waits when e.g. photos pipeline is running
   * but we're waiting for evidence results that are already available.
   *
   * @param {string} sessionId
   * @param {string} resultType - One of RESULT_TYPES
   * @returns {boolean}
   */
  isPipelineRunningForResult(sessionId, resultType) {
    const pipelineName = this._getPipelineForResult(resultType);
    const pipeline = this.pipelines.get(sessionId);
    if (!pipeline) return false;
    return pipeline[pipelineName]?.status === STATUS.RUNNING;
  }

  /**
   * Save result to file for restart resilience
   * @private
   */
  async _saveToFile(sessionId, filename, data, dataDir) {
    try {
      const fetchedDir = path.join(dataDir, sessionId, 'fetched');
      await fs.mkdir(fetchedDir, { recursive: true });
      const filePath = path.join(fetchedDir, filename);
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      console.log(`[BG:${sessionId}] Saved ${filename}`);
    } catch (error) {
      console.warn(`[BG:${sessionId}] Failed to save ${filename}:`, error.message);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────

  /**
   * Clean up resources for a session
   *
   * @param {string} sessionId
   */
  cleanup(sessionId) {
    this.pipelines.delete(sessionId);

    // Clear all results for this session
    for (const key of this.results.keys()) {
      if (key.startsWith(`${sessionId}:`)) {
        this.results.delete(key);
      }
    }

    console.log(`[BG:${sessionId}] Cleaned up`);
  }

  /**
   * Check if any pipelines are running for a session
   *
   * @param {string} sessionId
   * @returns {boolean}
   */
  isRunning(sessionId) {
    const pipeline = this.pipelines.get(sessionId);
    if (!pipeline) return false;
    return pipeline.evidence.status === STATUS.RUNNING ||
           pipeline.photos.status === STATUS.RUNNING;
  }
}

// Singleton instance
const instance = new BackgroundPipelineManager();

// ─────────────────────────────────────────────────────────────
// DRY Helper for Node Integration
// ─────────────────────────────────────────────────────────────

/**
 * Check for background pipeline result, optionally waiting if pipeline is running
 *
 * This is the single integration point for nodes - keeps node code DRY.
 * Nodes call this at the start; if it returns a value, use it and skip work.
 *
 * @param {string} sessionId - Session identifier
 * @param {string} resultType - One of RESULT_TYPES (tokens, paperEvidence, etc.)
 * @param {Object} config - Node config (checks for mock injection to skip)
 * @param {number} [timeoutMs=120000] - How long to wait if pipeline is running
 * @returns {Promise<any|null>} - Result if available, null otherwise
 *
 * @example
 * async function fetchMemoryTokens(state, config) {
 *   const bgResult = await getBackgroundResultOrWait(state.sessionId, 'tokens', config);
 *   if (bgResult) {
 *     return { memoryTokens: bgResult, currentPhase: PHASES.FETCH_EVIDENCE };
 *   }
 *   // ... existing code unchanged
 * }
 */
async function getBackgroundResultOrWait(sessionId, resultType, config, timeoutMs = 120000) {
  // Skip if using injected mock client (testing) or explicitly disabled
  if (config?.configurable?.notionClient || config?.configurable?.skipBackgroundCheck) {
    return null;
  }

  // 1. Check if result already exists (instant return)
  const existing = instance.getResult(sessionId, resultType);
  if (existing) {
    console.log(`[BG:${sessionId}] Found cached ${resultType}`);
    return existing;
  }

  // 2. If the RELEVANT pipeline is running, wait for result
  // Phase 4d fix: Use pipeline-specific check instead of isRunning() to avoid
  // waiting for e.g. photos pipeline when we need evidence results.
  // This prevents 120s hangs when evidence is done but photos is still running.
  const pipelineName = instance._getPipelineForResult(resultType);
  if (instance.getStatus(sessionId, pipelineName) === STATUS.RUNNING) {
    console.log(`[BG:${sessionId}] ${pipelineName} pipeline running, waiting for ${resultType}...`);
    const result = await instance.awaitResult(sessionId, resultType, timeoutMs);
    if (result) {
      console.log(`[BG:${sessionId}] Got ${resultType} from ${pipelineName} pipeline`);
      return result;
    }
  }

  // 3. No background result available - node should do its own work
  return null;
}

module.exports = {
  backgroundPipelineManager: instance,
  BackgroundPipelineManager,
  getBackgroundResultOrWait,
  STATUS,
  RESULT_TYPES
};

// Self-test when run directly
if (require.main === module) {
  console.log('BackgroundPipelineManager Self-Test\n');

  const manager = new BackgroundPipelineManager();

  // Test basic operations without actual node execution
  console.log('Testing result storage...');
  manager._setResult('test-session', RESULT_TYPES.TOKENS, [{ id: 'test' }]);
  const result = manager.getResult('test-session', RESULT_TYPES.TOKENS);
  console.log('Stored and retrieved result:', result);

  console.log('\nTesting status tracking...');
  manager.pipelines.set('test-session', {
    evidence: { status: STATUS.RUNNING, error: null },
    photos: { status: STATUS.COMPLETED, error: null }
  });
  console.log('Evidence status:', manager.getStatus('test-session', 'evidence'));
  console.log('Photos status:', manager.getStatus('test-session', 'photos'));
  console.log('Full status:', manager.getFullStatus('test-session'));

  console.log('\nTesting cleanup...');
  manager.cleanup('test-session');
  console.log('After cleanup:', manager.getFullStatus('test-session'));

  console.log('\nSelf-test passed!');
}

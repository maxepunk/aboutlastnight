/**
 * ReportStateAnnotation - LangGraph state definition for report generation
 *
 * Defines the state schema for the unified report generation workflow.
 * All fields use reducers to handle state updates during graph execution.
 *
 * Usage:
 *   const { StateGraph } = require('@langchain/langgraph');
 *   const { ReportStateAnnotation } = require('./state');
 *   const graph = new StateGraph(ReportStateAnnotation);
 *
 * State Fields (53 total - includes revision context + human feedback):
 *   - Session: sessionId, theme
 *   - Raw Input (8.9): rawSessionInput
 *   - Input Data: sessionConfig, directorNotes, playerFocus
 *   - Fetched Data: memoryTokens, paperEvidence, sessionPhotos
 *   - User Selection (8.9): selectedPaperEvidence
 *   - Photo Analysis (8.6): photoAnalyses, characterIdMappings
 *   - Preprocessed Data: preprocessedEvidence (Commit 8.5)
 *   - Curated Data: evidenceBundle
 *   - Arc Specialists (8.6): specialistAnalyses
 *   - Analysis: narrativeArcs, selectedArcs, heroImage, _arcAnalysisCache
 *   - Evaluation (8.6): evaluationHistory
 *   - Generation: outline, contentBundle
 *   - Supervisor (8.6): supervisorNarrativeCompass
 *   - Output: assembledHtml, validationResults
 *   - Control: currentPhase, errors
 *   - Revision Counters (8.6): arcRevisionCount, outlineRevisionCount, articleRevisionCount
 */

const { Annotation } = require('@langchain/langgraph');

/**
 * Default reducer: replaces old value with new value
 * @param {*} oldValue - Previous state value
 * @param {*} newValue - New state value
 * @returns {*} New value if provided, otherwise old value
 * Note: Uses !== undefined (not ??) to allow explicit null clearing
 */
const replaceReducer = (oldValue, newValue) => newValue !== undefined ? newValue : oldValue;

/**
 * Append reducer: appends new items to existing array
 * Used for errors to accumulate rather than replace
 * @param {Array} oldValue - Previous array
 * @param {Array} newValue - Items to append
 * @returns {Array} Combined array
 */
const appendReducer = (oldValue, newValue) => {
  const prev = oldValue || [];
  const next = newValue || [];
  return [...prev, ...next];
};

/**
 * Merge reducer: shallow-merges objects (Commit 8.6)
 * Used for specialistAnalyses where parallel specialists contribute results
 * @param {Object} oldValue - Previous object
 * @param {Object} newValue - New properties to merge
 * @returns {Object} Merged object
 */
const mergeReducer = (oldValue, newValue) => {
  const prev = oldValue || {};
  const next = newValue || {};
  return { ...prev, ...next };
};

/**
 * Append single reducer: appends a single item to existing array (Commit 8.6)
 * Used for evaluationHistory where each evaluation adds one entry
 * @param {Array} oldValue - Previous array
 * @param {*} newValue - Single item to append (or null to skip)
 * @returns {Array} Array with new item appended
 */
const appendSingleReducer = (oldValue, newValue) => {
  const prev = oldValue || [];
  if (newValue === null || newValue === undefined) return prev;
  return [...prev, newValue];
};

/**
 * Report generation state annotation
 * Defines all state channels with their reducers and default values
 */
const ReportStateAnnotation = Annotation.Root({
  // ═══════════════════════════════════════════════════════
  // SESSION IDENTIFICATION
  // ═══════════════════════════════════════════════════════

  /** Unique session identifier (e.g., "1220ALL48") */
  sessionId: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  /** Theme for report generation: "journalist" or "detective" */
  theme: Annotation({
    reducer: replaceReducer,
    default: () => 'journalist'
  }),

  // ═══════════════════════════════════════════════════════
  // RAW INPUT (Commit 8.9 - unstructured user input)
  // ═══════════════════════════════════════════════════════

  /**
   * Raw unstructured input from user (Commit 8.9)
   * Contains roster, accusation, session report, director notes as free text
   * Parsed by parseRawInput node into sessionConfig and directorNotes
   */
  rawSessionInput: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  // ═══════════════════════════════════════════════════════
  // INPUT DATA (from session directory)
  // ═══════════════════════════════════════════════════════

  /** Session configuration from director-notes.json */
  sessionConfig: Annotation({
    reducer: replaceReducer,
    default: () => ({})
  }),

  /** Director's notes with observations and whiteboard data */
  directorNotes: Annotation({
    reducer: replaceReducer,
    default: () => ({})
  }),

  /** Player focus from whiteboard (Layer 3 drives narrative) */
  playerFocus: Annotation({
    reducer: replaceReducer,
    default: () => ({})
  }),

  // ═══════════════════════════════════════════════════════
  // FETCHED DATA (from Notion/external sources)
  // ═══════════════════════════════════════════════════════

  /** Memory tokens fetched from Notion database */
  memoryTokens: Annotation({
    reducer: replaceReducer,
    default: () => []
  }),

  /** Paper evidence documents from Notion */
  paperEvidence: Annotation({
    reducer: replaceReducer,
    default: () => []
  }),

  /**
   * User-selected paper evidence items (Commit 8.9)
   * Subset of paperEvidence that was actually unlocked during gameplay
   * Selected at checkpoint after fetch, before curation
   */
  selectedPaperEvidence: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  /** Session photos from filesystem/Notion */
  sessionPhotos: Annotation({
    reducer: replaceReducer,
    default: () => []
  }),

  // ═══════════════════════════════════════════════════════
  // INCREMENTAL INPUT (Parallel branch architecture)
  // ═══════════════════════════════════════════════════════

  /**
   * Roster provided via /approve endpoint (incremental input)
   * Array of character names for whiteboard OCR disambiguation
   * Set by checkpointAwaitRoster when user provides roster
   */
  roster: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  /**
   * Generic photo analyses (before roster is available)
   * Created by analyzePhotosGeneric - descriptions use visual markers, not names
   * Character names resolved later via characterIdMappings
   */
  genericPhotoAnalyses: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  // ═══════════════════════════════════════════════════════
  // PHOTO PROCESSING (Parallel branch architecture)
  // ═══════════════════════════════════════════════════════

  /**
   * Auto-detected whiteboard photo path
   * Set by detectWhiteboard node via fuzzy filename matching
   */
  whiteboardPhotoPath: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  /**
   * Photo preprocessing statistics
   * Set by preprocessPhotos node: { totalPhotos, preprocessed, originalSizeBytes, processedSizeBytes }
   */
  preprocessStats: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  /**
   * Whiteboard OCR analysis result (requires roster for disambiguation)
   * Set by analyzeWhiteboard node after roster is provided
   */
  whiteboardAnalysis: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  // ═══════════════════════════════════════════════════════
  // PHOTO ANALYSIS (Commit 8.6)
  // ═══════════════════════════════════════════════════════

  /**
   * Photo analyses from Haiku vision (early in pipeline)
   * Each entry: { filename, visualContent, narrativeMoment, suggestedCaption }
   * Character names are generic until user provides characterIdMappings
   */
  photoAnalyses: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  /**
   * User-provided character ID mappings (structured format)
   * Maps photo descriptions → character names
   * Either provided directly or parsed from characterIdsRaw
   */
  characterIdMappings: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  /**
   * Raw natural language character ID input from user
   * Parsed by parseCharacterIds node into characterIdMappings
   * Added in Commit 8.9.x for natural language input support
   */
  characterIdsRaw: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  // ═══════════════════════════════════════════════════════
  // PREPROCESSED DATA (Commit 8.5)
  // ═══════════════════════════════════════════════════════

  /**
   * Batch-summarized evidence in universal schema format
   * Created by preprocessEvidence node before curation
   * @see preprocessed-evidence.schema.json
   */
  preprocessedEvidence: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  /**
   * Pre-curation checkpoint approval flag (Phase 4f)
   * Set to true when user approves preprocessed evidence
   */
  preCurationApproved: Annotation({
    reducer: replaceReducer,
    default: () => false
  }),

  /**
   * Outline checkpoint approval flag (Commit 8.26 - SRP checkpoint separation)
   * Set to true when user approves outline at checkpoint
   */
  outlineApproved: Annotation({
    reducer: replaceReducer,
    default: () => false
  }),

  /**
   * Article checkpoint approval flag (Commit 8.26 - SRP checkpoint separation)
   * Set to true when user approves article at checkpoint
   */
  articleApproved: Annotation({
    reducer: replaceReducer,
    default: () => false
  }),

  /**
   * Summary of preprocessed data for user review (Phase 4f)
   * Contains counts of exposed/buried items, photos, etc.
   */
  preCurationSummary: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  // ═══════════════════════════════════════════════════════
  // CURATED DATA (AI-processed)
  // ═══════════════════════════════════════════════════════

  /** Three-layer evidence bundle (exposed, buried, context) */
  evidenceBundle: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  // ═══════════════════════════════════════════════════════
  // ARC SPECIALIST OUTPUTS (Commit 8.8: Orchestrated Subagents)
  // ═══════════════════════════════════════════════════════

  /**
   * Arc specialist outputs from orchestrated subagent analysis
   * Structure: { financial: {...}, behavioral: {...}, victimization: {...} }
   *
   * Commit 8.8 change: Uses replaceReducer instead of mergeReducer
   * because the orchestrator returns the complete object in one call
   * (subagents run in parallel via SDK, not sequential graph nodes)
   */
  specialistAnalyses: Annotation({
    reducer: replaceReducer,
    default: () => ({})
  }),

  // ═══════════════════════════════════════════════════════
  // ANALYSIS RESULTS
  // ═══════════════════════════════════════════════════════

  /** Narrative arcs identified by AI analysis */
  narrativeArcs: Annotation({
    reducer: replaceReducer,
    default: () => []
  }),

  /** User-selected arcs for article generation */
  selectedArcs: Annotation({
    reducer: replaceReducer,
    default: () => []
  }),

  /**
   * Confirmed hero image filename for article generation
   * Set by generateOutline, consumed by generateContentBundle
   * Single source of truth - prevents duplicate hero/inline photos
   */
  heroImage: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  /**
   * Per-arc evidence packages with full quotable content
   * Built by buildArcEvidencePackages after arc selection
   * Contains: { arcId, arcTitle, evidence: [{ id, fullContent, quotableExcerpts }], photos: [...] }
   * @see Phase 1 Fix in plan
   */
  arcEvidencePackages: Annotation({
    reducer: replaceReducer,
    default: () => []
  }),

  /** Cached arc analysis for outline generation (internal) */
  _arcAnalysisCache: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  // ═══════════════════════════════════════════════════════
  // EVALUATION STATE (Commit 8.6)
  // ═══════════════════════════════════════════════════════

  /**
   * History of all evaluations across phases
   * Each entry: { phase, timestamp, ready, issues, confidence, revisionGuidance }
   * Used for debugging and tracking revision patterns
   */
  evaluationHistory: Annotation({
    reducer: appendSingleReducer,
    default: () => []
  }),

  // ═══════════════════════════════════════════════════════
  // GENERATION OUTPUTS
  // ═══════════════════════════════════════════════════════

  /** Article outline approved by user */
  outline: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  /** Structured content bundle (JSON schema validated) */
  contentBundle: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  // NOTE: outlineValidation and articleValidation removed in Commit 8.23
  // Programmatic validation was too brittle - trust Opus evaluators instead

  // ═══════════════════════════════════════════════════════
  // SUPERVISOR STATE (Commit 8.6)
  // ═══════════════════════════════════════════════════════

  /**
   * Supervisor's narrative compass - maintains cohesion across phases
   * Structure: { coreThemes, emotionalHook, keyMoments, playerFocusAnchors, coherenceNotes }
   * Updated by supervisor after each phase to track/enforce vision
   */
  supervisorNarrativeCompass: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  // ═══════════════════════════════════════════════════════
  // FINAL OUTPUTS
  // ═══════════════════════════════════════════════════════

  /** Assembled HTML from templates */
  assembledHtml: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  /** Validation results (voice check, anti-patterns) */
  validationResults: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  /** Path to saved HTML output file */
  outputPath: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  /** Number of photos copied to output directory */
  photosCopied: Annotation({
    reducer: replaceReducer,
    default: () => 0
  }),

  // ═══════════════════════════════════════════════════════
  // CONTROL FLOW
  // ═══════════════════════════════════════════════════════

  /** Current workflow phase (e.g., "1.1", "2", "complete") */
  currentPhase: Annotation({
    reducer: replaceReducer,
    default: () => 'init'
  }),

  /** @deprecated Use phase-specific revision counts (Commit 8.6) */
  voiceRevisionCount: Annotation({
    reducer: replaceReducer,
    default: () => 0
  }),

  // ═══════════════════════════════════════════════════════
  // PHASE-SPECIFIC REVISION COUNTERS (Commit 8.6)
  // ═══════════════════════════════════════════════════════

  /** Arc revision count (max 2 - foundational, escalate early) */
  arcRevisionCount: Annotation({
    reducer: replaceReducer,
    default: () => 0
  }),

  /** Outline revision count (max 3 - more surface area to fix) */
  outlineRevisionCount: Annotation({
    reducer: replaceReducer,
    default: () => 0
  }),

  /** Article revision count (max 3 - most content to polish) */
  articleRevisionCount: Annotation({
    reducer: replaceReducer,
    default: () => 0
  }),

  /** Accumulated errors during workflow execution */
  errors: Annotation({
    reducer: appendReducer,
    default: () => []
  }),

  // ═══════════════════════════════════════════════════════
  // INTERNAL TEMPORARY STATE (Commit 8.10+)
  // ═══════════════════════════════════════════════════════

  /**
   * Rescued item names from human override at evidence checkpoint
   * Set by server approval handler, consumed by processRescuedItems node
   * Cleared after processing
   */
  _rescuedItems: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  /**
   * Cache of full excluded item data for rescue mechanism
   * Maps item name → full preprocessed item data
   * Built by curateEvidenceBundle, consumed by processRescuedItems
   */
  _excludedItemsCache: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  /**
   * Warnings from rescue process (non-fatal issues)
   * Array of { item, reason } for items that couldn't be rescued
   */
  _rescueWarnings: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  // ═══════════════════════════════════════════════════════
  // REVISION CONTEXT (Preserves previous output for targeted fixes)
  // ═══════════════════════════════════════════════════════

  /**
   * Previous arcs before revision (for revision context)
   * Set by incrementArcRevision, consumed by reviseArcs
   * Contains full narrativeArcs array from failed evaluation
   */
  _previousArcs: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  /**
   * Previous outline before revision (for revision context)
   * Set by incrementOutlineRevision, consumed by reviseOutline
   * Contains full outline object from failed evaluation
   */
  _previousOutline: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  /**
   * Previous content bundle before revision (for revision context)
   * Set by incrementArticleRevision, consumed by reviseContentBundle
   * Contains full contentBundle object from failed evaluation
   */
  _previousContentBundle: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  /**
   * Human feedback for outline rejection (triggers revision loop)
   * Set by server approval handler, consumed by reviseOutline
   * Cleared after revision completes — follows _previousOutline pattern
   */
  _outlineFeedback: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  /**
   * Human feedback for article rejection (triggers revision loop)
   * Set by server approval handler, consumed by reviseContentBundle
   * Cleared after revision completes — follows _previousContentBundle pattern
   */
  _articleFeedback: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  /**
   * Arc validation results from validateArcStructure (Commit 8.xx)
   * Set by: validateArcStructure in arc-specialist-nodes.js
   * Consumed by: routeArcValidation in graph.js for routing decision
   * Contains: { inputCount, outputCount, structuralPassed, missingRoster, nonRosterPCs, ... }
   */
  _arcValidation: Annotation({
    reducer: replaceReducer,
    default: () => null
  })
});

/**
 * Get default state with all fields initialized (53 fields after human feedback additions)
 * Useful for testing and initialization
 * @returns {Object} Default state object
 */
function getDefaultState() {
  return {
    // Session
    sessionId: null,
    theme: 'journalist',
    // Raw input (Commit 8.9)
    rawSessionInput: null,
    // Input data
    sessionConfig: {},
    directorNotes: {},
    playerFocus: {},
    // Fetched data
    memoryTokens: [],
    paperEvidence: [],
    selectedPaperEvidence: null,  // Commit 8.9: user-selected subset
    sessionPhotos: [],
    // Incremental input (parallel branch architecture)
    roster: null,
    genericPhotoAnalyses: null,
    // Photo processing (parallel branch architecture)
    whiteboardPhotoPath: null,
    preprocessStats: null,
    whiteboardAnalysis: null,
    // Photo analysis (Commit 8.6)
    photoAnalyses: null,
    characterIdMappings: null,
    characterIdsRaw: null,  // Natural language character ID input (Commit 8.9.x)
    // Preprocessed data (Commit 8.5)
    preprocessedEvidence: null,
    // Pre-curation checkpoint (Phase 4f)
    preCurationApproved: false,
    preCurationSummary: null,
    // Checkpoint approvals (Commit 8.26 - SRP separation)
    outlineApproved: false,
    articleApproved: false,
    // Curated data
    evidenceBundle: null,
    // Arc specialists (Commit 8.6)
    specialistAnalyses: {},
    // Analysis results
    narrativeArcs: [],
    selectedArcs: [],
    heroImage: null,  // Confirmed hero image filename for article generation
    arcEvidencePackages: [],  // Phase 1 Fix: per-arc evidence with fullContent
    _arcAnalysisCache: null,
    // Evaluation (Commit 8.6)
    evaluationHistory: [],
    // Generation outputs
    outline: null,
    contentBundle: null,
    // Supervisor (Commit 8.6)
    supervisorNarrativeCompass: null,
    // Final outputs
    assembledHtml: null,
    validationResults: null,
    outputPath: null,
    photosCopied: 0,
    // Control flow
    currentPhase: 'init',
    voiceRevisionCount: 0,  // @deprecated
    // Revision counters (Commit 8.6)
    arcRevisionCount: 0,
    outlineRevisionCount: 0,
    articleRevisionCount: 0,
    // Error handling
    errors: [],
    // Internal temporary state (Commit 8.10+)
    _rescuedItems: null,
    _excludedItemsCache: null,
    _rescueWarnings: null,
    // Revision context (preserves previous output for targeted fixes)
    _previousArcs: null,
    _previousOutline: null,
    _previousContentBundle: null,
    // Arc validation routing (Commit 8.xx)
    _arcValidation: null,
    // Human rejection feedback (consumed by revision nodes, cleared after use)
    _outlineFeedback: null,
    _articleFeedback: null
  };
}

/**
 * Phase constants for workflow control (Commit 8.9 update)
 * Phases 0.x = Raw input parsing and review (Commit 8.9)
 * Phases 1.x = Data acquisition, photo analysis, preprocessing
 * Phases 2.x = Arc analysis (parallel specialists → synthesis → evaluation)
 * Phases 3.x = Outline generation and evaluation
 * Phases 4.x = Article generation and evaluation
 * Phase 5 = Assembly and completion
 */
const PHASES = {
  INIT: 'init',

  // Raw input phases (Commit 8.9)
  PARSE_INPUT: '0.1',               // Parse raw text input + analyze whiteboard
  REVIEW_INPUT: '0.2',              // User reviews/edits parsed input before proceeding

  LOAD_DIRECTOR_NOTES: '1.1',
  FETCH_TOKENS: '1.2',
  FETCH_EVIDENCE: '1.3',
  SELECT_PAPER_EVIDENCE: '1.35',    // Commit 8.9: user selects which paper evidence was unlocked
  FETCH_PHOTOS: '1.4',

  // Parallel branch phases (new - for parallel branch architecture)
  PREPROCESS_PHOTOS: '1.42',        // Resize/optimize photos for LLM + article display
  DETECT_WHITEBOARD: '1.43',        // Auto-detect whiteboard from photo folder
  JOIN_PARALLEL: '1.5',             // Synchronization point for parallel branches
  AWAIT_ROSTER: '1.51',             // Wait for roster via /approve (incremental input)
  AWAIT_FULL_CONTEXT: '1.52',       // Wait for accusation/sessionReport/directorNotes

  ANALYZE_PHOTOS: '1.65',           // Commit 8.6: early photo analysis (before preprocessing)
  CHARACTER_ID_CHECKPOINT: '1.66',  // Commit 8.9.5: user provides character IDs for photos
  PARSE_CHARACTER_IDS: '1.665',     // Commit 8.9.x: parse natural language → structured format
  FINALIZE_PHOTOS: '1.67',          // Commit 8.9.5: enrich photo analyses with character IDs
  PREPROCESS_EVIDENCE: '1.7',       // Commit 8.5: batch summarization before curation
  PRE_CURATION_CHECKPOINT: '1.75',  // Phase 4f: user approves evidence before curation
  CURATE_EVIDENCE: '1.8',

  // Arc analysis sub-phases (Commit 8.6)
  GENERATION_SUPERVISOR: '2.0',     // Supervisor orchestrates arc→outline→article (Commit 8.6)
  ARC_SPECIALISTS: '2.1',           // Parallel domain specialists (financial, behavioral, victimization)
  ARC_SYNTHESIS: '2.2',             // Synthesizer combines specialist outputs
  ARC_EVALUATION: '2.3',            // Evaluator checks arcs
  ARC_SELECTION: '2.35',            // Checkpoint: user selects arcs (Commit 8.26 - SRP separation)
  BUILD_ARC_PACKAGES: '2.4',        // Phase 1 Fix: Build per-arc evidence packages after selection
  ANALYZE_ARCS: '2',                // @deprecated - use sub-phases

  // Outline sub-phases (Commit 8.6)
  OUTLINE_GENERATION: '3.1',
  OUTLINE_EVALUATION: '3.2',
  OUTLINE_CHECKPOINT: '3.25',       // Checkpoint: user approves outline (Commit 8.26 - SRP separation)
  GENERATE_OUTLINE: '3',            // @deprecated - use sub-phases

  // Article sub-phases (Commit 8.6)
  ARTICLE_GENERATION: '4.1',
  ARTICLE_EVALUATION: '4.2',
  ARTICLE_CHECKPOINT: '4.25',       // Checkpoint: user approves article (Commit 8.26 - SRP separation)
  GENERATE_CONTENT: '4',            // @deprecated - use sub-phases
  VALIDATE_SCHEMA: '4.3',           // Moved from 4.1
  REVISE_CONTENT: '4.4',            // Moved from 4.2

  ASSEMBLE_HTML: '5',
  VALIDATE_ARTICLE: '5.1',          // @deprecated - use ARTICLE_EVALUATION
  COMPLETE: 'complete',
  ERROR: 'error'
};

// NOTE: APPROVAL_TYPES removed in interrupt() migration
// Checkpoint types now defined in checkpoint-helpers.js as CHECKPOINT_TYPES
// See: lib/workflow/checkpoint-helpers.js

/**
 * Revision cap constants (Commit 8.6)
 * Arcs: 2 (foundational - escalate early)
 * Outline/Article: 3 (more surface area to fix)
 */
const REVISION_CAPS = {
  ARCS: 2,
  OUTLINE: 3,
  ARTICLE: 3
};

/**
 * Rollback configuration (Commit 8.9.3)
 *
 * Defines what state fields to clear when rolling back to each checkpoint.
 * Each rollback point clears its own outputs plus all downstream phases.
 *
 * Usage: When user wants to re-run from a specific checkpoint with
 * potentially modified guidance (e.g., adjusted playerFocus).
 *
 * The fields listed are set to null, triggering node skip-logic to regenerate.
 */
const ROLLBACK_CLEARS = {
  // Phase 0.2: Input review - clears everything (essentially fresh start)
  'input-review': [
    // Input phase outputs
    'sessionConfig', 'directorNotes', 'playerFocus',
    // Fetch phase outputs
    'memoryTokens', 'paperEvidence', 'selectedPaperEvidence', 'sessionPhotos',
    // Photo analysis
    'photoAnalyses', 'characterIdMappings',
    // Preprocessing and curation
    'preprocessedEvidence', 'preCurationApproved', 'evidenceBundle',
    // Arc analysis
    'specialistAnalyses', 'narrativeArcs', 'selectedArcs', '_arcAnalysisCache',
    // Generation
    'heroImage', 'outline', 'outlineApproved', '_outlineFeedback',
    'contentBundle', 'articleApproved', '_articleFeedback', 'assembledHtml', 'validationResults',
    // Evaluation history
    'evaluationHistory'
  ],

  // Phase 1.35: Paper evidence selection (8.9.4)
  'paper-evidence-selection': [
    'selectedPaperEvidence',
    'photoAnalyses', 'characterIdMappings',
    'preprocessedEvidence', 'preCurationApproved', 'evidenceBundle',
    'specialistAnalyses', 'narrativeArcs', 'selectedArcs', '_arcAnalysisCache',
    'heroImage', 'outline', 'outlineApproved', '_outlineFeedback',
    'contentBundle', 'articleApproved', '_articleFeedback', 'assembledHtml', 'validationResults',
    'evaluationHistory'
  ],

  // Phase 1.51: Await roster (incremental input)
  'await-roster': [
    'whiteboardAnalysis',
    'characterIdMappings',
    'preprocessedEvidence', 'preCurationApproved', 'evidenceBundle',
    'specialistAnalyses', 'narrativeArcs', 'selectedArcs', '_arcAnalysisCache',
    'heroImage', 'outline', 'outlineApproved', '_outlineFeedback',
    'contentBundle', 'articleApproved', '_articleFeedback', 'assembledHtml', 'validationResults',
    'evaluationHistory'
  ],

  // Phase 1.65+: Character ID mappings (8.9.5)
  'character-ids': [
    'characterIdMappings',
    // Note: photoAnalyses preserved - only mappings need re-entry
    'preprocessedEvidence', 'preCurationApproved', 'evidenceBundle',
    'specialistAnalyses', 'narrativeArcs', 'selectedArcs', '_arcAnalysisCache',
    'heroImage', 'outline', 'outlineApproved', '_outlineFeedback',
    'contentBundle', 'articleApproved', '_articleFeedback', 'assembledHtml', 'validationResults',
    'evaluationHistory'
  ],

  // Phase 1.75: Pre-curation checkpoint (Phase 4f)
  'pre-curation': [
    'preCurationApproved',
    // Note: preprocessedEvidence preserved - expensive to regenerate
    'evidenceBundle',
    'specialistAnalyses', 'narrativeArcs', 'selectedArcs', '_arcAnalysisCache',
    'heroImage', 'outline', 'outlineApproved', '_outlineFeedback',
    'contentBundle', 'articleApproved', '_articleFeedback', 'assembledHtml', 'validationResults',
    'evaluationHistory'
  ],

  // Phase 1.8: Evidence and photos approval
  'evidence-and-photos': [
    'evidenceBundle',
    'specialistAnalyses', 'narrativeArcs', 'selectedArcs', '_arcAnalysisCache',
    'heroImage', 'outline', 'outlineApproved', '_outlineFeedback',
    'contentBundle', 'articleApproved', '_articleFeedback', 'assembledHtml', 'validationResults',
    'evaluationHistory'
  ],

  // Phase 2.3: Arc selection - most common rollback point
  'arc-selection': [
    'specialistAnalyses', 'narrativeArcs', 'selectedArcs', '_arcAnalysisCache',
    'heroImage', 'outline', 'outlineApproved', '_outlineFeedback',
    'contentBundle', 'articleApproved', '_articleFeedback',
    'assembledHtml', 'validationResults',
    'evaluationHistory'
  ],

  // Phase 3.2: Outline
  'outline': [
    'heroImage', 'outline', 'outlineApproved', '_outlineFeedback',
    'contentBundle', 'articleApproved', '_articleFeedback', 'assembledHtml', 'validationResults'
    // Note: evaluationHistory preserved - may contain useful arc evals
  ],

  // Phase 4.2: Article
  'article': [
    'contentBundle', 'articleApproved', '_articleFeedback', 'assembledHtml', 'validationResults'
  ]
};

/**
 * Revision counters to reset for each rollback point.
 * Rolling back past a phase resets its revision counter for fresh attempts.
 */
const ROLLBACK_COUNTER_RESETS = {
  'input-review': { arcRevisionCount: 0, outlineRevisionCount: 0, articleRevisionCount: 0 },
  'paper-evidence-selection': { arcRevisionCount: 0, outlineRevisionCount: 0, articleRevisionCount: 0 },
  'await-roster': { arcRevisionCount: 0, outlineRevisionCount: 0, articleRevisionCount: 0 },
  'character-ids': { arcRevisionCount: 0, outlineRevisionCount: 0, articleRevisionCount: 0 },
  'pre-curation': { arcRevisionCount: 0, outlineRevisionCount: 0, articleRevisionCount: 0 },
  'evidence-and-photos': { arcRevisionCount: 0, outlineRevisionCount: 0, articleRevisionCount: 0 },
  'arc-selection': { arcRevisionCount: 0, outlineRevisionCount: 0, articleRevisionCount: 0 },
  'outline': { outlineRevisionCount: 0, articleRevisionCount: 0 },
  'article': { articleRevisionCount: 0 }
};

/**
 * Valid rollback points (for validation)
 */
const VALID_ROLLBACK_POINTS = Object.keys(ROLLBACK_CLEARS);

module.exports = {
  ReportStateAnnotation,
  getDefaultState,
  PHASES,
  REVISION_CAPS,
  // Rollback configuration (Commit 8.9.3)
  ROLLBACK_CLEARS,
  ROLLBACK_COUNTER_RESETS,
  VALID_ROLLBACK_POINTS,
  // Export reducers for testing
  _testing: {
    replaceReducer,
    appendReducer,
    mergeReducer,
    appendSingleReducer
  }
};

// Self-test when run directly
if (require.main === module) {
  console.log('ReportStateAnnotation Self-Test\n');

  // Test default state
  const defaultState = getDefaultState();
  console.log('Default state keys:', Object.keys(defaultState).length); // Should be 53
  console.log('Default theme:', defaultState.theme);
  console.log('Default errors:', defaultState.errors);
  console.log('Default rawSessionInput:', defaultState.rawSessionInput); // Should be null
  console.log('Default selectedPaperEvidence:', defaultState.selectedPaperEvidence); // Should be null
  console.log('Default preprocessedEvidence:', defaultState.preprocessedEvidence); // Should be null
  console.log('Default photoAnalyses:', defaultState.photoAnalyses); // Should be null
  console.log('Default specialistAnalyses:', defaultState.specialistAnalyses); // Should be {}
  console.log('Default evaluationHistory:', defaultState.evaluationHistory); // Should be []
  console.log('Default arcRevisionCount:', defaultState.arcRevisionCount); // Should be 0

  // Test reducers
  const { replaceReducer, appendReducer, mergeReducer, appendSingleReducer } = module.exports._testing;

  console.log('\nReducer tests:');
  console.log('replaceReducer(1, 2):', replaceReducer(1, 2)); // Should be 2
  console.log('replaceReducer(1, null):', replaceReducer(1, null)); // Should be null (allows clearing)
  console.log('appendReducer([1], [2, 3]):', appendReducer([1], [2, 3])); // Should be [1, 2, 3]
  console.log('appendReducer(null, [1]):', appendReducer(null, [1])); // Should be [1]
  console.log('mergeReducer({a:1}, {b:2}):', mergeReducer({a:1}, {b:2})); // Should be {a:1, b:2}
  console.log('mergeReducer(null, {a:1}):', mergeReducer(null, {a:1})); // Should be {a:1}
  console.log('appendSingleReducer([1], 2):', appendSingleReducer([1], 2)); // Should be [1, 2]
  console.log('appendSingleReducer([1], null):', appendSingleReducer([1], null)); // Should be [1]

  // Test phases
  console.log('\nPhase constants:', Object.keys(PHASES).length, 'phases defined');
  console.log('PARSE_INPUT phase:', PHASES.PARSE_INPUT); // Should be '0.1'
  console.log('REVIEW_INPUT phase:', PHASES.REVIEW_INPUT); // Should be '0.2'
  console.log('SELECT_PAPER_EVIDENCE phase:', PHASES.SELECT_PAPER_EVIDENCE); // Should be '1.35'
  console.log('ANALYZE_PHOTOS phase:', PHASES.ANALYZE_PHOTOS); // Should be '1.65'
  console.log('ARC_SPECIALISTS phase:', PHASES.ARC_SPECIALISTS); // Should be '2.1'

  // NOTE: APPROVAL_TYPES removed - checkpoint types now in checkpoint-helpers.js

  // Test revision caps
  console.log('\nRevision caps:', REVISION_CAPS); // Should be { ARCS: 2, OUTLINE: 3, ARTICLE: 3 }

  // Test rollback points
  console.log('\nRollback points:', VALID_ROLLBACK_POINTS.length, 'valid'); // Should be 8

  console.log('\nSelf-test complete.');
}

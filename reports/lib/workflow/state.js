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
 * State Fields (30 total - Commit 8.6):
 *   - Session: sessionId, theme
 *   - Input Data: sessionConfig, directorNotes, playerFocus
 *   - Fetched Data: memoryTokens, paperEvidence, sessionPhotos
 *   - Photo Analysis (8.6): photoAnalyses, characterIdMappings
 *   - Preprocessed Data: preprocessedEvidence (Commit 8.5)
 *   - Curated Data: evidenceBundle
 *   - Arc Specialists (8.6): specialistAnalyses
 *   - Analysis: narrativeArcs, selectedArcs, _arcAnalysisCache
 *   - Evaluation (8.6): evaluationHistory
 *   - Generation: outline, contentBundle
 *   - Supervisor (8.6): supervisorNarrativeCompass
 *   - Output: assembledHtml, validationResults
 *   - Control: currentPhase, errors, awaitingApproval, approvalType
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

  /** Session photos from filesystem/Notion */
  sessionPhotos: Annotation({
    reducer: replaceReducer,
    default: () => []
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
   * User-provided character ID mappings
   * Maps photo descriptions → character names (from character-ids.json)
   * Provided at checkpoint before arc analysis
   */
  characterIdMappings: Annotation({
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

  // ═══════════════════════════════════════════════════════
  // CURATED DATA (AI-processed)
  // ═══════════════════════════════════════════════════════

  /** Three-layer evidence bundle (exposed, buried, context) */
  evidenceBundle: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  // ═══════════════════════════════════════════════════════
  // ARC SPECIALIST OUTPUTS (Commit 8.6)
  // ═══════════════════════════════════════════════════════

  /**
   * Parallel arc specialist outputs (scatter-gather pattern)
   * Structure: { financial: {...}, behavioral: {...}, victimization: {...} }
   * Each specialist contributes domain-specific insights
   */
  specialistAnalyses: Annotation({
    reducer: mergeReducer,
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
  // HUMAN APPROVAL CHECKPOINTS
  // ═══════════════════════════════════════════════════════

  /** Whether workflow is paused for human approval */
  awaitingApproval: Annotation({
    reducer: replaceReducer,
    default: () => false
  }),

  /** Type of approval needed: "evidence-bundle", "arc-selection", "outline" */
  approvalType: Annotation({
    reducer: replaceReducer,
    default: () => null
  })
});

/**
 * Get default state with all fields initialized (30 fields - Commit 8.6)
 * Useful for testing and initialization
 * @returns {Object} Default state object
 */
function getDefaultState() {
  return {
    // Session
    sessionId: null,
    theme: 'journalist',
    // Input data
    sessionConfig: {},
    directorNotes: {},
    playerFocus: {},
    // Fetched data
    memoryTokens: [],
    paperEvidence: [],
    sessionPhotos: [],
    // Photo analysis (Commit 8.6)
    photoAnalyses: null,
    characterIdMappings: null,
    // Preprocessed data (Commit 8.5)
    preprocessedEvidence: null,
    // Curated data
    evidenceBundle: null,
    // Arc specialists (Commit 8.6)
    specialistAnalyses: {},
    // Analysis results
    narrativeArcs: [],
    selectedArcs: [],
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
    // Control flow
    currentPhase: 'init',
    voiceRevisionCount: 0,  // @deprecated
    // Revision counters (Commit 8.6)
    arcRevisionCount: 0,
    outlineRevisionCount: 0,
    articleRevisionCount: 0,
    // Error handling
    errors: [],
    // Human approval
    awaitingApproval: false,
    approvalType: null
  };
}

/**
 * Phase constants for workflow control (Commit 8.6 update)
 * Phases 1.x = Data acquisition, photo analysis, preprocessing
 * Phases 2.x = Arc analysis (parallel specialists → synthesis → evaluation)
 * Phases 3.x = Outline generation and evaluation
 * Phases 4.x = Article generation and evaluation
 * Phase 5 = Assembly and completion
 */
const PHASES = {
  INIT: 'init',
  LOAD_DIRECTOR_NOTES: '1.1',
  FETCH_TOKENS: '1.2',
  FETCH_EVIDENCE: '1.3',
  FETCH_PHOTOS: '1.4',
  ANALYZE_PHOTOS: '1.65',           // Commit 8.6: early photo analysis (before preprocessing)
  PREPROCESS_EVIDENCE: '1.7',       // Commit 8.5: batch summarization before curation
  CURATE_EVIDENCE: '1.8',

  // Arc analysis sub-phases (Commit 8.6)
  GENERATION_SUPERVISOR: '2.0',     // Supervisor orchestrates arc→outline→article (Commit 8.6)
  ARC_SPECIALISTS: '2.1',           // Parallel domain specialists (financial, behavioral, victimization)
  ARC_SYNTHESIS: '2.2',             // Synthesizer combines specialist outputs
  ARC_EVALUATION: '2.3',            // Evaluator checks arcs
  ANALYZE_ARCS: '2',                // @deprecated - use sub-phases

  // Outline sub-phases (Commit 8.6)
  OUTLINE_GENERATION: '3.1',
  OUTLINE_EVALUATION: '3.2',
  GENERATE_OUTLINE: '3',            // @deprecated - use sub-phases

  // Article sub-phases (Commit 8.6)
  ARTICLE_GENERATION: '4.1',
  ARTICLE_EVALUATION: '4.2',
  GENERATE_CONTENT: '4',            // @deprecated - use sub-phases
  VALIDATE_SCHEMA: '4.3',           // Moved from 4.1
  REVISE_CONTENT: '4.4',            // Moved from 4.2

  ASSEMBLE_HTML: '5',
  VALIDATE_ARTICLE: '5.1',          // @deprecated - use ARTICLE_EVALUATION
  COMPLETE: 'complete',
  ERROR: 'error'
};

/**
 * Approval type constants (Commit 8.6 update)
 * Human always approves at checkpoints - evaluators determine readiness
 */
const APPROVAL_TYPES = {
  EVIDENCE_AND_PHOTOS: 'evidence-and-photos', // Combined evidence + photo analysis approval
  CHARACTER_IDS: 'character-ids',             // User provides character-ids.json mapping
  EVIDENCE_BUNDLE: 'evidence-bundle',         // @deprecated - use EVIDENCE_AND_PHOTOS
  ARC_SELECTION: 'arc-selection',             // Select which arcs to develop
  OUTLINE: 'outline',                         // Approve outline structure
  ARTICLE: 'article'                          // Final article approval before assembly
};

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

module.exports = {
  ReportStateAnnotation,
  getDefaultState,
  PHASES,
  APPROVAL_TYPES,
  REVISION_CAPS,
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
  console.log('Default state keys:', Object.keys(defaultState).length); // Should be 30 (Commit 8.6)
  console.log('Default theme:', defaultState.theme);
  console.log('Default errors:', defaultState.errors);
  console.log('Default preprocessedEvidence:', defaultState.preprocessedEvidence); // Should be null
  console.log('Default photoAnalyses:', defaultState.photoAnalyses); // Should be null
  console.log('Default specialistAnalyses:', defaultState.specialistAnalyses); // Should be {}
  console.log('Default evaluationHistory:', defaultState.evaluationHistory); // Should be []
  console.log('Default arcRevisionCount:', defaultState.arcRevisionCount); // Should be 0

  // Test reducers
  const { replaceReducer, appendReducer, mergeReducer, appendSingleReducer } = module.exports._testing;

  console.log('\nReducer tests:');
  console.log('replaceReducer(1, 2):', replaceReducer(1, 2)); // Should be 2
  console.log('replaceReducer(1, null):', replaceReducer(1, null)); // Should be 1
  console.log('appendReducer([1], [2, 3]):', appendReducer([1], [2, 3])); // Should be [1, 2, 3]
  console.log('appendReducer(null, [1]):', appendReducer(null, [1])); // Should be [1]
  console.log('mergeReducer({a:1}, {b:2}):', mergeReducer({a:1}, {b:2})); // Should be {a:1, b:2}
  console.log('mergeReducer(null, {a:1}):', mergeReducer(null, {a:1})); // Should be {a:1}
  console.log('appendSingleReducer([1], 2):', appendSingleReducer([1], 2)); // Should be [1, 2]
  console.log('appendSingleReducer([1], null):', appendSingleReducer([1], null)); // Should be [1]

  // Test phases
  console.log('\nPhase constants:', Object.keys(PHASES).length, 'phases defined'); // Should be 24 (Commit 8.6)
  console.log('ANALYZE_PHOTOS phase:', PHASES.ANALYZE_PHOTOS); // Should be '1.65'
  console.log('ARC_SPECIALISTS phase:', PHASES.ARC_SPECIALISTS); // Should be '2.1'

  // Test approval types
  console.log('\nApproval types:', Object.keys(APPROVAL_TYPES).length, 'types defined'); // Should be 6
  console.log('CHARACTER_IDS:', APPROVAL_TYPES.CHARACTER_IDS); // Should be 'character-ids'

  // Test revision caps
  console.log('\nRevision caps:', REVISION_CAPS); // Should be { ARCS: 2, OUTLINE: 3, ARTICLE: 3 }

  console.log('\nSelf-test complete.');
}

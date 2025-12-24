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
 * State Fields:
 *   - Session: sessionId, theme
 *   - Input Data: sessionConfig, directorNotes, playerFocus
 *   - Fetched Data: memoryTokens, paperEvidence, sessionPhotos
 *   - Curated Data: evidenceBundle
 *   - Analysis: narrativeArcs, selectedArcs
 *   - Generation: outline, contentBundle
 *   - Output: assembledHtml, validationResults
 *   - Control: currentPhase, voiceRevisionCount, errors, awaitingApproval, approvalType
 */

const { Annotation } = require('@langchain/langgraph');

/**
 * Default reducer: replaces old value with new value
 * @param {*} oldValue - Previous state value
 * @param {*} newValue - New state value
 * @returns {*} New value if defined, otherwise old value
 */
const replaceReducer = (oldValue, newValue) => newValue ?? oldValue;

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
  // CURATED DATA (AI-processed)
  // ═══════════════════════════════════════════════════════

  /** Three-layer evidence bundle (exposed, buried, context) */
  evidenceBundle: Annotation({
    reducer: replaceReducer,
    default: () => null
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

  /** Number of voice revision attempts (max 2) */
  voiceRevisionCount: Annotation({
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
 * Get default state with all fields initialized
 * Useful for testing and initialization
 * @returns {Object} Default state object
 */
function getDefaultState() {
  return {
    sessionId: null,
    theme: 'journalist',
    sessionConfig: {},
    directorNotes: {},
    playerFocus: {},
    memoryTokens: [],
    paperEvidence: [],
    sessionPhotos: [],
    evidenceBundle: null,
    narrativeArcs: [],
    selectedArcs: [],
    _arcAnalysisCache: null,
    outline: null,
    contentBundle: null,
    assembledHtml: null,
    validationResults: null,
    currentPhase: 'init',
    voiceRevisionCount: 0,
    errors: [],
    awaitingApproval: false,
    approvalType: null
  };
}

/**
 * Phase constants for workflow control
 */
const PHASES = {
  INIT: 'init',
  LOAD_DIRECTOR_NOTES: '1.1',
  FETCH_TOKENS: '1.2',
  FETCH_EVIDENCE: '1.3',
  FETCH_PHOTOS: '1.4',
  CURATE_EVIDENCE: '1.8',
  ANALYZE_ARCS: '2',
  GENERATE_OUTLINE: '3',
  GENERATE_CONTENT: '4',
  VALIDATE_SCHEMA: '4.1',
  REVISE_CONTENT: '4.2',
  ASSEMBLE_HTML: '5',
  VALIDATE_ARTICLE: '5.1',
  COMPLETE: 'complete',
  ERROR: 'error'
};

/**
 * Approval type constants
 */
const APPROVAL_TYPES = {
  EVIDENCE_BUNDLE: 'evidence-bundle',
  ARC_SELECTION: 'arc-selection',
  OUTLINE: 'outline'
};

module.exports = {
  ReportStateAnnotation,
  getDefaultState,
  PHASES,
  APPROVAL_TYPES,
  // Export reducers for testing
  _testing: {
    replaceReducer,
    appendReducer
  }
};

// Self-test when run directly
if (require.main === module) {
  console.log('ReportStateAnnotation Self-Test\n');

  // Test default state
  const defaultState = getDefaultState();
  console.log('Default state keys:', Object.keys(defaultState).length);
  console.log('Default theme:', defaultState.theme);
  console.log('Default errors:', defaultState.errors);

  // Test reducers
  const { replaceReducer, appendReducer } = module.exports._testing;

  console.log('\nReducer tests:');
  console.log('replaceReducer(1, 2):', replaceReducer(1, 2)); // Should be 2
  console.log('replaceReducer(1, null):', replaceReducer(1, null)); // Should be 1
  console.log('appendReducer([1], [2, 3]):', appendReducer([1], [2, 3])); // Should be [1, 2, 3]
  console.log('appendReducer(null, [1]):', appendReducer(null, [1])); // Should be [1]

  // Test phases
  console.log('\nPhase constants:', Object.keys(PHASES).length, 'phases defined');

  console.log('\nSelf-test complete.');
}

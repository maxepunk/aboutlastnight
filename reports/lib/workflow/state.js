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
 * State Fields (67 total - includes revision context + human feedback):
 *   - Session: sessionId, theme
 *   - Raw Input (8.9): rawSessionInput
 *   - Input Data: sessionConfig, directorNotes, playerFocus, inputReviewApproved, _inputCorrections
 *   - Fetched Data: memoryTokens, paperEvidence, sessionPhotos
 *   - User Selection (8.9): selectedPaperEvidence
 *   - Photo Analysis (8.6): photoAnalyses, characterIdMappings
 *   - Preprocessed Data: preprocessedEvidence (Commit 8.5)
 *   - Curated Data: evidenceBundle
 *   - Arc Specialists (8.6): specialistAnalyses
 *   - Analysis: narrativeArcs, selectedArcs, heroImage, _arcAnalysisCache
 *   - Evaluation (8.6): evaluationHistory
 *   - Generation: outline, contentBundle
 *   - Output: assembledHtml, validationResults
 *   - Control: currentPhase, errors
 *   - Revision Counters (8.6): arcRevisionCount, humanArcRevisionCount, outlineRevisionCount, articleRevisionCount
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
  if (Array.isArray(newValue) && newValue.length === 0) return [];
  const prev = oldValue || [];
  const next = newValue || [];
  return [...prev, ...next];
};

/**
 * Append single reducer: appends a single item to existing array (Commit 8.6)
 * Used for evaluationHistory where each evaluation adds one entry
 *
 * An EMPTY array is the clear sentinel (checked first, as in appendReducer). A
 * NON-EMPTY array appends its items — one state update sometimes has to add more
 * than one entry, and buildRollbackState('outline') is the case: it invalidates
 * both the outline AND the article evaluation (I1). Without this, the array would
 * be appended as a single nested element and neither phase's skip check would see
 * its stub.
 *
 * @param {Array} oldValue - Previous array
 * @param {*} newValue - Item to append, array of items, [] to clear, or null to skip
 * @returns {Array} Array with the new item(s) appended
 */
const appendSingleReducer = (oldValue, newValue) => {
  if (Array.isArray(newValue) && newValue.length === 0) return [];
  const prev = oldValue || [];
  if (newValue === null || newValue === undefined) return prev;
  if (Array.isArray(newValue)) return [...prev, ...newValue];
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

  /** Shell account standings from orchestrator parsed data (authoritative financial data) */
  shellAccounts: Annotation({
    reducer: replaceReducer,
    default: () => ([])
  }),

  /**
   * Input-review checkpoint approval flag (B2/B8 — dedicated checkpoint node).
   *
   * The interrupt used to live inside parseRawInput and gate on
   * `sessionConfig.roster?.length > 0` — satisfied by the parse two statements
   * earlier, so the checkpoint never fired. checkpointInputReview gates on THIS
   * channel instead: it is the only thing that makes the gate skip.
   * Set by: checkpointInputReview in checkpoint-nodes.js
   */
  inputReviewApproved: Annotation({
    reducer: replaceReducer,
    default: () => false
  }),

  /**
   * Director corrections captured when the input-review gate is REJECTED (B2).
   * Consumed by parseRawInput (appended to the Step-1/Step-2/enrichment prompts)
   * and nulled in the same node return. Non-empty => routeAfterInputReview
   * sends the graph back to parseRawInput.
   */
  _inputCorrections: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  // ═══════════════════════════════════════════════════════
  // FETCHED DATA (from Notion/external sources)
  // ═══════════════════════════════════════════════════════

  /** Memory tokens fetched from Notion database */
  memoryTokens: Annotation({
    reducer: replaceReducer,
    default: () => []
  }),

  /** Canonical character map derived from Notion token owners (RC2)
   *  Maps firstName -> fullName, e.g. { 'Alex': 'Alex Reeves' }
   *  Populated by fetchMemoryTokens, consumed by PromptBuilder
   */
  canonicalCharacters: Annotation({
    reducer: replaceReducer,
    default: () => null
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

  /**
   * The ONE owner of the session photo folder (C1).
   *
   * Seeded by POST /start when the director already has photos, otherwise
   * captured at the `photos` checkpoint, which runs after arc selection.
   * `fetchSessionPhotos` reads THIS and nothing else: the gate's skip signal and
   * the fetch's directory must never be able to disagree. rawSessionInput and
   * sessionConfig are no longer consulted by the fetch — a gate that skipped on a
   * directory scan of `data/<id>/photos` while the fetch fell back to
   * `data/<id>/inputs/photos` produced a photo-less article with no error.
   */
  photosPath: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  /**
   * Transient pre-fill stash for the `photos` gate (v2 M1).
   *
   * `ROLLBACK_CLEARS['photos']` nulls `photosPath` so the gate always re-asks, and
   * `rawSessionInput` is rollback-EXEMPT — so without this, every rollback after a
   * gate-time correction would re-offer the ORIGINAL start-time path, which is the
   * bad one the director just corrected. `/rollback` stashes the cleared value here
   * (exactly as ROLL-4 stashes `_previousFullContext`), the gate pre-fills from it,
   * and the approval that ANSWERS the gate nulls it — `buildResumePayload`'s photos
   * arm, not the node (v2 I2: a `Command` update lands before the interrupted node
   * re-executes, so `checkpointPhotos` always skips and could never consume it).
   * Display only: it can neither make the gate skip nor redirect
   * `fetchSessionPhotos`.
   */
  _previousPhotosPath: Annotation({
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
   * Per-character pronouns provided alongside the roster (F1)
   * Map of first name -> pronoun string, e.g. { 'Vic': 'she/her' }
   * Parallel to roster (which stays string[]); default they/them resolved at prompt time.
   * Set by checkpointAwaitRoster, carried into sessionConfig.rosterPronouns by parseRawInput.
   */
  rosterPronouns: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  /**
   * Full-context raw inputs (ROLL-4) — promoted from rawSessionInput sub-fields to
   * first-class channels so rollback to await-full-context can clear them and the
   * checkpoint re-pauses. Collected at checkpointAwaitContext; read by parseRawInput.
   */
  accusation: Annotation({ reducer: replaceReducer, default: () => null }),
  sessionReport: Annotation({ reducer: replaceReducer, default: () => null }),
  // 'Raw' suffix: the parsed `directorNotes` channel is separate (see below).
  // Same raw-vs-parsed convention as characterIdsRaw -> characterIdMappings.
  directorNotesRaw: Annotation({ reducer: replaceReducer, default: () => null }),

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
   * Character data extracted from paper evidence + tokens (pre-curation)
   * Contains structured groups, relationships, and roles for roster characters.
   * Extracted before curation so character sheet data is captured regardless of scoring.
   */
  characterData: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  // Narrative tensions from programmatic cross-referencing (pre-arc-analysis)
  narrativeTensions: Annotation({ reducer: replaceReducer, default: () => null }),

  /**
   * Pre-curation checkpoint approval flag (Phase 4f)
   * Set to true when user approves preprocessed evidence
   */
  preCurationApproved: Annotation({
    reducer: replaceReducer,
    default: () => false
  }),

  /**
   * Evidence checkpoint approval flag (SRP checkpoint separation)
   * Set to true when user approves evidence bundle at checkpoint
   */
  _evidenceApproved: Annotation({
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
   * Commit 8.8 change: Uses replaceReducer (the orchestrator returns the
   * complete specialistAnalyses object in one SDK call, so no merge needed)
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

  /** Arc revision count — evaluator-driven (max 2 - foundational, escalate early) */
  arcRevisionCount: Annotation({
    reducer: replaceReducer,
    default: () => 0
  }),

  /** Human arc revision count — human rejection-driven (max 4 - domain knowledge iterations) */
  humanArcRevisionCount: Annotation({
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
   * Stash of the prior full-context values during a rollback to await-full-context,
   * so AwaitFullContext pre-fills the re-collection form. Transient scratch (sibling
   * of _previousArcs/_previousOutline); nulled when new context is captured. EXEMPT
   * from ROLLBACK_CLEARS (owned by the checkpoint), like the other _previous* fields.
   */
  _previousFullContext: Annotation({ reducer: replaceReducer, default: () => null }),

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
   * Human feedback for arc selection rejection (triggers revision loop)
   * Set by server approval handler, consumed by reviseArcs
   * Cleared after revision completes — follows _outlineFeedback pattern
   */
  _arcFeedback: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  /**
   * Result of the programmatic content-bundle fact-check (BASELINE §4).
   *
   * Written by evaluateArticle BEFORE the Opus evaluation; surfaced on the
   * article checkpoint as `factCheck` so the operator sees the provable defects
   * (fabricated cards, roster gaps, invalid photo refs, reporter-mode slips)
   * alongside the model's opinion. Cleared wherever contentBundle is cleared.
   */
  _articleFactCheck: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  /**
   * Director guidance captured at the arc-selection gate (Q2 decision).
   *
   * The director picks the arcs and then has no say until the outline is already
   * written, where the only lever is reject-and-regenerate. This carries their
   * emphasis into BOTH the outline and the article prompts as the final section.
   * Set by: /approve (buildResumePayload) alongside selectedArcs.
   * Consumed by: generateOutline, generateContentBundle, buildArticleRevisionPrompt.
   */
  _outlineGuidance: Annotation({
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
 * Get default state with all fields initialized (69 fields; +2 input-review gate channels, +1 director guidance, +1 article fact-check, +1 photo path, +1 photo-path rollback stash)
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
    // Input-review checkpoint (B2/B8)
    inputReviewApproved: false,
    _inputCorrections: null,
    // Fetched data
    memoryTokens: [],
    canonicalCharacters: null,  // RC2: firstName -> fullName map from Notion tokens
    paperEvidence: [],
    selectedPaperEvidence: null,  // Commit 8.9: user-selected subset
    photosPath: null,             // Photo late-join: the one owner of the photo folder
    sessionPhotos: [],
    // Incremental input (parallel branch architecture)
    roster: null,
    rosterPronouns: null,
    accusation: null,
    sessionReport: null,
    directorNotesRaw: null,
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
    characterData: null,  // Character groups, relationships, roles (pre-curation extraction)
    narrativeTensions: null,  // Programmatic contradiction surfacing (pre-arc-analysis)
    // Pre-curation checkpoint (Phase 4f)
    preCurationApproved: false,
    preCurationSummary: null,
    // Checkpoint approvals (SRP separation)
    _evidenceApproved: false,
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
    humanArcRevisionCount: 0,
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
    _previousFullContext: null,
    _previousPhotosPath: null,
    // Arc validation routing (Commit 8.xx)
    _arcValidation: null,
    // Director guidance captured at arc selection (Q2)
    _outlineGuidance: null,
    // Programmatic article fact-check (BASELINE §4)
    _articleFactCheck: null,
    // Human rejection feedback (consumed by revision nodes, cleared after use)
    _outlineFeedback: null,
    _articleFeedback: null,
    _arcFeedback: null
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
  PHOTOS: '2.36',                   // Photo late-join: gate that collects the photo folder after arc selection
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
  HUMAN_ARCS: 4,
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
/**
 * Fields intentionally NOT subject to the downstream-clear denylist (ROOT-1).
 *
 * Every Annotation channel (Object.keys(ReportStateAnnotation.spec)) must either
 * appear in at least one ROLLBACK_CLEARS list OR be listed here with a reason. The
 * completeness test (rollback-clears-completeness.test.js) enforces this so the
 * hand-maintained denylist cannot silently drift behind new node-written state.
 *
 * Categories:
 *  - Session identity / config: stable for the whole run; rollback never re-derives.
 *  - Fetched / parsed, re-derivable: nodes re-derive on replay even without an
 *    explicit clear (canonicalCharacters from fetchMemoryTokens; shellAccounts from
 *    parseRawInput's re-parse).
 *  - Incremental raw input: rawSessionInput is owned by the await-* checkpoints' own
 *    skip semantics, not the clear lists. (The full-context raw inputs accusation/
 *    sessionReport/directorNotesRaw ARE first-class channels cleared by
 *    await-full-context — P6.3 — so they are NOT exempt.)
 *  - Transient per-revision scratch: '_'-prefixed caches that nodes null out
 *    themselves at end of use (incl. _previousFullContext, the await-full-context
 *    pre-fill stash, and _previousPhotosPath, the `photos` one); no rollback owns
 *    them.
 *  - Default-only / never written by a node: dead-but-defaulted channels.
 *  - Control + counters: currentPhase + *RevisionCount handled by
 *    buildRollbackState directly / ROLLBACK_COUNTER_RESETS, not the field list.
 */
const ROLLBACK_CLEARS_EXEMPT = new Set([
  // Session identity / config (stable across the run)
  'sessionId', 'theme',
  // Incremental raw input — owned by await-* checkpoint skip logic
  'rawSessionInput',
  // Fetched / parsed, re-derived on replay (fetchMemoryTokens + parseRawInput re-runs)
  'canonicalCharacters', 'shellAccounts',
  // NOTE: the photo INPUT channels are NOT exempt (C3/C4). They are cleared as a
  // unit by the `photos` rollback point, and by nothing else: preprocessPhotos
  // gates on preprocessStats and overwrites sessionPhotos with the PROCESSED
  // paths, so any partial clear either skips the resize or re-pays Haiku. See
  // ROLLBACK_CLEARS.
  // Default-only channels never written by any node return
  'preCurationSummary',
  // Raw character-ID text — paired with characterIdMappings (which IS cleared)
  'characterIdsRaw',
  // Transient per-revision scratch — nodes null these themselves after use
  '_rescuedItems', '_excludedItemsCache', '_rescueWarnings',
  '_previousArcs', '_previousOutline', '_previousContentBundle', '_arcValidation', '_previousFullContext', '_previousPhotosPath',
  // Control flow + counters — handled by buildRollbackState / ROLLBACK_COUNTER_RESETS
  'currentPhase', 'voiceRevisionCount',
  'arcRevisionCount', 'humanArcRevisionCount', 'outlineRevisionCount', 'articleRevisionCount',
  // Accumulator — error log intentionally preserved across rollback (no clear list
  // includes it). Not a stale-input risk; unlike evaluationHistory (which IS cleared
  // as [] by the lists that include it), errors is left to accumulate.
  'errors'
]);

const ROLLBACK_CLEARS = {
  // Phase 0.2: Input review — re-open the parse-review gate and clear everything
  // DOWNSTREAM of the parse.
  //
  // B2/B8: this point used to clear the whole run (roster, rosterPronouns,
  // memoryTokens, paperEvidence, selectedPaperEvidence, sessionPhotos,
  // photoAnalyses, characterIdMappings) plus the parse outputs themselves. Both
  // halves were wrong:
  //  - The upstream clears re-paused checkpoints that run BEFORE this one in the
  //    graph's replay order (paper-evidence-selection and await-roster both
  //    precede parseRawInput), so "roll back to input-review"
  //    actually threw the operator back to the first checkpoint of the run. And
  //    clearing sessionPhotos while preprocessStats survived made preprocessPhotos
  //    skip, leaving the article pointing at un-processed photo paths.
  //  - Clearing sessionConfig/directorNotes/playerFocus was futile anyway:
  //    loadDirectorNotes rehydrates them from inputs/*.json on the replay. The
  //    checkpoint now SHOWS the restored parse, and a reject-with-corrections
  //    (which nulls them inside checkpointInputReview, immediately before
  //    parseRawInput) is what triggers a re-parse.
  'input-review': [
    // The gate's own approval flag + its transient correction channel
    'inputReviewApproved', '_inputCorrections',
    // Preprocessing and curation
    'preprocessedEvidence', 'characterData', 'narrativeTensions', 'preCurationApproved', 'evidenceBundle', '_evidenceApproved',
    // Arc analysis
    'arcEvidencePackages', 'specialistAnalyses', 'narrativeArcs', 'selectedArcs', '_arcAnalysisCache', '_arcFeedback',
    '_outlineGuidance',
    // Generation
    'heroImage', 'outline', 'outlineApproved', '_outlineFeedback',
    'contentBundle', '_articleFactCheck', 'articleApproved', '_articleFeedback', 'assembledHtml', 'validationResults', 'outputPath', 'photosCopied',
    // Evaluation history
    'evaluationHistory'
  ],

  // Phase 1.35: Paper evidence selection (8.9.4)
  'paper-evidence-selection': [
    'selectedPaperEvidence',
    // Per-point re-pause: input-review is DOWNSTREAM of this point (the graph reaches
    // parseRawInput after this checkpoint), so its approval flag must clear here too.
    'inputReviewApproved',
    // Per-point re-pause: await-roster + await-full-context are DOWNSTREAM of this point;
    // clear their captured inputs so they re-pause when rolling back here (else they skip on
    // stale roster/full-context). Mirrors the already-cleared downstream characterIdMappings.
    'roster', 'rosterPronouns', 'accusation', 'sessionReport', 'directorNotesRaw',
    // v2 I2: these two STAY. They are roster-DERIVED: the roster goes into every
    // Haiku photo prompt and into the character-ID parse, and finalizePhotoAnalyses
    // skips whenever any analysis is already enriched — so a roster change after the
    // branch has run leaves the captions keyed to the OLD names and no replay
    // re-enriches them. This point clears the roster, so it must clear what the
    // roster produced. The photo INPUTS (photosPath/sessionPhotos/preprocessStats/
    // whiteboardPhotoPath/genericPhotoAnalyses) are NOT cleared here —
    // preprocessPhotos still skips on preprocessStats, so the resize is not re-paid,
    // only the analysis.
    'photoAnalyses', 'characterIdMappings',
    'preprocessedEvidence', 'characterData', 'narrativeTensions', 'preCurationApproved', 'evidenceBundle', '_evidenceApproved',
    'arcEvidencePackages', 'specialistAnalyses', 'narrativeArcs', 'selectedArcs', '_arcAnalysisCache', '_arcFeedback',
    '_outlineGuidance',
    'heroImage', 'outline', 'outlineApproved', '_outlineFeedback',
    'contentBundle', '_articleFactCheck', 'articleApproved', '_articleFeedback', 'assembledHtml', 'validationResults', 'outputPath', 'photosCopied',
    'evaluationHistory'
  ],

  // Phase 1.51: Await roster (incremental input)
  // ROLL-1: clear roster + rosterPronouns so checkpointAwaitRoster (skip on
  // state.roster?.length > 0) re-pauses instead of silently reusing stale input.
  'await-roster': [
    'roster', 'rosterPronouns',
    // Per-point re-pause: await-full-context + input-review are downstream — clear
    // full-context so it re-pauses, and the input-review approval flag so its gate re-opens.
    'accusation', 'sessionReport', 'directorNotesRaw', 'inputReviewApproved',
    'whiteboardAnalysis',
    // v2 I2: photoAnalyses travels with characterIdMappings. This gate captures the
    // roster, and both outputs are keyed to it.
    'photoAnalyses', 'characterIdMappings',
    'preprocessedEvidence', 'characterData', 'narrativeTensions', 'preCurationApproved', 'evidenceBundle', '_evidenceApproved',
    'arcEvidencePackages', 'specialistAnalyses', 'narrativeArcs', 'selectedArcs', '_arcAnalysisCache', '_arcFeedback',
    '_outlineGuidance',
    'heroImage', 'outline', 'outlineApproved', '_outlineFeedback',
    'contentBundle', '_articleFactCheck', 'articleApproved', '_articleFeedback', 'assembledHtml', 'validationResults', 'outputPath', 'photosCopied',
    'evaluationHistory'
  ],

  // Phase 1.52: Await full context — re-collect accusation/sessionReport/directorNotes.
  // ROLL-4: the three raw inputs are first-class channels; clearing them re-pauses
  // checkpointAwaitContext, and re-collection overwrites them. The parse OUTPUTS
  // (sessionConfig/directorNotes/playerFocus) are listed here too, BUT loadDirectorNotes
  // rehydrates sessionConfig/directorNotes from inputs/*.json on the replay (files are the
  // source of truth) — so the DURABLE re-parse trigger is checkpointAwaitContext's capture
  // branch (Step 8), which re-nulls these AFTER loadDirectorNotes and immediately before
  // parseRawInput (which skips when sessionConfig is populated). (rawSessionInput is EXEMPT
  // and no longer pruned — its at-start config survives so the re-parse can read
  // photosPath/journalistFirstName/etc.) Upstream collected inputs (roster,
  // selectedPaperEvidence) are PRESERVED. The photo branch's characterIdMappings
  // and photoAnalyses are DOWNSTREAM of this point now (photo late-join) and are
  // preserved for the opposite reason: this gate does not invalidate them, and
  // re-paying Haiku for a re-collected accusation would be pure waste (C4).
  'await-full-context': [
    'accusation', 'sessionReport', 'directorNotesRaw',
    'sessionConfig', 'directorNotes', 'playerFocus',
    // Per-point re-pause: the re-collected context is re-parsed, so the input-review
    // gate must re-open to show (and let the director reject) the NEW parse.
    'inputReviewApproved',
    'preprocessedEvidence', 'characterData', 'narrativeTensions', 'preCurationApproved', 'evidenceBundle', '_evidenceApproved',
    'arcEvidencePackages', 'specialistAnalyses', 'narrativeArcs', 'selectedArcs', '_arcAnalysisCache', '_arcFeedback',
    '_outlineGuidance',
    'heroImage', 'outline', 'outlineApproved', '_outlineFeedback',
    'contentBundle', '_articleFactCheck', 'articleApproved', '_articleFeedback', 'assembledHtml', 'validationResults', 'outputPath', 'photosCopied',
    'evaluationHistory'
  ],

  // Phase 1.75: Pre-curation checkpoint (Phase 4f)
  'pre-curation': [
    'preCurationApproved', 'characterData', 'narrativeTensions',
    // Note: preprocessedEvidence preserved - expensive to regenerate
    'evidenceBundle', '_evidenceApproved',
    'arcEvidencePackages', 'specialistAnalyses', 'narrativeArcs', 'selectedArcs', '_arcAnalysisCache', '_arcFeedback',
    '_outlineGuidance',
    'heroImage', 'outline', 'outlineApproved', '_outlineFeedback',
    'contentBundle', '_articleFactCheck', 'articleApproved', '_articleFeedback', 'assembledHtml', 'validationResults', 'outputPath', 'photosCopied',
    'evaluationHistory'
  ],

  // Phase 1.8: Evidence and photos approval
  // Note: memoryTokens, paperEvidence, preprocessedEvidence included because
  // curateEvidenceBundle prunes these to null after consuming them.
  // Rollback must clear them so fetch nodes re-fetch from Notion on replay.
  'evidence-and-photos': [
    'memoryTokens', 'paperEvidence', 'preprocessedEvidence', 'characterData', 'narrativeTensions',
    'evidenceBundle', '_evidenceApproved',
    'arcEvidencePackages', 'specialistAnalyses', 'narrativeArcs', 'selectedArcs', '_arcAnalysisCache', '_arcFeedback',
    '_outlineGuidance',
    'heroImage', 'outline', 'outlineApproved', '_outlineFeedback',
    'contentBundle', '_articleFactCheck', 'articleApproved', '_articleFeedback', 'assembledHtml', 'validationResults', 'outputPath', 'photosCopied',
    'evaluationHistory'
  ],

  // Phase 2.3: Arc selection - most common rollback point
  // ROLL-2: arcEvidencePackages is built post-selection (buildArcEvidencePackages
  // skips when non-empty); re-picking arcs must clear it or the article quotes the
  // wrong storyline's evidence.
  'arc-selection': [
    'narrativeTensions',
    'arcEvidencePackages',
    'specialistAnalyses', 'narrativeArcs', 'selectedArcs', '_arcAnalysisCache', '_arcFeedback',
    // Q2: _outlineGuidance is captured AT this gate, so re-picking arcs must re-collect
    // it. Every point at-or-upstream of here clears it; the outline/article points do
    // NOT — rolling back there keeps the arcs, so it keeps the emphasis chosen for them.
    '_outlineGuidance',
    'heroImage', 'outline', 'outlineApproved', '_outlineFeedback',
    'contentBundle', '_articleFactCheck', 'articleApproved', '_articleFeedback',
    'assembledHtml', 'validationResults', 'outputPath', 'photosCopied',
    'evaluationHistory'
  ],

  // Phase 2.36: Photos — the head of the photo branch (photo late-join).
  //
  // The ONLY rollback point that clears photo state. All five input channels move
  // as a unit (C3): preprocessPhotos skips on preprocessStats and overwrote
  // sessionPhotos with the PROCESSED paths, so clearing the list alone re-fetched
  // the full-resolution originals and then skipped the resize. photosPath is the
  // gate's skip field, so clearing it is what makes this point re-ask at all (C2).
  //
  // ARC STATE IS UPSTREAM of this point and is PRESERVED — that is the whole
  // point of the move. evaluationHistory is preserved too (the arc verdict is
  // still valid and the console renders it); buildRollbackState appends ready:false
  // stubs for outline + article instead (lib/api-helpers.js PHASES_INVALIDATED_BY).
  'photos': [
    'photosPath', 'sessionPhotos', 'preprocessStats', 'whiteboardPhotoPath', 'genericPhotoAnalyses',
    'photoAnalyses', 'characterIdMappings',
    'heroImage', 'arcEvidencePackages',
    'outline', 'outlineApproved', '_outlineFeedback',
    'contentBundle', '_articleFactCheck', 'articleApproved', '_articleFeedback',
    'assembledHtml', 'validationResults', 'outputPath', 'photosCopied'
  ],

  // Phase 1.66: Character ID mappings (8.9.5) — second gate of the photo branch.
  //
  // Rewritten for the photo late-join. This gate now runs AFTER await-full-context,
  // input-review, pre-curation, evidence-and-photos and arc-selection, so the
  // accusation/sessionReport/directorNotesRaw/inputReviewApproved clears and the
  // curation + arc clears are GONE: they would throw the director back to the start
  // of the run.
  //
  // photoAnalyses is preserved here, as today. KNOWN LIMITATION, not a promise
  // (v2 M8): finalizePhotoAnalyses skips whenever any analysis already carries
  // identifiedCharacters, so the re-entered mappings do NOT reach the captions. The
  // fix is either clearing photoAnalyses here too (a Haiku re-run) or making that
  // skip compare the mappings; it is out of scope and recorded in the plan's
  // Follow-ups. Roll back to `photos` to actually redo them.
  'character-ids': [
    'characterIdMappings',
    'heroImage', 'arcEvidencePackages',
    'outline', 'outlineApproved', '_outlineFeedback',
    'contentBundle', '_articleFactCheck', 'articleApproved', '_articleFeedback',
    'assembledHtml', 'validationResults', 'outputPath', 'photosCopied'
  ],

  // Phase 3.2: Outline
  'outline': [
    'heroImage', 'outline', 'outlineApproved', '_outlineFeedback',
    'contentBundle', '_articleFactCheck', 'articleApproved', '_articleFeedback', 'assembledHtml', 'validationResults', 'outputPath', 'photosCopied'
    // Note: evaluationHistory preserved - may contain useful arc evals
  ],

  // Phase 4.2: Article
  'article': [
    'contentBundle', '_articleFactCheck', 'articleApproved', '_articleFeedback', 'assembledHtml', 'validationResults', 'outputPath', 'photosCopied'
  ]
};

/**
 * Channels a FRESH START keeps. Everything else is cleared (C1).
 *
 * `theme` and `rawSessionInput` are what the POST body carries and `sessionId` is
 * the thread; they ARE the fresh start. Nothing else may survive it.
 */
const FRESH_START_KEEPS = new Set(['theme', 'sessionId', 'rawSessionInput']);

/**
 * What a fresh start clears — its own list, NOT a rollback point (C1).
 *
 * `/start` seeded `initialState` with `buildRollbackState('input-review')`. A
 * rollback list is the wrong tool: 'input-review' deliberately preserves
 * everything UPSTREAM of the parse (the graph reaches paper-evidence-selection,
 * await-roster and await-full-context before it), and it preserves the photo
 * branch entirely, which only the `photos` point clears. Correct for a
 * rollback; wrong for a start. On a second `/start` for a session id whose thread
 * exists, roster, rosterPronouns, selectedPaperEvidence, characterIdMappings,
 * photoAnalyses, sessionPhotos, preprocessStats, accusation, sessionReport,
 * directorNotesRaw, sessionConfig, directorNotes, playerFocus, memoryTokens and
 * paperEvidence all survived — so `fetchSessionPhotos` skipped on a non-null list
 * (including `[]`), `preprocessPhotos` skipped on preprocessStats, `analyzePhotos`
 * skipped on photoAnalyses, every checkpoint before input-review skipped, and the
 * run paused once at input-review showing the OLD parse of the OLD photos. The
 * new `rawSessionInput.photosPath` was never read.
 *
 * DERIVED from the channel set rather than hand-listed, so a channel added later
 * is cleared by default. That is the fail-safe direction here: the cost of
 * clearing a channel on a fresh start is re-deriving it, while the cost of keeping
 * one is a paid run against stale input. (The rollback lists are hand-maintained
 * for the opposite reason — there, preserving upstream work is the point.)
 */
const FRESH_START_CLEARS = Object.keys(ReportStateAnnotation.spec)
  .filter(field => !FRESH_START_KEEPS.has(field));

/**
 * Revision counters to reset for each rollback point.
 * Rolling back past a phase resets its revision counter for fresh attempts.
 */
const ROLLBACK_COUNTER_RESETS = {
  'input-review': { arcRevisionCount: 0, humanArcRevisionCount: 0, outlineRevisionCount: 0, articleRevisionCount: 0 },
  'paper-evidence-selection': { arcRevisionCount: 0, humanArcRevisionCount: 0, outlineRevisionCount: 0, articleRevisionCount: 0 },
  'await-roster': { arcRevisionCount: 0, humanArcRevisionCount: 0, outlineRevisionCount: 0, articleRevisionCount: 0 },
  'await-full-context': { arcRevisionCount: 0, humanArcRevisionCount: 0, outlineRevisionCount: 0, articleRevisionCount: 0 },
  'pre-curation': { arcRevisionCount: 0, humanArcRevisionCount: 0, outlineRevisionCount: 0, articleRevisionCount: 0 },
  'evidence-and-photos': { arcRevisionCount: 0, humanArcRevisionCount: 0, outlineRevisionCount: 0, articleRevisionCount: 0 },
  'arc-selection': { arcRevisionCount: 0, humanArcRevisionCount: 0, outlineRevisionCount: 0, articleRevisionCount: 0 },
  // The photo branch joins AFTER the arc verdict, so rolling back into it does not
  // refund an arc revision budget spent upstream (M1).
  'photos': { outlineRevisionCount: 0, articleRevisionCount: 0 },
  'character-ids': { outlineRevisionCount: 0, articleRevisionCount: 0 },
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
  ROLLBACK_CLEARS_EXEMPT,
  ROLLBACK_COUNTER_RESETS,
  VALID_ROLLBACK_POINTS,
  // Fresh-start configuration (C1) — a separate list, not a rollback target
  FRESH_START_CLEARS,
  FRESH_START_KEEPS,
  // Export reducers for testing
  _testing: {
    replaceReducer,
    appendReducer,
    appendSingleReducer
  }
};

// Self-test when run directly
if (require.main === module) {
  console.log('ReportStateAnnotation Self-Test\n');

  // Test default state
  const defaultState = getDefaultState();
  console.log('Default state keys:', Object.keys(defaultState).length); // Should be 69
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
  const { replaceReducer, appendReducer, appendSingleReducer } = module.exports._testing;

  console.log('\nReducer tests:');
  console.log('replaceReducer(1, 2):', replaceReducer(1, 2)); // Should be 2
  console.log('replaceReducer(1, null):', replaceReducer(1, null)); // Should be null (allows clearing)
  console.log('appendReducer([1], [2, 3]):', appendReducer([1], [2, 3])); // Should be [1, 2, 3]
  console.log('appendReducer(null, [1]):', appendReducer(null, [1])); // Should be [1]
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
  console.log('\nRevision caps:', REVISION_CAPS); // Should be { ARCS: 2, HUMAN_ARCS: 4, OUTLINE: 3, ARTICLE: 3 }

  // Test rollback points
  console.log('\nRollback points:', VALID_ROLLBACK_POINTS.length, 'valid'); // Should be 11

  console.log('\nSelf-test complete.');
}

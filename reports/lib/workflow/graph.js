/**
 * Report Generation Graph - Sequential Architecture
 *
 * Assembles the complete LangGraph StateGraph for report generation.
 * Uses native LangGraph interrupt() for human checkpoints with DEDICATED
 * checkpoint nodes (SRP - separate data from checkpoints).
 *
 * Graph Flow (30+ nodes - Commit 8.26: SRP checkpoint separation):
 *
 * PHASE 0: Input Parsing (conditional entry)
 * START → [conditional] → parseRawInput OR initializeSession
 * 0.1 parseRawInput [interrupt: input-review] → 0.2 finalizeInput
 *
 * PHASE 1: Data Acquisition (SEQUENTIAL)
 * 1.1 initializeSession → 1.2 loadDirectorNotes
 *   → fetchMemoryTokens → fetchPaperEvidence
 *   → fetchSessionPhotos → preprocessPhotos → analyzePhotos
 *   → detectWhiteboard
 *
 * NOTE: Parallel execution deferred - LangGraph's addEdge doesn't create
 * proper fan-in behavior (each edge triggers target independently).
 * TODO: Implement proper parallelization using Send() pattern when needed.
 *
 * PHASE 1.35-1.8: Sequential Checkpoints & Processing
 * → checkpointPaperEvidence [interrupt: paper-evidence-selection]
 * → checkpointCharacterIds [interrupt: character-ids]
 * → parseCharacterIds → finalizePhotoAnalyses
 * → preprocessEvidence → checkpointPreCuration [interrupt: pre-curation]
 * → curateEvidenceBundle [interrupt: evidence-photos] → processRescuedItems
 *
 * PHASE 2: Arc Analysis (Player-Focus-Guided)
 * → analyzeArcs → validateArcs → evaluateArcs
 * → checkpointArcSelection [interrupt: arc-selection] → buildArcEvidencePackages
 * → [revision loop]
 *
 * PHASE 3: Outline Generation
 * → generateOutline → evaluateOutline
 * → checkpointOutline [interrupt: outline] → [revision loop]
 *
 * PHASE 4: Article Generation
 * → generateContentBundle → evaluateArticle
 * → checkpointArticle [interrupt: article] → [revision loop]
 * → validateContentBundle
 *
 * PHASE 5: Assembly
 * → assembleHtml → COMPLETE
 *
 * Checkpoint Pattern (SRP):
 * - Data nodes are PURE (no interrupt calls) - can be called outside LangGraph
 * - Dedicated checkpoint nodes handle interrupt() for human approval
 * - Server resumes with Command({ resume: data })
 *
 * Checkpointing Storage:
 * - MemorySaver for testing (in-memory)
 * - SqliteSaver for production (persistent)
 */

const { StateGraph, START, END, MemorySaver } = require('@langchain/langgraph');
const { ReportStateAnnotation, PHASES, REVISION_CAPS } = require('./state');
const nodes = require('./nodes');

// ═══════════════════════════════════════════════════════════════════════════
// ROUTING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

// NOTE: routeEntryPoint removed - simplified to single incremental flow
// START always goes directly to initializeSession
// parseRawInput runs after checkpointAwaitContext (not at entry)

// ═══════════════════════════════════════════════════════════════════════════
// NOTE: Approval-based routing functions removed in interrupt() migration
// (routeInputReview, routePaperEvidenceSelection, routeCharacterIdCheckpoint,
//  routePreCurationCheckpoint, routeEvidenceApproval)
// Checkpoints now use native LangGraph interrupt() in nodes themselves.
// See lib/workflow/checkpoint-helpers.js for the new pattern.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Route function for arc evaluation results
 * Returns 'checkpoint' if ready for human, 'revise' if needs work, 'error' on failure
 * @param {Object} state - Current graph state
 * @returns {string} 'checkpoint', 'revise', or 'error'
 */
function routeArcEvaluation(state) {
  // Check for errors
  if (state.currentPhase === PHASES.ERROR) {
    return 'error';
  }

  // Check if evaluation says ready or hit revision cap
  const evalHistory = state.evaluationHistory || [];
  const lastEval = evalHistory[evalHistory.length - 1];
  const atCap = (state.arcRevisionCount || 0) >= REVISION_CAPS.ARCS;

  if (lastEval?.ready || atCap) {
    return 'checkpoint';
  }

  return 'revise';
}

/**
 * Route function for outline evaluation results
 * @param {Object} state - Current graph state
 * @returns {string} 'checkpoint', 'revise', or 'error'
 */
function routeOutlineEvaluation(state) {
  if (state.currentPhase === PHASES.ERROR) {
    return 'error';
  }

  const evalHistory = state.evaluationHistory || [];
  const lastEval = evalHistory[evalHistory.length - 1];
  const atCap = (state.outlineRevisionCount || 0) >= REVISION_CAPS.OUTLINE;

  if (lastEval?.ready || atCap) {
    return 'checkpoint';
  }

  return 'revise';
}

/**
 * Route function for article evaluation results
 * @param {Object} state - Current graph state
 * @returns {string} 'checkpoint', 'revise', or 'error'
 */
function routeArticleEvaluation(state) {
  if (state.currentPhase === PHASES.ERROR) {
    return 'error';
  }

  const evalHistory = state.evaluationHistory || [];
  const lastEval = evalHistory[evalHistory.length - 1];
  const atCap = (state.articleRevisionCount || 0) >= REVISION_CAPS.ARTICLE;

  if (lastEval?.ready || atCap) {
    return 'checkpoint';
  }

  return 'revise';
}

/**
 * Route function after outline human checkpoint
 * Approve → forward to content generation
 * Reject → revision loop (outlineApproved stays false)
 * @param {Object} state - Current graph state
 * @returns {string} 'forward' or 'revise'
 */
function routeAfterOutlineCheckpoint(state) {
  if (state.outlineApproved) return 'forward';
  return 'revise';
}

/**
 * Route function after article human checkpoint
 * Approve → forward to validation
 * Reject → revision loop (articleApproved stays false)
 * @param {Object} state - Current graph state
 * @returns {string} 'forward' or 'revise'
 */
function routeAfterArticleCheckpoint(state) {
  if (state.articleApproved) return 'forward';
  return 'revise';
}

/**
 * Route function after arc selection human checkpoint
 * Approve (selectedArcs populated) → forward to evidence packaging
 * Reject (no selectedArcs) → revision loop for arc regeneration
 * @param {Object} state - Current graph state
 * @returns {string} 'forward' or 'revise'
 */
function routeAfterArcCheckpoint(state) {
  if (state.selectedArcs?.length > 0) return 'forward';
  return 'revise';
}

// NOTE: routeOutlineValidation and routeArticleValidation removed in Commit 8.23
// Programmatic validation was too brittle (checked form, not substance)
// Trust Opus evaluators for quality judgment instead

/**
 * Route function for schema validation
 * @param {Object} state - Current graph state
 * @returns {string} 'error' or 'continue'
 */
function routeSchemaValidation(state) {
  const hasErrors = state.errors && state.errors.some(e => e.type === 'schema-validation');
  return hasErrors ? 'error' : 'continue';
}

/**
 * Route function for arc validation results (Commit 8.27)
 * Routes based on programmatic structural checks BEFORE expensive evaluation.
 * Returns 'evaluate' if structural checks pass, 'revise' if they fail.
 *
 * @param {Object} state - Current graph state with _arcValidation
 * @returns {string} 'evaluate' or 'revise'
 */
function routeArcValidation(state) {
  const validation = state._arcValidation;

  // Default to evaluate if no validation data
  if (!validation) {
    console.log('[routeArcValidation] No validation data, proceeding to evaluation');
    return 'evaluate';
  }

  if (validation.structuralPassed === false) {
    // Check revision cap before routing to revise
    const atCap = (state.arcRevisionCount || 0) >= REVISION_CAPS.ARCS;
    if (atCap) {
      console.log('[routeArcValidation] Structural issues but at revision cap, proceeding to evaluation');
      return 'evaluate';  // Let evaluator handle escalation
    }
    console.log(`[routeArcValidation] Structural issues detected (${validation.missingRoster?.length || 0} missing roster), routing to revision`);
    return 'revise';
  }

  console.log('[routeArcValidation] Structural checks passed, proceeding to evaluation');
  return 'evaluate';
}

// NOTE: routeArcSelectionApproval, routeOutlineApproval, routeArticleApproval
// removed in interrupt() migration. See checkpoint-helpers.js.

// ═══════════════════════════════════════════════════════════════════════════
// NOTE: Checkpoint-setting nodes removed in interrupt() migration
// (setPaperEvidenceCheckpoint, setCharacterIdCheckpoint, setPreCurationCheckpoint,
//  setArcSelectionCheckpoint, setOutlineCheckpoint, setArticleCheckpoint)
//
// Checkpoints now use native LangGraph interrupt() directly in content nodes.
// Skip logic moved into checkpointInterrupt() helper in checkpoint-helpers.js.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Increment arc revision count and preserve/clear arcs for re-analysis
 * Preserves current arcs in _previousArcs for revision context
 * Clears narrativeArcs so analyzeArcs skip logic doesn't trigger
 */
async function incrementArcRevision(state) {
  const newCount = (state.arcRevisionCount || 0) + 1;
  console.log(`[incrementArcRevision] Incrementing count to ${newCount}, preserving arcs for revision context`);
  return {
    arcRevisionCount: newCount,
    _previousArcs: state.narrativeArcs, // PRESERVE for revision context
    narrativeArcs: null // Clear for regeneration (replaceReducer now handles null)
  };
}

/**
 * Increment outline revision count and preserve/clear outline for regeneration
 * Preserves current outline in _previousOutline for revision context
 * Clears outline so generateOutline skip logic doesn't trigger
 */
async function incrementOutlineRevision(state) {
  const newCount = (state.outlineRevisionCount || 0) + 1;
  console.log(`[incrementOutlineRevision] Incrementing count to ${newCount}, preserving outline for revision context`);
  return {
    outlineRevisionCount: newCount,
    _previousOutline: state.outline, // PRESERVE for revision context
    outline: null // Clear for regeneration
  };
}

/**
 * Increment article revision count and preserve/clear content for regeneration
 * Preserves current contentBundle in _previousContentBundle for revision context
 * Clears contentBundle and assembledHtml so generateContentBundle skip logic doesn't trigger
 */
async function incrementArticleRevision(state) {
  const newCount = (state.articleRevisionCount || 0) + 1;
  console.log(`[incrementArticleRevision] Incrementing count to ${newCount}, preserving content for revision context`);
  return {
    articleRevisionCount: newCount,
    _previousContentBundle: state.contentBundle, // PRESERVE for revision context
    contentBundle: null, // Clear for regeneration
    assembledHtml: null  // Clear assembled output too
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GRAPH BUILDER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create the report generation StateGraph
 *
 * @returns {Object} Uncompiled StateGraph builder
 */
function createGraphBuilder() {
  const builder = new StateGraph(ReportStateAnnotation);

  // ═══════════════════════════════════════════════════════
  // ADD NODES - Phase 0: Input Parsing (Commit 8.9)
  // ═══════════════════════════════════════════════════════

  builder.addNode('parseRawInput', nodes.parseRawInput);
  builder.addNode('finalizeInput', nodes.finalizeInput);

  // ═══════════════════════════════════════════════════════
  // ADD NODES - Phase 1: Data Acquisition (Parallel Branches)
  // ═══════════════════════════════════════════════════════

  builder.addNode('initializeSession', nodes.initializeSession);
  builder.addNode('loadDirectorNotes', nodes.loadDirectorNotes);

  // Branch A: Evidence fetching
  builder.addNode('fetchMemoryTokens', nodes.fetchMemoryTokens);
  builder.addNode('fetchPaperEvidence', nodes.fetchPaperEvidence);

  // Branch B: Photo processing
  builder.addNode('fetchSessionPhotos', nodes.fetchSessionPhotos);
  builder.addNode('preprocessPhotos', nodes.preprocessPhotos);

  // Branch C: Whiteboard detection
  builder.addNode('detectWhiteboard', nodes.detectWhiteboard);

  // NOTE: joinParallelBranches removed - sequential execution doesn't need it
  // TODO: Re-add when implementing Send() pattern for true parallelization

  // ═══════════════════════════════════════════════════════
  // ADD NODES - Phase 1.35-1.8: Sequential Checkpoints & Processing
  // Dedicated checkpoint nodes follow SRP (data separate from checkpoints)
  // ═══════════════════════════════════════════════════════

  // Checkpoint: Paper evidence selection (after parallel join)
  builder.addNode('checkpointPaperEvidence', nodes.checkpointPaperEvidence);

  // Checkpoint: Await roster (incremental input - Phase 4f)
  // Pauses for user to provide roster via /approve endpoint
  builder.addNode('checkpointAwaitRoster', nodes.checkpointAwaitRoster);

  // Photo analysis (pure - no checkpoint, runs in parallel branch)
  builder.addNode('analyzePhotos', nodes.analyzePhotos);

  // Checkpoint: Character IDs (after parallel join)
  builder.addNode('checkpointCharacterIds', nodes.checkpointCharacterIds);
  builder.addNode('parseCharacterIds', nodes.parseCharacterIds);
  builder.addNode('finalizePhotoAnalyses', nodes.finalizePhotoAnalyses);

  // Checkpoint: Await full context (incremental input - Phase 4f)
  // Pauses for user to provide accusation, sessionReport, directorNotes via /approve
  builder.addNode('checkpointAwaitContext', nodes.checkpointAwaitContext);

  // Tag tokens with exposed/buried disposition (after parseRawInput provides orchestratorParsed)
  builder.addNode('tagTokenDispositions', nodes.tagTokenDispositions);

  // Evidence preprocessing (pure - no checkpoint)
  builder.addNode('preprocessEvidence', nodes.preprocessEvidence);

  // Checkpoint: Pre-curation approval
  builder.addNode('checkpointPreCuration', nodes.checkpointPreCuration);

  // Evidence curation (has interrupt for evidence-photos checkpoint)
  builder.addNode('curateEvidenceBundle', nodes.curateEvidenceBundle);
  builder.addNode('processRescuedItems', nodes.processRescuedItems);

  // ═══════════════════════════════════════════════════════
  // ADD NODES - Phase 2: Arc Analysis (Player-Focus-Guided - Commit 8.15)
  // ═══════════════════════════════════════════════════════

  // Arc analysis with player-focus-guided single-call architecture (Commit 8.15)
  // Player conclusions (accusation/whiteboard) drive arc generation
  // Single SDK call replaces 4-call parallel specialist pattern
  builder.addNode('analyzeArcs', nodes.analyzeArcsPlayerFocusGuided);

  // Arc structure validation - programmatic, no LLM (Commit 8.12)
  // Validates keyEvidence IDs exist in bundle, characterPlacements use roster names
  builder.addNode('validateArcs', nodes.validateArcStructure);

  // Arc evaluation (no interrupt - SRP: checkpoint separate)
  builder.addNode('evaluateArcs', nodes.evaluateArcs);

  // Arc selection checkpoint - interrupt() here (Commit 8.26: SRP separation)
  builder.addNode('checkpointArcSelection', nodes.checkpointArcSelection);

  // Arc revision handling
  // NOTE: setArcSelectionCheckpoint removed - interrupt() now in evaluateArcs
  builder.addNode('incrementArcRevision', incrementArcRevision);
  // Revision node - uses buildRevisionContext helper for targeted fixes
  builder.addNode('reviseArcs', nodes.reviseArcs);

  // ═══════════════════════════════════════════════════════
  // ADD NODES - Phase 2.4: Arc Evidence Packages (Phase 1 Fix)
  // ═══════════════════════════════════════════════════════

  // Runs after arc selection, before outline generation
  // Extracts full quotable content and enriched photos per arc
  builder.addNode('buildArcEvidencePackages', nodes.buildArcEvidencePackages);

  // ═══════════════════════════════════════════════════════
  // ADD NODES - Phase 3: Outline Generation
  // ═══════════════════════════════════════════════════════

  builder.addNode('generateOutline', nodes.generateOutline);
  // NOTE: validateOutlineStructure removed in Commit 8.23 - trust Opus evaluators instead
  // Outline evaluation (no interrupt - SRP: checkpoint separate)
  builder.addNode('evaluateOutline', nodes.evaluateOutline);

  // Outline checkpoint - interrupt() here (Commit 8.26: SRP separation)
  builder.addNode('checkpointOutline', nodes.checkpointOutline);
  // NOTE: setOutlineCheckpoint removed - interrupt() now in evaluateOutline
  builder.addNode('incrementOutlineRevision', incrementOutlineRevision);
  // Revision node - uses buildRevisionContext helper for targeted fixes
  builder.addNode('reviseOutline', nodes.reviseOutline);

  // ═══════════════════════════════════════════════════════
  // ADD NODES - Phase 4: Article Generation
  // ═══════════════════════════════════════════════════════

  builder.addNode('generateContentBundle', nodes.generateContentBundle);
  // NOTE: validateArticleContent removed in Commit 8.23 - trust Opus evaluators instead
  // Article evaluation (no interrupt - SRP: checkpoint separate)
  builder.addNode('evaluateArticle', nodes.evaluateArticle);

  // Article checkpoint - interrupt() here (Commit 8.26: SRP separation)
  builder.addNode('checkpointArticle', nodes.checkpointArticle);
  // NOTE: setArticleCheckpoint removed - interrupt() now in evaluateArticle
  builder.addNode('incrementArticleRevision', incrementArticleRevision);
  // Revision node - uses buildRevisionContext helper for targeted fixes
  builder.addNode('reviseContentBundle', nodes.reviseContentBundle);
  builder.addNode('validateContentBundle', nodes.validateContentBundle);

  // ═══════════════════════════════════════════════════════
  // ADD NODES - Phase 5: Assembly
  // ═══════════════════════════════════════════════════════

  builder.addNode('assembleHtml', nodes.assembleHtml);

  // ═══════════════════════════════════════════════════════
  // ADD EDGES - Entry Point (Simplified Incremental Flow)
  // Always start with initialization - parseRawInput comes after checkpointAwaitContext
  // ═══════════════════════════════════════════════════════

  builder.addEdge(START, 'initializeSession');

  // ═══════════════════════════════════════════════════════
  // ADD EDGES - Phase 1: Data Acquisition (SEQUENTIAL)
  // NOTE: Parallel branches deferred - LangGraph's addEdge doesn't create
  // proper fan-in behavior. Each edge triggers independently.
  // TODO: Implement proper parallelization using Send() pattern
  // ═══════════════════════════════════════════════════════

  builder.addEdge('initializeSession', 'loadDirectorNotes');

  // Sequential data fetching (previously parallel branches A, B, C)
  // Branch A: Evidence fetching
  builder.addEdge('loadDirectorNotes', 'fetchMemoryTokens');
  builder.addEdge('fetchMemoryTokens', 'fetchPaperEvidence');

  // Branch B: Photo processing
  builder.addEdge('fetchPaperEvidence', 'fetchSessionPhotos');
  builder.addEdge('fetchSessionPhotos', 'preprocessPhotos');
  builder.addEdge('preprocessPhotos', 'analyzePhotos');

  // Branch C: Whiteboard detection
  builder.addEdge('analyzePhotos', 'detectWhiteboard');

  // ═══════════════════════════════════════════════════════
  // ADD EDGES - Phase 1.35-1.8: Sequential Checkpoints & Processing
  // Incremental input flow: parseRawInput after checkpointAwaitContext
  // preprocessEvidence runs AFTER tagTokenDispositions so tokens have correct disposition
  // ═══════════════════════════════════════════════════════

  // After data acquisition, proceed to paper evidence checkpoint
  builder.addEdge('detectWhiteboard', 'checkpointPaperEvidence');

  // Paper evidence selection → await roster (skip preprocessEvidence - runs later after tokens tagged)
  builder.addEdge('checkpointPaperEvidence', 'checkpointAwaitRoster');

  // After roster provided → character ID mapping
  builder.addEdge('checkpointAwaitRoster', 'checkpointCharacterIds');

  // Character IDs → parsing → finalize analyses
  builder.addEdge('checkpointCharacterIds', 'parseCharacterIds');
  builder.addEdge('parseCharacterIds', 'finalizePhotoAnalyses');

  // Photo finalization → await full context (incremental input)
  builder.addEdge('finalizePhotoAnalyses', 'checkpointAwaitContext');

  // After full context provided → parse raw input (produces playerFocus, sessionConfig)
  builder.addEdge('checkpointAwaitContext', 'parseRawInput');

  // Parse raw input → finalize (input-review checkpoint inside parseRawInput)
  builder.addEdge('parseRawInput', 'finalizeInput');

  // Finalize input → tag token dispositions (re-tag with orchestratorParsed)
  builder.addEdge('finalizeInput', 'tagTokenDispositions');

  // Tag tokens → preprocess evidence (NOW tokens have correct disposition)
  builder.addEdge('tagTokenDispositions', 'preprocessEvidence');

  // Preprocess evidence → pre-curation checkpoint
  builder.addEdge('preprocessEvidence', 'checkpointPreCuration');

  // Pre-curation → evidence curation (has interrupt for evidence-photos)
  builder.addEdge('checkpointPreCuration', 'curateEvidenceBundle');

  // Curation → rescued items → arc analysis
  builder.addEdge('curateEvidenceBundle', 'processRescuedItems');
  builder.addEdge('processRescuedItems', 'analyzeArcs');

  // ═══════════════════════════════════════════════════════
  // ADD EDGES - Phase 2: Arc Analysis (Player-Focus-Guided - Commit 8.15)
  // ═══════════════════════════════════════════════════════

  // Arc analysis → validation → [conditional routing]
  builder.addEdge('analyzeArcs', 'validateArcs');

  // Arc validation routing (Commit 8.27: short-circuit expensive evaluator for structural issues)
  // evaluate: structural checks passed, proceed to Opus evaluation for quality judgment
  // revise: structural issues detected (missing roster, no accusation arc), immediate revision
  builder.addConditionalEdges('validateArcs', routeArcValidation, {
    evaluate: 'evaluateArcs',
    revise: 'incrementArcRevision'  // Skip expensive evaluation, go directly to revision
  });

  // Arc evaluation routing (Commit 8.26: SRP - checkpoint separate from evaluation)
  // checkpoint: evaluation ready, proceed to checkpoint node for human approval
  // revise: needs work, loop back for revision
  // error: fatal error, end workflow
  builder.addConditionalEdges('evaluateArcs', routeArcEvaluation, {
    checkpoint: 'checkpointArcSelection',  // Route to checkpoint node, not directly to next phase
    revise: 'incrementArcRevision',
    error: END
  });

  // Checkpoint → conditional: approve forwards, reject enters revision loop
  builder.addConditionalEdges('checkpointArcSelection', routeAfterArcCheckpoint, {
    forward: 'buildArcEvidencePackages',
    revise: 'incrementArcRevision'
  });

  // Revision loop: increment → revise → validate (NOT back to analyzeArcs)
  // reviseArcs receives previous output + feedback for TARGETED fixes
  builder.addEdge('incrementArcRevision', 'reviseArcs');
  builder.addEdge('reviseArcs', 'validateArcs');

  // Arc evidence packages → outline generation
  builder.addEdge('buildArcEvidencePackages', 'generateOutline');

  // ═══════════════════════════════════════════════════════
  // ADD EDGES - Phase 3: Outline Generation
  // Commit 8.23: Removed programmatic validation, trust Opus evaluators
  // ═══════════════════════════════════════════════════════

  builder.addEdge('generateOutline', 'evaluateOutline');

  // Outline evaluation routing (Commit 8.26: SRP - checkpoint separate from evaluation)
  // checkpoint: evaluation ready, proceed to checkpoint node for human approval
  // revise: needs work, loop back for revision
  // error: fatal error, end workflow
  builder.addConditionalEdges('evaluateOutline', routeOutlineEvaluation, {
    checkpoint: 'checkpointOutline',  // Route to checkpoint node, not directly to next phase
    revise: 'incrementOutlineRevision',
    error: END
  });

  // Checkpoint → conditional: approve forwards, reject enters revision loop
  builder.addConditionalEdges('checkpointOutline', routeAfterOutlineCheckpoint, {
    forward: 'generateContentBundle',
    revise: 'incrementOutlineRevision'
  });

  // Revision loop: increment → revise → evaluate (NOT back to generateOutline)
  // reviseOutline receives previous output + feedback for TARGETED fixes
  builder.addEdge('incrementOutlineRevision', 'reviseOutline');
  builder.addEdge('reviseOutline', 'evaluateOutline');

  // ═══════════════════════════════════════════════════════
  // ADD EDGES - Phase 4: Article Generation
  // Commit 8.23: Removed programmatic validation, trust Opus evaluators
  // ═══════════════════════════════════════════════════════

  builder.addEdge('generateContentBundle', 'evaluateArticle');

  // Article evaluation routing (Commit 8.26: SRP - checkpoint separate from evaluation)
  // checkpoint: evaluation ready, proceed to checkpoint node for human approval
  // revise: needs work, loop back for revision
  // error: fatal error, end workflow
  builder.addConditionalEdges('evaluateArticle', routeArticleEvaluation, {
    checkpoint: 'checkpointArticle',  // Route to checkpoint node, not directly to next phase
    revise: 'incrementArticleRevision',
    error: END
  });

  // Checkpoint → conditional: approve forwards, reject enters revision loop
  builder.addConditionalEdges('checkpointArticle', routeAfterArticleCheckpoint, {
    forward: 'validateContentBundle',
    revise: 'incrementArticleRevision'
  });

  // Revision loop: increment → revise → evaluate (NOT back to generateContentBundle)
  // reviseContentBundle receives previous output + feedback for TARGETED fixes
  builder.addEdge('incrementArticleRevision', 'reviseContentBundle');
  builder.addEdge('reviseContentBundle', 'evaluateArticle');

  // Schema validation routing
  builder.addConditionalEdges('validateContentBundle', routeSchemaValidation, {
    error: END,
    continue: 'assembleHtml'
  });

  // ═══════════════════════════════════════════════════════
  // ADD EDGES - Phase 5: Assembly
  // ═══════════════════════════════════════════════════════

  builder.addEdge('assembleHtml', END);

  return builder;
}

// ═══════════════════════════════════════════════════════════════════════════
// GRAPH FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Recursion limit for graph execution.
 * Graph has 27+ nodes and revision loops can exceed LangGraph's default of 25 steps.
 * IMPORTANT: Must be passed to invoke(), NOT compile() - LangGraph JS ignores compile options.
 */
const RECURSION_LIMIT = 75;

/**
 * Create compiled report graph with MemorySaver checkpointing
 * Use for testing or ephemeral sessions
 *
 * @returns {Object} Compiled StateGraph
 */
function createReportGraph() {
  const builder = createGraphBuilder();
  const checkpointer = new MemorySaver();
  return builder.compile({ checkpointer });
}

/**
 * Create compiled report graph with custom checkpointer
 * Use for production with SqliteSaver or other persistent storage
 *
 * @param {Object} checkpointer - Checkpointer instance (MemorySaver, SqliteSaver, etc.)
 * @returns {Object} Compiled StateGraph
 */
function createReportGraphWithCheckpointer(checkpointer) {
  const builder = createGraphBuilder();
  return builder.compile({ checkpointer });
}

/**
 * Create compiled report graph without checkpointing
 * Use for simple one-shot execution (no pause/resume)
 *
 * @returns {Object} Compiled StateGraph
 */
function createReportGraphNoCheckpoint() {
  const builder = createGraphBuilder();
  return builder.compile();
}

module.exports = {
  // Main factory functions
  createReportGraph,
  createReportGraphWithCheckpointer,
  createReportGraphNoCheckpoint,

  // Config constants - must be passed to invoke(), not compile()
  RECURSION_LIMIT,

  // For testing
  _testing: {
    createGraphBuilder,
    // Routing functions - evaluation-based (evaluation/schema logic)
    routeArcEvaluation,
    routeOutlineEvaluation,
    routeArticleEvaluation,
    routeSchemaValidation,
    // Routing functions - checkpoint-based (human approval routing)
    routeAfterOutlineCheckpoint,
    routeAfterArticleCheckpoint,
    // Revision handlers (kept)
    incrementArcRevision,
    incrementOutlineRevision,
    incrementArticleRevision
    // NOTE: routeEntryPoint removed - simplified to direct START → initializeSession
    // NOTE: Approval-based routing and checkpoint nodes removed in interrupt() migration
    // See checkpoint-helpers.js for new pattern
  }
};

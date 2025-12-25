/**
 * Report Generation Graph - Commit 8.8: SDK Subagent Orchestration
 *
 * Assembles the complete LangGraph StateGraph for report generation.
 * Connects all nodes with edges, conditional routing, and checkpointing.
 *
 * Graph Flow (18 nodes - Commit 8.8):
 *
 * PHASE 1: Data Acquisition
 * 1.1 initializeSession → 1.2 loadDirectorNotes → 1.3 fetchMemoryTokens
 * → 1.4 fetchPaperEvidence → 1.5 fetchSessionPhotos
 *
 * PHASE 1.6-1.8: Early Processing
 * → 1.65 analyzePhotos (Haiku vision) → 1.7 preprocessEvidence
 * → 1.8 curateEvidenceBundle → [checkpoint: evidence-and-photos]
 *
 * PHASE 2: Arc Analysis (Orchestrated Subagents - Commit 8.8)
 * → 2 analyzeArcs (orchestrator with 3 subagents) → 2.3 evaluateArcs → [revision loop]
 * → [checkpoint: arc-selection]
 *
 * PHASE 3: Outline Generation
 * → 3.1 generateOutline → 3.2 evaluateOutline → [revision loop]
 * → [checkpoint: outline]
 *
 * PHASE 4: Article Generation
 * → 4.1 generateContentBundle → 4.2 evaluateArticle → [revision loop]
 * → [checkpoint: article] → 4.3 validateContentBundle
 *
 * PHASE 5: Assembly
 * → 5 assembleHtml → COMPLETE
 *
 * Checkpointing:
 * - MemorySaver for testing (in-memory)
 * - SqliteSaver for production (persistent)
 *
 * See ARCHITECTURE_DECISIONS.md 8.8 for design rationale.
 */

const { StateGraph, START, END, MemorySaver } = require('@langchain/langgraph');
const { ReportStateAnnotation, PHASES, APPROVAL_TYPES, REVISION_CAPS } = require('./state');
const nodes = require('./nodes');

// ═══════════════════════════════════════════════════════════════════════════
// ROUTING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Route function for evidence+photos approval checkpoint
 * @param {Object} state - Current graph state
 * @returns {string} 'wait' or 'continue'
 */
function routeEvidenceApproval(state) {
  return state.awaitingApproval ? 'wait' : 'continue';
}

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
 * Route function for schema validation
 * @param {Object} state - Current graph state
 * @returns {string} 'error' or 'continue'
 */
function routeSchemaValidation(state) {
  const hasErrors = state.errors && state.errors.some(e => e.type === 'schema-validation');
  return hasErrors ? 'error' : 'continue';
}

/**
 * Route after arc selection approval
 * Continues to outline generation
 * @param {Object} state - Current graph state
 * @returns {string} 'wait' or 'continue'
 */
function routeArcSelectionApproval(state) {
  return state.awaitingApproval ? 'wait' : 'continue';
}

/**
 * Route after outline approval
 * Continues to article generation
 * @param {Object} state - Current graph state
 * @returns {string} 'wait' or 'continue'
 */
function routeOutlineApproval(state) {
  return state.awaitingApproval ? 'wait' : 'continue';
}

/**
 * Route after article approval
 * Continues to schema validation and assembly
 * @param {Object} state - Current graph state
 * @returns {string} 'wait' or 'continue'
 */
function routeArticleApproval(state) {
  return state.awaitingApproval ? 'wait' : 'continue';
}

// ═══════════════════════════════════════════════════════════════════════════
// WRAPPER NODES FOR APPROVAL CHECKPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Set arc selection approval checkpoint
 * Called after arc evaluation passes or hits revision cap
 * Skips if selectedArcs already exist (resume case)
 */
async function setArcSelectionCheckpoint(state) {
  // Skip if arcs already selected (resume after approval)
  if (state.selectedArcs && state.selectedArcs.length > 0) {
    return {
      awaitingApproval: false,
      currentPhase: PHASES.ARC_EVALUATION
    };
  }

  return {
    awaitingApproval: true,
    approvalType: APPROVAL_TYPES.ARC_SELECTION,
    currentPhase: PHASES.ARC_EVALUATION
  };
}

/**
 * Set outline approval checkpoint
 * Called after outline evaluation passes or hits revision cap
 *
 * Detection logic:
 * 1. If contentBundle exists → already past approval, continue
 * 2. If user approved THIS checkpoint (awaitingApproval=false AND approvalType=OUTLINE) → continue
 * 3. Otherwise → wait for approval (set approvalType to mark this checkpoint)
 *
 * Key insight: approvalType identifies WHICH checkpoint is active.
 * After arc approval, approvalType is still ARC_SELECTION, not OUTLINE.
 * Only when user approves the outline checkpoint does awaitingApproval=false WITH approvalType=OUTLINE.
 */
async function setOutlineCheckpoint(state) {
  // Skip if content already generated (resume after approval completed)
  if (state.contentBundle) {
    console.log('[setOutlineCheckpoint] Skipping - contentBundle already exists');
    return {
      awaitingApproval: false,
      currentPhase: PHASES.OUTLINE_EVALUATION
    };
  }

  // Check if user approved THIS checkpoint
  // - awaitingApproval=false means user sent approval
  // - approvalType=OUTLINE means this specific checkpoint was waiting
  // - outlineEval.ready means outline passed evaluation
  const evalHistory = state.evaluationHistory || [];
  const outlineEval = evalHistory.find(e => e.phase === 'outline' && e.ready === true);
  if (state.awaitingApproval === false &&
      state.approvalType === APPROVAL_TYPES.OUTLINE &&
      outlineEval &&
      state.outline) {
    console.log('[setOutlineCheckpoint] User approved outline, continuing to article generation');
    return {
      awaitingApproval: false,
      currentPhase: PHASES.OUTLINE_EVALUATION
    };
  }

  // First time at checkpoint - wait for approval
  console.log('[setOutlineCheckpoint] Waiting for user approval');
  return {
    awaitingApproval: true,
    approvalType: APPROVAL_TYPES.OUTLINE,
    currentPhase: PHASES.OUTLINE_EVALUATION
  };
}

/**
 * Set article approval checkpoint
 * Called after article evaluation passes or hits revision cap
 *
 * Detection logic:
 * 1. If assembledHtml exists → already past approval, continue
 * 2. If user approved THIS checkpoint (awaitingApproval=false AND approvalType=ARTICLE) → continue
 * 3. Otherwise → wait for approval (set approvalType to mark this checkpoint)
 */
async function setArticleCheckpoint(state) {
  // Skip if HTML already assembled (resume after approval completed)
  if (state.assembledHtml) {
    console.log('[setArticleCheckpoint] Skipping - assembledHtml already exists');
    return {
      awaitingApproval: false,
      currentPhase: PHASES.ARTICLE_EVALUATION
    };
  }

  // Check if user approved THIS checkpoint
  // - awaitingApproval=false means user sent approval
  // - approvalType=ARTICLE means this specific checkpoint was waiting
  // - articleEval.ready means article passed evaluation
  const evalHistory = state.evaluationHistory || [];
  const articleEval = evalHistory.find(e => e.phase === 'article' && e.ready === true);
  if (state.awaitingApproval === false &&
      state.approvalType === APPROVAL_TYPES.ARTICLE &&
      articleEval &&
      state.contentBundle) {
    console.log('[setArticleCheckpoint] User approved article, continuing to schema validation');
    return {
      awaitingApproval: false,
      currentPhase: PHASES.ARTICLE_EVALUATION
    };
  }

  // First time at checkpoint - wait for approval
  console.log('[setArticleCheckpoint] Waiting for user approval');
  return {
    awaitingApproval: true,
    approvalType: APPROVAL_TYPES.ARTICLE,
    currentPhase: PHASES.ARTICLE_EVALUATION
  };
}

/**
 * Increment arc revision count and clear arcs for re-analysis
 * Clears narrativeArcs so analyzeArcs skip logic doesn't trigger
 */
async function incrementArcRevision(state) {
  console.log(`[incrementArcRevision] Incrementing count to ${(state.arcRevisionCount || 0) + 1}, clearing arcs for regeneration`);
  return {
    arcRevisionCount: (state.arcRevisionCount || 0) + 1,
    narrativeArcs: null, // Clear for regeneration (replaceReducer now handles null)
    awaitingApproval: false
  };
}

/**
 * Increment outline revision count and clear outline for regeneration
 * Clears outline so generateOutline skip logic doesn't trigger
 */
async function incrementOutlineRevision(state) {
  console.log(`[incrementOutlineRevision] Incrementing count to ${(state.outlineRevisionCount || 0) + 1}, clearing outline for regeneration`);
  return {
    outlineRevisionCount: (state.outlineRevisionCount || 0) + 1,
    outline: null, // Clear for regeneration
    awaitingApproval: false
  };
}

/**
 * Increment article revision count and clear content for regeneration
 * Clears contentBundle and assembledHtml so generateContentBundle skip logic doesn't trigger
 */
async function incrementArticleRevision(state) {
  console.log(`[incrementArticleRevision] Incrementing count to ${(state.articleRevisionCount || 0) + 1}, clearing content for regeneration`);
  return {
    articleRevisionCount: (state.articleRevisionCount || 0) + 1,
    contentBundle: null, // Clear for regeneration
    assembledHtml: null, // Clear assembled output too
    awaitingApproval: false
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
  // ADD NODES - Phase 1: Data Acquisition
  // ═══════════════════════════════════════════════════════

  builder.addNode('initializeSession', nodes.initializeSession);
  builder.addNode('loadDirectorNotes', nodes.loadDirectorNotes);
  builder.addNode('fetchMemoryTokens', nodes.fetchMemoryTokens);
  builder.addNode('fetchPaperEvidence', nodes.fetchPaperEvidence);
  builder.addNode('fetchSessionPhotos', nodes.fetchSessionPhotos);

  // ═══════════════════════════════════════════════════════
  // ADD NODES - Phase 1.6-1.8: Early Processing
  // ═══════════════════════════════════════════════════════

  builder.addNode('analyzePhotos', nodes.analyzePhotos);
  builder.addNode('preprocessEvidence', nodes.preprocessEvidence);
  builder.addNode('curateEvidenceBundle', nodes.curateEvidenceBundle);

  // ═══════════════════════════════════════════════════════
  // ADD NODES - Phase 2: Arc Analysis (Orchestrated Subagents - Commit 8.8)
  // ═══════════════════════════════════════════════════════

  // Single orchestrator node replaces 4 sequential nodes (Commit 8.8)
  // Orchestrator coordinates 3 specialist subagents and synthesizes results
  builder.addNode('analyzeArcs', nodes.analyzeArcsWithSubagents);

  // Arc evaluation
  builder.addNode('evaluateArcs', nodes.evaluateArcs);

  // Arc revision handling
  builder.addNode('setArcSelectionCheckpoint', setArcSelectionCheckpoint);
  builder.addNode('incrementArcRevision', incrementArcRevision);

  // ═══════════════════════════════════════════════════════
  // ADD NODES - Phase 3: Outline Generation
  // ═══════════════════════════════════════════════════════

  builder.addNode('generateOutline', nodes.generateOutline);
  builder.addNode('evaluateOutline', nodes.evaluateOutline);
  builder.addNode('setOutlineCheckpoint', setOutlineCheckpoint);
  builder.addNode('incrementOutlineRevision', incrementOutlineRevision);

  // ═══════════════════════════════════════════════════════
  // ADD NODES - Phase 4: Article Generation
  // ═══════════════════════════════════════════════════════

  builder.addNode('generateContentBundle', nodes.generateContentBundle);
  builder.addNode('evaluateArticle', nodes.evaluateArticle);
  builder.addNode('setArticleCheckpoint', setArticleCheckpoint);
  builder.addNode('incrementArticleRevision', incrementArticleRevision);
  builder.addNode('validateContentBundle', nodes.validateContentBundle);

  // ═══════════════════════════════════════════════════════
  // ADD NODES - Phase 5: Assembly
  // ═══════════════════════════════════════════════════════

  builder.addNode('assembleHtml', nodes.assembleHtml);

  // ═══════════════════════════════════════════════════════
  // ADD EDGES - Phase 1: Data Acquisition (linear)
  // ═══════════════════════════════════════════════════════

  builder.addEdge(START, 'initializeSession');
  builder.addEdge('initializeSession', 'loadDirectorNotes');
  builder.addEdge('loadDirectorNotes', 'fetchMemoryTokens');
  builder.addEdge('fetchMemoryTokens', 'fetchPaperEvidence');
  builder.addEdge('fetchPaperEvidence', 'fetchSessionPhotos');

  // ═══════════════════════════════════════════════════════
  // ADD EDGES - Phase 1.6-1.8: Early Processing
  // ═══════════════════════════════════════════════════════

  builder.addEdge('fetchSessionPhotos', 'analyzePhotos');
  builder.addEdge('analyzePhotos', 'preprocessEvidence');
  builder.addEdge('preprocessEvidence', 'curateEvidenceBundle');

  // Evidence + Photos approval checkpoint
  builder.addConditionalEdges('curateEvidenceBundle', routeEvidenceApproval, {
    wait: END,
    continue: 'analyzeArcs'  // Start orchestrated arc analysis (Commit 8.8)
  });

  // ═══════════════════════════════════════════════════════
  // ADD EDGES - Phase 2: Arc Analysis (Orchestrated Subagents - Commit 8.8)
  // ═══════════════════════════════════════════════════════

  // Single orchestrator node handles all arc analysis and synthesis
  // Subagents run in parallel via SDK Task tool
  builder.addEdge('analyzeArcs', 'evaluateArcs');

  // Arc evaluation routing
  builder.addConditionalEdges('evaluateArcs', routeArcEvaluation, {
    checkpoint: 'setArcSelectionCheckpoint',
    revise: 'incrementArcRevision',
    error: END
  });

  // Revision loop back to orchestrator (Commit 8.8)
  builder.addEdge('incrementArcRevision', 'analyzeArcs');

  // Arc selection checkpoint
  builder.addConditionalEdges('setArcSelectionCheckpoint', routeArcSelectionApproval, {
    wait: END,
    continue: 'generateOutline'
  });

  // ═══════════════════════════════════════════════════════
  // ADD EDGES - Phase 3: Outline Generation
  // ═══════════════════════════════════════════════════════

  builder.addEdge('generateOutline', 'evaluateOutline');

  // Outline evaluation routing
  builder.addConditionalEdges('evaluateOutline', routeOutlineEvaluation, {
    checkpoint: 'setOutlineCheckpoint',
    revise: 'incrementOutlineRevision',
    error: END
  });

  // Revision loop back to outline generation
  builder.addEdge('incrementOutlineRevision', 'generateOutline');

  // Outline checkpoint
  builder.addConditionalEdges('setOutlineCheckpoint', routeOutlineApproval, {
    wait: END,
    continue: 'generateContentBundle'
  });

  // ═══════════════════════════════════════════════════════
  // ADD EDGES - Phase 4: Article Generation
  // ═══════════════════════════════════════════════════════

  builder.addEdge('generateContentBundle', 'evaluateArticle');

  // Article evaluation routing
  builder.addConditionalEdges('evaluateArticle', routeArticleEvaluation, {
    checkpoint: 'setArticleCheckpoint',
    revise: 'incrementArticleRevision',
    error: END
  });

  // Revision loop back to article generation
  builder.addEdge('incrementArticleRevision', 'generateContentBundle');

  // Article checkpoint → schema validation
  builder.addConditionalEdges('setArticleCheckpoint', routeArticleApproval, {
    wait: END,
    continue: 'validateContentBundle'
  });

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
 * Create compiled report graph with MemorySaver checkpointing
 * Use for testing or ephemeral sessions
 *
 * @returns {Object} Compiled StateGraph
 */
// Default recursion limit - graph has 20+ nodes and revision loops can exceed 25 steps
const RECURSION_LIMIT = 75;

function createReportGraph() {
  const builder = createGraphBuilder();
  const checkpointer = new MemorySaver();

  return builder.compile({ checkpointer, recursionLimit: RECURSION_LIMIT });
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
  return builder.compile({ checkpointer, recursionLimit: RECURSION_LIMIT });
}

/**
 * Create compiled report graph without checkpointing
 * Use for simple one-shot execution (no pause/resume)
 *
 * @returns {Object} Compiled StateGraph
 */
function createReportGraphNoCheckpoint() {
  const builder = createGraphBuilder();
  return builder.compile({ recursionLimit: RECURSION_LIMIT });
}

module.exports = {
  // Main factory functions
  createReportGraph,
  createReportGraphWithCheckpointer,
  createReportGraphNoCheckpoint,

  // For testing
  _testing: {
    createGraphBuilder,
    // Routing functions
    routeEvidenceApproval,
    routeArcEvaluation,
    routeOutlineEvaluation,
    routeArticleEvaluation,
    routeSchemaValidation,
    routeArcSelectionApproval,
    routeOutlineApproval,
    routeArticleApproval,
    // Checkpoint nodes
    setArcSelectionCheckpoint,
    setOutlineCheckpoint,
    setArticleCheckpoint,
    incrementArcRevision,
    incrementOutlineRevision,
    incrementArticleRevision
  }
};

/**
 * Report Generation Graph
 *
 * Assembles the complete LangGraph StateGraph for report generation.
 * Connects all nodes with edges, conditional routing, and checkpointing.
 *
 * Graph Flow (13 nodes):
 * 1. initializeSession → loadDirectorNotes → fetchMemoryTokens → fetchPaperEvidence
 * 2. preprocessEvidence (Commit 8.5: batch summarization) → curateEvidenceBundle
 * 3. curateEvidenceBundle → [approval checkpoint] → analyzeNarrativeArcs
 * 4. analyzeNarrativeArcs → [approval checkpoint] → generateOutline
 * 5. generateOutline → [approval checkpoint] → generateContentBundle
 * 6. validateContentBundle → [error or continue] → assembleHtml → validateArticle
 * 7. validateArticle → [complete or revise] → reviseContentBundle → loop back to validateContentBundle
 *
 * Checkpointing:
 * - MemorySaver for testing (in-memory)
 * - SqliteSaver for production (persistent)
 *
 * See ARCHITECTURE_DECISIONS.md for design rationale.
 */

const { StateGraph, START, END, MemorySaver } = require('@langchain/langgraph');
const { ReportStateAnnotation, PHASES } = require('./state');
const nodes = require('./nodes');

/**
 * Route function for approval checkpoints
 * Returns 'wait' if awaiting approval, 'continue' otherwise
 *
 * @param {Object} state - Current graph state
 * @returns {string} 'wait' or 'continue'
 */
function routeApproval(state) {
  return state.awaitingApproval ? 'wait' : 'continue';
}

/**
 * Route function for schema validation
 * Returns 'error' if errors present, 'continue' otherwise
 *
 * @param {Object} state - Current graph state
 * @returns {string} 'error' or 'continue'
 */
function routeValidation(state) {
  const hasErrors = state.errors && state.errors.length > 0;
  return hasErrors ? 'error' : 'continue';
}

/**
 * Route function for voice validation
 * Returns 'complete' if passed or max revisions reached, 'revise' otherwise
 *
 * @param {Object} state - Current graph state
 * @returns {string} 'complete' or 'revise'
 */
function routeVoiceValidation(state) {
  const passed = state.validationResults?.passed;
  const maxRevisions = 2;
  const atMaxRevisions = (state.voiceRevisionCount || 0) >= maxRevisions;

  if (passed || atMaxRevisions) {
    return 'complete';
  }
  return 'revise';
}

/**
 * Create the report generation StateGraph
 *
 * @returns {Object} Uncompiled StateGraph builder
 */
function createGraphBuilder() {
  const builder = new StateGraph(ReportStateAnnotation);

  // ═══════════════════════════════════════════════════════
  // ADD NODES
  // ═══════════════════════════════════════════════════════

  // Data fetching nodes
  builder.addNode('initializeSession', nodes.initializeSession);
  builder.addNode('loadDirectorNotes', nodes.loadDirectorNotes);
  builder.addNode('fetchMemoryTokens', nodes.fetchMemoryTokens);
  builder.addNode('fetchPaperEvidence', nodes.fetchPaperEvidence);

  // Preprocessing nodes (Commit 8.5)
  builder.addNode('preprocessEvidence', nodes.preprocessEvidence);

  // AI processing nodes
  builder.addNode('curateEvidenceBundle', nodes.curateEvidenceBundle);
  builder.addNode('analyzeNarrativeArcs', nodes.analyzeNarrativeArcs);
  builder.addNode('generateOutline', nodes.generateOutline);
  builder.addNode('generateContentBundle', nodes.generateContentBundle);
  builder.addNode('validateContentBundle', nodes.validateContentBundle);
  builder.addNode('validateArticle', nodes.validateArticle);
  builder.addNode('reviseContentBundle', nodes.reviseContentBundle);

  // Template nodes
  builder.addNode('assembleHtml', nodes.assembleHtml);

  // ═══════════════════════════════════════════════════════
  // ADD EDGES
  // ═══════════════════════════════════════════════════════

  // Phase 1: Data Fetching (linear flow)
  builder.addEdge(START, 'initializeSession');
  builder.addEdge('initializeSession', 'loadDirectorNotes');
  builder.addEdge('loadDirectorNotes', 'fetchMemoryTokens');
  builder.addEdge('fetchMemoryTokens', 'fetchPaperEvidence');

  // Phase 1.7: Evidence Preprocessing (Commit 8.5)
  builder.addEdge('fetchPaperEvidence', 'preprocessEvidence');
  builder.addEdge('preprocessEvidence', 'curateEvidenceBundle');

  // Phase 1.8: Evidence Curation → Approval Checkpoint
  builder.addConditionalEdges('curateEvidenceBundle', routeApproval, {
    wait: END,           // Pause for human approval
    continue: 'analyzeNarrativeArcs'
  });

  // Phase 2: Arc Analysis → Approval Checkpoint
  builder.addConditionalEdges('analyzeNarrativeArcs', routeApproval, {
    wait: END,
    continue: 'generateOutline'
  });

  // Phase 3: Outline Generation → Approval Checkpoint
  builder.addConditionalEdges('generateOutline', routeApproval, {
    wait: END,
    continue: 'generateContentBundle'
  });

  // Phase 4: Content Generation → Schema Validation
  builder.addEdge('generateContentBundle', 'validateContentBundle');

  // Phase 4.1: Schema Validation → Error or Continue
  builder.addConditionalEdges('validateContentBundle', routeValidation, {
    error: END,          // Stop on schema errors
    continue: 'assembleHtml'
  });

  // Phase 5: Template Assembly → Voice Validation
  builder.addEdge('assembleHtml', 'validateArticle');

  // Phase 5.1: Voice Validation → Complete or Revise
  builder.addConditionalEdges('validateArticle', routeVoiceValidation, {
    complete: END,       // Finish (passed or max revisions)
    revise: 'reviseContentBundle'
  });

  // Phase 4.2: Revision → Back to Schema Validation (loop)
  builder.addEdge('reviseContentBundle', 'validateContentBundle');

  return builder;
}

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

  // For testing
  _testing: {
    createGraphBuilder,
    routeApproval,
    routeValidation,
    routeVoiceValidation
  }
};

/**
 * Nodes Barrel Export
 *
 * Single import point for all LangGraph nodes used by the report generation graph.
 * Follows DRY principle - graph.js imports from here, not individual files.
 *
 * Node Categories:
 * - Input Nodes: Raw input parsing and review (parseRawInput, finalizeInput) - Commit 8.9
 * - Fetch Nodes: Data fetching from files/APIs (initializeSession, loadDirectorNotes, etc.)
 * - Photo Nodes: Photo analysis with Haiku vision (analyzePhotos) - Commit 8.6
 * - Preprocess Nodes: Batch evidence preprocessing (preprocessEvidence) - Commit 8.5
 * - Arc Specialist Nodes: Orchestrated subagent analysis (analyzeArcsWithSubagents) - Commit 8.8
 * - Evaluator Nodes: Per-phase quality evaluation (arcs, outline, article) - Commit 8.6
 * - AI Nodes: Claude-powered processing (curateEvidenceBundle, generateOutline, etc.)
 * - Template Nodes: HTML assembly (assembleHtml)
 *
 * Each category is in a separate file following Single Responsibility Principle.
 */

const inputNodes = require('./input-nodes');
const fetchNodes = require('./fetch-nodes');
const photoNodes = require('./photo-nodes');
const preprocessNodes = require('./preprocess-nodes');
const checkpointNodes = require('./checkpoint-nodes');
const arcSpecialistNodes = require('./arc-specialist-nodes');
const evaluatorNodes = require('./evaluator-nodes');
// NOTE: validationNodes removed in Commit 8.23 - trust Opus evaluators instead
const aiNodes = require('./ai-nodes');
const templateNodes = require('./template-nodes');
const nodeHelpers = require('./node-helpers');

// Re-export all node functions
module.exports = {
  // Input nodes (from input-nodes.js) - Commit 8.9
  parseRawInput: inputNodes.parseRawInput,
  finalizeInput: inputNodes.finalizeInput,

  // Fetch nodes (from fetch-nodes.js)
  initializeSession: fetchNodes.initializeSession,
  loadDirectorNotes: fetchNodes.loadDirectorNotes,
  fetchMemoryTokens: fetchNodes.fetchMemoryTokens,
  fetchPaperEvidence: fetchNodes.fetchPaperEvidence,
  fetchSessionPhotos: fetchNodes.fetchSessionPhotos,
  tagTokenDispositions: fetchNodes.tagTokenDispositions,  // Tag tokens with exposed/buried

  // Photo nodes (from photo-nodes.js) - parallel branch architecture
  preprocessPhotos: photoNodes.preprocessPhotos,            // Preprocess photos for LLM/article display
  detectWhiteboard: photoNodes.detectWhiteboard,            // Auto-detect whiteboard from folder
  analyzePhotos: photoNodes.analyzePhotos,                  // Pure analysis (no checkpoint)
  parseCharacterIds: photoNodes.parseCharacterIds,          // Parse natural language character IDs
  finalizePhotoAnalyses: photoNodes.finalizePhotoAnalyses,  // Enrich with character IDs

  // Preprocess nodes (from preprocess-nodes.js) - Commit 8.5
  preprocessEvidence: preprocessNodes.preprocessEvidence,

  // Checkpoint nodes (from checkpoint-nodes.js) - Parallel branch architecture
  checkpointPaperEvidence: checkpointNodes.checkpointPaperEvidence,
  checkpointCharacterIds: checkpointNodes.checkpointCharacterIds,
  checkpointPreCuration: checkpointNodes.checkpointPreCuration,
  checkpointAwaitRoster: checkpointNodes.checkpointAwaitRoster,
  checkpointAwaitContext: checkpointNodes.checkpointAwaitContext,
  joinParallelBranches: checkpointNodes.joinParallelBranches,

  // Arc specialist nodes (from arc-specialist-nodes.js) - Commit 8.15
  // Commit 8.15: Player-focus-guided single-call architecture (replaces parallel specialists)
  analyzeArcsPlayerFocusGuided: arcSpecialistNodes.analyzeArcsPlayerFocusGuided,
  validateArcStructure: arcSpecialistNodes.validateArcStructure,  // Commit 8.12: Strict evidence/roster validation
  reviseArcs: arcSpecialistNodes.reviseArcs,  // Revision node with previous output context (DRY)

  // Evaluator nodes (from evaluator-nodes.js) - Commit 8.6
  evaluateArcs: evaluatorNodes.evaluateArcs,
  evaluateOutline: evaluatorNodes.evaluateOutline,
  evaluateArticle: evaluatorNodes.evaluateArticle,

  // NOTE: validateOutlineStructure and validateArticleContent removed in Commit 8.23
  // Programmatic validation was too brittle - trust Opus evaluators instead

  // AI nodes (from ai-nodes.js)
  curateEvidenceBundle: aiNodes.curateEvidenceBundle,
  processRescuedItems: aiNodes.processRescuedItems,  // Commit 8.10+: Handle human-rescued paper evidence
  analyzeNarrativeArcs: aiNodes.analyzeNarrativeArcs, // @deprecated - use arc specialists
  buildArcEvidencePackages: aiNodes.buildArcEvidencePackages, // Phase 1 Fix: Extract per-arc evidence with fullContent
  generateOutline: aiNodes.generateOutline,
  reviseOutline: aiNodes.reviseOutline,  // Revision node with previous output context (DRY)
  generateContentBundle: aiNodes.generateContentBundle,
  validateContentBundle: aiNodes.validateContentBundle,
  validateArticle: aiNodes.validateArticle, // @deprecated - use evaluateArticle
  reviseContentBundle: aiNodes.reviseContentBundle,

  // Template nodes (from template-nodes.js)
  assembleHtml: templateNodes.assembleHtml,

  // Shared helpers (from node-helpers.js) - DRY refactor
  helpers: nodeHelpers,

  // Testing utilities (namespaced to avoid conflicts)
  _testing: {
    fetch: fetchNodes._testing,
    photo: photoNodes._testing,
    preprocess: preprocessNodes._testing,
    checkpoints: checkpointNodes._testing,
    arcSpecialists: arcSpecialistNodes._testing,
    evaluators: evaluatorNodes._testing,
    // NOTE: validation removed in Commit 8.23
    // NOTE: supervisor removed in interrupt() migration - generation-supervisor.js was deprecated
    ai: aiNodes._testing,
    template: templateNodes._testing,
    helpers: nodeHelpers
  },

  // Mock factories (for integration tests)
  mocks: {
    createMockNotionClient: fetchNodes.createMockNotionClient,
    createMockPhotoAnalyzer: photoNodes.createMockPhotoAnalyzer,
    createMockPreprocessor: preprocessNodes.createMockPreprocessor,
    // Commit 8.8: New orchestrator mock replaces individual specialist mocks
    createMockOrchestrator: arcSpecialistNodes.createMockOrchestrator,
    // @deprecated - use createMockOrchestrator (kept for backwards compatibility)
    createMockSpecialist: arcSpecialistNodes.createMockSpecialist,
    createMockSynthesizer: arcSpecialistNodes.createMockSynthesizer,
    createMockEvaluator: evaluatorNodes.createMockEvaluator,
    createMockSdkClient: aiNodes.createMockSdkClient,
    createMockClaudeClient: aiNodes.createMockClaudeClient, // @deprecated - use createMockSdkClient
    createMockPromptBuilder: aiNodes.createMockPromptBuilder,
    createMockTemplateAssembler: templateNodes.createMockTemplateAssembler
  }
};

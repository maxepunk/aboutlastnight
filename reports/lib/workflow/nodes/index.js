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
const arcSpecialistNodes = require('./arc-specialist-nodes');
const evaluatorNodes = require('./evaluator-nodes');
const aiNodes = require('./ai-nodes');
const templateNodes = require('./template-nodes');
const generationSupervisor = require('../generation-supervisor');
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

  // Photo analysis nodes (from photo-nodes.js) - Commit 8.6, 8.9.5, 8.9.x
  analyzePhotos: photoNodes.analyzePhotos,
  parseCharacterIds: photoNodes.parseCharacterIds,          // Commit 8.9.x: parse natural language character IDs
  finalizePhotoAnalyses: photoNodes.finalizePhotoAnalyses,  // Commit 8.9.5: enrich with character IDs

  // Preprocess nodes (from preprocess-nodes.js) - Commit 8.5
  preprocessEvidence: preprocessNodes.preprocessEvidence,

  // Arc specialist nodes (from arc-specialist-nodes.js) - Commit 8.8
  // Single orchestrator replaces 4 sequential nodes (financial, behavioral, victimization, synthesize)
  analyzeArcsWithSubagents: arcSpecialistNodes.analyzeArcsWithSubagents,

  // Evaluator nodes (from evaluator-nodes.js) - Commit 8.6
  evaluateArcs: evaluatorNodes.evaluateArcs,
  evaluateOutline: evaluatorNodes.evaluateOutline,
  evaluateArticle: evaluatorNodes.evaluateArticle,

  // AI nodes (from ai-nodes.js)
  curateEvidenceBundle: aiNodes.curateEvidenceBundle,
  analyzeNarrativeArcs: aiNodes.analyzeNarrativeArcs, // @deprecated - use arc specialists
  generateOutline: aiNodes.generateOutline,
  generateContentBundle: aiNodes.generateContentBundle,
  validateContentBundle: aiNodes.validateContentBundle,
  validateArticle: aiNodes.validateArticle, // @deprecated - use evaluateArticle
  reviseContentBundle: aiNodes.reviseContentBundle,

  // Template nodes (from template-nodes.js)
  assembleHtml: templateNodes.assembleHtml,

  // Generation supervisor (from generation-supervisor.js) - Commit 8.6
  runGenerationSupervisor: generationSupervisor.runGenerationSupervisor,

  // Shared helpers (from node-helpers.js) - DRY refactor
  helpers: nodeHelpers,

  // Testing utilities (namespaced to avoid conflicts)
  _testing: {
    fetch: fetchNodes._testing,
    photo: photoNodes._testing,
    preprocess: preprocessNodes._testing,
    arcSpecialists: arcSpecialistNodes._testing,
    evaluators: evaluatorNodes._testing,
    ai: aiNodes._testing,
    template: templateNodes._testing,
    supervisor: generationSupervisor._testing,
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

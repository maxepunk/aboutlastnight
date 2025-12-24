/**
 * Nodes Barrel Export
 *
 * Single import point for all LangGraph nodes used by the report generation graph.
 * Follows DRY principle - graph.js imports from here, not individual files.
 *
 * Node Categories:
 * - Fetch Nodes: Data fetching from files/APIs (initializeSession, loadDirectorNotes, etc.)
 * - AI Nodes: Claude-powered processing (curateEvidenceBundle, analyzeNarrativeArcs, etc.)
 * - Template Nodes: HTML assembly (assembleHtml)
 *
 * Each category is in a separate file following Single Responsibility Principle.
 */

const fetchNodes = require('./fetch-nodes');
const aiNodes = require('./ai-nodes');
const templateNodes = require('./template-nodes');

// Re-export all node functions
module.exports = {
  // Fetch nodes (from fetch-nodes.js)
  initializeSession: fetchNodes.initializeSession,
  loadDirectorNotes: fetchNodes.loadDirectorNotes,
  fetchMemoryTokens: fetchNodes.fetchMemoryTokens,
  fetchPaperEvidence: fetchNodes.fetchPaperEvidence,

  // AI nodes (from ai-nodes.js)
  curateEvidenceBundle: aiNodes.curateEvidenceBundle,
  analyzeNarrativeArcs: aiNodes.analyzeNarrativeArcs,
  generateOutline: aiNodes.generateOutline,
  generateContentBundle: aiNodes.generateContentBundle,
  validateContentBundle: aiNodes.validateContentBundle,
  validateArticle: aiNodes.validateArticle,
  reviseContentBundle: aiNodes.reviseContentBundle,

  // Template nodes (from template-nodes.js)
  assembleHtml: templateNodes.assembleHtml,

  // Testing utilities (namespaced to avoid conflicts)
  _testing: {
    fetch: fetchNodes._testing,
    ai: aiNodes._testing,
    template: templateNodes._testing
  },

  // Mock factories (for integration tests)
  mocks: {
    createMockNotionClient: fetchNodes.createMockNotionClient,
    createMockClaudeClient: aiNodes.createMockClaudeClient,
    createMockPromptBuilder: aiNodes.createMockPromptBuilder,
    createMockTemplateAssembler: templateNodes.createMockTemplateAssembler
  }
};

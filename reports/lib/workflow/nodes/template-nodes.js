/**
 * Template Nodes - Template/rendering nodes for report generation workflow
 *
 * These nodes handle the template assembly phase of the pipeline:
 * - assembleHtml: Assemble HTML from ContentBundle + Templates
 *
 * Currently a stub implementation. Full Handlebars template assembly
 * will be implemented in Commit 7 (Template System).
 *
 * All nodes follow the LangGraph pattern:
 * - Accept (state, config) parameters
 * - Return partial state updates
 * - Use PHASES constants
 * - Support dependency injection via config.configurable
 *
 * See ARCHITECTURE_DECISIONS.md for design rationale.
 */

const { PHASES } = require('../state');

/**
 * Get TemplateAssembler from config or use stub
 * Supports dependency injection for testing and future real implementation
 *
 * @param {Object} config - Graph config with optional configurable.templateAssembler
 * @returns {Object} TemplateAssembler instance
 */
function getTemplateAssembler(config) {
  return config?.configurable?.templateAssembler || createStubAssembler();
}

/**
 * Create a stub template assembler for development
 * Returns contentBundle as JSON string wrapped in basic HTML
 *
 * This will be replaced by real Handlebars assembler in Commit 7.
 *
 * @returns {Object} Stub assembler with assemble method
 */
function createStubAssembler() {
  return {
    async assemble(contentBundle) {
      // Stub: Return contentBundle as formatted JSON in HTML wrapper
      // Real implementation will use Handlebars templates
      const headline = contentBundle?.headline?.main || 'Untitled Report';
      const theme = contentBundle?.metadata?.theme || 'journalist';
      const contentJson = JSON.stringify(contentBundle, null, 2);

      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${headline}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
    pre { background: #f5f5f5; padding: 1rem; overflow-x: auto; }
    .stub-notice { background: #fff3cd; border: 1px solid #ffc107; padding: 1rem; margin-bottom: 1rem; }
  </style>
</head>
<body class="${theme}-article">
  <div class="stub-notice">
    <strong>Stub Template:</strong> Real ${theme} template will be implemented in Commit 7.
  </div>
  <article>
    <h1>${headline}</h1>
    <pre>${contentJson}</pre>
  </article>
</body>
</html>`;
    }
  };
}

/**
 * Assemble HTML from ContentBundle using templates
 *
 * Takes validated ContentBundle and applies theme-specific templates
 * to produce final HTML output.
 *
 * Current implementation is a stub that wraps ContentBundle in basic HTML.
 * Full Handlebars template assembly will be implemented in Commit 7.
 *
 * @param {Object} state - Current state with contentBundle
 * @param {Object} config - Graph config with optional configurable.templateAssembler
 * @returns {Object} Partial state update with assembledHtml, currentPhase
 */
async function assembleHtml(state, config) {
  const assembler = getTemplateAssembler(config);

  const html = await assembler.assemble(state.contentBundle);

  return {
    assembledHtml: html,
    currentPhase: PHASES.ASSEMBLE_HTML
  };
}

/**
 * Create a mock template assembler for testing
 *
 * @param {Object} options - Mock options
 * @param {string} options.html - HTML to return from assemble()
 * @returns {Object} Mock assembler
 */
function createMockTemplateAssembler(options = {}) {
  const { html = '<html><body>Mock HTML</body></html>' } = options;

  return {
    async assemble(contentBundle) {
      return html;
    }
  };
}

module.exports = {
  // Node functions
  assembleHtml,

  // Testing utilities
  createMockTemplateAssembler,

  // Internal functions for testing
  _testing: {
    getTemplateAssembler,
    createStubAssembler
  }
};

/**
 * Template Nodes - Template/rendering nodes for report generation workflow
 *
 * These nodes handle the template assembly phase of the pipeline:
 * - assembleHtml: Assemble HTML from ContentBundle + Templates
 *
 * Uses Handlebars-based TemplateAssembler for proper template rendering.
 * Templates are located in reports/templates/{theme}/.
 *
 * All nodes follow the LangGraph pattern:
 * - Accept (state, config) parameters
 * - Return partial state updates
 * - Use PHASES constants
 * - Support dependency injection via config.configurable
 *
 * See ARCHITECTURE_DECISIONS.md for design rationale.
 */

const fs = require('fs');
const path = require('path');
const { PHASES } = require('../state');
const { createTemplateAssembler } = require('../../template-assembler');
const { traceNode } = require('../../observability');

/**
 * Get TemplateAssembler from config or create default
 * Supports dependency injection for testing
 *
 * Priority:
 * 1. config.configurable.templateAssembler (injected)
 * 2. createTemplateAssembler with theme from config
 * 3. createStubAssembler (fallback for testing without templates)
 *
 * @param {Object} config - Graph config with optional configurable.templateAssembler
 * @param {string} theme - Theme name from state (journalist, detective)
 * @returns {Object} TemplateAssembler instance
 */
function getTemplateAssembler(config, theme = 'journalist') {
  // Use injected assembler if provided
  if (config?.configurable?.templateAssembler) {
    return config.configurable.templateAssembler;
  }

  // Use stub if explicitly requested (for tests that don't have templates)
  if (config?.configurable?.useStubAssembler) {
    return createStubAssembler();
  }

  // Create real assembler with theme
  const assemblerTheme = config?.configurable?.theme || theme;
  return createTemplateAssembler(assemblerTheme, {
    cssPaths: config?.configurable?.cssPaths,
    jsPaths: config?.configurable?.jsPaths,
    validateSchema: config?.configurable?.validateSchema
  });
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
 * to produce final HTML output using Handlebars templates.
 * Also copies session photos and saves HTML to outputs directory.
 *
 * @param {Object} state - Current state with contentBundle, theme, sessionId
 * @param {Object} config - Graph config with optional configurable.templateAssembler
 * @returns {Object} Partial state update with assembledHtml, outputPath, currentPhase
 */
async function assembleHtml(state, config) {
  const theme = state.theme || config?.configurable?.theme || 'journalist';
  const assembler = getTemplateAssembler(config, theme);

  // Pass sessionId for photo path resolution
  const sessionId = state.sessionId || config?.configurable?.sessionId;
  const html = await assembler.assemble(state.contentBundle, { sessionId });

  // Determine base directory (configurable for testing)
  const baseDir = config?.configurable?.baseDir || path.join(__dirname, '..', '..', '..');
  const outputDir = path.join(baseDir, 'outputs');

  // Ensure outputs directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Copy session photos to outputs/sessionphotos/{sessionId}/
  let photosCopied = 0;
  if (sessionId) {
    const sourcePhotosDir = path.join(baseDir, 'data', sessionId, 'photos');
    const destPhotosDir = path.join(outputDir, 'sessionphotos', sessionId);

    if (fs.existsSync(sourcePhotosDir)) {
      fs.mkdirSync(destPhotosDir, { recursive: true });
      const photos = fs.readdirSync(sourcePhotosDir);
      for (const photo of photos) {
        fs.copyFileSync(
          path.join(sourcePhotosDir, photo),
          path.join(destPhotosDir, photo)
        );
      }
      photosCopied = photos.length;
      console.log(`[assembleHtml] Copied ${photosCopied} photos to ${destPhotosDir}`);
    }
  }

  // Save HTML to outputs/report-{sessionId}.html
  const outputPath = path.join(outputDir, `report-${sessionId}.html`);
  fs.writeFileSync(outputPath, html);
  console.log(`[assembleHtml] Saved HTML to ${outputPath}`);

  return {
    assembledHtml: html,
    outputPath,
    photosCopied,
    currentPhase: PHASES.COMPLETE  // Final phase - signals pipeline completion
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
  // Node functions (wrapped with LangSmith tracing)
  assembleHtml: traceNode(assembleHtml, 'assembleHtml', {
    stateFields: ['contentBundle']
  }),

  // Testing utilities
  createMockTemplateAssembler,

  // Re-export for convenience
  createTemplateAssembler,

  // Internal functions for testing
  _testing: {
    getTemplateAssembler,
    createStubAssembler
  }
};

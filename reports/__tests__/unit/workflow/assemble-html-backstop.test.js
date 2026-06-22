/**
 * assembleHtml backstop (N8)
 *
 * assembleHtml is the FINAL node after the human `article` approval — no operator
 * follows it. It currently assembles + writes + returns COMPLETE regardless of bundle
 * thinness, so a hollow/fabricated contentBundle would be published to outputs/.
 *
 * These tests pin the backstop: a structurally-empty contentBundle (null, or no sections,
 * or sections with no content blocks) must THROW *before* any file write; a populated
 * bundle must assemble normally.
 *
 * Schema note: per the real content-bundle.schema.json, the per-section body array is
 * `content` (NOT `contentBlocks`). top-level required: ["metadata","headline","sections"];
 * each section: required ["id","type","content"], type ∈ narrative/evidence-highlight/
 * investigation-notes/conclusion/case-summary, `content` = array of content blocks.
 *
 * Mock pattern matches the working arc-specialist-nodes-failloud.test.js: observability is
 * a full no-op shape so the exported (traceNode-wrapped) assembleHtml is callable directly.
 * The success path requires `./node-helpers` (validateFinancialData), which transitively
 * loads `lib/llm/index.js` → it destructures `createTracedSdkQuery`/`createProgressFromTrace`
 * from observability at load time and calls `createTracedSdkQuery(impl)`. So the mock MUST
 * provide those (as passthroughs) or the require crashes — a complete no-op shape, not a
 * partial one.
 *
 * Pollution guard: the success case injects a temp `baseDir` (mkdtempSync) via
 * config.configurable, so the node writes report-TEST.html into an OS temp dir, never the
 * repo's real outputs/.
 */

// Mock observability (full no-op shape — matches working node tests; includes the
// llm/index.js consumers so requiring node-helpers doesn't crash at load).
jest.mock('../../../lib/observability', () => ({
  traceNode: (fn) => fn,
  progressEmitter: { emit: jest.fn() },
  createTracedSdkQuery: (fn) => fn,
  createProgressFromTrace: () => jest.fn()
}));

const fs = require('fs');
const os = require('os');
const path = require('path');

const templateNodes = require('../../../lib/workflow/nodes/template-nodes');
const assembleHtml = templateNodes.assembleHtml;
const { createMockTemplateAssembler } = templateNodes;

function cfg() {
  return {
    configurable: {
      templateAssembler: createMockTemplateAssembler({ html: '<html>ok</html>' }),
      baseDir: fs.mkdtempSync(path.join(os.tmpdir(), 'aln-')),
      theme: 'journalist'
    }
  };
}

describe('assembleHtml backstop (N8)', () => {
  test('throws on null contentBundle (never publishes a hollow report)', async () => {
    await expect(assembleHtml({ contentBundle: null, sessionId: 'TEST' }, cfg()))
      .rejects.toThrow(/empty|invalid|content/i);
  });

  test('throws on contentBundle with no sections', async () => {
    await expect(assembleHtml({ contentBundle: { sections: [] }, sessionId: 'TEST' }, cfg()))
      .rejects.toThrow(/empty|invalid|content/i);
  });

  test('assembles a populated bundle', async () => {
    const bundle = {
      metadata: {},
      headline: 'H',
      sections: [
        { id: 'lede', type: 'narrative', heading: 'Lede', content: [{ type: 'paragraph', text: 'X' }] }
      ]
    };
    const result = await assembleHtml({ contentBundle: bundle, sessionId: 'TEST' }, cfg());
    expect(result.assembledHtml).toContain('ok');
    expect(result.currentPhase).toBeDefined();
  });
});

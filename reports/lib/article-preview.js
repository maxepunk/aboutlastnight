/**
 * The article as it will print, for the article stop (phase 4, task 4.3; spec 2026-10-02
 * section 6.3).
 *
 * One renderer for both previews: `htmlPreview` in the article stop's payload, which shows
 * the writer's draft as the stop opens, and the desk's preview route (server.js, POST
 * /api/session/:id/article/preview), which shows the bundle the director has on the desk.
 * Both go through the publishing TemplateAssembler with the session's theme, photo paths
 * and ledger, so the preview spaces the photos (lib/photo-spacing.js) and prints the
 * ledger's money tracker where the page will, and both carry `<base href="/">`: the page
 * links its photos relatively (`sessionphotos/<id>/...`), which would otherwise resolve
 * against /console/ in the preview frame. The console takes the scripts out of both before
 * it shows them (console/article-desk-logic.js stripScripts).
 *
 * @module article-preview
 */

const { createTemplateAssembler, TemplateAssembler } = require('./template-assembler');

/** What the preview adds to the page's head, so its relative photo links resolve. */
const PREVIEW_BASE = '<base href="/">';

/**
 * What a preview renders with, from the session's state: its theme, its id (the photos'
 * path) and its ledger (the money tracker the page prints).
 *
 * @param {Object} state - the graph's state values
 * @returns {{theme: string, sessionId: string|undefined, shellAccounts: Array}}
 */
function previewOptionsOf(state) {
  const s = state || {};
  return { theme: s.theme || 'journalist', sessionId: s.sessionId, shellAccounts: s.shellAccounts || [] };
}

/**
 * The page a bundle prints, with the preview's base.
 *
 * @param {Object} bundle - ContentBundle
 * @param {{theme: string, sessionId?: string, shellAccounts?: Array}} options - previewOptionsOf's
 * @returns {Promise<string>}
 * @throws {Error} for a bundle the page cannot print (the assembler's schema check)
 */
async function articlePreviewHtml(bundle, { theme, sessionId, shellAccounts } = {}) {
  const assembler = createTemplateAssembler(theme || 'journalist');
  const html = await assembler.assemble(bundle, { sessionId, shellAccounts: shellAccounts || [] });
  return html.replace('<head>', `<head>\n  ${PREVIEW_BASE}`);
}

/**
 * Does the page print the writer's money tracker? Only when the ledger gives it none to
 * print in its place (TemplateAssembler.overrideFinancialTracker passes the writer's
 * through, the page's own rule, which evaluator-nodes.js printedWriterTracker reads too)
 * and the writer's has a row. Otherwise the desk has no use for an editor of it.
 *
 * @param {Object} bundle
 * @param {Array} shellAccounts - the session's ledger
 * @returns {boolean}
 */
function writerTrackerPrints(bundle, shellAccounts) {
  const tracker = bundle && bundle.financialTracker;
  if (!tracker || typeof tracker !== 'object') return false;
  if (TemplateAssembler.prototype.overrideFinancialTracker(tracker, shellAccounts || []) !== tracker) return false;
  return Array.isArray(tracker.entries) && tracker.entries.length > 0;
}

module.exports = { PREVIEW_BASE, previewOptionsOf, articlePreviewHtml, writerTrackerPrints };

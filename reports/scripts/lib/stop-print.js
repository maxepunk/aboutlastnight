/**
 * Step mode's print of the story meeting, the map and the desk (phase 4, brief 4.12a): the page
 * lib/stop-pages.js builds from the console's view models, one printed line per line of the page,
 * so the harness shows what the console shows and the stops log counts. A title prints as its
 * heading; any other line as its label and its text; a concern or a mark that sits beside a line,
 * one step further in; what the page folds, behind a ▸. The harness colours each line by its tone.
 */
'use strict';

const { stopPage } = require('../../lib/stop-pages');

/** One page line as step mode prints it. */
function printedText(line) {
  const fold = line.folded ? '▸ ' : '';
  if (line.tone === 'title') return `${fold}── ${line.label} ──`;
  const body = line.label && line.text ? `${line.label}: ${line.text}` : (line.label || line.text);
  return `${line.beside ? '    ' : '  '}${fold}${body}`;
}

/**
 * The lines step mode prints for a stop, or null for a stop with no page.
 *
 * @param {string} stop - the stop type
 * @param {Object} data - the stop's payload, as the server sends it
 * @param {Object} [options] - lib/stop-pages.js stopPage's (the run's theme)
 * @returns {Array<{text: string, tone: string, folded: boolean, beside: boolean}>|null}
 */
function stopPrint(stop, data, options) {
  const page = stopPage(stop, data, options);
  if (!page) return null;
  return page.lines.map((line) => ({ text: printedText(line), tone: line.tone, folded: line.folded, beside: Boolean(line.beside) }));
}

module.exports = { stopPrint };

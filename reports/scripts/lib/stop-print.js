/**
 * Step mode's print of a stop with a page (phase 4, briefs 4.12a and 4.12c: the input review, the
 * story meeting, the character-IDs stop, the map and the desk): the page
 * lib/stop-pages.js builds from the console's view models, one printed line per line of the page,
 * so the harness shows what the console shows and the stops log counts. A title prints as its
 * heading; any other line as its label and its text; a concern or a mark that sits beside a line,
 * one step further in; what the page folds, behind a ▸. The harness colours each line by its tone.
 *
 * The input review's and the character-IDs stop's screens also show blocks their components
 * render straight from the payload, with no view model, which the page leaves out (task 4.12c,
 * fix round 1). The print shows them beside the page, where the screen shows them, headed in the
 * component's words (BESIDE_HEADINGS); the stops log counts the page alone:
 * - the input review: the session's settings and the roster with each pronoun above the page, the
 *   player focus before the director's notes, and the enrichment panel's counts and sentences
 *   under the panel's heading on the page, its fallback an alert, since the article would have no
 *   quote bank. The enricher's other warnings follow them on the page (task 4.12d);
 * - the character-IDs stop: the session's roster above the cards.
 */
'use strict';

const { stopPage, PAGE_HEADINGS, NOTES_RECEIPT_LABEL } = require('../../lib/stop-pages');
const InputLogic = require('../../console/input-review-logic');
const { validateRosterEntry } = require('../../console/await-roster-logic');

/** The headings of the blocks printed beside a page, each a heading its component renders (InputReview.js, CharacterIds.js). */
const BESIDE_HEADINGS = Object.freeze({
  'input-review': Object.freeze({
    session: 'Session Info',
    roster: 'Roster',
    focus: 'Player Focus'
  }),
  'character-ids': Object.freeze({ roster: 'Session Roster' })
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** A list as the print reads it: the list, or an empty one. */
function listOf(value) {
  return Array.isArray(value) ? value : [];
}

/** A line beside the page, in a page line's shape and open, as its component shows it. */
function besideLine(tone, text, label = '', beside = false) {
  return { tone, text: String(text), label, folded: false, beside };
}

/** The session's settings, as InputReview.js's Session Info shows them: the reporting mode and a guest reporter only for the journalist. */
function sessionInfoLines(config, theme) {
  const lines = [
    besideLine('title', '', BESIDE_HEADINGS['input-review'].session),
    besideLine('text', config.sessionId || 'N/A', 'Session ID')
  ];
  if (config.journalistFirstName) lines.push(besideLine('text', config.journalistFirstName, 'Journalist'));
  if (theme === 'journalist' && config.reportingMode) lines.push(besideLine('text', config.reportingMode, 'Reporting Mode'));
  if (theme === 'journalist' && isPlainObject(config.guestReporter)) {
    const guest = config.guestReporter;
    lines.push(besideLine('text', `${guest.name} | ${guest.role || 'Guest Reporter'}`, 'Guest Reporter'));
  }
  lines.push(besideLine('text', theme, 'Theme'));
  return lines;
}

/** The roster with each player's pronouns, as InputReview.js shows it, a name no character matches flagged beside it. */
function rosterLines(config, canonicalCharacters) {
  const roster = listOf(config.roster);
  if (roster.length === 0) return [];
  const pronouns = isPlainObject(config.rosterPronouns) ? config.rosterPronouns : {};
  const canon = isPlainObject(canonicalCharacters) ? canonicalCharacters : {};
  const hasCanon = Object.keys(canon).length > 0;
  const lines = [besideLine('title', '', BESIDE_HEADINGS['input-review'].roster)];
  roster.forEach((name) => {
    lines.push(besideLine('text', `${name} (${InputLogic.resolveRosterPronoun(name, pronouns)})`));
    if (hasCanon && !validateRosterEntry(name, canon).matched) lines.push(besideLine('concern', '⚠ no character match', '', true));
  });
  return lines;
}

/** The player focus, as InputReview.js shows it once the parse gives an investigation or a theory. */
function playerFocusLines(focus) {
  if (!focus.primaryInvestigation && !focus.playerTheory) return [];
  const lines = [besideLine('title', '', BESIDE_HEADINGS['input-review'].focus)];
  if (focus.primaryInvestigation) lines.push(besideLine('text', focus.primaryInvestigation, 'Primary Investigation'));
  if (listOf(focus.primarySuspects).length > 0) lines.push(besideLine('text', focus.primarySuspects.join(', '), 'Primary Suspects'));
  if (focus.playerTheory) lines.push(besideLine('text', focus.playerTheory, 'Player Theory'));
  if (focus.confidenceLevel) lines.push(besideLine('text', focus.confidenceLevel, 'Confidence'));
  if (listOf(focus.secondaryThreads).length > 0) lines.push(besideLine('text', focus.secondaryThreads.join(', '), 'Secondary Threads'));
  return lines;
}

/**
 * The enrichment panel's own lines, as InputReview.js's EnrichmentPanel shows them under its
 * heading: the counts, the fallback as an alert and the quotes dropped. The page holds the heading
 * and the enricher's other warnings after these (enrichmentWarningLines).
 */
function enrichmentLines(enrichment) {
  if (!isPlainObject(enrichment)) return [];
  const fallback = enrichment.fallback || null;
  const warnings = enrichment.warnings || null;
  const lines = [
    besideLine('text', `Quotes indexed: ${enrichment.quotes || 0} · Character mentions: ${enrichment.characterMentions || 0} · Transaction links: ${enrichment.transactionReferences || 0}`)
  ];
  if (fallback) {
    lines.push(besideLine('alert', `Director-notes enrichment failed (${fallback.reason || 'no reason recorded'}). The article will have no quote bank. Reject with corrections to retry.`));
  }
  const dropped = warnings ? warnings.droppedQuotes : 0;
  if (dropped > 0) {
    lines.push(besideLine('concern', `${dropped} quote${dropped === 1 ? '' : 's'} dropped: not found verbatim in the prose. Anything a player actually said has to be in the notes word for word to reach the article.`));
  }
  return lines;
}

/**
 * Where the director's notes begin on the input review's page: its notes receipt, its quote bank,
 * its epilogue or its whiteboard, whichever comes first.
 */
function notesStart(pageLines) {
  const H = PAGE_HEADINGS['input-review'];
  const opensNotes = (line) => (line.tone === 'title'
    ? line.label === H.whiteboard || line.label.startsWith(`${H.quotes} (`) || line.label.startsWith(`${H.epilogue} (`)
    : line.label === NOTES_RECEIPT_LABEL);
  const at = pageLines.findIndex(opensNotes);
  return at === -1 ? pageLines.length : at;
}

/** Where the enrichment panel's own lines go on the input review's page: right under its heading, or at the end when it has none. */
function panelStart(pageLines) {
  const at = pageLines.findIndex((line) => line.tone === 'title' && line.label === PAGE_HEADINGS['input-review'].enrichment);
  return at === -1 ? pageLines.length : at + 1;
}

/** The input review as its screen shows it: the settings and the roster, the page with the player focus before the notes and the panel's lines under its heading. */
function inputReviewLines(data, pageLines, theme) {
  const config = isPlainObject(data.sessionConfig) ? data.sessionConfig : {};
  const notesAt = notesStart(pageLines);
  const panelAt = panelStart(pageLines);
  return [
    ...sessionInfoLines(config, theme),
    ...rosterLines(config, data.canonicalCharacters),
    ...pageLines.slice(0, notesAt),
    ...playerFocusLines(isPlainObject(data.playerFocus) ? data.playerFocus : {}),
    ...pageLines.slice(notesAt, panelAt),
    ...enrichmentLines(data.enrichment),
    ...pageLines.slice(panelAt)
  ];
}

/**
 * The character-IDs stop as its screen shows it: the roster bar above the cards. The bar reads the
 * roster the interrupt sends, else the parse's for a thread that has parsed (CharacterIds.js).
 */
function characterIdsLines(data, pageLines) {
  const config = isPlainObject(data.sessionConfig) ? data.sessionConfig : {};
  const roster = listOf(data.roster || config.roster || []);
  if (roster.length === 0) return pageLines;
  return [
    besideLine('title', '', BESIDE_HEADINGS['character-ids'].roster),
    besideLine('text', roster.join(', ')),
    ...pageLines
  ];
}

/** The stops whose screens show blocks beside their page, and how each places them. */
const BESIDE_PAGE = {
  'input-review': inputReviewLines,
  'character-ids': characterIdsLines
};

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
 * @param {Object} [options] - lib/stop-pages.js stopPage's (the run's theme, which also decides
 *   whether the input review's settings show the reporting mode)
 * @returns {Array<{text: string, tone: string, folded: boolean, beside: boolean}>|null}
 */
function stopPrint(stop, data, options) {
  const page = stopPage(stop, data, options);
  if (!page) return null;
  const payload = isPlainObject(data) ? data : {};
  const theme = (options && options.theme) || 'journalist';
  const lines = Object.prototype.hasOwnProperty.call(BESIDE_PAGE, stop) ? BESIDE_PAGE[stop](payload, page.lines, theme) : page.lines;
  return lines.map((line) => ({ text: printedText(line), tone: line.tone, folded: line.folded, beside: Boolean(line.beside) }));
}

module.exports = { BESIDE_HEADINGS, stopPrint };

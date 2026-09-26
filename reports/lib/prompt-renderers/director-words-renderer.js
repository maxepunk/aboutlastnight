/**
 * The director's own words, rendered beside their parse (phase 2, brief 2.2).
 *
 * What the director writes is part of the record and travels next to what the
 * parse made of it, never replaced by it. Every section here is shared by more
 * than one prompt, so each is built by one function that every prompt calls:
 *
 * - the accusation: the parsed accused and charge (with the no-culprit verdict
 *   said as such), then the director's account word for word. Arc writer and arc
 *   reworker, and the outline and article writers' SESSION_FACTS.
 * - the input-review corrections: after the director's notes wherever those are
 *   rendered (director-notes-renderer.js), and appended to every parse prompt.
 * - the whiteboard connections: the arc writer's section, reused by the outline
 *   and article writers under the same label.
 * - each photo's description as the director typed it at the character-IDs stop,
 *   joined to its photo by filename.
 *
 * Nothing here paraphrases the director. A label says whose words follow; the
 * words themselves are copied as given (trimmed at the ends, nothing else).
 */

const { isNoCulpritVerdict, accusedNames } = require('../accusation-verdict');

// ═══════════════════════════════════════════════════════
// ACCUSATION
// ═══════════════════════════════════════════════════════

/** How a no-culprit verdict kind reads in a sentence. */
const VERDICT_KIND_PHRASES = {
  accident: 'an accident',
  overdose: 'an overdose',
  'self-harm': 'self-harm',
  other: 'a finding that names no one'
};

/**
 * The accused, as a prompt prints them.
 *
 * A no-culprit verdict prints as "none", with its kind, so no line can print the
 * victim (or anyone) as the accused. Otherwise the names, as JSON (the arc
 * prompts' existing format) or joined with `joiner`.
 *
 * @param {Object|null} accusation - {accused, charge, verdictKind}
 * @param {Object} [options]
 * @param {boolean} [options.json=false] - print the names as a JSON array
 * @param {string} [options.joiner=', '] - join for the names when not JSON
 * @param {string} [options.empty='unspecified'] - text when no name was parsed
 * @returns {string}
 */
function formatAccused(accusation, { json = false, joiner = ', ', empty = 'unspecified' } = {}) {
  if (isNoCulpritVerdict(accusation)) {
    return `none (the room's verdict names no culprit: ${VERDICT_KIND_PHRASES[accusation.verdictKind]})`;
  }
  const names = accusedNames(accusation);
  if (json) return JSON.stringify(names);
  return names.length > 0 ? names.join(joiner) : empty;
}

/**
 * The director's accusation text as the director wrote it.
 *
 * @param {string|null} directorText - the raw accusation (sessionConfig.accusationRaw)
 * @returns {string} the block, or '' when there is no text
 */
function renderDirectorAccusation(directorText) {
  const text = typeof directorText === 'string' ? directorText.trim() : '';
  if (!text) return '';
  return `<DIRECTOR_ACCUSATION>
The director's own account of the verdict, word for word. The accused and charge above are parsed from it; where they differ, this account is right.
${text}
</DIRECTOR_ACCUSATION>`;
}

/**
 * The one sentence a no-culprit verdict adds to the arc prompts' accusation.
 *
 * @param {Object|null} accusation
 * @returns {string} '' for a verdict that names someone
 */
function noCulpritInstruction(accusation) {
  if (!isNoCulpritVerdict(accusation)) return '';
  const charge = typeof accusation.charge === 'string' && accusation.charge.trim()
    ? ` (${accusation.charge.trim()})`
    : '';
  return `The room named no culprit: its verdict is ${VERDICT_KIND_PHRASES[accusation.verdictKind]}${charge}. ` +
    'The accusation arc is about that verdict. Place no one as the accused, and never the victim.';
}

/**
 * The accusation block of the arc writer and the arc reworker.
 *
 * @param {Object|null} accusation - playerFocus.accusation {accused, charge, reasoning, verdictKind}
 * @param {string|null} directorText - the director's accusation, word for word
 * @param {string} reasoningLabel - "Players' Reasoning" (writer) or "Reasoning" (reworker)
 * @returns {string}
 */
function renderArcAccusation(accusation, directorText, reasoningLabel) {
  const acc = accusation || {};
  const lines = [
    `**Accused:** ${formatAccused(acc, { json: true })}`,
    `**Charge:** ${acc.charge || 'Not specified'}`,
    `**${reasoningLabel}:** ${acc.reasoning || 'Not documented'}`
  ];
  const instruction = noCulpritInstruction(acc);
  if (instruction) lines.push('', instruction);
  const director = renderDirectorAccusation(directorText);
  if (director) lines.push('', director);
  return lines.join('\n');
}

/**
 * The verdict lines of SESSION_FACTS, for the outline and article writers.
 *
 * The accused, the charge (which the writers never saw before this slice: an
 * overdose verdict reached them as `ACCUSATION: Marcus`), the director's account
 * word for word, and the whiteboard connections under the arc writer's label.
 *
 * @param {Object} sessionFacts - {accusation: {accused, charge, verdictKind}, accusationText, whiteboard}
 * @returns {string}
 */
function renderSessionFactsVerdict(sessionFacts) {
  const facts = sessionFacts || {};
  // A caller from before this slice passes the accused already joined; it prints
  // exactly as it did then.
  if (typeof facts.accusation === 'string') return `ACCUSATION: ${facts.accusation}`;
  const acc = facts.accusation && typeof facts.accusation === 'object' ? facts.accusation : {};
  const lines = [`ACCUSATION: ${formatAccused(acc, { joiner: ' and ', empty: 'Unknown' })}`];
  if (typeof acc.charge === 'string' && acc.charge.trim()) lines.push(`CHARGE: ${acc.charge.trim()}`);
  const director = renderDirectorAccusation(facts.accusationText);
  if (director) lines.push('', director);
  const whiteboard = renderWhiteboardConnections(facts.whiteboard, { omitWhenEmpty: true });
  if (whiteboard) lines.push('', whiteboard);
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════
// INPUT-REVIEW CORRECTIONS
// ═══════════════════════════════════════════════════════

/**
 * The corrections as a list of non-empty strings, in order.
 *
 * @param {string|string[]|null} corrections
 * @returns {string[]}
 */
function normalizeCorrections(corrections) {
  const list = Array.isArray(corrections) ? corrections : [corrections];
  return list.filter(c => typeof c === 'string' && c.trim()).map(c => c.trim());
}

/**
 * The corrections' text: one correction as written, several numbered in order.
 *
 * @param {string[]} list - normalized corrections
 * @returns {string}
 */
function formatCorrectionList(list) {
  if (list.length === 1) return list[0];
  return list.map((c, i) => `${i + 1}. ${c}`).join('\n\n');
}

/**
 * The <DIRECTOR_CORRECTIONS> suffix appended to a parse prompt (B2): parse steps 1
 * and 2, the director-notes enricher and the whiteboard parse.
 *
 * The director rejected a parse at the input review and typed what was wrong.
 * Those corrections outrank the source text: the source text is exactly what
 * produced the bad parse. Every correction of the session goes, in order, because
 * a re-parse starts again from the source text.
 *
 * @param {string|string[]|null} corrections
 * @returns {string} '' when there are no corrections
 */
function buildParseCorrectionsBlock(corrections) {
  const list = normalizeCorrections(corrections);
  if (list.length === 0) return '';
  return '\n\n<DIRECTOR_CORRECTIONS>\n' + formatCorrectionList(list) +
    '\n</DIRECTOR_CORRECTIONS>\nApply these corrections; they override anything in the source text.';
}

/**
 * The corrections for a writer, rendered right after the director's notes.
 *
 * The notes are never rewritten: the uncorrected sentence stays in them, and the
 * correction sits beside it, labelled as the director's and as the one that wins.
 *
 * @param {string|string[]|null} corrections
 * @returns {string} '' when there are no corrections
 */
function renderDirectorCorrectionsBlock(corrections) {
  const list = normalizeCorrections(corrections);
  if (list.length === 0) return '';
  return `<DIRECTOR_CORRECTIONS>
The director's corrections to the notes above, written at the input review, in the order given. They are the director's own words and override the notes where the two differ.
${formatCorrectionList(list)}
</DIRECTOR_CORRECTIONS>`;
}

// ═══════════════════════════════════════════════════════
// WHITEBOARD
// ═══════════════════════════════════════════════════════

/**
 * The whiteboard connections under the arc writer's label.
 *
 * @param {Object|null} whiteboard - playerFocus.whiteboardContext
 * @param {Object} [options]
 * @param {boolean} [options.omitWhenEmpty=false] - '' when all four lists are empty.
 *   The arc writer always prints the section; the outline and article writers
 *   print it only when the players drew something.
 * @returns {string}
 */
function renderWhiteboardConnections(whiteboard, { omitWhenEmpty = false } = {}) {
  const wb = whiteboard || {};
  const lists = [wb.suspectsExplored, wb.connections, wb.notes, wb.namesFound]
    .map(v => (Array.isArray(v) ? v : []));
  if (omitWhenEmpty && lists.every(l => l.length === 0)) return '';
  return `### Whiteboard Connections (Players drew these during investigation)
**Suspects Explored:** ${JSON.stringify(lists[0])}
**Connections Found:** ${JSON.stringify(lists[1])}
**Notes Captured:** ${JSON.stringify(lists[2])}
**Names Identified:** ${JSON.stringify(lists[3])}`;
}

// ═══════════════════════════════════════════════════════
// PHOTO DESCRIPTIONS
// ═══════════════════════════════════════════════════════

/** The basename of a path or filename, lower-cased: the one join key for photos. */
function photoKey(filename) {
  return String(filename || '').split(/[/\\]/).pop().toLowerCase();
}

/**
 * The director's description of one photo, found by filename.
 *
 * Basename, case-insensitive: the join generateOutline and the console's photoUrl
 * already use. Never by position in a list.
 *
 * @param {Object|null} photoDescriptions - {filename: text} from the character-IDs stop
 * @param {string} filename
 * @returns {string} '' when the director gave none
 */
function photoDescriptionFor(photoDescriptions, filename) {
  if (!photoDescriptions || typeof photoDescriptions !== 'object') return '';
  const key = photoKey(filename);
  if (!key) return '';
  const match = Object.keys(photoDescriptions).find(name => photoKey(name) === key);
  const text = match ? photoDescriptions[match] : '';
  return typeof text === 'string' ? text.trim() : '';
}

/**
 * One photo for a writer: filename, the identified names, and the director's
 * description word for word.
 *
 * @param {Object} photo
 * @param {string} photo.filename
 * @param {string[]} [photo.names] - identified characters
 * @param {Object|null} photoDescriptions - {filename: text}
 * @param {string} [indent='  '] - indent of the description line
 * @returns {string}
 */
function renderPhotoEntry({ filename, names = [] }, photoDescriptions, indent = '  ') {
  const nameList = (Array.isArray(names) ? names : []).filter(n => typeof n === 'string' && n.trim());
  const description = photoDescriptionFor(photoDescriptions, filename);
  const descriptionLine = description
    ? `The director's description, word for word: ${description}`
    : "The director's description: none given";
  return `${filename}: ${nameList.join(', ') || 'Unknown'}\n${indent}${descriptionLine}`;
}

module.exports = {
  VERDICT_KIND_PHRASES,
  formatAccused,
  renderDirectorAccusation,
  noCulpritInstruction,
  renderArcAccusation,
  renderSessionFactsVerdict,
  normalizeCorrections,
  formatCorrectionList,
  buildParseCorrectionsBlock,
  renderDirectorCorrectionsBlock,
  renderWhiteboardConnections,
  photoKey,  // the outline judge pairs each photo with its analysis by this key (brief 2.4)
  photoDescriptionFor,
  renderPhotoEntry
};

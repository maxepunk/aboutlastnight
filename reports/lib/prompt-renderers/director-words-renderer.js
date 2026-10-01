/**
 * The director's own words, rendered beside their parse (phase 2, brief 2.2).
 *
 * What the director writes is part of the record and travels next to what the
 * parse made of it, never replaced by it. Every section here is shared by more
 * than one prompt, so each is built by one function that every prompt calls:
 *
 * - the accusation: the parsed accused and charge (with the no-culprit verdict
 *   said as such, and since phase 3 a verdict that blames no character and a split
 *   final vote), then the director's account word for word. Arc writer and arc
 *   reworker, and the outline and article writers' SESSION_FACTS.
 * - the input-review corrections: after the director's notes wherever those are
 *   rendered (director-notes-renderer.js), and appended to every parse prompt.
 * - the whiteboard: the arc writer's section, reused by the outline and article
 *   writers under the same label, which since phase 3 names it a model's reading of
 *   the photo. (The whiteboard is the parse's reading, not the director's words; it
 *   sits here because the same writers' sections print it.)
 * - each photo's description as the director typed it at the character-IDs stop,
 *   joined to its photo by filename.
 *
 * Nothing here paraphrases the director. A label says whose words follow; the
 * words themselves are copied as given (trimmed at the ends, nothing else).
 */

const { isNoCulpritVerdict, blamesNoCharacter, accusedNames, normalizeVotes } = require('../accusation-verdict');

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

/** How the accused line reads when the group statement blames someone who is not a character. */
const BLAMES_NO_CHARACTER = 'no character (the group statement blames an institution or an unnamed person: see the charge)';

/**
 * The accused, as a prompt prints them.
 *
 * A no-culprit verdict prints as "none", with its kind, so no line can print the
 * victim (or anyone) as the accused. A culprit verdict that blames an institution or
 * an unnamed person prints as no character, pointing at the charge (phase 3, brief
 * 3.5). Otherwise the names, as JSON (the arc prompts' existing format) or joined
 * with `joiner`.
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
  if (blamesNoCharacter(accusation)) return BLAMES_NO_CHARACTER;
  const names = accusedNames(accusation);
  if (json) return JSON.stringify(names);
  return names.length > 0 ? names.join(joiner) : empty;
}

/**
 * A split final vote in one line: every option with its count, the one the group
 * statement adopted marked, or a sentence saying it adopted none.
 *
 * @param {Array|null} votes - accusation.votes
 * @returns {string} '' when there is no split vote
 */
function formatSplitVote(votes) {
  const clean = normalizeVotes(votes);
  if (!clean) return '';
  const options = clean.map((v) => `${v.option} ${v.count}${v.adopted ? ', adopted by the group statement' : ''}`).join('; ');
  return clean.some((v) => v.adopted) ? options : `${options}. The group statement adopted none of these.`;
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
 * The one sentence a verdict that places no character adds to the arc prompts'
 * accusation: a no-culprit verdict, or (phase 3, brief 3.5) a culprit verdict that
 * blames an institution or an unnamed person.
 *
 * @param {Object|null} accusation
 * @returns {string} '' for a verdict that names a character
 */
function noCulpritInstruction(accusation) {
  const charge = typeof accusation?.charge === 'string' ? accusation.charge.trim() : '';
  if (blamesNoCharacter(accusation)) {
    return `The group statement holds no character responsible: it blames ${charge ? `"${charge}"` : 'an institution or an unnamed person'}. ` +
      'The accusation arc is about that verdict. Place no character as the accused.';
  }
  if (!isNoCulpritVerdict(accusation)) return '';
  return `The room named no culprit: its verdict is ${VERDICT_KIND_PHRASES[accusation.verdictKind]}${charge ? ` (${charge})` : ''}. ` +
    'The accusation arc is about that verdict. Place no one as the accused, and never the victim.';
}

/**
 * The accusation block of the arc writer and the arc reworker.
 *
 * @param {Object|null} accusation - playerFocus.accusation {accused, charge, reasoning, verdictKind, votes}
 * @param {string|null} directorText - the director's accusation, word for word
 * @param {string} reasoningLabel - "Players' Reasoning" (writer) or "Reasoning" (reworker)
 * @returns {string}
 */
function renderArcAccusation(accusation, directorText, reasoningLabel) {
  const acc = accusation || {};
  const vote = formatSplitVote(acc.votes);
  const lines = [
    `**Accused:** ${formatAccused(acc, { json: true })}`,
    `**Charge:** ${acc.charge || 'Not specified'}`,
    ...(vote ? [`**Final Vote (split):** ${vote}`] : []),
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
 * Phase 3 (brief 3.5): a split final vote prints beside them, every option with its
 * count and the one the group statement adopted.
 *
 * @param {Object} sessionFacts - {accusation: {accused, charge, verdictKind, votes}, accusationText, whiteboard}
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
  const vote = formatSplitVote(acc.votes);
  if (vote) lines.push(`FINAL VOTE (split): ${vote}`);
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
 * The line after the block speaks only to what the parse reads from the source
 * text (phase 3, brief 3.5; spec D15). The roster, its pronouns, the reporting mode
 * and the reporter's name are stamped by code from where the director entered them,
 * so no parse sets them and the block promises nothing about them.
 *
 * @param {string|string[]|null} corrections
 * @returns {string} '' when there are no corrections
 */
function buildParseCorrectionsBlock(corrections) {
  const list = normalizeCorrections(corrections);
  if (list.length === 0) return '';
  return '\n\n<DIRECTOR_CORRECTIONS>\n' + formatCorrectionList(list) +
    '\n</DIRECTOR_CORRECTIONS>\nApply these corrections to what you parse from the source text; where a correction and the source text differ, the correction is right.';
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

const asList = (value) => (Array.isArray(value) ? value : []);

/**
 * The whiteboard's regions, each {label, location, entries}.
 *
 * A thread parsed before phase 3 has no regions: its playerFocus carries the
 * members of the one group whose model-written label held "suspect". They print as
 * one region with no heading, since the heading the players wrote is not known.
 */
function whiteboardRegionsOf(wb) {
  if (Array.isArray(wb.regions)) return wb.regions.filter((r) => r && typeof r === 'object');
  const legacy = asList(wb.suspectsExplored);
  return legacy.length > 0 ? [{ label: '', location: '', entries: legacy }] : [];
}

/** One region's line: the players' heading (or none), where it sits, and what it holds. */
function whiteboardRegionLine(region) {
  const label = typeof region.label === 'string' ? region.label.trim() : '';
  const location = typeof region.location === 'string' ? region.location.trim() : '';
  const heading = `${label ? `"${label}"` : 'no heading'}${location ? ` (${location})` : ''}`;
  return `- ${heading}: ${asList(region.entries).join(', ')}`;
}

/**
 * The whiteboard, for the arc, outline and article writers (phase 3, brief 3.5;
 * spec T13).
 *
 * Labelled as what it is: a model's reading of the photo of the room's working
 * notes, given as context for how the room reasoned, never as a source and never as
 * what the players drew (the old label). Each region prints under the heading the
 * players wrote, with nothing the parse added; then the lines drawn, the writing in
 * no region, the names, and the writing the model could not read with confidence.
 *
 * @param {Object|null} whiteboard - playerFocus.whiteboardContext
 * @param {Object} [options]
 * @param {boolean} [options.omitWhenEmpty=false] - '' when every list is empty.
 *   The arc writer always prints the section; the outline and article writers
 *   print it only when the whiteboard held something.
 * @returns {string}
 */
function renderWhiteboardConnections(whiteboard, { omitWhenEmpty = false } = {}) {
  const wb = whiteboard || {};
  const regions = whiteboardRegionsOf(wb);
  const lists = [wb.connections, wb.notes, wb.namesFound, wb.ambiguities].map(asList);
  if (omitWhenEmpty && regions.length === 0 && lists.every(l => l.length === 0)) return '';
  return `### The Whiteboard (a model's reading of the photo)
A model's reading of the photo of the whiteboard where the room kept its working notes during the investigation: context for how the room reasoned toward its verdict, not a source.
**Regions, each under the heading the players wrote:**${regions.length > 0 ? `\n${regions.map(whiteboardRegionLine).join('\n')}` : ' none'}
**Lines drawn:** ${JSON.stringify(lists[0])}
**Other writing:** ${JSON.stringify(lists[1])}
**Names on the whiteboard:** ${JSON.stringify(lists[2])}
**Writing the model could not read with confidence:** ${JSON.stringify(lists[3])}`;
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
 * With no description map at all (a thread from before the character-IDs stop
 * collected descriptions, or one whose descriptions were not re-entered), the
 * description line is left out: "none given" would say the director gave nothing,
 * which is not known. "none given" is printed only when a map exists and lacks this
 * photo (phase 2 final fix wave).
 *
 * @param {Object} photo
 * @param {string} photo.filename
 * @param {string[]} [photo.names] - identified characters
 * @param {Object|null} photoDescriptions - {filename: text}, or null when none was collected
 * @param {string} [indent='  '] - indent of the description line
 * @returns {string}
 */
function renderPhotoEntry({ filename, names = [] }, photoDescriptions, indent = '  ') {
  const nameList = (Array.isArray(names) ? names : []).filter(n => typeof n === 'string' && n.trim());
  const entry = `${filename}: ${nameList.join(', ') || 'Unknown'}`;
  if (!photoDescriptions || typeof photoDescriptions !== 'object') return entry;
  const description = photoDescriptionFor(photoDescriptions, filename);
  const descriptionLine = description
    ? `The director's description, word for word: ${description}`
    : "The director's description: none given";
  return `${entry}\n${indent}${descriptionLine}`;
}

module.exports = {
  VERDICT_KIND_PHRASES,
  formatAccused,
  formatSplitVote,
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

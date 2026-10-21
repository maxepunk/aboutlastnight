/**
 * The article's authors, as every stage is told of them (phases 14 and 15, brief E; spec
 * section 5; rulings R4 and R5).
 *
 * Nova's name for the session (R4). The theme's NPC entry that writes the article carries
 * the text (lib/theme-config.js, its `writer`), and these functions fill it with the
 * session's first name for Nova (sessionConfig.journalistFirstName, which the start form
 * stamps, else the entry's default):
 * - writerSignsLine: joins the writer's line in the roster section (prompt-builder.js
 *   generateRosterSection), which every writer and judge reads, in both modes;
 * - writerInPhotosLine: on site only, the character-IDs parse and the photo enrichment read
 *   it beside the roster, so neither corrects Nova's name to a player's;
 * - markWriterInPhoto: on site only, marks a photo's name for Nova (the first name, the
 *   entry's name, or the two together) as the article's writer; a name that holds the entry's
 *   own name takes the shorter mark, so it is not repeated (K4). The roster decides a clash:
 *   a name a roster player has is that player, and stays unmarked.
 * - writerInTheRoom: on site only, SESSION_FACTS names the writer beside Blake among the
 *   characters in the room (K1).
 * Remote, Nova was outside the warehouse and is in no photo, so the parse, the photo
 * entries and SESSION_FACTS are as they were. A theme with no writer entry, such as the parked detective,
 * gets none of these.
 *
 * The guest reporters (R5; phase 17, each apart), only when the session has any, read
 * through guestReportersOf, the one reading:
 * - guestReporterLine: who shares the byline, and that a memory turned in under each one's
 *   name is reporting they filed to Nova for this article, as world.md and C11 say.
 *   SESSION_FACTS, the weave writer's first section and both judges print it;
 * - guestTurnInName: the record view's timeline marks a turn-in under a reporter's full name
 *   or their first name, in any case.
 * A session with no guest reporter prints nothing of either.
 *
 * Pure: no I/O, and nothing passed in is changed.
 */

const { getThemeNPCEntries } = require('../theme-config');

/**
 * The one rule for the reporting mode (final fix wave, K2): on site unless the mode is
 * 'remote', as the mode block has always read it, so a session with no mode stamped is on
 * site everywhere. The mode block (prompt-builder.js buildReportingModeBlock), the photo
 * calls and marks below, SESSION_FACTS' line for Nova (prompt-builder.js
 * _sessionFactsSection), the article judge's mode line and the fact check's reporter-mode
 * scan all read it.
 *
 * @param {Object|null} sessionConfig - its reportingMode
 * @returns {boolean}
 */
function isOnSite(sessionConfig) {
  return sessionConfig?.reportingMode !== 'remote';
}

/**
 * The session's reporting mode by that rule, as the mode files name it.
 *
 * @param {Object|null} sessionConfig - its reportingMode
 * @returns {'on-site'|'remote'}
 */
function reportingModeOf(sessionConfig) {
  return isOnSite(sessionConfig) ? 'on-site' : 'remote';
}

const lower = (text) => String(text).trim().toLowerCase();
const fill = (template, values) => template.replace(/\{(\w+)\}/g, (whole, key) => (key in values ? values[key] : whole));

/** The theme's NPC entry that writes the article, or null. */
function writerEntryOf(theme) {
  return getThemeNPCEntries(theme).find((entry) => entry && typeof entry === 'object' && entry.writer) || null;
}

/** The session's first name for the writer: the one the director gave, else the theme's default. */
function writerFirstName(entry, firstName) {
  return typeof firstName === 'string' && firstName.trim() ? firstName.trim() : entry.writer.defaultFirstName;
}

/**
 * The session's first name for the article's writer (the final fix wave, K3): the one the
 * director gave at the start form, else the theme's default (`writer.defaultFirstName`), the
 * one source of the default. The parse stamps it (input-nodes.js parseRawInput) and the
 * article writer's byline prints it (prompt-builder.js). The console's start form keeps its own
 * copy of the default, which session-authors.test.js holds equal.
 *
 * @param {string} theme
 * @param {string|null} [firstName] - the first name the director gave
 * @returns {string|null} null for a theme with no writer entry
 */
function writerFirstNameOf(theme, firstName) {
  const entry = writerEntryOf(theme);
  return entry ? writerFirstName(entry, firstName) : null;
}

/**
 * The writer's line for the session, which joins its line in the roster section (R4).
 *
 * @param {string} theme
 * @param {string|null} [firstName] - sessionConfig.journalistFirstName
 * @returns {string|null} null for a theme with no writer entry
 */
function writerSignsLine(theme, firstName) {
  const entry = writerEntryOf(theme);
  return entry ? fill(entry.writer.signs, { first: writerFirstName(entry, firstName) }) : null;
}

/**
 * The writer's names for the character-IDs parse and the photo enrichment, on site only (R4).
 *
 * @param {string} theme
 * @param {Object|null} sessionConfig - its reportingMode and journalistFirstName
 * @returns {string|null} null remote, or for a theme with no writer entry
 */
function writerInPhotosLine(theme, sessionConfig) {
  const entry = writerEntryOf(theme);
  if (!entry || !isOnSite(sessionConfig)) return null;
  return fill(entry.writer.inPhotos, { first: writerFirstName(entry, sessionConfig?.journalistFirstName) });
}

/**
 * A photo's names, each name for the writer marked as the article's writer, on site only
 * (R4). A name a roster player has is the player: the roster decides.
 *
 * @param {string[]} names - the names identified in the photo
 * @param {Object} context
 * @param {string} context.theme
 * @param {Object|null} context.sessionConfig - its reportingMode and journalistFirstName
 * @param {string[]} [context.rosterNames] - the roster players' names, first or full; a full
 *   name's first word counts as the player's too
 * @returns {string[]} a new list; the names as given remote or with no writer entry
 */
function markWriterInPhoto(names, { theme, sessionConfig, rosterNames = [] } = {}) {
  const list = Array.isArray(names) ? names : [];
  const entry = writerEntryOf(theme);
  if (!entry || !isOnSite(sessionConfig)) return [...list];
  const first = writerFirstName(entry, sessionConfig?.journalistFirstName);
  // K4: a name that already holds the entry's own name takes the shorter mark
  const byOwnName = new Set([entry.name, `${first} ${entry.name}`].map(lower));
  const writerNames = new Set([...byOwnName, lower(first)]);
  // A roster player goes by each name given and by its first word: "Cass Zhang" is Cass.
  const players = new Set(rosterNames.filter((name) => typeof name === 'string' && name.trim())
    .flatMap((name) => [lower(name), lower(name).split(/\s+/)[0]]));
  return list.map((name) => {
    if (typeof name !== 'string' || !writerNames.has(lower(name)) || players.has(lower(name))) return name;
    return fill(byOwnName.has(lower(name)) ? entry.writer.inAPhotoByName : entry.writer.inAPhoto, { name });
  });
}

/**
 * The writer in the room, on site only (the final fix wave, K1): SESSION_FACTS names the
 * writer beside Blake among the characters who were in the room, with the theme's line for
 * it (`writer.inTheRoom`), which points at the mode block. Remote, the writer took no part in
 * the room, and SESSION_FACTS is as it was.
 *
 * @param {string} theme
 * @param {Object|null} sessionConfig - its reportingMode, read through isOnSite
 * @returns {{name: string, line: string}|null} null remote, or for a theme with no writer entry
 */
function writerInTheRoom(theme, sessionConfig) {
  const entry = writerEntryOf(theme);
  if (!entry || !isOnSite(sessionConfig)) return null;
  return { name: entry.name, line: entry.writer.inTheRoom };
}

/** A name as the guest reporters' reading keeps it: trimmed, its inner whitespace collapsed. */
const cleanName = (text) => String(text).trim().replace(/\s+/g, ' ');

/** One guest reporter, `{name, firstName, role}`, the first name the name's first word. */
function guestEntry(name, role) {
  const full = cleanName(name);
  return { name: full, firstName: full.split(' ')[0], role: typeof role === 'string' ? role.trim() : '' };
}

/**
 * The session's guest reporters, each apart (phase 17, R5): the one reading every reader
 * calls. `sessionConfig.guestReporters`, the list the parse stamps as `[{name, role}]`, when
 * it is a list. Otherwise an older thread's `sessionConfig.guestReporter`, one `{name, role}`
 * whose name may hold several reporters: the name split on commas, each piece trimmed with
 * its inner whitespace collapsed and blank pieces dropped; the role split on commas and paired
 * by position when the counts match, otherwise taken whole, trimmed, by each reporter. The
 * console's copy (console/input-review-logic.js) is held equal to this one by a test.
 *
 * @param {Object|null} sessionConfig - its guestReporters, else its guestReporter
 * @returns {Array<{name: string, firstName: string, role: string}>} [] with none
 */
function guestReportersOf(sessionConfig) {
  const config = sessionConfig && typeof sessionConfig === 'object' ? sessionConfig : {};
  const named = (entry) => entry && typeof entry === 'object' && typeof entry.name === 'string' && entry.name.trim();
  if (Array.isArray(config.guestReporters)) {
    return config.guestReporters.filter(named).map((entry) => guestEntry(entry.name, entry.role));
  }
  const guest = config.guestReporter;
  if (!named(guest)) return [];
  const names = guest.name.split(',').map(cleanName).filter(Boolean);
  const role = typeof guest.role === 'string' ? guest.role : '';
  const roles = role.split(',');
  return names.map((name, i) => guestEntry(name, roles.length === names.length ? roles[i] : role));
}

/**
 * Names as a sentence lists them: "A", "A and B", "A, B and C". The one rule: the guest
 * reporters' line, the parse's log line and the fact check's messages read it.
 */
function joinedNames(names) {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] || '');
}

/** Whether a reporter's first name is theirs alone among the session's guest reporters. */
function firstNameIsTheirs(reporter, reporters) {
  return reporters.filter((other) => lower(other.firstName) === lower(reporter.firstName)).length === 1;
}

/**
 * The guest reporters' line (R5; the read's section 14): who shares the byline, then for each
 * reporter, that a memory turned in under their name is reporting they filed to Nova for this
 * article, as world.md and C11 say, Nova named from the theme's writer entry. A first name two
 * reporters share names neither, as the mark marks neither.
 *
 * @param {Object|null} sessionConfig
 * @param {string} theme
 * @returns {string|null} null with no guest reporter, or for a theme with no writer entry
 */
function guestReporterLine(sessionConfig, theme) {
  const reporters = guestReportersOf(sessionConfig);
  const entry = writerEntryOf(theme);
  if (reporters.length === 0 || !entry) return null;
  const credits = joinedNames(reporters.map((reporter) => (reporter.role ? `${reporter.name} (${reporter.role})` : reporter.name)));
  const byline = reporters.length === 1
    ? `The guest reporter: ${credits} shares this article's byline.`
    : `The guest reporters: ${credits} share this article's byline.`;
  const turnIns = reporters.map((reporter) => {
    const names = reporter.firstName === reporter.name || !firstNameIsTheirs(reporter, reporters)
      ? reporter.name : `${reporter.name} or ${reporter.firstName}`;
    return `Each memory turned in under the name ${names} is reporting ${reporter.name} filed to ${entry.name} for this article.`;
  });
  return [byline, ...turnIns].join(' ');
}

/**
 * The name on a turn-in, marked as a guest reporter's (R5): "Taylor Chase (the guest
 * reporter)" when it is any reporter's full name, in any case, and "Taylor (the guest
 * reporter, Taylor Chase)" when it is the first name of exactly one reporter.
 *
 * @param {string} name - the name on the turn-in, as written
 * @param {Object|null} sessionConfig
 * @returns {string} the name as written when it is no reporter's, or with no guest reporter
 */
function guestTurnInName(name, sessionConfig) {
  const reporters = guestReportersOf(sessionConfig);
  if (reporters.length === 0 || typeof name !== 'string') return name;
  if (reporters.some((reporter) => lower(name) === lower(reporter.name))) return `${name} (the guest reporter)`;
  const byFirst = reporters.filter((reporter) => lower(name) === lower(reporter.firstName));
  return byFirst.length === 1 ? `${name} (the guest reporter, ${byFirst[0].name})` : name;
}

module.exports = {
  isOnSite,
  reportingModeOf,
  writerFirstNameOf,
  writerSignsLine,
  writerInPhotosLine,
  markWriterInPhoto,
  writerInTheRoom,
  guestReportersOf,
  joinedNames,
  guestReporterLine,
  guestTurnInName
};

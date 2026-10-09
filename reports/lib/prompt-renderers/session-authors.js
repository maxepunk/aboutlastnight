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
 *   entry's name, or the two together) as the article's writer. The roster decides a clash:
 *   a name a roster player has is that player, and stays unmarked.
 * Remote, Nova was outside the warehouse and is in no photo, so the parse and the photo
 * entries are as they were. A theme with no writer entry, such as the parked detective,
 * gets none of these.
 *
 * The guest reporter (R5), only when sessionConfig.guestReporter names one:
 * - guestReporterLine: who shares the byline, and that a memory turned in under their name
 *   is their reporting for this article. SESSION_FACTS, the weave writer's first section and
 *   both judges print it;
 * - guestTurnInName: the record view's timeline marks a turn-in under their full name or
 *   their first name, in any case.
 * A session with no guest reporter prints nothing of either.
 *
 * Pure: no I/O, and nothing passed in is changed.
 */

const { getThemeNPCEntries } = require('../theme-config');

const ON_SITE = 'on-site';

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
  if (!entry || sessionConfig?.reportingMode !== ON_SITE) return null;
  return fill(entry.writer.inPhotos, { first: writerFirstName(entry, sessionConfig.journalistFirstName) });
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
  if (!entry || sessionConfig?.reportingMode !== ON_SITE) return [...list];
  const first = writerFirstName(entry, sessionConfig.journalistFirstName);
  const writerNames = new Set([entry.name, first, `${first} ${entry.name}`].map(lower));
  // A roster player goes by each name given and by its first word: "Cass Zhang" is Cass.
  const players = new Set(rosterNames.filter((name) => typeof name === 'string' && name.trim())
    .flatMap((name) => [lower(name), lower(name).split(/\s+/)[0]]));
  return list.map((name) => (typeof name === 'string' && writerNames.has(lower(name)) && !players.has(lower(name))
    ? fill(entry.writer.inAPhoto, { name })
    : name));
}

/**
 * The session's guest reporter, or null: `{name, firstName, role}` from
 * sessionConfig.guestReporter, which the start form stamps as `{name, role}`.
 *
 * @param {Object|null} sessionConfig
 * @returns {{name: string, firstName: string, role: string}|null}
 */
function guestReporterOf(sessionConfig) {
  const guest = sessionConfig && sessionConfig.guestReporter;
  if (!guest || typeof guest !== 'object' || typeof guest.name !== 'string' || !guest.name.trim()) return null;
  const name = guest.name.trim().replace(/\s+/g, ' ');
  return { name, firstName: name.split(' ')[0], role: typeof guest.role === 'string' ? guest.role.trim() : '' };
}

/**
 * The guest reporter's line (R5): who shares the byline, and that a memory turned in under
 * their name is their reporting for this article.
 *
 * @param {Object|null} sessionConfig
 * @returns {string|null} null with no guest reporter
 */
function guestReporterLine(sessionConfig) {
  const guest = guestReporterOf(sessionConfig);
  if (!guest) return null;
  const role = guest.role ? ` (${guest.role})` : '';
  const names = guest.firstName === guest.name ? guest.name : `${guest.name} or ${guest.firstName}`;
  return `The guest reporter: ${guest.name}${role} shares this article's byline. ` +
    `A memory turned in under the name ${names} is ${guest.name}'s reporting for this article.`;
}

/**
 * The name on a turn-in, marked as the guest reporter's when it is their full name or their
 * first name, in any case (R5): "Taylor (the guest reporter, Taylor Chase)", or
 * "Taylor Chase (the guest reporter)".
 *
 * @param {string} name - the name on the turn-in, as written
 * @param {Object|null} sessionConfig
 * @returns {string} the name as written when it is not theirs, or with no guest reporter
 */
function guestTurnInName(name, sessionConfig) {
  const guest = guestReporterOf(sessionConfig);
  if (!guest || typeof name !== 'string') return name;
  if (lower(name) === lower(guest.name)) return `${name} (the guest reporter)`;
  if (lower(name) === lower(guest.firstName)) return `${name} (the guest reporter, ${guest.name})`;
  return name;
}

module.exports = {
  writerSignsLine,
  writerInPhotosLine,
  markWriterInPhoto,
  guestReporterOf,
  guestReporterLine,
  guestTurnInName
};

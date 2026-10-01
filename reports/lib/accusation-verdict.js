/**
 * The room's verdict, as the parse records it (phase 2, brief 2.2).
 *
 * The parse used to force a defendant: `accused` was the only way to say what the
 * room decided. Session 092026's room voted for an accidental overdose, named no
 * culprit, and the parse wrote `accused: ["Marcus"]`, the victim. Every downstream
 * line then printed the victim as the accused (`ACCUSATION: Marcus`, curation's
 * SUSPECTS, the arc writer's accused list).
 *
 * A verdict now carries its kind. `culprit` is the only kind that names anyone;
 * every other kind leaves `accused` empty, and the parse enforces that in code
 * (normalizeAccusation), not only in the prompt.
 *
 * Phase 3 (brief 3.5; spec T2, section 6) adds two shapes:
 * - A verdict that blames an institution (NeurAI's board) or a person it does not
 *   name is a `culprit` verdict naming no character, with the room's words as the
 *   charge (blamesNoCharacter).
 * - A split final vote keeps every option that drew votes, with its count, and marks
 *   the one the group statement adopted, or none (`votes`, present only for a split).
 */

/** Every verdict kind the parse may return. Order is the schema enum's order. */
const VERDICT_KINDS = ['culprit', 'accident', 'overdose', 'self-harm', 'other'];

/** The kinds that name no culprit. */
const NO_CULPRIT_KINDS = VERDICT_KINDS.filter(kind => kind !== 'culprit');

/**
 * Does this accusation name no culprit?
 *
 * Only an explicit kind says so. A parse written before verdict kinds existed has
 * no kind, and an empty `accused` there means "not parsed", which the input review
 * already flags; it is not read as a no-culprit verdict.
 *
 * @param {Object|null} accusation - sessionConfig.accusation or playerFocus.accusation
 * @returns {boolean}
 */
function isNoCulpritVerdict(accusation) {
  return !!accusation && NO_CULPRIT_KINDS.includes(accusation.verdictKind);
}

/**
 * The accused names as an array of non-empty strings.
 *
 * `accused` may arrive as an array, a single string or nothing at all.
 *
 * @param {Object|null} accusation
 * @returns {string[]}
 */
function accusedNames(accusation) {
  const value = accusation ? accusation.accused : null;
  const list = Array.isArray(value) ? value : (typeof value === 'string' ? [value] : []);
  return list.filter(name => typeof name === 'string' && name.trim()).map(name => name.trim());
}

/**
 * Does this verdict blame someone who is not a character: an institution such as
 * NeurAI's board, or a person the room did not name?
 *
 * That is a `culprit` verdict with no character in `accused`; the room's words for
 * who it blamed are the charge. A parse from before verdict kinds is never read this
 * way: its empty `accused` means "not parsed".
 *
 * @param {Object|null} accusation
 * @returns {boolean}
 */
function blamesNoCharacter(accusation) {
  return !!accusation && accusation.verdictKind === 'culprit' && accusedNames(accusation).length === 0;
}

/**
 * The split final vote, cleaned: each option with a name and a count, at most one
 * marked adopted, and at least two options (one option is not a split).
 *
 * @param {*} votes - the parse's votes
 * @returns {Array<{option: string, count: number, adopted: boolean}>|null} null when there is no split
 */
function normalizeVotes(votes) {
  if (!Array.isArray(votes)) return null;
  let adoptedSeen = false;
  const clean = votes
    .filter((v) => v && typeof v.option === 'string' && v.option.trim() && typeof v.count === 'number' && Number.isFinite(v.count))
    .map((v) => {
      const adopted = v.adopted === true && !adoptedSeen;
      if (adopted) adoptedSeen = true;
      return { option: v.option.trim(), count: v.count, adopted };
    });
  if (votes.filter((v) => v && v.adopted === true).length > 1) {
    console.warn('[normalizeAccusation] more than one vote option marked adopted; kept the first');
  }
  return clean.length >= 2 ? clean : null;
}

/**
 * The parse's accusation with the verdict rules applied in code.
 *
 * A no-culprit verdict has no accused, whatever the model put there: on 092026 the
 * model listed the victim. A kind the schema does not know is dropped rather than
 * trusted. A culprit verdict with no character named (an institution, an unnamed
 * person) is kept as it is. `votes` stays only for a split final vote.
 *
 * @param {Object|null} accusation - Step 1's parsed accusation
 * @returns {Object|null} the same object shape, never with the victim as accused
 */
function normalizeAccusation(accusation) {
  if (!accusation || typeof accusation !== 'object') return accusation || null;
  const normalized = { ...accusation };
  if (normalized.verdictKind !== undefined && !VERDICT_KINDS.includes(normalized.verdictKind)) {
    console.warn(`[normalizeAccusation] unknown verdictKind "${normalized.verdictKind}"; dropped`);
    delete normalized.verdictKind;
  }
  if (isNoCulpritVerdict(normalized)) {
    const dropped = accusedNames(normalized);
    if (dropped.length > 0) {
      console.warn(`[normalizeAccusation] verdict "${normalized.verdictKind}" names no culprit; dropped accused ${JSON.stringify(dropped)}`);
    }
    normalized.accused = [];
  }
  if ('votes' in normalized) {
    const votes = normalizeVotes(normalized.votes);
    if (votes) normalized.votes = votes;
    else delete normalized.votes;
  }
  return normalized;
}

/**
 * The director's accusation, word for word, for a writer.
 *
 * Stored with the parse (sessionConfig.accusationRaw, stamped by parseRawInput and
 * written to inputs/session-config.json). The `accusation` channel covers a parse
 * written before that field existed; it holds the same text until a rollback that
 * re-collects it.
 *
 * @param {Object} state
 * @returns {string|null}
 */
function directorAccusationText(state) {
  const stored = state?.sessionConfig?.accusationRaw;
  if (typeof stored === 'string' && stored.trim()) return stored;
  const channel = state?.accusation;
  return typeof channel === 'string' && channel.trim() ? channel : null;
}

module.exports = {
  VERDICT_KINDS,
  NO_CULPRIT_KINDS,
  isNoCulpritVerdict,
  blamesNoCharacter,
  accusedNames,
  normalizeVotes,
  normalizeAccusation,
  directorAccusationText
};

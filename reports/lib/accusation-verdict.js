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
 * The parse's accusation with the no-culprit rule applied in code.
 *
 * A no-culprit verdict has no accused, whatever the model put there: on 092026 the
 * model listed the victim. A kind the schema does not know is dropped rather than
 * trusted.
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
  accusedNames,
  normalizeAccusation,
  directorAccusationText
};

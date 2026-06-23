/**
 * await-roster-logic.js — pure, dual-export logic for the AwaitRoster checkpoint.
 *
 * Browser: registers on window.Console.awaitRosterLogic.
 * Node: module.exports (unit-tested in node-env; reports/CLAUDE.md console rule —
 *       no DOM/React harness, so pure logic lives here and the React component
 *       is a thin consumer verified manually).
 *
 * F1 capture-layer fix: director pronouns only resolve when roster entries match
 * canonicalCharacters keys (firstName -> fullName, all 20 player characters from
 * Notion). These helpers validate a typed entry and surface the known set so the
 * UI can elicit CHARACTER names, suggest them, and warn (never block) on misses.
 */
(function () {
  /**
   * Validate a roster entry against the canonical character map.
   *
   * Match order mirrors normalizeRosterPronounsToCanonical (X-1) semantics:
   *   1. exact canonical key, case-insensitive  (e.g. 'sarah' -> 'Sarah')
   *   2. typed string equals a canonical full-name value, case-insensitive/trimmed
   *   3. otherwise no match.
   *
   * Prototype-safe: uses Object.keys(...).find, never bare map[name].
   *
   * @param {string} name - the typed roster entry
   * @param {Object|null} canonicalCharacters - firstName -> fullName map
   * @returns {{ matched: boolean, canonical: (string|null) }}
   */
  function validateRosterEntry(name, canonicalCharacters) {
    const map = canonicalCharacters || {};
    const typed = String(name == null ? '' : name).trim();
    if (!typed) return { matched: false, canonical: null };

    const lower = typed.toLowerCase();

    // 1. exact canonical key, case-insensitive
    const keyMatch = Object.keys(map).find(function (k) { return k.toLowerCase() === lower; });
    if (keyMatch) return { matched: true, canonical: map[keyMatch] };

    // 2. typed string equals a canonical full-name value (case-insensitive, trimmed)
    const valueMatchKey = Object.keys(map).find(function (k) {
      return String(map[k] == null ? '' : map[k]).trim().toLowerCase() === lower;
    });
    if (valueMatchKey) return { matched: true, canonical: map[valueMatchKey] };

    return { matched: false, canonical: null };
  }

  /**
   * Produce a sorted list of known characters for one-click suggestion chips.
   *
   * @param {Object|null} canonicalCharacters - firstName -> fullName map
   * @returns {Array<{ first: string, full: string }>} sorted by first (localeCompare)
   */
  function knownCharacterList(canonicalCharacters) {
    const map = canonicalCharacters || {};
    return Object.keys(map)
      .map(function (first) { return { first: first, full: map[first] }; })
      .sort(function (a, b) { return a.first.localeCompare(b.first); });
  }

  const api = { validateRosterEntry, knownCharacterList };

  if (typeof window !== 'undefined') {
    window.Console = window.Console || {};
    window.Console.awaitRosterLogic = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();

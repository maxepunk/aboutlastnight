/**
 * input-review-logic.js — pure, dual-export logic for the InputReview checkpoint.
 *
 * Browser: registers on window.Console.inputReviewLogic.
 * Node: module.exports (unit-tested in node-env; reports/CLAUDE.md console rule —
 *       no DOM/React harness, so pure logic lives here and the React component
 *       is a thin consumer verified manually).
 */
(function () {
  /**
   * Resolve a character's pronouns for display at the input-review gate.
   * Tolerant of case divergence between the parsed roster name and the
   * (canonical-keyed, post-X-1) pronoun map; defaults to they/them.
   *
   * @param {string} name - roster name as parsed into sessionConfig.roster
   * @param {Object|null} rosterPronouns - canonical-first-name-keyed pronoun map
   * @returns {string} pronoun string, or 'they/them'
   */
  function resolveRosterPronoun(name, rosterPronouns) {
    const map = rosterPronouns || {};
    if (Object.prototype.hasOwnProperty.call(map, name)) return map[name];
    const lower = String(name).toLowerCase();
    const key = Object.keys(map).find(k => k.toLowerCase() === lower);
    return key ? map[key] : 'they/them';
  }

  const api = { resolveRosterPronoun };

  if (typeof window !== 'undefined') {
    window.Console = window.Console || {};
    window.Console.inputReviewLogic = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();

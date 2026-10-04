/**
 * What counts as a word, for every length the pipeline holds an output to: a run of
 * text between whitespace that holds a letter or a digit, so a lone dash or bullet is
 * not a word.
 *
 * Phase 4: the weave's bound (lib/weave.js, brief 4.4) and the article's length check
 * (content-bundle-fact-check.js, brief 4.7a) count by it, so the two lengths are counted
 * one way.
 */

/**
 * @param {*} text
 * @returns {number}
 */
function wordCount(text) {
  return String(text == null ? '' : text).split(/\s+/).filter(w => /[A-Za-z0-9]/.test(w)).length;
}

module.exports = { wordCount };

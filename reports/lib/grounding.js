/**
 * Grounding: whether a piece of text is the director's words, word for word.
 *
 * One rule, shared by the notes step (lib/director-enricher.js), which keeps a
 * quote, a context, a correction, an epilogue item or a link's observation only
 * when the director's words hold it, and by the notes renderer
 * (lib/prompt-renderers/director-notes-renderer.js), which prints a stored context,
 * correction or epilogue sentence as the director's words only when they hold it.
 * It lives here so a prompt renderer does not load the model-calling notes step to
 * ask the question (phase 3, 3.6 fix).
 */

/**
 * Normalize for substring comparison: curly quotes to straight, dashes to a
 * hyphen, runs of whitespace to one space. A quote the model retyped with a
 * different dash or line wrap is still the director's quote.
 *
 * @param {*} value
 * @returns {string}
 */
function normalizeForGrounding(value) {
  return String(value || '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    // A quote the model retyped with an em-dash where the prose has a hyphen was
    // being DROPPED as ungrounded.
    .replace(/[–—-]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Whether `fragment` is in `source` word for word, under normalizeForGrounding.
 *
 * @param {string} fragment
 * @param {string} source
 * @returns {boolean}
 */
function isVerbatimIn(fragment, source) {
  const piece = normalizeForGrounding(fragment);
  return piece.length > 0 && normalizeForGrounding(source).includes(piece);
}

module.exports = { normalizeForGrounding, isVerbatimIn };

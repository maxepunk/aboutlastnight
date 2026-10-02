/**
 * Grounding: whether a piece of text is the director's words, word for word, and
 * whether the director's words name a quote's speaker.
 *
 * Two rules, shared by the notes step (lib/director-enricher.js), which keeps a
 * quote, a context, a correction, an epilogue item or a link's observation only
 * when the director's words hold it, and a quote's speaker and addressee only when
 * those words name them, and by the notes renderer
 * (lib/prompt-renderers/director-notes-renderer.js), which prints a stored context,
 * correction, epilogue sentence or speaker by the same rules (task 3.11 for the
 * speaker). They live here so a prompt renderer does not load the model-calling notes
 * step to ask the question (phase 3, 3.6 fix).
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

/** Words in a name that name no one ("the Valet" is named by "Valet"). */
const NAME_FILLER = new Set(['the', 'a', 'an', 'and', 'of', 'to', 'mr', 'ms', 'mrs', 'dr']);

/**
 * Whether one of `sources` names `name` in the director's own words: a word of the
 * name, matched whole and in any case, outside the quoted words themselves. A line
 * such as "Oh, Sam exposed everything." names Sam without saying who spoke it.
 *
 * @param {string} name - a speaker or addressee
 * @param {string[]} sources - the quote's context and correction
 * @param {string} quoteText - the quoted words, which never count as naming
 * @returns {boolean}
 */
function namedOutsideQuote(name, sources, quoteText) {
  const words = (String(name || '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [])
    .filter(word => word.length >= 2 && !NAME_FILLER.has(word.toLowerCase()));
  if (words.length === 0) return false;
  const quoted = normalizeForGrounding(quoteText);
  return sources.some(source => {
    const outside = quoted ? normalizeForGrounding(source).split(quoted).join(' ') : normalizeForGrounding(source);
    return words.some(word => {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(outside);
    });
  });
}

module.exports = { normalizeForGrounding, isVerbatimIn, namedOutsideQuote };

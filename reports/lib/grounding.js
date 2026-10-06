/**
 * Grounding: whether a piece of text is the director's words, word for word, and
 * whether the director's words name a quote's speaker; the one rule of what a quoted
 * span is (QUOTED_SPANS, phase 4b brief 1B), which the article fact check and the
 * evidence module (lib/evidence.js) both read; and the one rule of where a quoted passage
 * splits at an elision (ELISION), which the evidence module and the edits' guard
 * (lib/hand-edit-diff.js) both read.
 *
 * Shared by the notes step (lib/director-enricher.js), which keeps a quote, a context, a
 * correction, an epilogue item or a link's observation only when the director's words
 * hold it, and a quote's speaker and addressee only when those words name them, and by
 * the notes renderer (lib/prompt-renderers/director-notes-renderer.js), which prints a
 * stored context, correction, epilogue sentence or speaker by the same rules (task 3.11
 * for the speaker). A quote's names are decided by one function, groundQuote, which both
 * call (final review, data-harness-docs[1]). The rules live here so a prompt renderer
 * does not load the model-calling notes step to ask the question (phase 3, 3.6 fix).
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

/**
 * The passages a piece of text quotes, normalized as isVerbatimIn reads them: each in
 * double quotation marks, and each in single quotation marks (final review,
 * data-harness-docs[1]: a director writes a correction either way). A single quotation
 * mark opens after a character that is not a letter or a digit and closes before one,
 * so an apostrophe inside a word ("wasn't", "Vic's") quotes nothing.
 *
 * @param {*} value
 * @returns {string[]}
 */
function quotedPassages(value) {
  const text = normalizeForGrounding(value);
  const double = text.match(/"[^"]+"/g) || [];
  const single = text.match(/(?<![\p{L}\p{N}])'(?:[^']|(?<=[\p{L}\p{N}])'(?=[\p{L}\p{N}]))+'(?![\p{L}\p{N}])/gu) || [];
  return [...double, ...single]
    .map(passage => passage.slice(1, -1).trim())
    .filter(Boolean);
}

/** A letter or digit, accented Latin ones included (exposé's): what stands either side of an apostrophe in a word. */
const LETTER_OR_DIGIT = '[0-9A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u024F]';
/** Double quotation marks, straight or curly, each read as any other: a span runs from one to the next. */
const DOUBLE_QUOTED = '["“”][^"“”\\n]*["“”]';
/** A single mark that opens a span: after no letter or digit, before a non-space. A curly ’ never opens. */
const SINGLE_OPENING = `(?<!${LETTER_OR_DIGIT})['‘](?=\\S)`;
/** A single mark that can close a span: after a non-space, before no letter or digit. A curly ‘ never closes. */
const SINGLE_CLOSING = `(?<=\\S)['’](?!${LETTER_OR_DIGIT})`;
/** A single mark after a plural (the players' votes): an s before it, a word after it on its line. */
const AFTER_PLURAL = `(?<=[sS])['’](?=[^\\S\\n]+${LETTER_OR_DIGIT})`;
/** A closing mark the rule reads as a close: one not after a plural. */
const SINGLE_ENDING = `(?!${AFTER_PLURAL})${SINGLE_CLOSING}`;
/**
 * A single-quoted span: an opening mark, then its line up to the first ending mark, or, with none
 * on the line, up to the last mark after a plural. So a mark before a shortened word ('90s) with a
 * plural's mark later on its line masks every word between them, the narrator's included: a known
 * limit, in the readers' direction, pinned by test.
 */
const SINGLE_QUOTED = `${SINGLE_OPENING}(?:(?:(?!${SINGLE_ENDING})[^\\n])*${SINGLE_ENDING}|[^\\n]*${AFTER_PLURAL})`;

/**
 * The one rule of what a quoted span is (briefs 4.10e and 4.10f): someone else's words. Its
 * readers are the article fact check's narrator checks (lib/content-bundle-fact-check.js, where it
 * was written: stripQuotedSpans, maskQuotedSpans and PRINTED_GAP), and since phase 4b (brief 1B)
 * the story-terms check on a writer's line at the story meeting and on the map, and the evidence
 * check's reading of a quotation in a piece (lib/evidence.js), so an apostrophe in a name or a
 * possessive is never a quotation anywhere.
 *
 * No span crosses a line's end. A span in double quotation marks, straight or curly, runs from
 * one mark to the next (DOUBLE_QUOTED). A span in single quotation marks, straight or curly
 * (SINGLE_QUOTED), is told from an apostrophe by where each mark stands, since the writers quote
 * speech in straight single marks too ('She means nothing to me.'):
 *   - in a word (Kai's, don't, o'clock) a mark is an apostrophe: it neither opens nor closes;
 *   - after a plural (the players' votes) a mark is an apostrophe while another mark on its line
 *     can close the span, and closes it when none can;
 *   - before a shortened word ('90s) a mark stands where an opening mark does, so it opens a span
 *     only when a closing mark follows on its line.
 * Where the rule cannot tell, it errs as the fact check does, toward not flagging: it reads the
 * span. It is global: read it with String#match, #matchAll or #replace, which start each scan at
 * the text's beginning.
 */
const QUOTED_SPANS = new RegExp(`(?:${DOUBLE_QUOTED}|${SINGLE_QUOTED})`, 'g');

/**
 * Where a quoted passage splits at an elision: "...", an ellipsis, either in brackets, with the
 * space around it. A passage with words left out is read as its parts, each word for word on its
 * own. The one rule for every reader that splits a quotation so (phase 4b fix round, fix 4): the
 * guard's locating of a finding's quotes (lib/hand-edit-diff.js locateQuotedText) and the evidence
 * check's reading of a quotation in a piece (lib/evidence.js). The console, which cannot require
 * this module, keeps a copy (console/checkpoint-view-logic.js ELISION), held to the guard by a
 * test on a corpus of findings.
 */
const ELISION = /\s*(?:\[\s*(?:\.{3}|…)\s*\]|\.{3}|…)\s*/;

/**
 * The fewest words in a sentence that can name a line (task 3.11, fix round 1). A name
 * or a vote word the line says whole ("Blake.", "No.") has fewer, and corrections quote
 * names and vote words as often as lines.
 */
const MIN_LINE_SENTENCE_WORDS = 3;

/**
 * The sentences of a line that can name it: each whole sentence, normalized as
 * isVerbatimIn reads it, without the quotation marks and brackets around it or its
 * closing punctuation, and holding at least MIN_LINE_SENTENCE_WORDS words.
 *
 * @param {string} line - a quote's words, or a passage its context quotes
 * @returns {string[]}
 */
function lineSentences(line) {
  return normalizeForGrounding(line)
    .split(/(?<=[.!?]["')\]]*)\s+/)
    .map(sentence => sentence.replace(/^["'(\[]+/, '').replace(/[.!?,;:"')\]]+$/, ''))
    .filter(sentence => (sentence.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) || []).length >= MIN_LINE_SENTENCE_WORDS);
}

/**
 * Whether `fragment` holds `sentence` word for word, in any case (final review,
 * data-harness-docs[1]), starting and ending on word boundaries ("no" is not in "know").
 *
 * @param {string} fragment - a passage a correction quotes, or a paragraph of the notes, normalized
 * @param {string} sentence - one of lineSentences
 * @returns {boolean}
 */
function holdsWholeSentence(fragment, sentence) {
  const escaped = sentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(fragment);
}

/**
 * Whether a director's correction is about this quote (task 3.11): one of the
 * passages it quotes holds a whole sentence of the quote's words, or of the passage
 * the quote's context quotes. 092026's correction quotes "My company is very
 * interesting", a sentence of the passage its context quotes. Corrections are about
 * the roster, the accusation, names and votes as often as about quotes (fix round 1):
 * a name, a vote word, a short phrase or a charge sits inside a sentence, or is a whole
 * line shorter than MIN_LINE_SENTENCE_WORDS, so it never decides.
 *
 * @param {string} correction - one of the director's input-review corrections
 * @param {string} words - the quote's words
 * @param {string|null} context - the quote's context
 * @returns {boolean}
 */
function correctionQuotesTheLine(correction, words, context) {
  const sentences = [words, ...quotedPassages(context)].flatMap(lineSentences);
  return quotedPassages(correction).some(fragment =>
    sentences.some(sentence => holdsWholeSentence(fragment, sentence)));
}

/**
 * The paragraphs of the director's notes that hold one of these sentences whole: the
 * notes' own account of where a line was said, and by whom.
 *
 * @param {string[]} sentences - lineSentences of a line and the passages that quote it
 * @param {string} rawProse - the director's notes
 * @returns {string[]}
 */
function notesParagraphsHolding(sentences, rawProse) {
  if (sentences.length === 0) return [];
  return String(rawProse || '').split(/\n+/).filter(paragraph => {
    const text = normalizeForGrounding(paragraph);
    return text !== '' && sentences.some(sentence => holdsWholeSentence(text, sentence));
  });
}

/** A field as text: the string when it holds more than whitespace, else null. */
function textOf(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * A quote as the director's words hold it: the one rule for the notes step
 * (director-enricher.js groundQuotes), which stores a quote, and the notes renderer
 * (director-notes-renderer.js quoteEntry), which prints a stored one (final review,
 * data-harness-docs[1]; T12: a line in the wrong mouth changes the story).
 *
 * - The context counts only when the notes hold it word for word, and the correction
 *   only when one of the director's corrections holds it.
 * - The speaker and the addressee are decided alike, each by the director's words
 *   outside the quoted words (namedOutsideQuote). "unknown", which the enricher before
 *   3.6 wrote, names no one.
 * - An attached correction that none of the director's corrections hold says the
 *   director changed the quote, with nothing code can read the change from: no name is
 *   kept.
 * - A director's correction is about the quote when it is attached and held, or when it
 *   quotes a whole sentence of the line (correctionQuotesTheLine). It names the old
 *   speaker as well as the new ("attributed to Vic ... said by Blake"), so a name is
 *   kept only when such a correction names it and the notes' account of the line does
 *   not: the name the correction brings in. The notes' account is the context and every
 *   paragraph of the notes that holds a sentence of the line, so a context the notes do
 *   not hold, or one that leaves out who spoke, cannot let the corrected-away name
 *   through. With no account of the line at all, no name is kept.
 * - With no correction about the quote, a name the context gives is kept.
 *
 * @param {Object} quote - {speaker?, addressee?, text, context?, correction?}
 * @param {string} rawProse - the director's notes
 * @param {string[]} corrections - the director's input-review corrections
 * @returns {{context: string|null, correction: string|null, correctionFailed: boolean,
 *            speaker: string|null, addressee: string|null}}
 */
function groundQuote(quote, rawProse, corrections) {
  const q = quote && typeof quote === 'object' ? quote : {};
  const words = textOf(q.text) || '';
  const directorsCorrections = (Array.isArray(corrections) ? corrections : []).filter(textOf);
  const context = textOf(q.context) && isVerbatimIn(q.context, rawProse) ? q.context : null;
  const correction = textOf(q.correction) && directorsCorrections.some(c => isVerbatimIn(q.correction, c)) ? q.correction : null;
  const correctionFailed = Boolean(textOf(q.correction) && !correction);
  const about = [correction, ...directorsCorrections.filter(c => correctionQuotesTheLine(c, words, context))].filter(Boolean);
  const notesAccount = about.length === 0
    ? [context].filter(Boolean)
    : [context, ...notesParagraphsHolding(
      [words, ...quotedPassages(context), ...about.flatMap(quotedPassages)].flatMap(lineSentences), rawProse
    )].filter(Boolean);
  const recorded = (name) => {
    const value = textOf(name) ? name.trim() : null;
    if (!value || value.toLowerCase() === 'unknown' || correctionFailed) return null;
    if (about.length === 0) return namedOutsideQuote(value, notesAccount, words) ? value : null;
    return notesAccount.length > 0 && namedOutsideQuote(value, about, words) && !namedOutsideQuote(value, notesAccount, words)
      ? value
      : null;
  };
  return { context, correction, correctionFailed, speaker: recorded(q.speaker), addressee: recorded(q.addressee) };
}

module.exports = { normalizeForGrounding, isVerbatimIn, namedOutsideQuote, quotedPassages, groundQuote, QUOTED_SPANS, ELISION };

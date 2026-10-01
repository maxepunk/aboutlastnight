/**
 * The removed-phrase list (phase 3, task 3.1; spec 2026-09-30-rule-set.md section 7).
 *
 * Phrases and patterns the pipeline's own instruction text must not carry: the rule
 * files, inline prompt text, schema descriptions and labels. The director's words and
 * the record reach every call as written, and they may say what this list removes
 * (092026's notes say "the murder investigation" and "the black market"; 092626's
 * verdict is murder): none of that is a defect. So a scan runs on `instructionText`,
 * which strips the director's words and <RECORD> first.
 *
 * Strings match case-insensitively. Where today's prompts word a spec phrase
 * differently, a pattern beside it catches today's wording, so a scan of a render
 * shows whether the line is really gone.
 *
 * Owned by the integrator from 3.1 on: a slice that removes another phrase reports
 * it, and the integrator adds it here.
 *
 * Not a test file (jest's testMatch is *.test.js).
 */

const GENDERED = '(?:she|her|hers|herself|he|him|his|himself)';
/** A clause ends at sentence punctuation, a comma, a bracket, a dash or a line break. */
const IN_CLAUSE = '[^.;:!?,()\\n\\u2013\\u2014]*';

const REMOVED_PHRASES = [
  // Spec section 7.
  // The lede formula's murder hint.
  'hint at both the murder AND the systemic critique',
  // The convergence spent mid-STORY.
  'resolution cascade',
  // Nova's self-implication; today's character-voice.md says it as the pattern.
  'no better than the sellers',
  /same moral level as the people who took/i,
  'empathy for buriers',
  // Blake's fixed beat; today's text has an em-dash where the spec has a comma.
  /Blake wasn't cruel or threatening/i,
  'End the Blake beat with the tension unresolved',
  // The fixed "preserve, do not regenerate" lines of the rework rules, as worded today:
  // "Do NOT regenerate from scratch", "(to improve, not regenerate)",
  // "PRESERVE everything that's working well".
  /\bnot regenerate\b/i,
  /\bPRESERVE everything that's working\b/i,
  // Modelled phrases that turned into tics.
  'the shape of the silence',

  // The murder framing, exactly as the spec names it.
  'the murder victim',
  'hint at the murder',
  'the murder revelation',
  'who killed Marcus',

  // Exposed memories reach Nova by turn-in, never as tips (plan review I6): the
  // brief's "exposures reached you as tips", and today's remote block, "Every exposure,
  // observation, and the verdict reached you as tips".
  /\bexposures?\b[^.;\n]*\breached (?:you|Nova) as tips\b/i,

  // Nova and a gendered pronoun in one clause (T9).
  new RegExp(`\\bNova\\b${IN_CLAUSE}\\b${GENDERED}\\b|\\b${GENDERED}\\b${IN_CLAUSE}\\bNova\\b`, 'i')
];

/** Blocks that hold the director's words or the record, whole. */
const WHOLE_BLOCKS = [
  'RECORD',
  'DIRECTOR_NOTES',
  'DIRECTOR_CORRECTIONS',
  'DIRECTOR_ACCUSATION',
  'DIRECTOR_GUIDANCE',
  'HAND_EDITS',
  'EPILOGUE',
  'POST_INVESTIGATION_NEWS'
];

/** Blocks whose label is instruction text and whose "- " lines are the director's words. */
const LISTED_BLOCKS = ['QUOTE_BANK', 'TRANSACTION_LINKS'];

/**
 * A render's instruction text: the render with the director's words and <RECORD>
 * taken out.
 *
 * Taken out: the whole of each WHOLE_BLOCKS tag; the "- " lines inside each
 * LISTED_BLOCKS tag (their labels stay); the director's send-back note after
 * "HUMAN FEEDBACK (HIGHEST PRIORITY):", up to the next blank line; and the text after
 * "The director's description" on a photo line. Each tag pair stays, empty, so a scan
 * still sees where it was.
 *
 * @param {string} render - a rendered prompt, system and user
 * @returns {string}
 */
function instructionText(render) {
  let text = String(render || '');
  for (const tag of WHOLE_BLOCKS) {
    text = text.replace(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'g'), `<${tag}></${tag}>`);
  }
  for (const tag of LISTED_BLOCKS) {
    text = text.replace(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'g'),
      (block) => block.replace(/^- .*$/gm, '-'));
  }
  text = text.replace(/(HUMAN FEEDBACK \(HIGHEST PRIORITY\):\n)[\s\S]*?(?=\n\n|$)/g, '$1');
  text = text.replace(/(The director's description[^:\n]*:).*$/gm, '$1');
  return text;
}

/**
 * The entries of REMOVED_PHRASES that `text` carries. Scan `instructionText(render)`,
 * not the raw render.
 *
 * @param {string} text
 * @returns {Array<string|RegExp>}
 */
function findRemovedPhrases(text) {
  const haystack = String(text || '');
  const lower = haystack.toLowerCase();
  return REMOVED_PHRASES.filter((entry) => (typeof entry === 'string'
    ? lower.includes(entry.toLowerCase())
    : entry.test(haystack)));
}

module.exports = { REMOVED_PHRASES, instructionText, findRemovedPhrases };

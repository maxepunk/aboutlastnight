/**
 * The removed-phrase list (phase 3, task 3.1; spec 2026-09-30-rule-set.md section 7).
 *
 * Phrases and patterns the pipeline's own instruction text must not carry: the rule
 * files, inline prompt text, schema descriptions and labels. The director's words and
 * the record reach every call as written, and they may say what this list removes
 * (092026's notes say "the murder investigation" and "the black market"; 092626's
 * verdict is murder): none of that is a defect. Nor is a model's output that a prompt
 * carries as data. So a scan runs on `instructionText`, which keeps only the pipeline's
 * own instructions.
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
  'HAND_EDITS',
  'EPILOGUE',
  'POST_INVESTIGATION_NEWS'
];

/** Blocks whose label is instruction text and whose "- " lines are the director's words. */
const LISTED_BLOCKS = ['QUOTE_BANK', 'TRANSACTION_LINKS'];

/**
 * The pipeline's own lines in <DIRECTOR_GUIDANCE> (buildDirectorGuidanceSection and
 * formatGateNotes in lib/prompt-builder.js). The director's arc-stop guidance follows
 * GUIDANCE_LABEL_END and runs to STANDING_NOTES_PREAMBLE or the block's end. The
 * preamble's lines are the pipeline's; the director's notes are the GATE_NOTE_LINE lines
 * after it, to the block's end.
 */
const GUIDANCE_LABEL_END = 'It outranks the craft rules above where they conflict:';
const STANDING_NOTES_PREAMBLE = 'Standing notes the director gave at earlier stops';
const GATE_NOTE_LINE = /^- \[[^\]\n]+\] /m;

/** buildRevisionContext (node-helpers.js): the director's send-back note runs from SEND_BACK_HEAD to SEND_BACK_END. */
const SEND_BACK_HEAD = 'HUMAN FEEDBACK (HIGHEST PRIORITY):\n';
const SEND_BACK_END = 'NOTE: The human reviewer has explicitly requested these changes.';

/**
 * buildRevisionContext's previous version: a header line and a rule, the version, then
 * a rule and "END PREVIOUS OUTPUT".
 */
const PREVIOUS_HEAD = /^PREVIOUS [^\n]* OUTPUT\b[^\n]*:\n═+$/gm;
const PREVIOUS_VERSION = /^(PREVIOUS [^\n]* OUTPUT\b[^\n]*:\n═+\n)[\s\S]*?(\n═+\nEND PREVIOUS OUTPUT)$/gm;

/**
 * The lines a model's output follows as one pretty-printed JSON value (JSON.stringify
 * with an indent: the value opens and closes on a line of its own).
 */
const MODEL_OUTPUT_LABELS = new Set([
  // the article writer and reworker
  'APPROVED OUTLINE:',
  // the outline writer and reworker: the arcs, then the rest of the arc analysis
  '<arc-metadata>',
  '<arc-analysis>',
  // the interweaving call
  '## GENERATED ARCS',
  // the arc reworker
  '### PREVIOUS INTERWEAVING PLAN',
  // the judges
  'ARCS:',
  'OUTLINE:',
  'SELECTED ARCS (with interweaving metadata):',
  'INTERWEAVING PLAN (from arc analysis):',
  'CONTENT BUNDLE:'
]);

/**
 * The whiteboard reading's heading: today's "### Whiteboard Connections (...)", and
 * "### The Whiteboard (...)" from task 3.5 on. The reading runs to the next blank line.
 */
const WHITEBOARD_HEADING = /^### (?:Whiteboard Connections|The Whiteboard)\b/;

const blockPattern = (tag) => new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'g');

/** A <DIRECTOR_GUIDANCE> block with the pipeline's lines kept and the director's taken out. */
function guidanceLabels(block) {
  const open = '<DIRECTOR_GUIDANCE>';
  const close = '</DIRECTOR_GUIDANCE>';
  let inner = block.slice(open.length, block.length - close.length);
  if (inner.trim() && !inner.includes(GUIDANCE_LABEL_END) && !inner.includes(STANDING_NOTES_PREAMBLE)) {
    throw new Error(
      `instructionText: a <DIRECTOR_GUIDANCE> block with neither "${GUIDANCE_LABEL_END}" nor ` +
      `"${STANDING_NOTES_PREAMBLE}"; the director's words in it cannot be told from the pipeline's`
    );
  }
  const labelAt = inner.indexOf(GUIDANCE_LABEL_END);
  if (labelAt >= 0) {
    const guidanceAt = labelAt + GUIDANCE_LABEL_END.length;
    const notesAt = inner.indexOf(STANDING_NOTES_PREAMBLE, guidanceAt);
    inner = inner.slice(0, guidanceAt) + (notesAt >= 0 ? `\n\n${inner.slice(notesAt)}` : '\n');
  }
  const noteAt = inner.search(GATE_NOTE_LINE);
  if (noteAt >= 0) inner = `${inner.slice(0, noteAt)}-\n`;
  return `${open}${inner}${close}`;
}

/** Every paragraph of each send-back note taken out, the pipeline's lines around it kept. */
function stripSendBackNotes(text) {
  let out = '';
  let rest = text;
  for (let at = rest.indexOf(SEND_BACK_HEAD); at >= 0; at = rest.indexOf(SEND_BACK_HEAD)) {
    const noteAt = at + SEND_BACK_HEAD.length;
    const endAt = rest.indexOf(SEND_BACK_END, noteAt);
    if (endAt < 0) {
      throw new Error(
        `instructionText: a send-back note with no "${SEND_BACK_END}" line after it; where the director's words end is unknown`
      );
    }
    out += `${rest.slice(0, noteAt)}\n`;
    rest = rest.slice(endAt);
  }
  return out + rest;
}

/** Each previous version a rework shows taken out, its header and end kept. */
function stripPreviousVersions(text) {
  const heads = (text.match(PREVIOUS_HEAD) || []).length;
  let stripped = 0;
  const out = text.replace(PREVIOUS_VERSION, (match, head, end) => {
    stripped += 1;
    return `${head}${end}`;
  });
  if (stripped !== heads) {
    throw new Error('instructionText: a previous version with no "END PREVIOUS OUTPUT" line after it; where the model\'s output ends is unknown');
  }
  return out;
}

/**
 * The JSON value after each MODEL_OUTPUT_LABELS line taken out, its brackets kept. A
 * label followed by anything else stays as it is.
 */
function stripModelOutputJson(text) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    out.push(lines[i]);
    if (!MODEL_OUTPUT_LABELS.has(lines[i])) continue;
    let open = i + 1;
    while (open < lines.length && lines[open] === '') open += 1;
    if (lines[open] !== '{' && lines[open] !== '[') continue;
    const closer = lines[open] === '{' ? '}' : ']';
    let close = open + 1;
    while (close < lines.length && lines[close] !== closer) close += 1;
    if (close === lines.length) {
      throw new Error(`instructionText: the JSON after "${lines[i]}" never closes; where the model's output ends is unknown`);
    }
    out.push(...lines.slice(i + 1, open), lines[open], closer);
    i = close;
  }
  return out.join('\n');
}

/** Each whiteboard reading's values taken out, its labels kept. */
function stripWhiteboardReadings(text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (!WHITEBOARD_HEADING.test(lines[i])) continue;
    for (i += 1; i < lines.length && lines[i] !== ''; i += 1) {
      lines[i] = lines[i].replace(/^(\*\*[^*\n]+:\*\*).*$/, '$1').replace(/^- .*$/, '-');
    }
  }
  return lines.join('\n');
}

/**
 * A render's instruction text: the render with everything but the pipeline's own
 * instructions taken out.
 *
 * Taken out:
 * - the director's words and the record: the whole of each WHOLE_BLOCKS tag; the "- "
 *   lines inside each LISTED_BLOCKS tag; the director's guidance and notes inside
 *   <DIRECTOR_GUIDANCE>; every paragraph of the send-back note after "HUMAN FEEDBACK
 *   (HIGHEST PRIORITY):", up to the pipeline's "NOTE: The human reviewer" line; and the
 *   text after "The director's description" on a photo line;
 * - a model's output the prompt carries as data: the previous version a rework shows,
 *   the JSON after each MODEL_OUTPUT_LABELS line (the approved outline, the arcs and the
 *   rest of the arc analysis, the plans, the content bundle) and the whiteboard
 *   reading's values.
 *
 * Kept: every label, the ones inside <DIRECTOR_GUIDANCE> included, so a scan reads them.
 * Each tag pair and bracket pair stays, empty, so a scan still sees where it was.
 *
 * @param {string} render - a rendered prompt, system and user
 * @returns {string}
 * @throws {Error} on a shape it cannot read: a send-back note or a previous version
 *   with no end line, JSON that never closes, a <DIRECTOR_GUIDANCE> block with neither
 *   of the pipeline's labels. A guess would scan the director's words or skip the
 *   pipeline's.
 */
function instructionText(render) {
  let text = String(render || '');
  for (const tag of WHOLE_BLOCKS) {
    text = text.replace(blockPattern(tag), `<${tag}></${tag}>`);
  }
  for (const tag of LISTED_BLOCKS) {
    text = text.replace(blockPattern(tag), (block) => block.replace(/^- .*$/gm, '-'));
  }
  text = text.replace(blockPattern('DIRECTOR_GUIDANCE'), guidanceLabels);
  text = stripSendBackNotes(text);
  text = stripPreviousVersions(text);
  text = stripModelOutputJson(text);
  text = stripWhiteboardReadings(text);
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

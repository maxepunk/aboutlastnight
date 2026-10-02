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
  // brief's "exposures reached you as tips", today's remote block, "Every exposure,
  // observation, and the verdict reached you as tips", and the article judge's remote
  // rule, "... reached them as tips" (3.4). The fact check's fix line said "arrived as
  // a tip" (3.4).
  /\bexposures?\b[^.;\n]*\breached (?:you|Nova|them) as tips\b/i,
  /arrived as a tip/i,

  // Nova and a gendered pronoun in one clause (T9).
  new RegExp(`\\bNova\\b${IN_CLAUSE}\\b${GENDERED}\\b|\\b${GENDERED}\\b${IN_CLAUSE}\\bNova\\b`, 'i'),

  // The phrases waves 1 and 2 reported removing (removed-phrases-reported.md in the
  // phase workspace; added in the 3.6b fix batch), by task. A phrase an entry above
  // already finds is named in a comment, not listed twice.

  // 3.5: the session-config, session-report and whiteboard parses, and the labels the
  // writers print. "Who killed Marcus Blackwood?" is found by 'who killed Marcus';
  // "Buried memories appear only in <buried-transactions>, ..." by its tag;
  // "Tokens sold to Black Market" by 'sold to Black Market'.
  'Players drew these during investigation',
  // The old whiteboard headings, matched in their title case: the judges' photo lists
  // say "the names identified in it".
  /\bWhiteboard Connections\b/,
  /\bSuspects Explored\b/,
  /\bConnections Found\b/,
  /\bNotes Captured\b/,
  /\bNames Identified\b/,
  '<buried-transactions>',
  'MURDER ACCUSATION',
  'Never list the victim as accused',
  'they override anything in the source text',
  'sold to Detective',
  'sold to Black Market',
  'Total Black Market economy value',
  'The downstream pipeline tolerates missing data better than wrong data',
  'murder mystery investigation game',
  'When in doubt, prefer roster names over literal transcription',
  'Always apply roster disambiguation',
  'roster-corrected',
  'Group label (e.g., SUSPECTS, FACTS)',
  'accusation web',
  'Use the provided sessionId verbatim',
  'Derive sessionId from:',

  // 3.6: the director's notes, the tensions and character extraction. The quote bank's
  // phrase to pin is "prefer these".
  'prefer these',
  "Verbatim quotes extracted from the director's prose",
  'Behavioral observations pre-linked to specific burial transactions',
  '<POST_INVESTIGATION_NEWS>',
  'Developments that occurred AFTER the investigation concluded',
  'distinct epistemic status',
  'used their own name for a burial account',
  'a deliberate choice to be identifiable',
  'publicly demonstrated transparency while also maintaining a named burial account',
  'Director observed multiple characters interacting with Blake',
  "The pipeline's code found these by matching account names to roster names",
  'the Black Market operator',
  'strongly implied',
  'include ALL members of the group',
  'the deceased victim',
  'the journalist narrator',

  // 3.2: the outline and article writers. The retired tags and headings; the rest of
  // 3.2's list names blocks, not phrases.
  /\bHARD CONSTRAINTS\b/,
  '<TEMPORAL_DISCIPLINE>',
  'TEMPORAL CONTEXT KEY',
  '<arc-interweaving>',
  '<visual-rules>',
  '<visual-principles>',
  '<arc-section-flow>',
  '<ARC_FLOW>',
  '<VISUAL_DISTRIBUTION>',
  '<VISUAL_COMPONENT_TYPES>',
  '<ANTI_PATTERNS>',
  '<VOICE_CHECKPOINT>',
  'the valet NPC',
  /\bOMIT for\b/,

  // 3.3: the arc calls and the rework rules. "The murder revelation / accusation
  // climax" is found by 'the murder revelation'; "PRESERVE EVERYTHING THAT'S WORKING -
  // Do NOT regenerate from scratch" by the two rework patterns above.
  'name who exposed each memory',
  'Account naming that suggests involvement',
  'Victim/operator relationships',
  'Targeting patterns',
  'murder/accusation',
  'Events from the murder night',
  'the murder, the accusation, etc.',
  /memory-altering drug called ["“]the memory drug["”]/i,
  /\bGROUND TRUTH\b/,
  "The director's prose below is the AUTHORITATIVE source",
  'Sarah exposed three memories during the investigation',
  /Never use ["“]token["”] \(say ["“]memory["”]\)/i,
  'comparing public behavior with Black Market activity',
  'Optimal arc sequence for maximum payoff',
  'Suggested arc order for maximum interweaving potential',
  /Vic['’]s confident smile/i,
  'she knew all along',
  'something players completely missed',
  'events before Marcus died',
  'Do not just regenerate',
  'These aspects are working well, PRESERVE THESE',
  'These aspects need improvement',
  'Make TARGETED FIXES',
  'You are IMPROVING, not regenerating',
  'Make minimal, surgical fixes',
  /\bWHAT TO PRESERVE\b/,
  /\bWHAT TO FIX\b/,
  'Low-scoring criteria need targeted fixes',
  'Any anti-patterns flagged by the evaluator',
  'She was NOT there',
  'it reached her as tips',
  'Role contradiction for',

  // 3.4: the judges and the fact check, with 3.4's suggested patterns. The two tips
  // lines are found by the tips patterns above; "Marcus (the murder victim)" by 'the
  // murder victim'; "Nova (the journalist narrator)" by 'the journalist narrator'.
  /ground truth\s*[-–—]\s*never question/i,
  /first-person participatory/i,
  /people who told you/i,
  /whoever took it/i,
  /\(the murder, the accusation\)/i,
  /breathe before escalation/i,
  'should appear in most arcs as the central victim',
  "may appear as the article's narrator/voice",
  'Do evidence cards, photos, and pull quotes serve loop mechanics?',
  'Do visual components (evidence cards, photos, pull quotes) serve loop mechanics (CLOSER/OPENER)?',
  'Do arcs flow THROUGH multiple sections (not isolated to THE STORY)?',
  'Check: arcConnections in followTheMoney, thePlayers, whatsMissing, closing.',
  'Do arcs weave through multiple sections (THE STORY → FOLLOW THE MONEY → THE PLAYERS)?',
  'requiredSections: lede, theStory, thePlayers, closing MUST exist',
  'Are all required sections present (lede, theStory, thePlayers, closing)?',
  'arcCoverage: Every selected arc should be referenced in theStory section',
  'within the 1000-1500 word budget',
  '(lede 75-150, theStory 350-550, followTheMoney 75-200, thePlayers 150-250, whatsMissing 75-150, closing 75-150)',
  'Do arcs tell a consistent story without contradictions?',
  'Score each criterion as: pass (1.0), partial (0.5), fail (0.0)',
  'In BOTH modes the reporter never votes and owns no exposed memory.',
  'are STRUCTURAL failures either way',

  // 3.8: the wording the rule files retire when the craft is rebuilt around the form
  // (spec round 7). Each was absent from every prompt text, schema description and
  // judge criterion in the code when it was added. The bare "names no one" stays
  // legal: T2 and the verdict labels use it.
  // The buyer stated as fact (T5, T3; R11).
  "NeurAI's board pays the seller",
  "NeurAI's board pays more",
  // "A reading" as the rules' word for Nova's inference, and the hedge menu (T1, T4,
  // the world's timeline; R12); what an account's name proves (T4; R12).
  'A reading across the counts that names no one',
  'as a reading, an unproven claim or a question',
  "present that placement as Nova's reading",
  'never proves who holds',
  // The remote block's attribution on every room event (T8; R13), and T1's remote point.
  'the attribution carries it everywhere else',
  'as reported to Nova remotely',
  // The closing that ends on a question (C14; R17), and the old C6, C10 and C11.
  'It ends on an open question',
  'The deliberation is its own movement',
  'how does a lobbyist know exactly where the money is hidden',
  'Read an exposure as an act with a motive',
  // C16's old example, in any character's name.
  /So where is [^?\n]*['’]s payday/i,

  // Wave 4 (3.9, 3.10 and the two fix batches): the code text that had to say what the
  // round-7 rule files say (rule-text read 2, section D). Each was absent from every
  // journalist prompt, schema description and judge criterion when it was added. A few
  // stay in the parked detective's own text (D13), and the scans read journalist
  // renders only: "compulsive readability through callbacks", "recontextualized later
  // for aha moments", "bridges for transitions", the card-count line and "state your
  // absence at most once".
  // The buyer stated as fact, and the money read as other wealth (T5; R11). The final
  // fix: SESSION_FACTS said Blake worked the room "for NeurAI", whom the deals served.
  "run from NeurAI's board",
  'working it for NeurAI',
  'working the room for NeurAI',
  "what NeurAI's board paid out",
  "anyone's other wealth",
  // The retired craft files' tags, and "a reading" as the noun for an inference.
  /<craft-(?:thesis|sections|arcs|room|tracing)>/,
  "Nova's reading under T1",
  "The section's reading of the account",
  "the arc writer's reading of one thread",
  // The judges' craft clauses in structural slots (R22; read section D).
  'spent early in THE STORY',
  'the thesis running through every section',
  'with the thesis deciding which sections exist and their order',
  'each placed where it pulls the reader on',
  'with details planted early coming back changed',
  'the house style C4 states',
  'A tight article with 3 perfectly-placed evidence cards',
  'a suggestion for the rework and the director',
  // The old T4 and T8 in the judges and the fact check (R13, R21).
  'no account\'s name read as proof of who holds it',
  'outside the room\'s votes, accusations and exposures',
  'on Nova voting, accusing or exposing',
  'accuses or exposes',
  // Attribution on every room event and the absence stated "at most once" (R13).
  'by attribution to the people in the room',
  "attributing the room's events to the people in it",
  "the room's events reached Nova from people in it",
  'state the absence at most once',
  // The judge's output contract before the must-fix-only fixes (R23).
  'Step 2: Optional advisory fix.',
  'concrete action to improve this criterion',
  // The automatic rework's old scope (R23).
  'This rework answers the findings above',
  'truer to the record or better for the players who read it',
  'What the findings do not name was not questioned',
  'and this rework answers it',
  "the evaluation's findings on an automatic pass",
  // Callbacks as the engine, and C16's payoff without its condition (C16; R14).
  "comes back changed later: the reader's moment of recognition",
  'Which details in this arc, from the record, could come back changed later?',
  'A detail from the record that can come back changed later',
  'recontextualized later for aha moments',
  'Key callback opportunities across arcs for recontextualization',
  /compulsive readability/i,
  'bridges for transitions',
  'What this arc brings to the convergence point'
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

/**
 * Blocks whose label is instruction text and whose "- " lines are the director's words:
 * the quote bank, the transaction links, and the article writer's narrative tensions,
 * the director's own sentences that name Blake or the Valet, one per line.
 */
const LISTED_BLOCKS = ['QUOTE_BANK', 'TRANSACTION_LINKS', 'NARRATIVE_TENSIONS'];

/**
 * The arc writer's heading for the same sentences (buildJournalistCoreArcSections): its
 * label line, then the sentences as "- " lines, one per sentence.
 */
const TENSIONS_HEADING = "### Blake and the Valet in the director's notes";

/**
 * The arc packages' excerpts, the documents' own words cut at sentence breaks; an
 * excerpt may run over lines.
 * - The outline writer's <arc-evidence>: an "  Excerpts:" line under each document's
 *   "- <id>: memory|paper" line, up to the next document's line or the package's photos.
 * - The article writer's packages: the lines between "EXCERPTS:" and "DOCUMENTS:".
 */
const OUTLINE_EXCERPTS = /^ {2}Excerpts:/;
const OUTLINE_EXCERPTS_END = /^- .*: (?:memory|paper)$|^\*\*Photos in which /;
const ARTICLE_EXCERPTS = 'EXCERPTS:';
const ARTICLE_EXCERPTS_END = 'DOCUMENTS:';

/**
 * The outline judge's photo analyses (renderJudgePhotos, evaluator-nodes.js), the
 * Haiku model's output: "Photo analysis: {" then the indented JSON, closing on a line of
 * the same indent.
 */
const PHOTO_ANALYSIS = /^(\s*)Photo analysis: \{$/;

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
  '### PREVIOUS QUESTIONS FOR THE DIRECTOR (writerQuestions)',
  // the judges
  'ARCS:',
  'QUESTIONS FOR THE DIRECTOR (writerQuestions):',
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

/** The director's sentences under the arc writer's TENSIONS_HEADING taken out, its label kept. */
function stripTensionSentences(text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i] !== TENSIONS_HEADING) continue;
    let at = i + 1;
    while (at < lines.length && !lines[at].startsWith('- ') && !/^(#|---)/.test(lines[at])) at += 1;
    for (; at < lines.length && lines[at].startsWith('- '); at += 1) lines[at] = '-';
    i = at - 1;
  }
  return lines.join('\n');
}

/** Each arc package's excerpts taken out, the "Excerpts:", "EXCERPTS:" and "DOCUMENTS:" labels kept. */
function stripExcerpts(text) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (OUTLINE_EXCERPTS.test(lines[i])) {
      out.push('  Excerpts:');
      let end = i + 1;
      while (end < lines.length && !OUTLINE_EXCERPTS_END.test(lines[end])) end += 1;
      if (end === lines.length) {
        throw new Error('instructionText: an "Excerpts:" line with no next document or photos line after it; where the document\'s words end is unknown');
      }
      i = end - 1;
    } else if (lines[i] === ARTICLE_EXCERPTS) {
      out.push(lines[i]);
      let end = i + 1;
      while (end < lines.length && lines[end] !== ARTICLE_EXCERPTS_END) end += 1;
      if (end === lines.length) {
        throw new Error(`instructionText: an "${ARTICLE_EXCERPTS}" list with no "${ARTICLE_EXCERPTS_END}" line after it; where the documents' words end is unknown`);
      }
      i = end - 1;
    } else {
      out.push(lines[i]);
    }
  }
  return out.join('\n');
}

/** Each photo analysis the outline judge prints taken out, its label and braces kept. */
function stripPhotoAnalyses(text) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    out.push(lines[i]);
    const head = lines[i].match(PHOTO_ANALYSIS);
    if (!head) continue;
    const closer = `${head[1]}}`;
    let close = i + 1;
    while (close < lines.length && lines[close] !== closer) close += 1;
    if (close === lines.length) {
      throw new Error('instructionText: a photo analysis whose JSON never closes; where the model\'s output ends is unknown');
    }
    out.push(closer);
    i = close;
  }
  return out.join('\n');
}

/**
 * A render's instruction text: the render with everything but the pipeline's own
 * instructions taken out.
 *
 * Taken out:
 * - the director's words and the record: the whole of each WHOLE_BLOCKS tag; the "- "
 *   lines inside each LISTED_BLOCKS tag (the narrative tensions' sentences included) and
 *   under the arc writer's TENSIONS_HEADING; the director's guidance and notes inside
 *   <DIRECTOR_GUIDANCE>; every paragraph of the send-back note after "HUMAN FEEDBACK
 *   (HIGHEST PRIORITY):", up to the pipeline's "NOTE: The human reviewer" line; the
 *   text after "The director's description" on a photo line; and the arc packages'
 *   excerpts, the documents' own words (3.6b fix batch);
 * - a model's output the prompt carries as data: the previous version a rework shows,
 *   the JSON after each MODEL_OUTPUT_LABELS line (the approved outline, the arcs and the
 *   rest of the arc analysis, the plans, the content bundle, the arc writer's questions
 *   for the director as the arc reworker and the arc judge print them; fix 3.7b), the whiteboard reading's
 *   values, and the outline judge's photo analyses (3.6b fix batch).
 *
 * Kept: every label, the ones inside <DIRECTOR_GUIDANCE> included, so a scan reads them.
 * Each tag pair and bracket pair stays, empty, so a scan still sees where it was.
 *
 * @param {string} render - a rendered prompt, system and user
 * @returns {string}
 * @throws {Error} on a shape it cannot read: a send-back note or a previous version
 *   with no end line, JSON that never closes (a photo analysis's included), a
 *   <DIRECTOR_GUIDANCE> block with neither of the pipeline's labels, excerpts with no
 *   line after them that ends them. A guess would scan the director's words or skip the
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
  text = stripTensionSentences(text);
  text = stripExcerpts(text);
  text = stripPhotoAnalyses(text);
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

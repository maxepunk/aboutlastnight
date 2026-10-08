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
  'What this arc brings to the convergence point',

  // Phase 4, 4.1: the old items' wording that named the old stages' jobs. The story
  // meeting settles the story, the map lays it across the sections and chooses the
  // director's lines, and questions are asked only at the meeting. The phrases still in
  // code text (the interweaving call, the outline writer's and the outline judge's jobs)
  // join when the slices that remove them merge.
  'The outline names the thesis',
  'Before the article is planned',
  'The threads are ordered by how they bear',
  'The threads are intercut through the article',
  'Each thread is examined through three lenses',
  'The thesis decides which sections exist',
  'the thesis decides what earns space',
  'used where they make sense',
  'The outline and the article carry what the throughline uses',
  'A line that cannot be placed so it makes sense stays out',
  'a connection prints when it moves the throughline',
  'raised with the director',
  'Each player reaches the story through',
  'The writer raises questions to the director',
  'the writer raises it in a short list of questions',
  'The director answers with a note',
  "as the director's notes record it",
  'The alternative theories the room debated are always reported',
  'goes to the director as a question',
  'reaches the writer with no roster pronoun',
  'raised as a question to the director',

  // Phase 4, 4.4: the arc stage's old wording, which went with the interweaving call,
  // the long write-up for each thread and the every-player rule (spec section 10). The
  // weave names its connections itself, and the meeting's fact check reads no roster
  // coverage.
  'the interweaving call',
  'Return the interweavingPlan (suggestedOrder, convergencePoint, keyCallbacks)',
  'INTERWEAVING PRINCIPLES',
  '## WHAT THIS REWORK RETURNS',
  'ARC CHECK GUIDANCE',
  'or a writerQuestions entry of kind "player"',
  '### All Valid Evidence IDs for keyEvidence',
  'THE THREE LENSES IN analysisNotes',
  'ROSTER COVERAGE: Every name in SESSION ROSTER',
  'Character Categories for characterPlacements',

  // Phase 4, 4.5: the no-culprit sentence named an accusation arc (ruling 11), and the
  // weave's task restated C1 and C16, which state those rules once (ruling 10).
  'The accusation arc is about that verdict',
  'Place no character as the accused',
  'Place no one as the accused',
  "When the director's notes end with their own read of the session, the story starts from it",
  'When the notes end without a read, the story is your proposal from the record',
  'Every thread you find stays in the weave',
  "only when another thread would carry a stronger story as the main thread (C1): that thread's id",
  'the weave C16 (<craft-story>) sets out',
  'each saying what its answer changes in print',

  // Phase 4, 4.6: the outline writer, its rework and the arc packages went with the map;
  // the map writer lays out the settled weave and writes no prose (C2). The detective's
  // outline went with its old stages (R1).
  'You are creating an article outline for a NovaNews investigative piece.',
  'Plan the outline of the article from these selected arcs.',
  "Write the plan in the third person: the article writer gives it Nova's voice.",
  'SELECTED ARCS:',
  '<arc-metadata>',
  'Each arc above is one thread of the story, as the arc writer found it.',
  '<arc-analysis>',
  'A photo placement names its photo by the exact filename above.',
  'The outline is JSON in this shape',
  'You are reworking the outline you wrote',
  '# Outline Revision Request',
  'REVISION CONTEXT: OUTLINE',
  'PREVIOUS OUTLINE OUTPUT',
  "You are planning the structure of Detective Anondono's case report.",
  'You are REVISING that outline, not writing it from scratch.',
  '<arc-evidence>',

  // Phase 4, 4.6b: the map's task names the approval note marked arc-selection, the one
  // the map's check counts, not any standing note.
  'the standing note marked arc-selection',

  // Phase 4, 4.7a: the article judge scores the truth criteria alone (spec 6.2). Its
  // frame, its craft findings and its weighted criteria went, and the detective's judge
  // with its old stages (R1). The card-count line is on the list above.
  'IMMUTABLE INPUTS (DO NOT suggest changes to these',
  '- selectedArcs: The narrative arcs are locked',
  '- outline: The article structure is approved',
  '- evidenceBundle: The evidence is curated and final',
  'how the ARTICLE EXECUTES the outline',
  'EVALUATION GOAL: COMPELLING GIFT FOR PLAYERS',
  "celebrates the players' gameplay experience",
  'Visual distribution serves narrative flow, NOT quota compliance',
  'CRAFT FINDINGS (should-consider)',
  'THE CRAFT GUIDANCE the article writer followed',
  'CRITICAL: Your feedback MUST be actionable',
  'Human always makes final decision',
  'STRUCTURAL issues block. ADVISORY issues are warnings',
  'Evaluate this article content:',
  'Is this article ready for human review?',
  'reporterMode scores it',
  'overallScore is the weighted average of the weighted criteria',
  'You are the ARTICLE Evaluator',
  'Report MUST use third-person investigative voice',

  // Phase 4, 4.7b: the article writer reads the settled weave and the map (<STORY_MAP>),
  // and code stamps the map's headline, deck and top photo (R7); the outline, its hero
  // line and its old section ids went. The detective's article writer and rework went
  // with its old stages (R1); its character-voice.md keeps its own voice line.
  'APPROVED OUTLINE:',
  // Case-sensitive: the record can describe a "hero image:" in a document's text.
  /HERO IMAGE:/,
  '<the HERO IMAGE filename>',
  'none chosen: use the first photo the outline places',
  'It prints at the top of the article, as "heroImage"',
  'one of lede, the-story, follow-the-money, the-players, whats-missing or closing',
  'Remember: You are IMPROVING, not regenerating.',
  'CRITICAL REVISION RULES:',
  'DETECTIVE VOICE:',
  'Before generating, internalize Detective Anondono',

  // Phase 4, 4.7c: the arc stop's guidance input went from <DIRECTOR_GUIDANCE>, the parked
  // detective's rework text with it (R1), the weighted judge contract went (both judges are
  // truth-only), and the headline line names the director's words first.
  'The director reviewed the arcs and asks for this emphasis',
  'Apply them where they serve the piece. They are not requirements.',
  'CRITICAL REVISION INSTRUCTIONS',
  'with all original content plus fixes',
  'Maintain consistency with the original structure and organization',
  'Focus on the issues identified below.',
  '"type": "structural" | "advisory",',
  'issues that are suggestions, not blockers',
  'Suggestions, not blockers, one self-contained sentence each',
  "the map's headline and deck as written",
  "<the map's headline>",
  "<the map's deck>",
  'and your own kicker',

  // Phase 4, 4.5d: a connection the director brought back stays in the weave, and its words
  // are the writer's.
  'which is back in the story',
  'each thread they added stays in the weave, and each connection they struck',
  "This automatic pass fixes the writer's text. Each change of the director's is final",

  // Phase 4, 4.7d: a heading and a photo's place hold the director's desk edits, worded as the
  // headline line is. "nor the director's notes name (T6)" stays off: the weave's judge prints it.
  'each under its heading',
  "the map's heading for the section, as written",
  'A section whose heading on the map is empty',
  'each photo where the map places it',

  // Phase 4, 4.6d: the map's schema says "note" is the meeting's approval note, when the
  // prompt holds it. The shorter "the director's note from the meeting" stays live.
  '"note" for the director\x27s note from the meeting',

  // Phase 4, 4.13: the parked detective's inline mode blocks went (R1); every theme's block is
  // its own mode file. The remote one's "reached you as tips" is on the list above.
  'You watched the investigation from inside the room',

  // Phase 4, 4.7e and 4.5f: the article task's beats and words lines name the director's desk
  // edits first, and the vote fix line reads the director's words for who turned a memory in.
  'the beats under leftOut stay out of the article',
  'each with its beats as C2',
  "or the director's notes name who turned it in",

  // Phase 4, 4.6e: "no note" means no approval note at the meeting.
  'empty when the director changed nothing and left no note',
  'the director changed nothing at the meeting and left no note',

  // Phase 4, 4.7f and its merge: the director's desk edits are stated once, in <HAND_EDITS>,
  // with the send-back's exception first; the article task gives precedence. 4.7e's clauses
  // and 4.7f's first wording went. ("An edit is the final word on its text" alone stays: the
  // judges print it.)
  'a block the director has cut stays out',
  'a block the director has added stays, whatever its material',
  'the text the director has written into the article stays as written',
  'a block the director has moved stays where the director put it',
  'which this rework retells in no other words',
  'An edit is the final word on its text, so the text the director wrote',

  // Phase 4, 4.10d: a truth criterion's fallback line names its subject, never its key.
  /\b[a-z]+Truth criterion failed\b/,

  // Phase 4, 4.12b: the standalone path's agents follow the stages (the weave, the map) and
  // the rule set's calls; the validator, like the article judge, reads no craft file.
  'examines each through the three lenses and proposes the thesis',
  'plan how they intercut and converge',
  "Plans the telling of the session's article from the arcs the director selected",
  "Build on the selected arcs and the director's stop notes",
  'Every craft finding, C1 to C19',
  "the should-consider list is the editor's notes for the director",

  // Phase 4, 4.14a: the meeting's changes have an id form of their own (M) wherever a later
  // stage's prompt shows them, so no prompt holds two edits under one id.
  'such as E3, or',
  "[the director's change E",

  // Phase 4b, piece 1 (slices 1A and 1B): the weave and the map stay at the level of the
  // story, with the evidence underneath, so a connection is said in plain words rather than
  // named exactly, and the article writer writes from each beat's evidence.
  'named exactly',
  'each named by its material',
  'from the documents the map names',
  // Phase 4b, piece 3 (slices 3A to 3C): the meeting pitches angles over one shared set of
  // threads, so no thread has a role toward a main thread. A bare "complicates it" stays
  // off the list: C17 and C18 say "confirms or complicates it" of a receipt.
  'stronger main thread',
  /the main thread/i,
  'grounds it',
  'mirrors it',
  'carries it forward',
  'left out, with one line on why',
  // Phase 4b, piece 4 (slices 4A and 4B): the order of a section's beats is the map's, which
  // the director sees and sets, so the article writer no longer chooses it (C2, C16).
  /the order of the beats within (?:each|a) section/i
];

/** Blocks that hold the director's words or the record, whole. */
const WHOLE_BLOCKS = [
  'RECORD',
  // Phase 4 (brief 4.6): the settled weave the map writer reads first, the weave's model
  // output with the director's changes and answers in it.
  'SETTLED_WEAVE',
  // Brief 4.7b: the story map the article writer and its rework read after it, the map
  // writer's output with the director's edits in it.
  'STORY_MAP',
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
 * The pipeline's own lines in <DIRECTOR_GUIDANCE> (buildDirectorGuidanceSection and
 * formatGateNotes in lib/prompt-builder.js): STANDING_NOTES_PREAMBLE's lines. The
 * director's notes are the GATE_NOTE_LINE lines after it, to the block's end. Brief 4.7c:
 * the arc stop's guidance and its label went from the section, so the preamble is the one
 * label the parser reads.
 */
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
  // (the article writer's APPROVED OUTLINE went with brief 4.7b: it prints the map in
  // <STORY_MAP>, a WHOLE_BLOCKS tag)
  // the outline writer and reworker: the arcs, then the rest of the arc analysis
  '<arc-metadata>',
  '<arc-analysis>',
  // the judges (phase 4, brief 4.4: the story meeting's fact check reads the weave; the
  // interweaving call, and the arc reworker's and the arc judge's old labels, went;
  // brief 4.6: the outline judge's labels went with it; brief 4.7a: the article judge
  // reads the map under MAP:, where it read OUTLINE:)
  'WEAVE:',
  'MAP:',
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
  if (inner.trim() && !inner.includes(STANDING_NOTES_PREAMBLE)) {
    throw new Error(
      `instructionText: a <DIRECTOR_GUIDANCE> block without "${STANDING_NOTES_PREAMBLE}"; ` +
      "the director's words in it cannot be told from the pipeline's"
    );
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

/**
 * A render's instruction text: the render with everything but the pipeline's own
 * instructions taken out.
 *
 * Taken out:
 * - the director's words and the record: the whole of each WHOLE_BLOCKS tag; the "- "
 *   lines inside each LISTED_BLOCKS tag (the narrative tensions' sentences included) and
 *   under the arc writer's TENSIONS_HEADING; the director's notes inside
 *   <DIRECTOR_GUIDANCE>; every paragraph of the send-back note after "HUMAN FEEDBACK
 *   (HIGHEST PRIORITY):", up to the pipeline's "NOTE: The human reviewer" line; the
 *   text after "The director's description" on a photo line. (The arc packages'
 *   excerpts, stripped since the 3.6b fix batch, went with the packages: phase 4, brief
 *   4.6, R5.)
 * - a model's output the prompt carries as data: the previous version a rework shows,
 *   the JSON after each MODEL_OUTPUT_LABELS line (the arcs and the
 *   rest of the arc analysis, the plans, the content bundle, the weave the fact check
 *   reads; phase 4, brief 4.4; the map the article judge reads, brief 4.7a), and the
 *   whiteboard reading's values. (The outline judge's
 *   photo analyses, stripped since the 3.6b fix batch, went with the outline judge:
 *   phase 4, brief 4.6.)
 *
 * Kept: every label, the ones inside <DIRECTOR_GUIDANCE> included, so a scan reads them.
 * Each tag pair and bracket pair stays, empty, so a scan still sees where it was.
 *
 * @param {string} render - a rendered prompt, system and user
 * @returns {string}
 * @throws {Error} on a shape it cannot read: a send-back note or a previous version
 *   with no end line, JSON that never closes, a
 *   <DIRECTOR_GUIDANCE> block without the pipeline's label. A guess would scan the
 *   director's words or skip the pipeline's.
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

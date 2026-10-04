/**
 * PromptBuilder - Assemble phase-specific prompts from ThemeLoader + session data
 *
 * Takes loaded prompt files and session data to build complete prompts
 * for each phase of the journalist pipeline.
 */

const { createThemeLoader, PHASE_REQUIREMENTS } = require('./theme-loader');
const { renderDirectorEnrichmentBlock, directorTensionSentences } = require('./prompt-renderers/director-notes-renderer');
const { renderRecordView, DOCUMENT_POINTER } = require('./prompt-renderers/record-view');
const { withSessionClock } = require('./prompt-renderers/session-clock');
const { DERIVED_LABELS } = require('./prompt-renderers/derived-labels');
const { renderSessionFactsVerdict, renderPhotoListEntry } = require('./prompt-renderers/director-words-renderer');
const contentBundleSchema = require('./schemas/content-bundle.schema.json');
// Phase 4 (brief 4.6): the map writer embeds the map's schema for its theme as its
// <SCHEMA> (fix 3.2b), the one the SDK channel enforces (ai-nodes.js), as the article
// writer embeds the schema above; its slots are the theme's.
const { mapSchemaFor } = require('./map');
const { withoutWriterQuestions } = require('./writer-questions');
const { getThemeNPCEntries, mapSlotsOf } = require('./theme-config');
const { loadModeBlock, loadRuleSet } = require('./rule-set');
// theme-config import removed: canonicalCharacters now derived entirely from Notion

/**
 * The map task's line on the top photo (brief 4.6b): code's pick is the photo
 * <available-photos> marks [hero image] (renderPhotoListEntry marks the entry whose `hero`
 * is set), so the line prints only when a photo is marked. The writer's inputs mark code's
 * pick whenever the director kept a photo (ai-nodes.js outlineWriterInputs), so with none
 * marked there is no top photo to choose.
 */
const MAP_TASK_TOP_PHOTO = "- Choose the top photo. The photo marked [hero image] in <available-photos> is code's pick, the one with the most players identified in it: start from it.";

/**
 * The map writer's task (phase 4, brief 4.6), right after the settled weave: lay the weave
 * across the sections. It names what goes where in the map and points at the rule items
 * that say how (spec 5.1 and 5.2; the approved read's section D), stating none of them.
 *
 * Brief 4.6b: each line is true of the prompt it sits in. The meeting's note is the approval
 * note marked arc-selection in <DIRECTOR_GUIDANCE>, the one note the map checks take as a
 * change's source "note" (lib/map.js meetingNoteOf); a reweave's or a send-back's note at
 * the meeting prints there marked as a rejection. The line on the top photo prints only
 * when a photo is marked [hero image] (MAP_TASK_TOP_PHOTO).
 *
 * @param {boolean} heroMarked - whether <available-photos> marks a photo [hero image]
 * @returns {string}
 */
function mapTask(heroMarked) {
  return `Lay the settled weave above across the article's sections: the story map the article writer writes the article from. The map runs to about 450 words and writes no prose.
- The story is the director's, and the map's part in it is C16's (\`<craft-story>\`). Fit in each change the director made at the meeting, marked above by its edit's id, and each change the director's note from the meeting asks for (the approval note marked arc-selection in <DIRECTOR_GUIDANCE>). List each change you make to fit one in under weaveChanges, with its source: the edit's id, or "note".
- Give each section you use its heading, its job, its beats and its photos as C2 (\`<craft-form>\`) sets them out, each beat naming its material. Drop each slot the story does not use, with its reason.
${heroMarked ? `${MAP_TASK_TOP_PHOTO}\n` : ''}- List what you considered and did not use under leftOut, as C8 (\`<craft-material>\`) sets out.
- A part of the story the record cannot carry, a player you cannot place, or a link you see that the weave lacks goes in gapNote, the one line at the top, as C7 (\`<craft-material>\`) and C16 set out.
- Set expectedLength from what the map holds, as C4 (\`<craft-telling>\`) sets out.
Code builds Everyone from each beat's players, and checks the players, the photos, the cards and the connections. A player named among gapNote's players counts as raised.`;
}

/** What the roster block prints for a roster character whose pronoun the roster stop did not capture (T9). */
const PRONOUN_NOT_GIVEN = 'pronoun not given';

/** The rule-set call each journalist writer phase reads (lib/rule-set.js), for requirePhasePrompts. */
const JOURNALIST_RULE_SET_CALLS = Object.freeze({
  outlineGeneration: 'outline',
  articleGeneration: 'article'
});

/**
 * Generate canonical character roster section
 * Uses Notion-derived canonical characters map directly (sole source of truth).
 *
 * Each character gets at most one pronoun, and none is guessed (phase 2 final fix
 * wave; the director's ruling): an NPC is listed once, in the NPC block, with its
 * canon pronoun or none; a canonical character not on this session's roster prints
 * no pronoun. Pronouns show for the journalist theme only.
 *
 * Phase 3 (3.2; spec T9): a roster character with no captured pronoun prints
 * "pronoun not given", which the writer raises as a question to the director, in
 * place of the they/them default. The pronoun the roster stop sets is the
 * director's choice, they/them included (R3), and prints as set. Nova has no
 * pronoun in the canon, Marcus is he/him, and Blake has none.
 *
 * @param {string} theme - Theme name (e.g., 'journalist') — kept for signature compatibility
 * @param {Object|null} canonicalCharacters - Notion-derived map of firstName -> fullName
 * @param {Object|null} characterData - Optional character metadata (groups, roles, relationships) from extractCharacterData node
 * @param {Object|null} rosterPronouns - first name -> pronouns captured for this session's roster
 * @param {Array<string|{name: string}>|null} roster - this session's roster (sessionConfig.roster)
 * @returns {string} Formatted roster section for prompts
 */
function generateRosterSection(theme = 'journalist', canonicalCharacters = null, characterData = null, rosterPronouns = null, roster = null) {
  const characters = canonicalCharacters || {};
  const pronounMap = rosterPronouns || {};
  const lower = (name) => String(name).trim().toLowerCase();

  // Case-insensitive pronoun lookup by first name.
  const capturedPronouns = (first) => {
    if (pronounMap[first]) return pronounMap[first];
    const key = Object.keys(pronounMap).find(k => lower(k) === lower(first));
    return key ? pronounMap[key] : null;
  };

  // On this session's roster: listed in it, or given a pronoun at the roster stop
  // (pronouns are captured for roster characters only).
  const rosterNames = new Set((Array.isArray(roster) ? roster : [])
    .map(p => (p && typeof p === 'object' ? p.name : p))
    .filter(name => typeof name === 'string' && name.trim())
    .map(lower));
  const onRoster = (first) => rosterNames.has(lower(first)) || !!capturedPronouns(first);

  // An NPC is listed once, in the NPC block below, with its canon pronoun or none. In
  // the canonical list it took the they/them default, and the NPC block then gave
  // Marcus he/him and called it authoritative (report-quality baseline defect #3).
  const npcEntries = getThemeNPCEntries(theme).filter(e => e && typeof e === 'object' && !e.aliasOf);
  const npcNames = new Set(npcEntries.map(e => lower(e.name)));

  // Pronoun annotation is journalist-only (first-person, captured pronouns).
  // Detective is third-person — the annotation is meaningless there, so omit the
  // suffix even when rosterPronouns is populated (it's captured theme-agnostically) (X-6).
  const showPronouns = theme === 'journalist';
  const pronounOf = (first) => {
    if (!showPronouns || !onRoster(first)) return null;
    return capturedPronouns(first) || PRONOUN_NOT_GIVEN;
  };
  const entries = Object.entries(characters).filter(([first]) => !npcNames.has(lower(first)));
  const lines = entries
    .map(([first, full]) => {
      const pronouns = pronounOf(first);
      return pronouns ? `- ${first} → ${full} (${pronouns})` : `- ${first} → ${full}`;
    })
    .join('\n');
  const unrecorded = showPronouns && entries.some(([first]) => !pronounOf(first))
    ? '\nA name with no pronoun is not on this session\'s roster, so its pronoun is not recorded: never guess one.'
    : '';

  let result = `CANONICAL CHARACTER ROSTER:
Use ONLY these full names in ALL article text. NEVER invent different last names:
${lines}${unrecorded}`;

  // BASELINE §4 class 3: the NPCs are fixed canon and are NOT on the session
  // roster, so the victim had no pronoun anywhere in the prompt and the model
  // guessed (Marcus written they/them on 4 of 5 sessions). Aliases and NPCs whose
  // pronouns the canon never states are listed without a pronoun rather than
  // given an invented one.
  const npcLines = npcEntries
    .map(e => {
      const display = e.fullName || e.name;
      const pronouns = showPronouns && e.pronouns ? ` (${e.pronouns})` : '';
      const role = e.role ? ` - ${e.role}` : '';
      return `- ${display}${pronouns}${role}`;
    });

  if (npcLines.length > 0) {
    result += `

Non-player characters (fixed canon, NOT on the session roster; these pronouns are as authoritative as the roster's):
${npcLines.join('\n')}`;
  }

  if (characterData && Object.keys(characterData).length > 0) {
    result += `\n\nCHARACTER CONTEXT (${DERIVED_LABELS.characterContext}):`;
    for (const [name, data] of Object.entries(characterData)) {
      const parts = [];
      if (data.role) parts.push(`Role: ${data.role}`);
      if (data.groups?.length) parts.push(`Member of: ${data.groups.join(', ')}`);
      if (data.relationships && Object.keys(data.relationships).length > 0) {
        const allRels = Object.entries(data.relationships);
        const shown = allRels.slice(0, 4).map(([k, v]) => `${k} (${v})`).join(', ');
        const overflow = allRels.length > 4 ? ` (+${allRels.length - 4} more)` : '';
        parts.push(`Relationships: ${shown}${overflow}`);
      }
      if (parts.length > 0) {
        result += `\n- ${name}: ${parts.join(' | ')}`;
      }
    }
  }

  return result;
}

/**
 * Wrap prompt content in one XML tag named after it.
 *
 * Uses XML tags for consistency with Claude's training and token efficiency. It wraps
 * the section the writers add by name, <DIRECTOR_GUIDANCE>. The parked detective's
 * prompt files, each wrapped under its file name, went with its writers (R1; phase 4,
 * briefs 4.6 and 4.7b). The journalist's rule files come wrapped from lib/rule-set.js,
 * and a journalist prompt points at a rule by its id and its file's tag, as in "C16
 * (<craft-story>)".
 *
 * @param {string} filename - the tag: a section's name (e.g. 'DIRECTOR_GUIDANCE')
 * @param {string} content - the section's content
 * @returns {string} XML-wrapped content, or '' when the content is empty
 */
function labelPromptSection(filename, content) {
  if (!content || !content.trim()) return '';
  return `<${filename}>
${content.trim()}
</${filename}>`;
}

/**
 * The director's standing notes as a prompt paragraph (spec 2026-09-19 §5.3).
 * Entries with no usable text are skipped. '' when nothing remains.
 *
 * Phase 1 brief 1.1: the note box is now sent with WHATEVER the director presses,
 * so the channel holds two kinds. The preamble has to tell them apart — a rejection
 * note was already acted on by the rework at its own stop, but an approval note has
 * never reached a writer, and calling it "already applied" told the writer to treat
 * a forward instruction as history.
 */
function formatGateNotes(gateNotes) {
  const list = Array.isArray(gateNotes)
    ? gateNotes.filter(n => n && typeof n.text === 'string' && n.text.trim())
    : [];
  if (list.length === 0) return '';
  const lines = list.map(n => `- [${n.gate}, ${n.kind || 'rejection'} ${n.round || 1}] ${n.text.trim()}`);
  return 'Standing notes the director gave at earlier stops, in order.\n' +
         'Each carries its kind: a rejection note was applied by the rework at its own stop;\n' +
         'an approval note is forward guidance no writer has acted on yet.\n' +
         'Keep honoring each in what you write now.\n' + lines.join('\n');
}

/**
 * Drop the note the reviser is acting on RIGHT NOW (it is already in the prompt as
 * HUMAN FEEDBACK). On an evaluator-driven second pass the feedback slot is null, so
 * nothing is excluded and every note stands (spec §5.3 [I10]).
 *
 * Phase 1 brief 1.1: the match is kind- and gate-narrowed, not text-only. The note
 * being acted on can only be the REJECTION at the stop being reworked; a text-only
 * match deleted an approval note, or another stop's note, whenever the director
 * reused a sentence. A note written before approval notes existed carries no kind
 * and counts as a rejection, as it does everywhere else.
 *
 * The gate is REQUIRED and the call fails loud without it: an optional gate silently
 * restored the cross-stop text match this narrowing exists to remove, and a caller
 * that forgot to pass one would look correct.
 *
 * @param {Array} gateNotes - directorGateNotes entries
 * @param {string|null} currentFeedback - the note this rework is acting on
 * @param {string} gate - the stop being reworked; required
 */
function filterGateNotes(gateNotes, currentFeedback, gate) {
  if (typeof gate !== 'string' || !gate.trim()) {
    throw new Error(
      'filterGateNotes: gate is required (the stop being reworked); without it the ' +
      "match falls back across stops and drops another stop's note"
    );
  }
  const list = Array.isArray(gateNotes) ? gateNotes.filter(n => n && typeof n === 'object') : [];
  const current = typeof currentFeedback === 'string' ? currentFeedback.trim() : '';
  if (!current) return list;
  return list.filter(n => {
    const text = typeof n.text === 'string' ? n.text.trim() : '';
    const isRejection = (n.kind || 'rejection') === 'rejection';
    return !(text === current && isRejection && n.gate === gate);
  });
}

/**
 * What an advisory finding is, said once (brief 1.3).
 *
 * The evaluation splits its findings into structural issues, which the writer must
 * fix, and advisory warnings, which are suggestions. Concatenated into one list the
 * suggestions read as defects; dropped — as they were until this slice — the outline
 * evaluation's warnings about frontloading never reached the article writer at all.
 * These two lines introduce the list in a generation prompt's <SHOULD_CONSIDER>, and in
 * the detective rework's SHOULD CONSIDER block (buildRevisionContext). Since phase 3
 * (3.10) a journalist rework introduces its list with REWORK_SHOULD_CONSIDER_LINE
 * (node-helpers.js) alone: "Apply them where they serve the piece" would give a
 * suggestion a scope of its own, and WHAT THIS REWORK DOES states that scope once (R23).
 */
const SHOULD_CONSIDER_PREAMBLE =
  'These came from the evaluation that ran before this pass. Apply them where they\n' +
  'serve the piece. They are not requirements.';

/**
 * Build the <DIRECTOR_GUIDANCE> section (Q2 decision + spec 2026-09-19 §5.3).
 *
 * Standalone so the revision nodes can append it without going through a
 * PromptBuilder instance (their tests use a mock builder).
 *
 * @param {string|null} directorGuidance - free text from the arc-selection gate
 * @param {Array} [gateNotes] - directorGateNotes entries (already filtered by the caller)
 * @returns {string} XML section, or '' when there is neither guidance nor notes
 */
function buildDirectorGuidanceSection(directorGuidance, gateNotes = []) {
  const hasGuidance = typeof directorGuidance === 'string' && !!directorGuidance.trim();
  const notesText = formatGateNotes(gateNotes);
  if (!hasGuidance && !notesText) return '';
  const parts = [];
  if (hasGuidance) {
    parts.push('The director reviewed the arcs and asks for this emphasis. It outranks the craft rules above where they conflict:\n\n' +
      directorGuidance.trim());
  }
  if (notesText) parts.push(notesText);
  return labelPromptSection('DIRECTOR_GUIDANCE', parts.join('\n\n'));
}

// Default reporter first name when the director provides none. The pipeline's
// authoritative stamp is input-nodes.js (parseRawInput); this fallback only
// covers PromptBuilder instances constructed without that stamp (e.g. tests, skill).
const DEFAULT_JOURNALIST_FIRST_NAME = 'Cassandra';

/**
 * Reporting-mode blocks (BASELINE.md §4 class 6).
 *
 * BOTH remote sessions of the last five were written as on-site. The rule
 * existed (a "REPORTING MODE OVERRIDE" section in character-voice.md) but arrived
 * as an OVERRIDE, appended after that file's on-site persona ("Was surveilling the
 * party") and its "in-the-muck-with-everyone" voice line — and it lost. So the
 * mode does not override the persona any more: it IS the persona, stated once, in
 * the system prompt, immediately after the identity line.
 *
 * I3 finished the job: the craft prompts no longer assert presence at all, in
 * either direction. Since phase 3 (3.2) the journalist's craft files are retired and
 * T8 in the truth rules defers here. This block is the only place the reporter's
 * whereabouts are stated. Pinned by prompt-reporting-mode-neutral.test.js.
 *
 * "You did not vote" is in both of the detective's blocks below. The reporter covers
 * the room and is never a member of it; hardConstraints used to say the opposite in
 * so many words (`use "We decided"`). The journalist's blocks said it too until
 * phase 3 (task 3.1); for the journalist it is now T8's shared part in
 * truth-rules.md, which the outline and article writers carry in their system
 * prompts since 3.2 (the arc calls and judges from 3.3 and 3.4).
 *
 * Phase 2 (2.6): the remote block asks for attribution and allows the absence to
 * be stated at most once. 092026's remote article announced it five times ("I was
 * not there.", "I was not in that room.", "This is the story they told me.") and
 * the article evaluation praised it as voice. The prompt lines that restated where
 * the reporter was now defer to this block instead.
 *
 * Phase 3 (task 3.1): these two strings are the DETECTIVE's blocks only, kept as they
 * were while the detective is parked (spec D13). The journalist's block is the rule
 * set's mode file, `references/rules/mode-on-site.md` or `mode-remote.md`, read
 * through lib/rule-set.js: T8's mode part, Nova's position as the uninterested
 * third party and what Nova could witness. Its remote file sends exposures to Nova
 * by turn-in, never as tips; "never votes" moved to the truth rules (T8's shared
 * part) and the party to T7.
 */
const DETECTIVE_REPORTING_MODE_BLOCKS = {
  'on-site': 'You watched the investigation from inside the room and spoke to people there. You did not vote and you were not at the party; the party reaches you only through the memories people exposed.',
  remote: 'You were not in the room. Every exposure, observation, and the verdict reached you as tips from people who were there: show where each fact came from by attributing it to the people who told you. State your absence at most once in the whole piece; the attribution shows it everywhere else. You did not vote and you were not at the party.'
};

/**
 * The block for one session and theme, defaulting to on-site.
 *
 * The single source of the wording for all eight system prompts that carry it:
 * the article's (PromptBuilder._buildReportingModeBlock) and the article rework's,
 * the outline's and the outline rework's, the two arc calls' and the two arc rework
 * branches'. The two arc calls are built outside PromptBuilder, in
 * arc-specialist-nodes.js, and reach this through withReportingModeBlock. Since
 * phase 2 (2.3) every rework system prompt opens with its writer's, so each rework
 * carries the block its writer does, once, in the writer's position.
 *
 * The journalist reads the rule set's mode file (loadModeBlock), wrapped in one tag
 * named after the file (`<mode-remote>`), so the system prompt's text after the block
 * is not read as part of its "## T8" section; the detective keeps
 * DETECTIVE_REPORTING_MODE_BLOCKS. The theme is required: a missing one would
 * silently give one theme the other's block.
 *
 * @param {Object} [sessionConfig] - the session's config, with reportingMode
 * @param {'journalist'|'detective'} theme
 * @returns {string}
 * @throws {Error} on any other theme, a missing one included
 */
function buildReportingModeBlock(sessionConfig, theme) {
  const mode = sessionConfig?.reportingMode === 'remote' ? 'remote' : 'on-site';
  if (theme === 'journalist') return loadModeBlock(mode);
  if (theme === 'detective') return DETECTIVE_REPORTING_MODE_BLOCKS[mode];
  throw new Error(
    `buildReportingModeBlock: unknown theme "${theme}"; the theme is required ('journalist' or 'detective')`
  );
}

/**
 * The roster with pronouns under its heading, without the character context: the
 * section the arc writer (the weave) and the map writer print, with their reworks (phase
 * 3, 3.10; T9; phase 4), each player with the pronoun the roster stop gave and the NPCs'
 * canon lines, as the article writer's system prompt and the judges print them
 * (generateRosterSection). Neither reads the character data with it: the arc writer
 * prints its own character context, and the map writer reads none.
 *
 * The 4b fix batch (3.10 review minor 5): one builder, heading included. The section
 * was built at two sites with two constructions, and the outline printed it bare while
 * the arc writer gave it a heading of its own. Journalist only: the detective's prompts
 * print no such section (D13).
 *
 * @param {Object|null} sessionConfig - its roster and rosterPronouns
 * @param {Object|null} canonicalCharacters - first name -> full name
 * @returns {string}
 */
function rosterWithPronounsSection(sessionConfig, canonicalCharacters) {
  const config = sessionConfig || {};
  return `### Names and Pronouns
${generateRosterSection('journalist', canonicalCharacters || null, null, config.rosterPronouns, config.roster)}`;
}

/**
 * Put the block into a system prompt assembled somewhere else.
 *
 * Phase 1 brief 1.5: the arc writer and the outline reworker were never told the
 * mode, so a remote session's arc summaries said "I watched" and its outline
 * carried six presence claims. Their system prompts are fixed constants, so the
 * block is inserted here, in the position the article uses: immediately after the
 * identity line, before anything else the prompt asserts.
 *
 * @param {string} systemPrompt - a system prompt whose FIRST LINE is its identity
 * @param {Object} [sessionConfig] - the session's config, with reportingMode
 * @param {'journalist'|'detective'} theme - see buildReportingModeBlock
 * @returns {string}
 */
function withReportingModeBlock(systemPrompt, sessionConfig, theme) {
  const text = String(systemPrompt || '');
  const identityLine = text.split('\n', 1)[0];
  const rest = text.slice(identityLine.length).replace(/^\n+/, '');
  return `${identityLine}\n\n${buildReportingModeBlock(sessionConfig, theme)}\n\n${rest}`;
}

/**
 * Each writer's identity line, by theme and phase: who is writing, and nothing more. The
 * world, the truth rules and the craft guidance (lib/rule-set.js) carry the rest (phase
 * 3, 3.2). A rework's first line is its rework rules' own (ai-nodes.js). The parked
 * detective's lines went with its writers (R1): its outline writer's in phase 4 brief
 * 4.6, its article writer's and its revision line in brief 4.7b.
 */
const THEME_SYSTEM_PROMPTS = {
  journalist: {
    outlineGeneration: 'You are laying out the story map of a NovaNews investigative article.',
    articleGeneration: 'You are Nova, writing a NovaNews investigative article in the first person.'
  }
};

class PromptBuilder {
  /**
   * @param {ThemeLoader} themeLoader - Initialized ThemeLoader instance
   * @param {string} themeName - Theme name (default: 'journalist')
   */
  constructor(themeLoader, themeName = 'journalist', sessionConfig = {}, canonicalCharacters = null, characterData = null) {
    this.theme = themeLoader;
    this.themeName = themeName;
    this.sessionConfig = sessionConfig;
    this.canonicalCharacters = canonicalCharacters;
    this.characterData = characterData;
  }

  /**
   * Returns the roster section string for the current theme/characters/pronouns.
   * Single source of truth for the 4 identical generateRosterSection call sites (CR-7).
   *
   * @returns {string}
   */
  _rosterSection() {
    return generateRosterSection(this.themeName, this.canonicalCharacters, this.characterData,
      this.sessionConfig?.rosterPronouns, this.sessionConfig?.roster);
  }

  /**
   * The session's reporting-mode block (BASELINE §4 class 6).
   *
   * Placed in the SYSTEM prompt right after the identity line, where it replaces
   * the persona rather than overriding it later in a rules file.
   *
   * @returns {string}
   */
  _buildReportingModeBlock() {
    return buildReportingModeBlock(this.sessionConfig, this.themeName);
  }

  /**
   * Build the <INVESTIGATION_OBSERVATIONS> section from the director's raw notes.
   *
   * Shared by the article prompt and (phase 1, brief 1.5) the outline prompt: the
   * planner that decides what each section does had never read the director's own
   * account of the morning. One renderer, one wording, so the outline and the
   * article are planned and written against the same observations.
   *
   * @param {Object|null} directorNotes - enriched director notes
   * @param {string[]|null} [corrections] - the director's input-review corrections, in
   *   order (brief 2.2): rendered right after the notes, which are never rewritten
   * @param {Object|null} [evidenceBundle] - the curated bundle, whose sales decide the
   *   session clock of a thread with no stamp, as the record view's timeline does
   *   (brief 3.5): the transaction links print their times on that one decision
   * @returns {string} the XML section, or '' when the director wrote no prose
   *
   * Phase 3 (3.2): the header no longer dates every line to "this morning" (the
   * notes hold the director's read of the session and the epilogue as well), and
   * no longer prescribes wire phrasing ("It has just been announced…") for the
   * follow-up: T7 says the follow-up is Nova's own reporting, from the epilogue
   * alone. The header points at <EPILOGUE> only when the notes carry one, so a
   * session with no epilogue gets no post-investigation section at all.
   */
  _buildInvestigationObservations(directorNotes, corrections = null, evidenceBundle = null) {
    if (!directorNotes?.rawProse) return '';
    const notes = renderDirectorEnrichmentBlock({
      rawProse: directorNotes.rawProse,
      quotes: directorNotes.quotes,
      transactionReferences: directorNotes.transactionReferences,
      postInvestigationDevelopments: directorNotes.postInvestigationDevelopments,
      corrections,
      sessionConfig: withSessionClock(this.sessionConfig, evidenceBundle)
    });
    const epilogueLine = notes.includes('\n<EPILOGUE>\n')
      ? "\nThe follow-up from Nova's day is the <EPILOGUE> below; T7 says how Nova reports it."
      : '';
    return `<INVESTIGATION_OBSERVATIONS>
The director's notes on the session, as written. Each block below says what it is.${epilogueLine}

${notes}
</INVESTIGATION_OBSERVATIONS>`;
  }

  /**
   * Build the <DIRECTOR_GUIDANCE> section (Q2 decision).
   *
   * Appended LAST to the outline and article user prompts. Recency bias is the
   * point: the director reviewed the ARCS and is telling the writer where to put
   * the weight, which has to survive several thousand tokens of craft rules.
   *
   * @param {string|null} directorGuidance - free text from the arc-selection gate
   * @param {Array} [gateNotes] - directorGateNotes entries carried into this prompt
   * @returns {string} XML section, or '' when there is neither guidance nor notes
   */
  _buildDirectorGuidance(directorGuidance, gateNotes = []) {
    const section = buildDirectorGuidanceSection(directorGuidance, gateNotes);
    return section ? '\n' + section : '';
  }

  /**
   * The FINANCIAL_SUMMARY section: the ledger's accounts with code-computed figures.
   * Returns '' when no account has a positive total. Journalist only.
   *
   * Phase 3 (3.2): the figures are 3.5's (lib/session-ledger.js buildLedger). An
   * account's total is its sales plus the first-burial bonus and the transfers it
   * received, less those it sent, so the sum of the totals is the sales and the
   * bonus: it is labelled for what it sums, where "Total buried" overstated the
   * sales. Each account's count is its sales (tokenCount), never "tokens" (T14).
   * The block it replaces ("HOW THE BLACK MARKET WORKS") said Blake keeps every
   * buried memory and that each total was its holder's pay for their own secrets,
   * both against the world and T3, T4 and T5, which now say how the money moves.
   *
   * Phase 3 (3.9; T5, R11): the total is what the buyer paid out. Who the buyer is,
   * NeurAI and its board, is Nova's suspicion, so the figures the writers copy name no
   * payer. The outline and article judges print this same block (evaluator-nodes.js
   * renderJudgeFinancialSummary), so a judge checks a writer's money against the
   * figures that writer was given.
   *
   * Final review (data-harness-docs[0]): where the session report's Final Standings
   * disagree with an account's rows, or credit an account no row reached, its total is
   * the standings' figure and buildLedger keeps the rows' sum as `computedTotal`. That
   * account's line says its figure is the session report's final total, so a writer or
   * a judge never reads it as sales plus transfers, and the grand total adds up the
   * rows, so it stays the sales and the bonus, and says so. A ledger whose standings
   * agree prints as before.
   *
   * @param {Array} shellAccounts - Array of {name, total, tokenCount, computedTotal?} objects
   * @returns {string} XML section or empty string
   */
  _buildFinancialSummary(shellAccounts) {
    if (!shellAccounts || shellAccounts.length === 0) return '';
    const nonZero = shellAccounts.filter(a => a.total > 0);
    if (nonZero.length === 0) return '';

    const isFinalFigure = (a) => Number.isFinite(a.computedTotal);
    const total = shellAccounts.reduce((sum, a) => sum + ((isFinalFigure(a) ? a.computedTotal : a.total) || 0), 0);
    const sales = (count) => {
      const n = Number.isFinite(count) ? count : 0;
      return `${n} sale${n === 1 ? '' : 's'}`;
    };
    const finalFigure = (a) => (isFinalFigure(a)
      ? "; the session report's final total for this account, which the ledger's sales, bonus and transfers do not add up to"
      : '');
    const sumSource = shellAccounts.some(isFinalFigure) ? ", by the ledger's sales, bonus and transfers" : '';

    return `
<FINANCIAL_SUMMARY>
The ledger's accounts, with figures code computed from the session report. Each account's total is its sales, plus the first-burial bonus and the transfers it received, less the transfers it sent; beside it, how many sales it took.
${nonZero.map(a => `- ${a.name}: $${a.total.toLocaleString('en-US')} (${sales(a.tokenCount)}${finalFigure(a)})`).join('\n')}
All accounts together${sumSource}: $${total.toLocaleString('en-US')}. That is what the buyer paid out this morning, the sales and the first-burial bonus; a transfer moves money between accounts and adds nothing to it.
</FINANCIAL_SUMMARY>`;
  }

  /**
   * The SESSION_FACTS section of the journalist outline and article writers, one
   * builder for both: the roster, the verdict, and who was where.
   *
   * Phase 3 (3.2): the agency rule is rewritten, not deleted. It used to say no
   * character off the roster acts or speaks during the investigation, which wrote
   * Blake out of the room he works (the world; plan review I11). Only the roster's
   * players were at the investigation, every other character reaches the article
   * through the memories and documents, Blake acts in the room, and Nova is not one
   * of the players. The head count is the roster's (T10), a guest reporter who
   * plays a character included, since that character is on the roster. Fix 3.2b
   * (finding 7): "every other character except Blake", so the line does not put
   * Blake among the absent and then in the room, and the count is in T10's words,
   * of the people at the investigation (Blake, and Nova on site, were in the room).
   *
   * Final review (rules-writers[0]; R11, T5, T14): Blake's line says what world.md says
   * Blake does in the room, making deals, and nothing about whom the deals serve. "Working
   * it for NeurAI" stated as fact who stands behind the market, which is Nova's
   * suspicion, and the gate's outline carried it into FOLLOW THE MONEY.
   *
   * @param {Object|null} sessionFacts - ai-nodes.js buildSessionFacts
   * @returns {string} the XML section, or '' without facts
   */
  _sessionFactsSection(sessionFacts) {
    if (!sessionFacts) return '';
    const n = sessionFacts.playerCount;
    return `
<SESSION_FACTS>
INVESTIGATION ROSTER (${n} players):
${sessionFacts.roster.join('\n')}

${renderSessionFactsVerdict(sessionFacts)}

Only the ${n} players above were at the investigation. Every other character except Blake appears only through the memories and documents. Blake was in the room too, making deals, and acts and speaks there as the record shows. Nova is not one of the players. When the article counts the people at the investigation, it counts these ${n} players.
</SESSION_FACTS>`;
  }

  /**
   * The map writer's prompt (phase 4, brief 4.6; spec 5.1): its system prompt
   * (buildOutlineSystemPrompt), its user sections (buildOutlineUserSections), then
   * <DIRECTOR_GUIDANCE> last, with the standing notes. The map's rework is built from the
   * same two builders (ai-nodes.js buildOutlineRevisionPrompt), so whatever this writer is
   * given reaches its rework without a second copy.
   *
   * @param {string} settledWeave - the settled weave (prompt-renderers/settled-weave.js)
   * @param {Array} photos - code's pick for the top photo first, marked as the hero, then
   *   every other photo the director kept (ai-nodes.js outlineWriterInputs)
   * @param {Array} shellAccounts - Deterministic shell account data
   * @param {Object|null} sessionFacts - Roster and verdict (ai-nodes.js buildSessionFacts)
   * @param {Object} options - { gateNotes, directorNotes, evidenceBundle,
   *   directorCorrections, photoDescriptions }
   * @returns {Promise<{systemPrompt: string, userPrompt: string}>}
   */
  async buildOutlinePrompt(settledWeave, photos = [], shellAccounts = [], sessionFacts = null, options = {}) {
    const systemPrompt = await this.buildOutlineSystemPrompt();
    let userPrompt = await this.buildOutlineUserSections(settledWeave, photos, shellAccounts, sessionFacts, options);

    // The standing notes, LAST, so they outrank the rules above (Q2; spec 2026-09-19 §5.3):
    // the director's note from the story meeting is among them.
    userPrompt += this._buildDirectorGuidance(null, options.gateNotes || []);

    return { systemPrompt, userPrompt };
  }

  /**
   * The map writer's system prompt, shared with its rework (2.3): the identity line, the
   * mode block right after it (brief 1.5), then the world and the truth rules, the stable
   * frame every writer reads first (phase 3, 3.2; the integrator's placement ruling). Its
   * craft files go last in the user prompt.
   *
   * @returns {Promise<string>}
   * @throws {Error} for a theme with no story map (lib/map.js mapSchemaFor), such as the
   *   parked detective (R1): the outline stage's detective branch went with the old stage
   */
  async buildOutlineSystemPrompt() {
    mapSchemaFor(this.themeName);
    return `${THEME_SYSTEM_PROMPTS[this.themeName].outlineGeneration}

${this._buildReportingModeBlock()}

${loadRuleSet('outline').core}`;
  }

  /**
   * The map writer's user prompt up to, not including, <DIRECTOR_GUIDANCE> (phase 4, brief
   * 4.6). Shared with the map's rework, which follows it with its revision block and then
   * its own <DIRECTOR_GUIDANCE>.
   *
   * The settled weave comes first, as the writer's task (spec 5.1), then the task itself and
   * the theme's slots, then what the outline writer read: the director's notes, the photos
   * with the director's descriptions, the record with its morning timeline, the money, the
   * session facts with the director's accusation, the roster with pronouns (phase 3, 3.10;
   * T9), the map's <SCHEMA> (fix 3.2b) and the craft files last (the integrator's placement
   * ruling). The arcs, the arc analysis and the selected arcs went with their channels (R4),
   * and the arc stage's <SHOULD_CONSIDER> with the arc selection.
   *
   * @returns {Promise<string>}
   * @throws {Error} with no settled weave: the map lays out the weave the meeting settled
   */
  async buildOutlineUserSections(settledWeave, photos = [], shellAccounts = [], sessionFacts = null, options = {}) {
    if (typeof settledWeave !== 'string' || !settledWeave.trim()) {
      throw new Error('The map writer reads the settled weave first, and this thread holds no weave: the story meeting settles it. Go back to the story meeting.');
    }
    const slots = mapSlotsOf(this.themeName);
    const observationsSection = this._buildInvestigationObservations(options.directorNotes, options.directorCorrections, options.evidenceBundle);
    // Brief 2.1: every usable document in full, once, with the morning timeline.
    const recordSection = renderRecordView(options.evidenceBundle, { sessionConfig: this.sessionConfig });
    const rosterSection = rosterWithPronounsSection(this.sessionConfig, this.canonicalCharacters);
    const photoList = Array.isArray(photos) ? photos : [];
    // Brief 4.6b: the entry renderPhotoListEntry marks [hero image].
    const heroMarked = photoList.some((photo) => Boolean(photo && photo.hero));

    return `${settledWeave}

${mapTask(heroMarked)}

<SLOTS>
The article's slots, in their usual order, each with the heading the map starts from:
${slots.map((slot) => `- ${slot.key}: ${slot.heading ? slot.heading : 'no heading'}`).join('\n')}
</SLOTS>
${observationsSection ? `\n${observationsSection}\n` : ''}
<available-photos>

${photoList.length > 0 ? photoList.map((p, i) => renderPhotoListEntry(p, i, options.photoDescriptions)).join('\n\n') : 'No session photos available'}

A photo is placed by its exact filename above.
</available-photos>

${recordSection}
${this._buildFinancialSummary(shellAccounts)}
${this._sessionFactsSection(sessionFacts)}

${rosterSection}

<SCHEMA>
The map is JSON in this shape: field names, types, enum values and required fields.

\`\`\`json
${JSON.stringify(mapSchemaFor(this.themeName), null, 2)}
\`\`\`
</SCHEMA>

${loadRuleSet('outline').craft}`;
  }

  /**
   * Build article generation prompt
   * Phase 4: Generate final article HTML from approved outline
   *
   * Uses context engineering techniques:
   * - XML tags for clear section boundaries
   * - Recency bias: rules placed LAST in prompt
   * - Voice checkpoint: model internalizes voice before generating
   * - Voice self-check: model assesses own output
   *
   * Phase 2 (2.3): the writer's prompt is its system prompt
   * (buildArticleSystemPrompt), its user sections (buildArticleUserSections), then
   * <DIRECTOR_GUIDANCE>. The article reworker is built from the same two builders
   * (ai-nodes.js buildArticleRevisionPrompt). The <SHOULD_CONSIDER> it carried, the
   * outline evaluation's advisories, went with the outline judge (phase 4, brief 4.6).
   *
   * @param {Object} outline - Approved article outline
   * @param {string|null} heroImage - Hero image filename (prevents duplicate in photos)
   * @param {Array} shellAccounts - Shell account data for financial summary
   * @param {Object|null} sessionFacts - Session facts for non-roster character guardrail
   * @param {Object|null} directorNotes - Director observations for article grounding
   * @param {Object|null} narrativeTensions - Programmatic contradictions from surfaceContradictions node
   * @param {Object} options - { directorGuidance, gateNotes, evidenceBundle, directorCorrections,
   *   photoDescriptions, photos }
   * @returns {Promise<{systemPrompt: string, userPrompt: string}>}
   */
  async buildArticlePrompt(outline, heroImage = null, shellAccounts = [], sessionFacts = null, directorNotes = null, narrativeTensions = null, options = {}) {
    const systemPrompt = await this.buildArticleSystemPrompt();
    let userPrompt = await this.buildArticleUserSections(
      outline, heroImage, shellAccounts, sessionFacts, directorNotes, narrativeTensions, options
    );

    // Q2: the director's arc-selection emphasis, LAST so it outranks the rules above.
    // Since spec 2026-09-19 §5.3 the same section also carries the standing gate notes
    // (every rejection note still in state), as a second paragraph inside the same tag.
    userPrompt += this._buildDirectorGuidance(options.directorGuidance, options.gateNotes || []);

    return { systemPrompt, userPrompt };
  }

  /**
   * The article writer's system prompt, shared with the article reworker (2.3): the
   * identity, the mode block, the world, the truth rules and the roster with pronouns
   * (phase 3, 3.2: the integrator's placement ruling). The roster prints here alone (M20:
   * the user prompt's <RULES> carried a second copy).
   *
   * @returns {Promise<string>}
   * @throws {Error} for a theme with no story map (lib/map.js mapSchemaFor), such as the
   *   parked detective (R1): the article writer writes from the map, and the article
   *   stage's detective branch went with the old stages (phase 4, brief 4.7b)
   */
  async buildArticleSystemPrompt() {
    mapSchemaFor(this.themeName);
    return `${THEME_SYSTEM_PROMPTS[this.themeName].articleGeneration}

${this._buildReportingModeBlock()}

${loadRuleSet('article').core}

${this._rosterSection()}`;
  }

  /**
   * The article writer's user prompt up to, not including, <SHOULD_CONSIDER> and
   * <DIRECTOR_GUIDANCE>: the data (outline, record, money, observations),
   * the rules and the generation instruction with its schema. Shared with the article
   * reworker (2.3). Takes buildArticlePrompt's arguments; the tail's options
   * (shouldConsider, directorGuidance, gateNotes) are not read here.
   *
   * @returns {Promise<string>}
   * @throws {Error} for a theme with no story map, such as the parked detective (R1)
   */
  async buildArticleUserSections(outline, heroImage = null, shellAccounts = [], sessionFacts = null, directorNotes = null, narrativeTensions = null, options = {}) {
    mapSchemaFor(this.themeName);
    // Brief 2.1: the record, once, in the data part. Phase 4 (brief 4.6; R5): the arc
    // packages that named each arc's documents went; the record is whole.
    const recordSection = renderRecordView(options.evidenceBundle, { sessionConfig: this.sessionConfig });
    return this._journalistArticleUserSections(
      outline, heroImage, shellAccounts, sessionFacts, directorNotes, narrativeTensions, options, recordSection
    );
  }

  /**
   * The journalist article writer's user prompt up to <SHOULD_CONSIDER> and
   * <DIRECTOR_GUIDANCE>: the data, the roster and verdict, the generation instruction
   * with its schema, and the craft files last (phase 3, 3.2: the integrator's
   * placement ruling; the world and the truth rules are in the system prompt).
   *
   * Gone, because the rule set states each once or contradicted it: the temporal
   * context key (M11: no document carries the field) and <TEMPORAL_DISCIPLINE> (the
   * world and T7; its "memories were exposed to the Detective" and "written
   * immediately after" with them), <RULES> and its second roster (M20), <ARC_FLOW>
   * (every arc in every section; "the reader must not see where an arc ends"),
   * <VISUAL_DISTRIBUTION> (a fixed section table, pull quotes), <ANTI_PATTERNS>,
   * <VOICE_CHECKPOINT> ("participatory and implicated", a Nova the story "happened
   * to"), the voice self-check, the old agency rule, the card text's id and timestamp
   * prefix (T12), and the schema's "the schema wins" line and SDK note (M24).
   *
   * The instruction asks only for the fields the article prints. The schema keeps
   * the rest as optional (HY1, the integrator's ruling): the article stop's sidebar
   * editor writes a sidebar entry's owner. The money tracker prints itself from the ledger (M2). An
   * evidence reference is described as the template prints it, a caption naming a
   * document (M1).
   *
   * Phase 3 (3.7): APPROVED OUTLINE leaves out the outline writer's questions, which
   * were the director's to answer at the outline stop.
   *
   * Phase 3 (3.9; T13, the integrator's ruling): the article places every photo the
   * director has not excluded, and the outline only what its photo slots hold, so the
   * writer is given the outline writer's whole set less the excluded photos
   * (options.photos, from articleWriterInputs): the hero image, then every other photo
   * the director kept but the whiteboard. A hero the director excluded comes as none.
   * PHOTOS prints each one's entry once (renderPhotoListEntry, the entry the article
   * judge lists too: the 4b fix batch).
   *
   * Phase 4 (brief 4.6; R5): the arc packages went; the writer reads the record whole.
   *
   * @returns {string}
   */
  _journalistArticleUserSections(outline, heroImage, shellAccounts, sessionFacts, directorNotes, narrativeTensions, options, recordSection) {
    const photos = Array.isArray(options.photos) ? options.photos.filter(photo => photo && photo.filename) : [];
    const photoSection = photos.length > 0
      ? `PHOTOS (every photo the director has not excluded, without the whiteboard${photos[0].hero ? ': the hero image, then the rest' : ''}; each gives the names identified in it and the director's description):

${photos.map((photo, i) => renderPhotoListEntry(photo, i, options.photoDescriptions)).join('\n\n')}`
      : 'PHOTOS: none';

    // T4: the director's sentences about Blake and the Valet, through the filter the
    // arc writer's section uses (fix 3.2b): each stored sentence prints only when the
    // notes hold it word for word.
    const tensions = directorTensionSentences(narrativeTensions, directorNotes?.rawProse || '');
    const tensionsSection = tensions.length > 0 ? `
<NARRATIVE_TENSIONS>
${DERIVED_LABELS.narrativeTensions}
${tensions.map(sentence => `- ${sentence}`).join('\n')}
</NARRATIVE_TENSIONS>` : '';

    const byline = [
      `"author": "${this.sessionConfig.journalistFirstName || DEFAULT_JOURNALIST_FIRST_NAME} Nova | NovaNews"`,
      '"title": "Senior Investigative Correspondent"',
      ...(this.sessionConfig.guestReporter
        ? [`"guestReporter": "${this.sessionConfig.guestReporter.name} | ${this.sessionConfig.guestReporter.role}"`]
        : [])
    ].join(', ');

    return `<DATA_CONTEXT>
APPROVED OUTLINE:
${JSON.stringify(withoutWriterQuestions(outline), null, 2)}

HERO IMAGE: ${heroImage || 'none chosen: use the first photo the outline places'}
It prints at the top of the article, as "heroImage". The other photos in PHOTOS print as inline photo blocks.

${photoSection}

${recordSection}
${this._buildFinancialSummary(shellAccounts)}
${this._buildInvestigationObservations(directorNotes, options.directorCorrections, options.evidenceBundle)}
${tensionsSection}
</DATA_CONTEXT>
${this._sessionFactsSection(sessionFacts)}

<GENERATION_INSTRUCTION>
Write the article as a ContentBundle: JSON in the shape of the schema at the end of this instruction. Every object takes only the fields the schema lists for it, and every "type" only the values listed.

1. "sections": the article's sections, in reading order. Each has:
   - "id": the slot the section fills, one of lede, the-story, follow-the-money, the-players, whats-missing or closing. A slot the article does not use has no section.
   - "type": one of "narrative", "evidence-highlight", "investigation-notes" or "conclusion".
   - "heading": optional. A section with none prints untitled.
   - "content": an array of blocks, each one of these:
     * {"type": "paragraph", "text": "..."}
     * {"type": "quote", "text": "...", "attribution": "..."}: "attribution" is the speaker.
     * {"type": "evidence-card", "tokenId": "...", "headline": "...", "content": "...", "owner": "...", "significance": "critical" | "supporting" | "contextual"}: an inline card, printed whole in the body. "content" is copied from ${DOCUMENT_POINTER}, and "owner" is that document's owner as the record gives it.
     * {"type": "evidence-reference", "tokenId": "...", "caption": "..."}: a one-line caption naming a document, printed in the body with none of the document's text. Give it a caption; with none, the article prints the bare id.
     * {"type": "photo", "filename": "...", "caption": "..."}: an inline photo, by its exact filename.
     * {"type": "list", "items": ["..."], "ordered": false}
2. "evidenceCards": the sidebar's entries. Each names a document by its id in "tokenId", with a "headline", a one-line "summary" under 100 characters, and its "significance".
3. "heroImage": {"filename": "<the HERO IMAGE filename>", "caption": "..."}.
4. "headline": {"main": "...", "kicker": "...", "deck": "..."}.
5. "byline": {${byline}}.
6. "metadata": {"sessionId": "...", "theme": "journalist", "generatedAt": "<an ISO 8601 timestamp>"}. The server stamps these values.

These are the fields the article prints, and the money tracker prints itself from the ledger. The schema also allows fields that nothing prints, and the bundle leaves them out: "financialTracker", "photos", "pullQuotes" and "voice_self_check"; a sidebar entry's "owner", "placement" and "content"; and the "characters" of a photo or of the hero image.

<SCHEMA>
The ContentBundle's shape: field names, types, enum values and required fields.

\`\`\`json
${JSON.stringify(contentBundleSchema, null, 2)}
\`\`\`
</SCHEMA>
</GENERATION_INSTRUCTION>

${loadRuleSet('article').craft}`;
  }

  /**
   * Fail loud when a writer's rules did not load.
   *
   * ThemeLoader.loadPrompt WARNS and returns '' for a file it cannot read. A
   * reworker built on that would run without the craft rules its writer had, and
   * nothing in the output would show it. Phase 2 (2.3): each reworker is its
   * writer's prompt plus a revision block, so the reworkers check their writer's
   * phase (ai-nodes.js buildOutlineRevisionPrompt, buildArticleRevisionPrompt).
   *
   * Phase 3 (3.2): the journalist's writers read the rule set, so its check is the
   * rule-set loader's own, which throws naming every missing or empty rule file. The
   * detective is parked and checks its craft files as before.
   *
   * @param {'outlineGeneration'|'articleGeneration'} phase - the writer's phase
   * @throws {Error} if any of the phase's rule or prompt files is empty or missing
   */
  async requirePhasePrompts(phase) {
    if (this.themeName === 'journalist') {
      const call = JOURNALIST_RULE_SET_CALLS[phase];
      if (!call) {
        throw new Error(`[PromptBuilder] No journalist writer reads phase "${phase}"; phases: ${Object.keys(JOURNALIST_RULE_SET_CALLS).join(', ')}`);
      }
      loadRuleSet(call);
      return;
    }
    const required = this.getPhaseRequirements(phase);
    const rawPrompts = await this.theme.loadPhasePrompts(phase);
    const empty = required.filter(
      name => !rawPrompts[name] || !String(rawPrompts[name]).trim()
    );
    if (empty.length > 0) {
      throw new Error(
        `[PromptBuilder] Missing ${phase} prompt${empty.length > 1 ? 's' : ''} for theme ` +
        `"${this.themeName}": ${empty.join(', ')}. ThemeLoader returns '' for an unreadable ` +
        `file, so reworking now would silently drop the craft rules the writer had.`
      );
    }
  }

  /**
   * Get this theme's prompt files for a phase (for debugging/logging). The
   * journalist's writers list none: they read the rule set.
   * @param {string} phase - Phase name
   * @returns {string[]} - List of required prompt names
   */
  getPhaseRequirements(phase) {
    return (PHASE_REQUIREMENTS[this.themeName] || {})[phase] || [];
  }
}

/**
 * Factory function to create PromptBuilder with default ThemeLoader
 * @param {string|Object|null} options - Custom path (string, legacy) or { theme, customSkillPath }
 * @returns {PromptBuilder}
 */
function createPromptBuilder(options = null) {
  // Legacy: support direct string argument (custom skill path)
  if (typeof options === 'string') {
    const themeLoader = createThemeLoader(options);
    return new PromptBuilder(themeLoader, 'journalist');
  }

  const { theme = 'journalist', customSkillPath, sessionConfig = {}, canonicalCharacters = null, characterData = null } = options || {};
  const themeLoader = createThemeLoader({ theme, customPath: customSkillPath });
  return new PromptBuilder(themeLoader, theme, sessionConfig, canonicalCharacters, characterData);
}

module.exports = {
  PromptBuilder,
  createPromptBuilder,
  generateRosterSection,
  // The roster with pronouns, without the character context, for the arc writer and the
  // map writer (the 4b fix batch; phase 4)
  rosterWithPronounsSection,
  buildDirectorGuidanceSection,
  // Shared with buildRevisionContext (node-helpers.js), which introduces the detective
  // rework's advisory list with it; a journalist rework's list has its own line,
  // REWORK_SHOULD_CONSIDER_LINE (phase 3, 3.10).
  SHOULD_CONSIDER_PREAMBLE,
  filterGateNotes,
  DETECTIVE_REPORTING_MODE_BLOCKS,
  buildReportingModeBlock,
  // Consumed by the system prompts assembled outside PromptBuilder (the two arc
  // calls, and through the arc writer's the two arc rework branches), so the
  // block's wording has one home.
  withReportingModeBlock
};

// Self-test when run directly
if (require.main === module) {
  (async () => {
    console.log('PromptBuilder Self-Test\n');

    const builder = createPromptBuilder();

    // Validate theme loader first
    const validation = await builder.theme.validate();
    if (!validation.valid) {
      console.error('Theme validation failed:', validation.missing);
      process.exit(1);
    }
    console.log('Theme files validated.\n');

    // Show phase requirements
    console.log('Phase requirements:');
    Object.keys(PHASE_REQUIREMENTS[builder.themeName] || {}).forEach(phase => {
      const reqs = builder.getPhaseRequirements(phase);
      console.log(`  ${phase}: ${reqs.length} prompts`);
    });
  })();
}

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
const { renderSessionFactsVerdict, renderPhotoEntry } = require('./prompt-renderers/director-words-renderer');
const contentBundleSchema = require('./schemas/content-bundle.schema.json');
// The journalist outline writer embeds this file as its <SCHEMA> (fix 3.2b), the one
// the SDK channel enforces (ai-nodes.js), as the article writer embeds the schema above.
const outlineSchema = require('./schemas/outline.schema.json');
// The detective is parked (spec D13) and its prompt keeps today's text, the <SCHEMA>
// it embeds included. Phase 3 (3.2) cut the schema's descriptions down to shape only,
// so the detective prints this copy of the schema as it was before that cut. It is
// printed, never validated against: the schema above is the one every check uses.
// lib/__tests__/content-bundle-detective-copy.test.js holds the copy to the live
// schema's shape. The copy carries no $id, so it can never be registered as the live
// schema (fix 3.2b); the printed text puts back the id line it printed before (D13).
// Phase 3 (3.7): the copy carries the live schema's writerQuestions, to keep its
// shape, and the detective's print leaves it out, so its <SCHEMA> stays as it was.
const detectivePromptSchema = require('./schemas/content-bundle.detective-prompt.json');
const { withoutWriterQuestions, schemaWithoutWriterQuestions } = require('./writer-questions');
const DETECTIVE_PRINTED_SCHEMA = (({ $schema, ...rest }) => ({ $schema, $id: 'content-bundle', ...rest }))(schemaWithoutWriterQuestions(detectivePromptSchema));
const { getThemeNPCEntries } = require('./theme-config');
const { loadModeBlock, loadRuleSet } = require('./rule-set');
// theme-config import removed: canonicalCharacters now derived entirely from Notion

/** What the roster block prints for a roster character whose pronoun the roster stop did not capture (T9). */
const PRONOUN_NOT_GIVEN = 'pronoun not given';

/** The rule-set call each journalist writer phase reads (lib/rule-set.js), for requirePhasePrompts. */
const JOURNALIST_RULE_SET_CALLS = Object.freeze({
  outlineGeneration: 'outline',
  articleGeneration: 'article'
});

/**
 * What the arc packages' excerpts are, in the journalist outline and article
 * prompts (phase 3, 3.2). They are fragments buildArcEvidencePackages cuts at
 * sentence breaks; their label used to send them to pull quotes, which never print.
 */
const ARC_EXCERPTS_LABEL =
  "Excerpts are fragments code cut from each document's text at its sentence breaks, in the document's own words: pointers to lines worth reading in its full text.";

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
 * Wrap prompt content with XML tags for AI cross-referencing
 *
 * Uses XML tags for consistency with Claude's training and token efficiency.
 * Cross-references use tag names: "See <narrative-structure> Section 8"
 *
 * @param {string} filename - The prompt file name (e.g., 'narrative-structure')
 * @param {string} content - The prompt file content
 * @returns {string} XML-wrapped content
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
 * The same two lines introduce the list wherever it appears: here in a generation
 * prompt, and in buildRevisionContext's SHOULD CONSIDER block in a rework prompt.
 */
const SHOULD_CONSIDER_PREAMBLE =
  'These came from the evaluation that ran before this pass. Apply them where they\n' +
  'serve the piece. They are not requirements.';

/**
 * Build the <SHOULD_CONSIDER> section: the previous stage's advisory findings.
 *
 * Placed immediately before <DIRECTOR_GUIDANCE>, which stays last — the director's
 * own words outrank an evaluation's suggestions.
 *
 * @param {Array<string>} [advisories] - advisoryWarnings from the previous stage
 * @returns {string} XML section, or '' when there is nothing to consider
 */
function buildShouldConsiderSection(advisories = []) {
  const list = Array.isArray(advisories)
    ? advisories.filter(a => typeof a === 'string' && a.trim())
    : [];
  if (list.length === 0) return '';
  return labelPromptSection(
    'SHOULD_CONSIDER',
    `${SHOULD_CONSIDER_PREAMBLE}\n\n${list.map(a => `- ${a.trim()}`).join('\n')}`
  );
}

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
 * Theme-specific system prompt framing.
 *
 * Phase 3 (3.2): the journalist's identity lines say who is writing and nothing
 * more: the world, the truth rules and the craft guidance (lib/rule-set.js) carry
 * the rest. The article rework's line names the task its revision context gives it
 * (TH7), where it used to call every rework a voice fix; the rework rules that
 * follow it are 3.3's, in ai-nodes.js articleRevisionRules. The detective is parked
 * (spec D13) and keeps its lines. The 'validation' lines went with the dead
 * validation builder.
 */
const THEME_SYSTEM_PROMPTS = {
  journalist: {
    outlineGeneration: 'You are creating an article outline for a NovaNews investigative piece.',
    articleGeneration: 'You are Nova, writing a NovaNews investigative article in the first person.',
    revision: "You are Nova, reworking your article. The task is the one the REVISION CONTEXT in the user prompt gives: the director's note on a send back, or the evaluation's findings on an automatic pass."
  },
  detective: {
    outlineGeneration: 'You are planning the structure of Detective Anondono\'s case report. Each section answers a DIFFERENT QUESTION about the same underlying facts.',
    articleGeneration: `You are a cynical, seasoned Detective in a near-future noir setting. You are writing an official Case Report.

TONE: Professional, analytical, with a distinct noir flair. Economical with words. Every sentence earns its place.
FORMAT: HTML (body content only, NO <html>, <head>, or <body> tags).`,
    revision: 'You are revising Detective Anondono\'s case report to fix structural or factual issues. Make TARGETED fixes only. Keep the third-person investigative case-report voice.'
  }
};

/**
 * Theme-specific hard constraints and voice guidance.
 *
 * Phase 3 (3.2): the journalist's hard constraints, voice checkpoint and voice
 * question are gone. Each restated a rule the rule set now states once (C4's house
 * style, T14's words, C10's "name who acted") or reversed one ("no buried memories,
 * no bonus, no counted memories" against T5; "participatory and implicated" and a
 * Nova the story "happened to" against T8 and C12). The voice is craft-voice, which
 * the article writer and its reworker carry in the user prompt. revisionVoice stays
 * as an empty slot because articleRevisionRules (ai-nodes.js, 3.3's) still prints it.
 */
const THEME_CONSTRAINTS = {
  journalist: {
    revisionVoice: ''
  },
  detective: {
    hardConstraints: `CRITICAL WRITING PRINCIPLES:
- SYNTHESIZE evidence into thematic groups—do NOT list every item individually
- Tell the STORY of what happened—do NOT catalog facts
- Each report must feel BESPOKE to this specific case—reference unique details
- Avoid repetition—each fact appears ONCE in the most impactful location
- TARGET LENGTH: 750 words (+-50 words acceptable)

FACTUAL ACCURACY (CRITICAL - NEVER VIOLATE):
- Only state facts EXPLICITLY supported by the evidence provided
- Do NOT infer group memberships, relationships, or details unless directly stated
- If evidence is ambiguous or incomplete, acknowledge uncertainty

EVIDENCE REFERENCING (CRITICAL):
- Call them "memory extractions", "recovered memories", or "scanned memories"
- NEVER use "Memory Token", token codes, database names, RFID codes, or item IDs
- NEVER reference "character sheets" as sources—present as background knowledge
- NO inventing last names - use ONLY canonical names from the roster above`,
    voiceCheckpoint: 'Before generating, internalize Detective Anondono\'s voice:',
    voiceQuestion: 'Ask yourself: "Am I writing a professional case report that synthesizes evidence, or am I just listing facts?"\nThe answer must be synthesis. Every section answers a different question about the same underlying facts.',
    revisionVoice: `DETECTIVE VOICE:
- Third-person investigative: "The investigation revealed..." not "I saw..."
- Professional noir: world-weary but precise, economical with words
- In-world always: never reference game mechanics
- Section differentiation: each section answers a DIFFERENT question
- Name formatting: ALL names in <strong> tags, evidence in <em> tags`
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
   * Build the <SHOULD_CONSIDER> section (brief 1.3).
   *
   * Appended to the outline and article user prompts immediately BEFORE
   * <DIRECTOR_GUIDANCE>: near the end, where the writer will still weigh it, but
   * never ahead of the director's own words.
   *
   * @param {Array<string>} [advisories] - advisoryWarnings from the previous stage
   * @returns {string} XML section, or '' when there is nothing to consider
   */
  _buildShouldConsider(advisories = []) {
    const section = buildShouldConsiderSection(advisories);
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
   * @param {Array} shellAccounts - Array of {name, total, tokenCount} objects
   * @returns {string} XML section or empty string
   */
  _buildFinancialSummary(shellAccounts) {
    if (!shellAccounts || shellAccounts.length === 0) return '';
    const nonZero = shellAccounts.filter(a => a.total > 0);
    if (nonZero.length === 0) return '';

    const total = shellAccounts.reduce((sum, a) => sum + (a.total || 0), 0);
    const sales = (count) => {
      const n = Number.isFinite(count) ? count : 0;
      return `${n} sale${n === 1 ? '' : 's'}`;
    };

    return `
<FINANCIAL_SUMMARY>
The ledger's accounts, with figures code computed from the session report. Each account's total is its sales, plus the first-burial bonus and the transfers it received, less the transfers it sent; beside it, how many sales it took.
${nonZero.map(a => `- ${a.name}: $${a.total.toLocaleString('en-US')} (${sales(a.tokenCount)})`).join('\n')}
All accounts together: $${total.toLocaleString('en-US')}. That is what NeurAI's board paid out this morning, the sales and the first-burial bonus; a transfer moves money between accounts and adds nothing to it.
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

Only the ${n} players above were at the investigation. Every other character except Blake appears only through the memories and documents. Blake was in the room too, working it for NeurAI, and acts and speaks there as the record shows. Nova is not one of the players. When the article counts the people at the investigation, it counts these ${n} players.
</SESSION_FACTS>`;
  }

  /**
   * A phase's craft files, with their template variables (e.g.
   * {{JOURNALIST_FIRST_NAME}}) resolved.
   *
   * @param {string} phase - a PHASE_REQUIREMENTS key
   * @returns {Promise<Object>} prompt name -> resolved text
   */
  async _loadResolvedPhasePrompts(phase) {
    const rawPrompts = await this.theme.loadPhasePrompts(phase);
    return Object.fromEntries(
      Object.entries(rawPrompts).map(([k, v]) => [k, this.resolvePromptVariables(v)])
    );
  }

  /**
   * Build outline generation prompt
   * Phase 3: Generate article outline from selected arcs
   *
   * Phase 2 (2.3): the writer's prompt is its system prompt
   * (buildOutlineSystemPrompt), its user sections (buildOutlineUserSections), then
   * <SHOULD_CONSIDER> and <DIRECTOR_GUIDANCE>. The outline reworker is built from the
   * same two builders (ai-nodes.js buildOutlineRevisionPrompt), so whatever this
   * writer is given reaches its reworker without a second copy.
   *
   * @param {Object} arcAnalysis - Arc analysis results
   * @param {string[]} selectedArcs - User-selected arc names
   * @param {string} heroImage - Confirmed hero image filename
   * @param {Array} availablePhotos - List of available photos with analyses (Commit 8.24)
   * @param {Array} arcEvidencePackages - Per-arc evidence: the arc's document ids and quotable excerpts
   * @param {Array} shellAccounts - Deterministic shell account data
   * @param {Object|null} sessionFacts - Roster and verdict (ai-nodes.js buildSessionFacts)
   * @param {Object} options - { directorGuidance, gateNotes, directorNotes, shouldConsider,
   *   evidenceBundle, directorCorrections, photoDescriptions }
   * @returns {Promise<{systemPrompt: string, userPrompt: string}>}
   */
  async buildOutlinePrompt(arcAnalysis, selectedArcs, heroImage, availablePhotos = [], arcEvidencePackages = [], shellAccounts = [], sessionFacts = null, options = {}) {
    const systemPrompt = await this.buildOutlineSystemPrompt();
    let userPrompt = await this.buildOutlineUserSections(
      arcAnalysis, selectedArcs, heroImage, availablePhotos, arcEvidencePackages, shellAccounts, sessionFacts, options
    );

    // Brief 1.3: the previous stage's advisory findings, second to last.
    userPrompt += this._buildShouldConsider(options.shouldConsider || []);

    // Q2: the director's arc-selection emphasis, LAST so it outranks the rules above.
    // Since spec 2026-09-19 §5.3 the same section also carries the standing gate notes
    // (every rejection note still in state), as a second paragraph inside the same tag.
    userPrompt += this._buildDirectorGuidance(options.directorGuidance, options.gateNotes || []);

    return { systemPrompt, userPrompt };
  }

  /**
   * The outline writer's system prompt, shared with the outline reworker (2.3).
   *
   * @returns {Promise<string>}
   */
  async buildOutlineSystemPrompt() {
    // The mode block sits where the article's does: right after the identity line,
    // ahead of every rule (brief 1.5). The outline planner used to be told nothing
    // about where the reporter was, and planned presence beats for a reporter who
    // was never in the room.
    //
    // Phase 3 (3.2): the journalist's system prompt then carries the world and the
    // truth rules, the stable frame every writer and judge reads first (the
    // integrator's placement ruling); its craft files go last in the user prompt.
    // The detective is parked (spec D13) and keeps its craft files here.
    if (this.themeName === 'journalist') {
      return `${THEME_SYSTEM_PROMPTS.journalist.outlineGeneration}

${this._buildReportingModeBlock()}

${loadRuleSet('outline').core}`;
    }

    const prompts = await this._loadResolvedPhasePrompts('outlineGeneration');
    return `${THEME_SYSTEM_PROMPTS[this.themeName].outlineGeneration}

${this._buildReportingModeBlock()}
${labelPromptSection('section-rules', prompts['section-rules'])}
${labelPromptSection('editorial-design', prompts['editorial-design'])}`;
  }

  /**
   * The outline writer's user prompt up to, not including, <SHOULD_CONSIDER> and
   * <DIRECTOR_GUIDANCE>: the data, the rules and the JSON structure. Shared with the
   * outline reworker (2.3), which follows it with its revision block and then its own
   * <DIRECTOR_GUIDANCE>. Takes buildOutlinePrompt's arguments; the tail's options
   * (shouldConsider, directorGuidance, gateNotes) are not read here.
   *
   * @returns {Promise<string>}
   */
  async buildOutlineUserSections(arcAnalysis, selectedArcs, heroImage, availablePhotos = [], arcEvidencePackages = [], shellAccounts = [], sessionFacts = null, options = {}) {
    // <arc-metadata> below renders every arc, trimmed to the fields the outline
    // needs. <arc-analysis> then dumped the SAME arcs again, untrimmed, so every
    // arc title, summary and evidence list was serialized twice in one prompt.
    // Strip them: the analysis (synthesisNotes, interweavingPlan) is what
    // <arc-analysis> is for.
    const { narrativeArcs: _arcsRenderedInMetadata, ...arcAnalysisOnly } = arcAnalysis || {};

    // Commit 8.15: Extract arc-specific fields for outline guidance
    const arcsWithMetadata = (arcAnalysis.narrativeArcs || []).map(arc => ({
      id: arc.id,
      title: arc.title,
      arcSource: arc.arcSource,  // accusation | whiteboard | observation | discovered
      evidenceStrength: arc.evidenceStrength,  // strong | moderate | weak | speculative
      caveats: arc.caveats || [],  // Complications to acknowledge
      unansweredQuestions: arc.unansweredQuestions || [],  // Gaps for narrative tension
      analysisNotes: arc.analysisNotes || {}  // Financial/behavioral/victimization insights
    }));

    const observationsSection = this._buildInvestigationObservations(options.directorNotes, options.directorCorrections, options.evidenceBundle);

    // Brief 2.1: every usable document in full, once, ahead of the per-arc lists that
    // name them by id. The planner used to read the text of at most five documents
    // per arc, and on 092026 never saw 12 of the 37 the article writer later used.
    const recordSection = renderRecordView(options.evidenceBundle, { sessionConfig: this.sessionConfig });

    let userPrompt;

    if (this.themeName === 'detective') {
      const prompts = await this._loadResolvedPhasePrompts('outlineGeneration');
      userPrompt = `Generate a case report outline using these selected narrative threads.

SELECTED THREADS (in order of significance):
${selectedArcs.map((arc, i) => `${i + 1}. ${arc}`).join('\n')}

<arc-metadata>
${JSON.stringify(arcsWithMetadata, null, 2)}

USING THREAD METADATA IN THE OUTLINE:

1. **arcSource** determines framing:
   - "accusation": The suspects concluded this. Frame as "The group accused..."
   - "whiteboard": Investigation thread explored by subjects. Frame as lead.
   - "observation": Observed behavioral pattern. Frame as investigative finding.
   - "discovered": Evidence pattern subjects missed. Frame as detective's insight.

2. **evidenceStrength** determines confidence:
   - "strong": State findings with authority
   - "moderate": Use "evidence suggests", "indicators point to"
   - "weak": Use "warrants further investigation", "inconclusive"
   - "speculative": Use "subjects believed..." with noted uncertainty

3. **caveats** become investigative complications
   - Each caveat is a gap in the evidence chain

4. **unansweredQuestions** feed OUTSTANDING QUESTIONS section
   - These represent genuine investigative gaps
</arc-metadata>

${recordSection}

<evidence-context>

${arcEvidencePackages.length > 0 ? arcEvidencePackages.map(pkg => `
### ${pkg.arcId} - ${pkg.arcTitle}

**Evidence Items (${pkg.evidenceItems?.length || 0} items; each one's full text is ${DOCUMENT_POINTER}):**
${(pkg.evidenceItems || []).map(item => `- ${item.id}: ${item.type}`).join('\n')}
`).join('\n') : 'No arc evidence packages available - using evidence bundle directly'}
</evidence-context>

<arc-analysis>
${JSON.stringify(arcAnalysisOnly, null, 2)}

${labelPromptSection('section-rules', prompts['section-rules'])}
${labelPromptSection('evidence-boundaries', prompts['evidence-boundaries'])}
</arc-analysis>

<section-guidance>
CRITICAL: This is a CASE REPORT, not a narrative article. Each section answers a DIFFERENT QUESTION:

- EXECUTIVE SUMMARY: What happened? (Hook + factual overview + top findings)
- EVIDENCE LOCKER: What does the evidence show? (Thematically grouped, synthesized—NOT listed)
- MEMORY ANALYSIS (optional): What do the memory extraction patterns reveal?
- SUSPECT NETWORK: Who are the key players and how do they connect?
- OUTSTANDING QUESTIONS: What remains unknown?
- FINAL ASSESSMENT: What is the detective's conclusion?

SECTION DIFFERENTIATION is critical. If a fact appears in one section, it should NOT repeat in another.
The report should feel BESPOKE to this specific case—reference unique details, not generic observations.

TARGET LENGTH: ~750 words total. Be economical. Every sentence earns its place.
</section-guidance>
${sessionFacts ? `
<SESSION_FACTS>
INVESTIGATION ROSTER (${sessionFacts.playerCount} subjects):
${sessionFacts.roster.join('\n')}

${renderSessionFactsVerdict(sessionFacts)}

ONLY the ${sessionFacts.playerCount} characters listed above were present at the investigation.
Use exactly ${sessionFacts.playerCount} when referencing how many subjects were involved.
</SESSION_FACTS>` : ''}
Return JSON with the following structure:
{
  "executiveSummary": {
    "hook": "Opening line establishing case tension",
    "caseOverview": "Brief factual summary of the case",
    "primaryFindings": ["Top finding 1", "Top finding 2", "Top finding 3"]
  },
  "evidenceLocker": {
    "evidenceGroups": [
      {
        "theme": "Thematic grouping (e.g., 'Financial Irregularities')",
        "evidenceIds": ["evidence-id-1", "evidence-id-2"],
        "synthesis": "What this group reveals together"
      }
    ]
  },
  "memoryAnalysis": {
    "focus": "What memory extraction patterns reveal",
    "keyPatterns": ["Notable pattern 1"],
    "significance": "Why these patterns matter"
  },
  "suspectNetwork": {
    "keyRelationships": [
      {"characters": ["Name1", "Name2"], "nature": "Relationship description"}
    ],
    "assessments": [
      {"name": "Character", "role": "Their role in events", "suspicionLevel": "high|moderate|low"}
    ]
  },
  "outstandingQuestions": {
    "questions": ["Unanswered question 1", "Unanswered question 2"],
    "investigativeGaps": "Summary of what remains unknown"
  },
  "finalAssessment": {
    "accusationHandling": "How the group's accusation relates to evidence",
    "verdict": "Detective's overall assessment",
    "closingLine": "Final noir closing line"
  }
}`;
    } else {
      // Journalist (NovaNews article) outline prompt.
      //
      // The director's observations sit with the data and BEFORE the arc metadata
      // (brief 1.5). They are not guidance and must not compete with it:
      // <DIRECTOR_GUIDANCE> is appended last, and keeps the last word. Journalist
      // only, as in the article prompt: the detective report has no such section,
      // and an outline must not plan on material its writer never sees.
      //
      // Phase 3 (3.2): the data, then the craft files last (the integrator's
      // placement ruling; the world and the truth rules are in the system prompt).
      // Gone, because the rule set states each once or contradicted it: the arc
      // metadata's framing rules ("state conclusions confidently", a discovered arc
      // "framed as revelation"), <arc-interweaving> and <arc-section-flow> (every arc
      // in every section, the convergence in THE STORY), <visual-rules> and
      // <visual-principles> (pull quotes, a fixed section table, photos as pacing),
      // <TEMPORAL_DISCIPLINE> (the world and T7), the old agency rule, and the JSON
      // shape restated in the prompt's own words (M27). The shape comes from
      // outline.schema.json alone: the SDK channel enforces it, and since fix 3.2b
      // (finding 10) the prompt embeds the same file as <SCHEMA>, after the data and
      // before the craft files, a backstop for the channel (SDK #277) as the article
      // writer's <SCHEMA> is.
      userPrompt = `Plan the outline of the article from these selected arcs. Write the plan in the third person: the article writer gives it Nova's voice.

SELECTED ARCS:
${selectedArcs.map((arc, i) => `${i + 1}. ${arc}`).join('\n')}

HERO IMAGE: ${heroImage}
${observationsSection ? `\n${observationsSection}\n` : ''}
<arc-metadata>
${JSON.stringify(arcsWithMetadata, null, 2)}

Each arc above is the arc writer's reading of one thread. Its arcSource says where the thread came from: "accusation" (the verdict), "whiteboard" (a theory the room worked through), "observation" (the director's notes) or "discovered" (a pattern in the record the room did not take up, which C3 governs). Its evidenceStrength, caveats and unansweredQuestions say how far the record carries it; T1 says how each claim is written.
</arc-metadata>

<available-photos>

${availablePhotos.length > 0 ? availablePhotos.map((p, i) => `${i + 1}. ${renderPhotoEntry({ filename: p.filename, names: p.identifiedCharacters }, options.photoDescriptions, '   ')}`).join('\n\n') : 'No session photos available'}

A photo placement names its photo by the exact filename above.
</available-photos>

${recordSection}

<arc-evidence>

${arcEvidencePackages.length > 0 ? arcEvidencePackages.map(pkg => `
### ${pkg.arcId} - ${pkg.arcTitle}

**Documents (${pkg.evidenceItems?.length || 0}; each one's full text is ${DOCUMENT_POINTER}):**
${(pkg.evidenceItems || []).map(item => `- ${item.id}: ${item.type}
  Excerpts: ${(item.quotableExcerpts || []).slice(0, 2).map(q => `"${q}"`).join(' | ') || 'none'}`).join('\n')}

**Photos in which this arc's characters were identified (${pkg.photos?.length || 0}):**
${(pkg.photos || []).map(p => `- ${p.filename}: ${p.characters?.join(', ') || 'Unknown characters'}`).join('\n') || 'None'}
`).join('\n') : 'No arc evidence packages; every document is in <RECORD>.'}

${ARC_EXCERPTS_LABEL}
</arc-evidence>

<arc-analysis>
${JSON.stringify(arcAnalysisOnly, null, 2)}
</arc-analysis>
${this._buildFinancialSummary(shellAccounts)}
${this._sessionFactsSection(sessionFacts)}

<SCHEMA>
The outline is JSON in this shape: field names, types, enum values and required fields.

\`\`\`json
${JSON.stringify(outlineSchema, null, 2)}
\`\`\`
</SCHEMA>

${loadRuleSet('outline').craft}`;
    }

    return userPrompt;
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
   * <SHOULD_CONSIDER> and <DIRECTOR_GUIDANCE>. The article reworker is built from the
   * same two builders (ai-nodes.js buildArticleRevisionPrompt).
   *
   * @param {Object} outline - Approved article outline
   * @param {Array} arcEvidencePackages - Per-arc evidence: document ids, quotable excerpts, photos
   * @param {string|null} heroImage - Hero image filename (prevents duplicate in photos)
   * @param {Array} shellAccounts - Shell account data for financial summary
   * @param {Object|null} sessionFacts - Session facts for non-roster character guardrail
   * @param {Object|null} directorNotes - Director observations for article grounding
   * @param {Object|null} narrativeTensions - Programmatic contradictions from surfaceContradictions node
   * @param {Object} options - { directorGuidance, gateNotes, shouldConsider, evidenceBundle }
   * @returns {Promise<{systemPrompt: string, userPrompt: string}>}
   */
  async buildArticlePrompt(outline, arcEvidencePackages = [], heroImage = null, shellAccounts = [], sessionFacts = null, directorNotes = null, narrativeTensions = null, options = {}) {
    const systemPrompt = await this.buildArticleSystemPrompt();
    let userPrompt = await this.buildArticleUserSections(
      outline, arcEvidencePackages, heroImage, shellAccounts, sessionFacts, directorNotes, narrativeTensions, options
    );

    // Brief 1.3: the previous stage's advisory findings, second to last.
    userPrompt += this._buildShouldConsider(options.shouldConsider || []);

    // Q2: the director's arc-selection emphasis, LAST so it outranks the rules above.
    // Since spec 2026-09-19 §5.3 the same section also carries the standing gate notes
    // (every rejection note still in state), as a second paragraph inside the same tag.
    userPrompt += this._buildDirectorGuidance(options.directorGuidance, options.gateNotes || []);

    return { systemPrompt, userPrompt };
  }

  /**
   * The article writer's system prompt, shared with the article reworker (2.3): the
   * identity, the mode block, and then, for the journalist, the world, the truth
   * rules and the roster with pronouns (phase 3, 3.2: the integrator's placement
   * ruling). The journalist's hard constraints and evidence-boundaries file are gone:
   * the rule set states what they said that holds. The roster prints here alone
   * (M20: the user prompt's <RULES> carried a second copy). The detective is parked
   * and keeps its constraints and craft file.
   *
   * @returns {Promise<string>}
   */
  async buildArticleSystemPrompt() {
    if (this.themeName === 'journalist') {
      return `${THEME_SYSTEM_PROMPTS.journalist.articleGeneration}

${this._buildReportingModeBlock()}

${loadRuleSet('article').core}

${this._rosterSection()}`;
    }

    const prompts = await this._loadResolvedPhasePrompts('articleGeneration');

    // System prompt: Identity and hard constraints (kept short for salience)
    // Roster in system prompt for higher salience (prevents name hallucination)
    const constraints = THEME_CONSTRAINTS[this.themeName];
    return `${THEME_SYSTEM_PROMPTS[this.themeName].articleGeneration}

${this._buildReportingModeBlock()}

${this._rosterSection()}

${constraints.hardConstraints}
${labelPromptSection('evidence-boundaries', prompts['evidence-boundaries'])}`;
  }

  /**
   * The article writer's user prompt up to, not including, <SHOULD_CONSIDER> and
   * <DIRECTOR_GUIDANCE>: the data (outline, record, packages, money, observations),
   * the rules and the generation instruction with its schema. Shared with the article
   * reworker (2.3). Takes buildArticlePrompt's arguments; the tail's options
   * (shouldConsider, directorGuidance, gateNotes) are not read here.
   *
   * @returns {Promise<string>}
   */
  async buildArticleUserSections(outline, arcEvidencePackages = [], heroImage = null, shellAccounts = [], sessionFacts = null, directorNotes = null, narrativeTensions = null, options = {}) {
    // Brief 2.1: the record, once, in the data part. The packages name each arc's
    // documents by id instead of repeating their text.
    const recordSection = renderRecordView(options.evidenceBundle, { sessionConfig: this.sessionConfig });

    if (this.themeName === 'journalist') {
      return this._journalistArticleUserSections(
        outline, arcEvidencePackages, heroImage, shellAccounts, sessionFacts, directorNotes, narrativeTensions, options, recordSection
      );
    }

    // The detective is parked (spec D13): everything below is its text as it was.
    const prompts = await this._loadResolvedPhasePrompts('articleGeneration');
    const constraints = THEME_CONSTRAINTS[this.themeName];

    // Format arc evidence packages for verbatim quoting
    const arcEvidenceSection = arcEvidencePackages.length > 0 ? `
ARC EVIDENCE PACKAGES (Phase 1 Fix - use these for verbatim quotes):
${arcEvidencePackages.map(pkg => `
### ${pkg.arcId} - ${pkg.arcTitle}

QUOTABLE EXCERPTS (use these VERBATIM for pull quotes and article text):
${(pkg.evidenceItems || []).flatMap(item =>
  (item.quotableExcerpts || []).map(q => `- "${q}" (from ${item.id})`)
).join('\n') || 'No extracted quotes - quote the arc\'s documents in <RECORD> directly'}

EVIDENCE (for context and additional quoting; each one's full text is ${DOCUMENT_POINTER}):
${(pkg.evidenceItems || []).map(item =>
  `${item.id} (${item.type})`
).join('\n')}

ARC PHOTOS:
${(pkg.photos || []).map(p => `- ${renderPhotoEntry({ filename: p.filename, names: p.characters }, options.photoDescriptions)}`).join('\n') || 'None'}
`).join('\n---\n')}
` : '';

    // User prompt: Data first, then template, then RULES LAST (recency bias)
    let userPrompt;

    if (this.themeName === 'detective') {
      userPrompt = `<DATA_CONTEXT>
APPROVED OUTLINE:
${JSON.stringify(outline, null, 2)}

HERO IMAGE:
Filename: ${heroImage || 'Use first available photo from outline'}
- Emit "heroImage" as an OBJECT: { "filename": "<exact filename>", "caption": "...", "characters": [...] }
- Do NOT emit "heroImage" as a bare filename string — the schema requires an object.
- Do NOT include this filename in the "photos" array

${recordSection}
${arcEvidenceSection}
</DATA_CONTEXT>

<RULES>
${labelPromptSection('section-rules', prompts['section-rules'])}
${labelPromptSection('narrative-structure', prompts['narrative-structure'])}
${labelPromptSection('formatting', prompts['formatting'])}
${labelPromptSection('evidence-boundaries', prompts['evidence-boundaries'])}

${this._rosterSection()}
</RULES>

<SECTION_GUIDANCE>
CRITICAL: This is a CASE REPORT. Each section answers a DIFFERENT QUESTION about the same underlying facts.

- EXECUTIVE SUMMARY: What happened? (Hook + factual overview + top findings)
- EVIDENCE LOCKER: What does the evidence show? (Thematically grouped, synthesized — NOT listed individually)
- MEMORY ANALYSIS (optional): What do the memory extraction patterns reveal?
- SUSPECT NETWORK: Who are the key players and how do they connect?
- OUTSTANDING QUESTIONS: What remains unknown or unresolved?
- FINAL ASSESSMENT: What is the detective's conclusion?

SECTION DIFFERENTIATION is critical. If a fact appears in one section, it should NOT repeat in another.
The report should feel BESPOKE to this specific case — reference unique details, not generic observations.
</SECTION_GUIDANCE>

<ANTI_PATTERNS>
${labelPromptSection('anti-patterns', prompts['anti-patterns'])}
</ANTI_PATTERNS>

<VOICE_CHECKPOINT>
${constraints.voiceCheckpoint}
${labelPromptSection('character-voice', prompts['character-voice'])}
${labelPromptSection('writing-principles', prompts['writing-principles'])}
${constraints.voiceQuestion}
</VOICE_CHECKPOINT>

<GENERATION_INSTRUCTION>
Generate structured case report content as JSON matching the ContentBundle schema.

STRUCTURE:
1. "sections" - Array of report sections, each with:
   - "id": Section identifier (executive-summary, evidence-locker, memory-analysis, suspect-network, outstanding-questions, final-assessment)
   - "type": Section type for styling (case-summary, evidence-highlight, narrative, investigation-notes, conclusion)
   - "heading": Section heading
   - "content": Array of content blocks:
     * {"type": "paragraph", "text": "..."} - Prose text
     * {"type": "quote", "text": "...", "attribution": "..."} - Inline quotes
     * {"type": "evidence-reference", "tokenId": "xxx", "caption": "..."} - Evidence reference
     * {"type": "list", "items": [...], "ordered": false} - Lists

2. "headline" - Report headline with:
   - "main": Case report title
   - "kicker": Optional subtitle
   - "deck": Brief summary line

3. "byline" - Author information:
   - "author": "Detective Anondono"
   - "title": "Lead Investigator"

4. "photos" - Session photos with placement:
   - "filename": EXACT filename from available photos (do NOT include hero image here)
   - "caption": Caption text
   - "characters": Array of character names visible
   - "placement": "inline" or "sidebar"
   - "afterSection": Section ID after which photo appears

5. "heroImage" - Featured image (OBJECT, not string):
   - "filename": EXACT filename of the hero image (matches HERO IMAGE above)
   - "caption": Hero image caption
   - "characters": Array of character names visible in the image

6. "metadata" - Required top-level metadata object:
   - "sessionId": session identifier (will be overwritten by state value)
   - "theme": "detective"
   - "generatedAt": ISO 8601 timestamp

7. "voice_self_check" - Self-assessment:
   - Is the tone professional and analytical with noir flair?
   - Does each section answer a DIFFERENT question?
   - Are names in <strong> tags, evidence in <em> tags?
   - Is the report ~750 words?
   - Are facts synthesized (not cataloged)?
   - No game mechanics language?

Do NOT include pullQuotes, evidenceCards, or financialTracker — these are journalist-specific components.

TARGET LENGTH: ~750 words (+-50 words acceptable). Be economical. Every sentence earns its place.

<SCHEMA>
Authoritative output shape for the ContentBundle. The SDK's outputFormat enforcement is known to fail silently for nested schemas (see anthropics/claude-agent-sdk-typescript#277) — when that happens, this schema is the only contract you have. Match it exactly: respect every enum, every required field, and the additionalProperties:false constraint at every level. Do not invent fields. Note: the schema permits pullQuotes/evidenceCards/financialTracker as optional properties, but the detective theme excludes them per the rule above; if anything else contradicts the schema, the schema wins.

\`\`\`json
${JSON.stringify(DETECTIVE_PRINTED_SCHEMA, null, 2)}
\`\`\`
</SCHEMA>
</GENERATION_INSTRUCTION>`;
    }

    return userPrompt;
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
   * editor writes a sidebar entry's owner, and the parked detective asks for photos
   * and voice_self_check. The money tracker prints itself from the ledger (M2). An
   * evidence reference is described as the template prints it, a caption naming a
   * document (M1).
   *
   * Phase 3 (3.7): APPROVED OUTLINE leaves out the outline writer's questions, which
   * were the director's to answer at the outline stop.
   *
   * @returns {string}
   */
  _journalistArticleUserSections(outline, arcEvidencePackages, heroImage, shellAccounts, sessionFacts, directorNotes, narrativeTensions, options, recordSection) {
    const packages = arcEvidencePackages.length > 0 ? `
ARC EVIDENCE PACKAGES: each selected arc's documents by id. Each one's full text is ${DOCUMENT_POINTER}. ${ARC_EXCERPTS_LABEL}
${arcEvidencePackages.map(pkg => `
### ${pkg.arcId} - ${pkg.arcTitle}

EXCERPTS:
${(pkg.evidenceItems || []).flatMap(item =>
  (item.quotableExcerpts || []).map(q => `- "${q}" (from ${item.id})`)
).join('\n') || 'None'}

DOCUMENTS:
${(pkg.evidenceItems || []).map(item =>
  `${item.id} (${item.type})`
).join('\n')}

ARC PHOTOS:
${(pkg.photos || []).map(p => `- ${renderPhotoEntry({ filename: p.filename, names: p.characters }, options.photoDescriptions)}`).join('\n') || 'None'}
`).join('\n---\n')}
` : '';

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
It prints at the top of the article, as "heroImage". The inline photo blocks use the session's other photos.

${recordSection}
${packages}
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

  /**
   * Resolve template variables in prompt text using sessionConfig values
   * Variables use {{VARIABLE_NAME}} format (matching existing prompt conventions)
   *
   * @param {string} text - Prompt text with template variables
   * @returns {string} Text with variables resolved
   */
  resolvePromptVariables(text) {
    if (!text) return '';

    const variables = {
      JOURNALIST_FIRST_NAME: this.sessionConfig.journalistFirstName || DEFAULT_JOURNALIST_FIRST_NAME,
      REPORTING_MODE: this.sessionConfig.reportingMode || 'on-site'
    };

    return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      return variables[varName] !== undefined ? variables[varName] : match;
    });
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
  buildDirectorGuidanceSection,
  buildShouldConsiderSection,
  // Shared with buildRevisionContext (node-helpers.js) so a rework prompt and a
  // generation prompt introduce the advisory list in the same words (brief 1.3).
  SHOULD_CONSIDER_PREAMBLE,
  filterGateNotes,
  DETECTIVE_REPORTING_MODE_BLOCKS,
  buildReportingModeBlock,
  // Consumed by the system prompts assembled outside PromptBuilder (the two arc
  // calls, and through the arc writer's the two arc rework branches), so the
  // block's wording has one home.
  withReportingModeBlock,
  // Theme framing, consumed by the article rework rules in ai-nodes.js
  THEME_SYSTEM_PROMPTS,
  THEME_CONSTRAINTS
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

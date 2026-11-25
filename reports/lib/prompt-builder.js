/**
 * PromptBuilder - Assemble phase-specific prompts from ThemeLoader + session data
 *
 * Takes loaded prompt files and session data to build complete prompts
 * for each phase of the journalist pipeline.
 */

const { createThemeLoader, PHASE_REQUIREMENTS } = require('./theme-loader');
const { renderDirectorEnrichmentBlock } = require('./prompt-renderers/director-notes-renderer');
const { renderRecordView, DOCUMENT_POINTER } = require('./prompt-renderers/record-view');
const { withSessionClock } = require('./prompt-renderers/session-clock');
const { DERIVED_LABELS } = require('./prompt-renderers/derived-labels');
const {
  renderSessionFactsVerdict, renderPhotoListEntry, photoKey, stopNotePlaceOf, stopNoteActionOf, STOP_NOTE_ACTIONS,
  DIRECTOR_NOTES_LABEL
} = require('./prompt-renderers/director-words-renderer');
const contentBundleSchema = require('./schemas/content-bundle.schema.json');
// Phase 4 (brief 4.6): the map writer embeds the map's schema for its theme as its
// <SCHEMA> (fix 3.2b), the one the SDK channel enforces (ai-nodes.js), as the article
// writer embeds the schema above; its slots are the theme's. Brief 4.6c: its task points
// at the meeting's note by the rule the map checks read the note by (meetingNoteOf). Brief
// 4.6e: with the schema's one pointer at that note (MEETING_NOTE_POINTER).
// Phase 4b (brief 1D): the bound on the map's page and the writer's aim, stated once there.
// Phase 4b, piece 4 (R6): the page with every synopsis open, and the synopses' aim.
const {
  mapSchemaFor, topPhotoOf, meetingNoteOf, MEETING_NOTE_POINTER, MAP_WORD_BOUND, MAP_WORD_AIM, MAP_OPEN_WORD_BOUND, MAP_SYNOPSIS_AIM
} = require('./map');
// Phase 4b (brief 1E; R4): the article writer reads a beat's card as the map's checks and counts
// do, through the one reader of a beat's card, and names a piece's sources as lib/evidence.js does.
const { beatCardOf } = require('../console/outline-edit-logic');
const { SOURCES_GLOSS, documentResolverOf } = require('./evidence');
// Brief 4.13: each writer's identity line is its theme's (identityLineOf), and the rule set
// and the mode block come from the theme's rules folder (R14).
const { getThemeNPCEntries, mapSlotsOf, identityLineOf } = require('./theme-config');
const { writerSignsLine, reportingModeOf, writerInTheRoom, writerFirstNameOf, guestReportersOf } = require('./prompt-renderers/session-authors');
const { loadModeBlock, loadRuleSet } = require('./rule-set');
// A standing note's kind, the one rule (review of 4.12e).
const { noteKindOf } = require('./workflow/state');
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
 * The map task's pointers at the director's note from the story meeting (brief 4.6c): the
 * changes it asks for, and "note" as a change's source. They print only when the prompt's
 * standing notes hold that note. Where the prompt holds it is the schema's pointer too, one
 * constant (lib/map.js MEETING_NOTE_POINTER; brief 4.6e).
 */
const MAP_TASK_NOTE_CHANGE = `, and each change the director's note from the meeting asks for (${MEETING_NOTE_POINTER})`;
const MAP_TASK_NOTE_SOURCE = ', or "note"';

/**
 * The map writer's task (phase 4, brief 4.6), right after the settled weave: lay the weave
 * across the sections. It names what goes where in the map and points at the writer's own part,
 * `<job-map>`, for how (phase 18: the rule-text read's part 2, word for word, with the page's
 * bounds filled in from lib/map.js); the part and the brief say the rest, so the task restates none
 * of it.
 *
 * Brief 4.6b: each line is true of the prompt it sits in. The meeting's note is the note
 * marked [the story meeting, approved] in <DIRECTOR_GUIDANCE> (formatGateNotes; R48, R57), the
 * one note the map checks take as a change's source "note" (lib/map.js meetingNoteOf); a
 * reweave's or a send-back's note at the meeting prints there marked as sent back, with its
 * round. The line on the top photo prints only
 * when a photo is marked [hero image] (MAP_TASK_TOP_PHOTO). Brief 4.6c: the line on the
 * meeting's changes points at that note, and offers "note" as a source, only when the
 * prompt's notes hold it (MAP_TASK_NOTE_CHANGE, MAP_TASK_NOTE_SOURCE). Pointed at a note it
 * does not hold, the writer names "note" as a change's source, the check fails the change,
 * and the round's one rework goes on that failure (0926262).
 *
 * Phase 4b (brief 1D; spec 2026-10-05 sections 4.2, 5 and 7): the map stays at the level of the
 * story, a page of at most MAP_WORD_BOUND words aiming for MAP_WORD_AIM. Each beat is a move
 * with its people, the threads it carries and its evidence from those threads' evidence and the
 * record; the card's document is flagged on a piece; and what the record cannot carry, a change
 * of the director's among it, goes in the gap note, a thread the director added or brought into
 * the story named there by its name, without quotation marks, the outlet lib/map.js mapFindings
 * reads (fix round 4).
 *
 * Phase 4b, piece 4 (spec 2026-10-07 sections 3, 8 and 11; R2, R5, R6): the director reads the
 * map as a board whose synopses are folded when it opens, so the task asks for each beat's
 * synopsis, of about 20 words, and for both pages: at most MAP_WORD_BOUND words as it opens,
 * aiming for MAP_WORD_AIM of the writer's own, and at most MAP_OPEN_WORD_BOUND with every synopsis
 * open, the synopses about MAP_SYNOPSIS_AIM between them. Each section's beats are in the order the
 * article will tell them, and a beat in a section carries only threads of the story, which the
 * checks hold it to.
 *
 * Phase 17 (R3): the deck and the section headings print as the map writer writes them, so the
 * task names them as the only lines the article prints as written, under the settled angle's
 * headline, which the map carries word for word.
 *
 * Phase 18 (R10): the job is the section's step, in one sentence of about 25 words at most, and
 * the page's bounds rose by 100 words for it.
 *
 * @param {boolean} heroMarked - whether <available-photos> marks a photo [hero image]
 * @param {boolean} meetingNote - whether <DIRECTOR_GUIDANCE> holds the director's approval
 *   note from the story meeting (lib/map.js meetingNoteOf)
 * @returns {string}
 */
function mapTask(heroMarked, meetingNote) {
  return `Lay the settled weave above across the article's sections: the story map the article writer writes the article from. \`<job-map>\` below says how. The only lines on the map that the article prints as you write them are the deck under the settled angle's headline, which the map carries word for word, and each section's heading. The director reads the map as a board whose synopses are folded when it opens: that page holds at most ${MAP_WORD_BOUND} words, so aim for ${MAP_WORD_AIM} of your own; with every synopsis open it holds at most ${MAP_OPEN_WORD_BOUND}, so give the synopses about ${MAP_SYNOPSIS_AIM} words between them.
- Fit in each change the director made at the meeting, marked above by its edit's id${meetingNote ? MAP_TASK_NOTE_CHANGE : ''}. List each change you make to fit one in under weaveChanges, with its source: the edit's id${meetingNote ? MAP_TASK_NOTE_SOURCE : ''}.
- Give each section you use its heading, its job, its beats and its photos. The job is the section's step, in one sentence of about 25 words at most. The beats come in the order the article will tell them. Each has its move, a title of a few plain words with its people; its synopsis of about 20 words; the ids of the threads it carries; and its evidence, taken from those threads' evidence above and from the record. Every thread in the story lands in at least one beat, and a beat in a section carries only threads of the story, since the director settled the other threads out of it at the meeting. Drop each slot the story does not use, with its reason.
- Mark each beat whose evidence prints as a card, and flag the card's document on one of its pieces.
${heroMarked ? `${MAP_TASK_TOP_PHOTO}\n` : ''}- List what you considered and did not use under leftOut. Those beats print on the page by their titles.
- What the record cannot carry goes in gapNote, the one line at the top, in plain words: a part of the story, or a change the director made at the meeting, named by its name without quotation marks. A player you cannot place and a connection you see that the weave lacks go there too.
- Set expectedLength from what the map holds.
Code reads who is placed from each beat's players, counts the cards by their flagged pieces, and checks the players, the photos, the cards, the threads, the connections, each beat's evidence, that each line is in plain words, and the page's length on both counts. A player named among gapNote's players counts as raised.`;
}

/** What the roster block prints for a roster character whose pronoun the roster stop did not capture (T9). */
const PRONOUN_NOT_GIVEN = 'pronoun not given';

/**
 * The list of names' headings (phase 18, run 2c; the wording doc's part 5), which every writer
 * and judge prints through generateRosterSection:
 * - ROSTER_OPENING, over the game's characters, each first name with the full name the article
 *   prints;
 * - ROSTER_PLAYED, after it where the theme prints pronouns: a played character is marked with
 *   its pronoun or PRONOUN_NOT_GIVEN ("marked as having none given"), and the rest print bare;
 *   run 2e (the wording doc's part 9): it says the pronoun is the one the director's roster gives,
 *   since the summary of the characters sends pronouns here (DERIVED_LABELS.characterContext);
 * - ROSTER_NPC_HEADING, over the game's own characters, each with its canon pronoun or none.
 */
const ROSTER_OPENING = 'Every character of the game, first name and then the full name the article prints. A surname that is not on this list is invented, so use these.';
const ROSTER_PLAYED = "A name marked with a pronoun, or marked as having none given, was played in this session, and the pronoun is the one the director's roster gives. The rest were not played.";
const ROSTER_NPC_HEADING = "The game's own characters, who are never played. Where a pronoun is given here, it is fixed:";

/**
 * The rule-set call each writer phase reads (lib/rule-set.js), for requirePhasePrompts: the
 * same calls for every theme, each from its theme's rules folder (R14).
 */
const WRITER_RULE_SET_CALLS = Object.freeze({
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
 * Phases 14 and 15 (R4): the line of the NPC who writes the article gains the session's
 * name for it (session-authors.js writerSignsLine, from the theme's file and the first name
 * the director gave), so every writer and judge knows who signs the article.
 *
 * Phase 18, run 2c (the wording doc's part 5): the headings are ROSTER_OPENING, ROSTER_PLAYED and
 * ROSTER_NPC_HEADING. The line that said a name with no pronoun is not on the roster went: the
 * marks say who played, and the limits say what a missing pronoun means. A theme that prints no
 * pronouns prints no ROSTER_PLAYED.
 *
 * @param {string} theme - Theme name (e.g., 'journalist') — kept for signature compatibility
 * @param {Object|null} canonicalCharacters - Notion-derived map of firstName -> fullName
 * @param {Object|null} characterData - Optional character metadata (groups, roles, relationships) from extractCharacterData node
 * @param {Object|null} rosterPronouns - first name -> pronouns captured for this session's roster
 * @param {Array<string|{name: string}>|null} roster - this session's roster (sessionConfig.roster)
 * @param {string|null} [writerFirstName] - the session's first name for the writer
 *   (sessionConfig.journalistFirstName); the theme's default when none was given
 * @returns {string} Formatted roster section for prompts
 */
function generateRosterSection(theme = 'journalist', canonicalCharacters = null, characterData = null, rosterPronouns = null, roster = null, writerFirstName = null) {
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

  // Phase 18, run 2c (the wording doc's part 5): the heading in the limits' manner. A played
  // character carries its pronoun or PRONOUN_NOT_GIVEN, so the two sentences on the marks say who
  // played; a theme that prints no pronouns leaves them out.
  let result = `${ROSTER_OPENING}${showPronouns ? ` ${ROSTER_PLAYED}` : ''}
${lines}`;

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
      const signs = e.writer ? writerSignsLine(theme, writerFirstName) : null;
      return `- ${display}${pronouns}${role}${signs ? `. ${signs}` : ''}`;
    });

  if (npcLines.length > 0) {
    result += `

${ROSTER_NPC_HEADING}
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
 * and a journalist prompt points at a rule file by its tag alone, as in "<job-map>", and at
 * no rule by number (phase 18, R7).
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
 * The paragraph over the director's notes from the stops in every writer's prompt (phase 18, run
 * 2h, R48; the wording doc's part 10, "The director's notes from the stops"): what the notes are,
 * and what each kind asks of the writer. A note sent with a send-back was acted on at its stop and
 * is not undone; a note sent with an approval has reached no writer yet.
 */
const GATE_NOTES_PREAMBLE = "The director's notes from the stops so far, in order, in the director's own words. A note sent with a send-back was acted on at that stop: do not undo what it asked for. A note sent with an approval has not been acted on yet: act on it where it bears on your work.";

/**
 * The director's standing notes as a prompt paragraph (spec 2026-09-19 §5.3).
 * Entries with no usable text are skipped. '' when nothing remains.
 *
 * Phase 1 brief 1.1: the note box is sent with whatever the director presses, so the channel
 * holds two kinds, and the paragraph tells them apart: a note sent back was acted on by the rework
 * at its own stop, while an approval note has never reached a writer.
 *
 * Phase 18, run 2h (R48): the paragraph, then one line a note, `[stop, action, round n] text`. A
 * stop's name and an action's word come from the map the judges' block reads
 * (director-words-renderer.js stopNotePlaceOf, stopNoteActionOf), so a stop the map does not name
 * prints as it does for the judges. A note sent back carries its round; an approved note carries
 * none. A note's kind is read through noteKindOf, so one with none reads as sent back.
 */
function formatGateNotes(gateNotes) {
  const list = Array.isArray(gateNotes)
    ? gateNotes.filter(n => n && typeof n.text === 'string' && n.text.trim())
    : [];
  if (list.length === 0) return '';
  const lines = list.map((n) => {
    const action = stopNoteActionOf(n);
    const round = action === STOP_NOTE_ACTIONS.rejection ? `, round ${n.round || 1}` : '';
    return `- [${stopNotePlaceOf(n)}, ${action}${round}] ${n.text.trim()}`;
  });
  return `${GATE_NOTES_PREAMBLE}\n${lines.join('\n')}`;
}

/**
 * Drop the note the reviser is acting on RIGHT NOW (it is already in the prompt, under
 * THE DIRECTOR'S NOTE: node-helpers.js DIRECTOR_NOTE_LABEL). On an evaluator-driven second
 * pass the feedback slot is null, so nothing is excluded and every note stands (spec §5.3
 * [I10]).
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
    const isRejection = noteKindOf(n) === 'rejection';
    return !(text === current && isRejection && n.gate === gate);
  });
}

/**
 * Build the <DIRECTOR_GUIDANCE> section (Q2 decision + spec 2026-09-19 §5.3): the
 * director's standing notes, last in every writer's and reworker's prompt.
 *
 * Standalone so the revision nodes can append it without going through a
 * PromptBuilder instance (their tests use a mock builder).
 *
 * Phase 4 (brief 4.7c): the notes are its one input. The arc stop's guidance it took first,
 * which every caller passed as null once the story meeting wrote it no more (briefs 4.5 and
 * 4.7b; R4), went with its label. A call in that shape, guidance text or a second argument,
 * fails loud rather than drop the notes it carries.
 *
 * @param {Array} [gateNotes] - directorGateNotes entries (already filtered by the caller)
 * @returns {string} XML section, or '' when no note has text
 * @throws {Error} on guidance text in the notes' place, or a second argument
 */
function buildDirectorGuidanceSection(gateNotes = [], ...retired) {
  if (retired.length > 0 || typeof gateNotes === 'string') {
    throw new Error(
      'buildDirectorGuidanceSection takes the standing notes alone: the arc stop\'s guidance it ' +
      'took first went with its last readers (phase 4, brief 4.7c)'
    );
  }
  return labelPromptSection('DIRECTOR_GUIDANCE', formatGateNotes(gateNotes));
}

/**
 * The <this-session> block for one session and theme, defaulting to on-site
 * (BASELINE.md §4 class 6).
 *
 * BOTH remote sessions of the last five were written as on-site. The rule
 * existed (a "REPORTING MODE OVERRIDE" section in character-voice.md) but arrived
 * as an OVERRIDE, appended after that file's on-site persona ("Was surveilling the
 * party") and its "in-the-muck-with-everyone" voice line — and it lost. So the
 * mode does not override the persona any more: it IS the persona, stated once, in
 * the system prompt, immediately after the identity line.
 *
 * I3 finished the job: the craft prompts no longer assert presence at all, in
 * either direction. Since phase 3 (3.2) the journalist's craft files are retired, and since
 * phase 18 the limit on Nova's side ("Nova takes no side", limits.md) has its part about this
 * session here. This block is the only place the reporter's whereabouts are stated. Pinned
 * by prompt-reporting-mode-neutral.test.js.
 *
 * The reporter covers the room and is never a member of it; hardConstraints used to
 * say the opposite in so many words (`use "We decided"`). The journalist's blocks said
 * "you did not vote" until phase 3 (task 3.1); it is now in limits.md, which every writer
 * and judge carries in its system prompt (phase 18, R2; before it, truth-rules.md).
 *
 * Phase 2 (2.6): the remote block asks for attribution and allows the absence to
 * be stated at most once. 092026's remote article announced it five times ("I was
 * not there.", "I was not in that room.", "This is the story they told me.") and
 * the article evaluation praised it as voice. The prompt lines that restated where
 * the reporter was now defer to this block instead.
 *
 * Phase 3 (task 3.1): the journalist's block is the rule set's mode file,
 * `references/rules/mode-on-site.md` or `mode-remote.md`, read through lib/rule-set.js:
 * T8's mode part, Nova's position as the uninterested third party and what Nova could
 * witness. "Never votes" moved to the limits (limits.md), and the party to the limit on the
 * three stretches of time. Since phase 18 the mode files are the approved text: the remote one
 * says the memories were turned in to Nova and the players sent "tips and messages" besides,
 * the director's words (R6).
 *
 * Phase 4 (R14; brief 4.13): every theme's block is its own mode file, from the rules
 * folder its config names. The detective's one-line blocks, which served its writers of
 * the old stages, went with them (R1): the parked detective names no rules folder, so its
 * block throws, naming it.
 *
 * The single source of the wording for every system prompt that carries it: each writer's
 * and judge's, through systemPromptOpening (brief 4.13b), and each rework's. Since phase 2
 * (2.3) every rework system prompt opens with its writer's, so each rework carries the block
 * its writer does, once, in the writer's position.
 *
 * The theme's mode file (loadModeBlock), wrapped in one `<this-session>` tag whichever file
 * it came from (phase 18, R2), so the system prompt's text after the block is not read as
 * part of it. The theme is required: a missing one would silently give one theme another's
 * block.
 *
 * @param {Object} [sessionConfig] - the session's config, with reportingMode
 * @param {string} theme - the theme the caller holds
 * @returns {string}
 * @throws {Error} without a theme, or for a theme with no rules folder or no mode file,
 *   naming it (lib/rule-set.js)
 */
function buildReportingModeBlock(sessionConfig, theme) {
  // K2: the one mode rule (session-authors.js isOnSite), which the photo calls read too.
  return loadModeBlock(reportingModeOf(sessionConfig), { theme });
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
${generateRosterSection('journalist', canonicalCharacters || null, null, config.rosterPronouns, config.roster, config.journalistFirstName)}`;
}

/**
 * The opening of a writer's or a judge's system prompt (brief 4.13b): one rule for the weave
 * writer's, the map writer's, the article writer's and the two judges' system prompts, which
 * open with it. A rework's system prompt is its writer's, so it opens with this too.
 *
 * The theme's identity line for the call (lib/theme-config.js identityLineOf; brief 4.13),
 * then the session's mode block, before anything else the prompt asserts (phase 1 brief 1.5:
 * the arc writer and the outline reworker were never told the mode, so a remote session's
 * arc summaries said "I watched"), then the world and the limits, the stable frame
 * every writer and judge reads first (phase 3, 3.2: the integrator's placement ruling), all
 * from the theme's files (R14). The call's own text follows it.
 *
 * The rules are read first, so a theme with no rules folder, such as the parked detective
 * (R1), is refused for that, named, before its identity line is read.
 *
 * @param {string} theme - the theme the caller holds
 * @param {string} call - the rule-set call (lib/rule-set.js RULE_SET_CALLS), which names the
 *   identity line too
 * @param {Object} [sessionConfig] - the session's config, with reportingMode
 * @returns {string}
 * @throws {Error} as loadRuleSet, identityLineOf and buildReportingModeBlock do, naming the
 *   theme
 */
function systemPromptOpening(theme, call, sessionConfig) {
  const { core } = loadRuleSet(call, { theme });
  return `${identityLineOf(theme, call)}\n\n${buildReportingModeBlock(sessionConfig, theme)}\n\n${core}`;
}

/**
 * The article writer's map block (brief 4.7b): the tag the story map prints in, right after
 * the settled weave, and the line that opens it.
 *
 * Phase 4b (brief 1E; spec 2026-10-05 sections 5.1 and 7; R1, R4): the line reads a beat as the
 * map carries it, a move with its people, the threads it carries and its evidence underneath, each
 * piece with its sources (each named source with what it holds, lib/evidence.js SOURCES_GLOSS,
 * the gloss the weave writer's Sources line prints), what it shows and its stance, and the card
 * as a marker on the beat with its document on the piece flagged "card". The beat's `kind` is not
 * printed (mapAsShown; phase 18, run 2b, R20).
 * Phase 4b, piece 4 (spec 2026-10-07 sections 3 and 9; R1): the line names the beat's "synopsis",
 * the one sentence saying what the article tells there, which the article writer tells in its own
 * words. A map from before piece 4, and a move the director added, may carry none, so the line
 * says "where the beat has one".
 * Phase 17 (R3; the rule-text read's section 13): the evidence holds the pieces the move "can be
 * told from", so the article draws on them for what the move needs.
 * Phase 18 (the phase 18 read's part 5b): a section's job on the map is its step, and the line
 * says so right after it names a section's parts.
 * Phase 18, run 2h (the wording doc's part 10, "The line over the map, for the article writer"):
 * a connection's beat is where the article shows its two threads meeting; a piece that cuts against
 * a beat is a caution or a disagreement; a photo whose moment is outside the story sits where its
 * people appear, unexplained; and "leftOut" is the one note the line names, since the map as shown
 * holds no gapNote and no dropped (mapAsShown, R50), and no weaveChanges (the final review's item
 * 1). The names of the sections follow the line (sectionNamesLines).
 * It names the record in words, never by its tag, as lib/evidence.js's piece descriptions do: the
 * map prints above the record, and the prompt's readers take the first <RECORD> for the record.
 */
const STORY_MAP_TAG = 'STORY_MAP';
const STORY_MAP_LABEL = `The story map as the director left it at the map's stop, as JSON. Each section gives its slot, heading, job, beats and photos. A section's job is its step: what the reader learns there about the question. A beat is one move of the story: its "move" says it in a few plain words, "synopsis", where the beat has one, says in one sentence what the article tells there, "players" names the people in it, "threads" the ids of the settled weave's threads it carries, and "connection" the id of the weave's connection that lands in it: the beat where the article shows those two threads meeting. Its "evidence" holds the pieces of the record the move can be told from, each with its "sources" (the id of a document in the record, ${SOURCES_GLOSS}), what it "shows", and its "stance": whether it supports the move or cuts against it. A piece that cuts against a beat is a caution or a disagreement. It keeps the article from claiming more than the record supports, and the article can tell the disagreement where the step needs it. A beat marked "card": true prints an inline evidence card of the document named by its piece flagged "card": true. A photo's "beat" is the beat it sits beside. A photo whose moment is outside the story sits in the section where its people appear, and nothing is written to explain it. "leftOut" lists the beats the story does not use.`;

/** The line over the names of the sections the article writer is shown after the map's line (run 2h). */
const SECTION_NAMES_LINE = "What each section's name stands for:";

/**
 * The map's sections for a theme, one line each, its name and what it stands for, from the
 * theme's config (lib/theme-config.js mapSlotsOf): the one list the map writer's <SLOTS> prints
 * and the article writer reads after the line over the map (phase 18, run 2e, R33; run 2h, the
 * wording doc's part 10). A slot with no description would print as "undefined", so the call
 * stops the prompt instead: one check for both readers.
 *
 * @param {string} themeName
 * @returns {string[]} `- <key>: <description>`, in the config's order
 * @throws {Error} for a slot with no description
 */
function sectionNamesLines(themeName) {
  const slots = mapSlotsOf(themeName);
  const undescribed = slots.find((slot) => typeof slot.description !== 'string' || !slot.description.trim());
  if (undescribed) {
    throw new Error(`The map writer's <SLOTS> and the article writer's names of the sections print each slot's description, and slot "${undescribed.key}" of theme "${themeName}" has none in lib/theme-config.js (map.slots).`);
  }
  return slots.map((slot) => `- ${slot.key}: ${slot.description}`);
}

/**
 * The instruction's line on which inline cards the article prints (phase 4b, brief 1E; spec
 * 2026-10-05 sections 5.1 and 7; C9; R4): the map's, one for each beat in its sections that
 * flags a card's document, each named by that document's id beside its beat, as beatCardOf reads
 * it, so the writer never reads a card from the JSON by hand. A beat under leftOut prints none.
 *
 * The director's desk edits come first, as HAND_EDITS gives them, as on the task's beats line
 * (briefs 4.7e and 4.7f): the map keeps the beat of a card the director deleted at the desk, so
 * the line names that card too, and a rework that carries it reads the director's cut first. The
 * rule for those edits is HAND_EDITS' alone, and this line restates none of it.
 *
 * Fix round 4: each document by the record's own spelling of its id (lib/evidence.js
 * documentResolverOf, the rule the map's card check and the article's card fidelity read), so a
 * card the map cites as "SAM001" reaches the writer as sam001; one the record does not hold, or a
 * prompt built with no record, as the map writes it.
 *
 * @param {Object} map - the map as the article reads it
 * @param {Object|null} [evidenceBundle] - the record the documents are named from
 * @returns {string}
 */
function mapCardsLine(map, evidenceBundle = null) {
  const resolve = documentResolverOf(evidenceBundle);
  const cards = [];
  (Array.isArray(map && map.sections) ? map.sections : []).forEach((section) => {
    (Array.isArray(section && section.beats) ? section.beats : []).forEach((beat) => {
      const cited = beatCardOf(beat);
      const document = cited && resolve(cited) ? resolve(cited).id : cited;
      if (document) cards.push(`"${document}" for ${beat.id}`);
    });
  });
  const opening = "The cards: the director's edits first, as HAND_EDITS gives them; otherwise the map's, and no other,";
  if (cards.length === 0) return `${opening} and its sections name no card's document.`;
  const listed = cards.length > 1 ? `${cards.slice(0, -1).join(', ')} and ${cards[cards.length - 1]}` : cards[0];
  return `${opening} each with the "tokenId" of the document its beat's flagged piece names: ${listed}.`;
}

/**
 * The article writer's task (brief 4.7b; spec 6.1; the approved read's section D), right
 * after the settled weave and the map: the reading order, then what the writer writes from
 * the map.
 *
 * Phase 18 (the brief-and-the-limits spec, sections 3 and 7; the phase 18 read's part 2): the
 * task points at the brief (<brief>) and the writer's own part (<job-article>) by their tags,
 * which print below it, and repeats neither. Run 2b: each tag in backticks, as mapTask names
 * <job-map> (the integrator's ruling after run 2). It cites no rule by number. It names this call's
 * decisions: the beats, the sections' order, the headings, the photos' places, the headline and
 * the deck, and the length. How the writer tells a beat, with or without evidence, how it prints
 * a card, and its words, transitions and voice are its own part's to say.
 *
 * The article rework carries this task word for word, ahead of its <HAND_EDITS>, which lists
 * the director's edits at the desk (spec section 7). So the lines on a section's heading, a
 * photo's place, and the headline and deck give the director's version first and the map's
 * otherwise (briefs 4.7c and 4.7d): the heading, headline or deck where the director edited
 * one, and the place where the director moved the photo. Since phase 18's run 2f (R40) the stamp
 * records the map's headline, its deck and each section's heading as the director's edits the same
 * way, whoever wrote them, since the director approved the map that carries them, and a top photo
 * where the director chose it on the map (ai-nodes.js stampFromMap). So a rework's <HAND_EDITS>
 * lists them, and "the director's own" and "the map's" in these lines name the same text until the
 * director edits one at the desk.
 * The instruction's heading and headline lines defer to this task. The line above the headline
 * (the headline's kicker) is the theme's, which code stamps and a rework carries (phase 18, R38),
 * so neither the task nor the instruction names it, and a kicker the director edited at the desk
 * reaches a rework on <HAND_EDITS> alone. The top photo is the map's: the desk edits only its
 * caption.
 *
 * The beats line and the sections line give the director's edits precedence over the body
 * (briefs 4.7e and 4.7f): the director's edits first, as HAND_EDITS gives them; otherwise every
 * beat in the map's sections, and no other, in the map's order (piece 4, R2: the order is the
 * map's). The map keeps the beat of a card the director deleted at the desk (only a deleted
 * photo leaves it, through the leave-out list), its leftOut names beats whose material, in the
 * record, a paragraph the director inserts may use (the writer sees a left-out beat by its id and
 * title: mapAsShown), and code does not restore a send-back's rework, so the edits come
 * first. The rule for those edits, with its send-back exception, is stated in <HAND_EDITS> alone
 * (node-helpers.js buildRevisionContext), and these lines restate neither: 4.7e's restated the
 * rule, a cut staying out among it, without the exception, so a send-back whose note asked for
 * a cut card back met two statements that disagreed. With no edit, as in the
 * first draft, the prompt carries no <HAND_EDITS>, and the lines ask for every beat in the map's
 * sections, and no other.
 *
 * Phase 4b, piece 4 (spec 2026-10-07 sections 3 and 9; R2): the order of a section's beats is the
 * map's, where the director sees it and can change it, so the sections line gives the writer the
 * beats in the map's order.
 *
 * The lines name the block without its angle brackets, as the judges' questions name
 * FINANCIAL_SUMMARY, and the writer's prompts never say "desk". A rework carries the task above
 * its <HAND_EDITS> block, and the removed-phrase scan strips that block from the first
 * "<HAND_EDITS>" it meets (lib/__tests__/fixtures/removed-phrases.js instructionText), so a
 * bracketed name here would hide every line between the task and the block from it.
 */
const ARTICLE_TASK = `Write the article. The weave above is the story the director settled at the meeting, and the story map lays it across the article's sections as the director left it at the map's stop. \`<brief>\` below says what the article has to be, and \`<job-article>\` says what is yours to decide. For this article:
- the beats: the director's edits first, as HAND_EDITS gives them; otherwise every beat in the map's sections, and no other, so the beats under leftOut, the director's strikes among them, stay out of the article;
- the map's sections in its order; the director's edits first, as HAND_EDITS gives them; otherwise each section holds its beats in the map's order;
- each section's heading: the director's own where the director has edited one, otherwise the map's, as written;
- each photo's place: the director's where the director has moved the photo, otherwise the map's, beside its beat; and the map's top photo at the top of the article;
- the headline and the deck: the director's own where the director has edited one, otherwise the map's, as written;
- the length: about the map's expected length.`;

/**
 * The places in a ContentBundle where a field the article writer is not shown sits (phase 18,
 * run 2b, R23), each with:
 * - `where`, for an error;
 * - `schemaOf`, the object schema that holds the field in the ContentBundle schema;
 * - `objectsOf`, the objects in a bundle the field sits on;
 * - `keyOf`, what pairs an object of the previous article with one of the reworked article in
 *   the carry (carryUnshownFields): a sidebar entry by its document id, a photo block and the top
 *   photo by filename (photoKey, the one rule for a photo's name), and the bundle, its headline,
 *   its metadata and its byline each with the other's.
 */
const BUNDLE_PLACES = Object.freeze({
  bundle: {
    where: 'the bundle',
    schemaOf: (schema) => schema,
    objectsOf: (bundle) => [bundle],
    keyOf: () => 'bundle'
  },
  headline: {
    where: 'the headline',
    schemaOf: (schema) => schema.properties?.headline,
    objectsOf: (bundle) => [bundle.headline],
    keyOf: () => 'headline'
  },
  metadata: {
    where: "the bundle's metadata",
    schemaOf: (schema) => schema.properties?.metadata,
    objectsOf: (bundle) => [bundle.metadata],
    keyOf: () => 'metadata'
  },
  byline: {
    where: 'the byline',
    schemaOf: (schema) => schema.properties?.byline,
    objectsOf: (bundle) => [bundle.byline],
    keyOf: () => 'byline'
  },
  sidebarEntry: {
    where: 'a sidebar entry',
    schemaOf: (schema) => schema.properties?.evidenceCards?.items,
    objectsOf: (bundle) => (Array.isArray(bundle.evidenceCards) ? bundle.evidenceCards : []),
    keyOf: (entry) => (typeof entry.tokenId === 'string' ? entry.tokenId.trim() : '')
  },
  photoBlock: {
    where: 'a photo block',
    schemaOf: (schema) => (schema.properties?.sections?.items?.properties?.content?.items?.oneOf || [])
      .find((branch) => branch?.properties?.type?.const === 'photo'),
    objectsOf: (bundle) => (Array.isArray(bundle.sections) ? bundle.sections : [])
      .flatMap((section) => (section && Array.isArray(section.content) ? section.content : []))
      .filter((block) => block && block.type === 'photo'),
    keyOf: (block) => photoKey(block.filename)
  },
  heroImage: {
    where: 'the hero image',
    schemaOf: (schema) => schema.properties?.heroImage,
    objectsOf: (bundle) => [bundle.heroImage],
    keyOf: (hero) => photoKey(hero.filename)
  }
});

/**
 * Every field of the ContentBundle the article writer is not shown, each as [its place in
 * BUNDLE_PLACES, its name] (phase 18, R13; run 2b, R23): every field the generation
 * instruction's six items do not name. The one list the writer's schema (writerBundleSchemaOf),
 * the previous article a rework is shown (bundleAsShown) and the carry (carryUnshownFields) read.
 *
 * - The bundle's money tracker, which the page prints from the ledger; its top-level photos, pull
 *   quotes and voice self-check, which nothing prints; and its revision history, which the server
 *   writes after each rework.
 * - The headline's kicker, the line above the headline (run 2d, R38): the theme's, which the stamp
 *   puts on a first write (ai-nodes.js stampFromMap) and the carry keeps through a rework, the
 *   director's at the desk among them.
 * - The metadata's version and story date: the server stamps the story date.
 * - The byline's location and date, which the page does not print.
 * - A sidebar entry's owner, placement and content, which the sidebar does not print (the article
 *   stop's sidebar editor writes the owner).
 * - The characters of a photo block and of the hero image.
 *
 * The full schema keeps each as optional, for the validator, the template, the desk and the stored
 * bundle.
 */
const UNSHOWN_BUNDLE_FIELDS = Object.freeze([
  ['bundle', 'financialTracker'],
  ['bundle', 'photos'],
  ['bundle', 'pullQuotes'],
  ['bundle', 'voice_self_check'],
  ['bundle', '_revisionHistory'],
  ['headline', 'kicker'],
  ['metadata', 'version'],
  ['metadata', 'storyDate'],
  ['byline', 'location'],
  ['byline', 'date'],
  ['sidebarEntry', 'owner'],
  ['sidebarEntry', 'placement'],
  ['sidebarEntry', 'content'],
  ['photoBlock', 'characters'],
  ['heroImage', 'characters']
].map((entry) => Object.freeze(entry)));

/**
 * The kinds of block a section's content may hold that the article writer is not offered (phase 18,
 * run 2c, R34; the wording doc's part 6): the caption that names a document and prints none of its
 * text, and the list. The generation instruction names neither, and writerBundleSchemaOf leaves
 * their shapes out of the writer's schema, the one printed and given to the SDK. The full schema,
 * the validator and the template keep both, so a stored article that holds one validates and
 * prints.
 */
const UNOFFERED_BLOCK_TYPES = Object.freeze(['evidence-reference', 'list']);

/** The list of a section's block shapes in a ContentBundle schema, each a branch of its oneOf. */
function blockShapesOf(schema) {
  return schema.properties?.sections?.items?.properties?.content?.items;
}

/** A plain object: not null, not an array. */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** The names UNSHOWN_BUNDLE_FIELDS lists at one place. */
function unshownNamesAt(place) {
  return UNSHOWN_BUNDLE_FIELDS.filter(([at]) => at === place).map(([, name]) => name);
}

/**
 * The article writer's schema (phase 18, R13; run 2b, R23): the full ContentBundle schema less
 * UNSHOWN_BUNDLE_FIELDS, and less the block shapes of UNOFFERED_BLOCK_TYPES in a section's content
 * (run 2c, R34), derived here so the two cannot drift. It is the schema printed in the
 * writer's <SCHEMA> and the schema the SDK is given for the article call and its rework (ai-nodes.js
 * generateContentBundle, articleReworkCall), so the printed copy and the tool always agree. A
 * pure function: it returns a copy and leaves `schema` as it is. The validator (schema-validator.js)
 * and the template read the full schema, so a stored bundle that holds a field left out here still
 * validates.
 *
 * It fails loud, naming the field, when a field it removes is missing from `schema` (the schema
 * changed and the list did not follow) or is required where it sits (a required field the writer
 * cannot write would fail every bundle), and naming the block, when a block shape it removes is
 * missing. No property or shape removed is the target of a "$ref", since the
 * schema holds none, so the copy stays valid JSON Schema. It adds no keyword, so the SDK's
 * sanitizing (lib/llm/client.js sanitizeSchemaForSdk) treats it as it treats the full schema.
 *
 * @param {Object} schema - the full ContentBundle schema
 * @returns {Object} the writer's schema
 */
function writerBundleSchemaOf(schema) {
  const trimmed = JSON.parse(JSON.stringify(schema));
  UNSHOWN_BUNDLE_FIELDS.forEach(([place, name]) => {
    const { where, schemaOf } = BUNDLE_PLACES[place];
    const object = schemaOf(trimmed);
    if (!object || !object.properties || !Object.prototype.hasOwnProperty.call(object.properties, name)) {
      throw new Error(`writerBundleSchemaOf: the ContentBundle schema has no "${name}" on ${where} to leave out of the article writer's schema`);
    }
    if (Array.isArray(object.required) && object.required.includes(name)) {
      throw new Error(`writerBundleSchemaOf: "${name}" on ${where} is required, so the article writer's schema cannot leave it out`);
    }
    delete object.properties[name];
  });
  const blocks = blockShapesOf(trimmed);
  UNOFFERED_BLOCK_TYPES.forEach((type) => {
    const shapes = blocks && Array.isArray(blocks.oneOf) ? blocks.oneOf : [];
    if (!shapes.some((branch) => branch?.properties?.type?.const === type)) {
      throw new Error(`writerBundleSchemaOf: the ContentBundle schema has no "${type}" block to leave out of the article writer's schema`);
    }
    blocks.oneOf = shapes.filter((branch) => branch?.properties?.type?.const !== type);
  });
  return trimmed;
}

/**
 * The article writer's schema, built once at load, so a schema it cannot trim fails the server's
 * start, and the SDK is handed one object (lib/llm/client.js memoizes its sanitized copy by the
 * object).
 */
const WRITER_BUNDLE_SCHEMA = writerBundleSchemaOf(contentBundleSchema);

/**
 * A ContentBundle as the article writer is shown it (run 2b, R23): a copy less every field in
 * UNSHOWN_BUNDLE_FIELDS, wherever it sits. What a rework prints as the previous article
 * (ai-nodes.js articleReworkCall), in the shape the writer writes. The bundle it is given is
 * untouched; anything that is no object passes through.
 *
 * @param {Object} bundle
 * @returns {Object}
 */
function bundleAsShown(bundle) {
  if (!isPlainObject(bundle)) return bundle;
  const shown = JSON.parse(JSON.stringify(bundle));
  Object.entries(BUNDLE_PLACES).forEach(([place, { objectsOf }]) => {
    const names = unshownNamesAt(place);
    objectsOf(shown).filter(isPlainObject).forEach((object) => names.forEach((name) => { delete object[name]; }));
  });
  return shown;
}

/**
 * The fields the article writer is not shown, carried from the previous article into the
 * reworked one (run 2b, R23): a rework writes into the writer's schema, so it returns none of
 * them, and the stored bundle keeps each. For each place in BUNDLE_PLACES, an object of the
 * reworked article is paired with the object of the previous article its key names (a sidebar
 * entry by its document id, a photo block and the top photo by filename; objects that repeat a
 * key pair in their order), and each field UNSHOWN_BUNDLE_FIELDS lists there is copied where the
 * reworked object lacks it. An object the previous article did not hold gets nothing, and a field
 * the reworked article holds stays as it is.
 *
 * It runs in the rework (ai-nodes.js reviseContentBundle) on the call's output, before code puts
 * back the director's edits (settleEdits) and before validation, so a field the director wrote at
 * the desk that the writer is not shown, a sidebar entry's owner, survives an automatic pass and a
 * send-back. A pure function: both articles it is given are untouched, and a reworked article that
 * is no object passes through.
 *
 * @param {Object|null} previous - the article the rework started from, in the full shape
 * @param {Object|null} reworked - the rework's output, in the writer's shape
 * @returns {Object|null} a copy of `reworked` with the carried fields
 */
function carryUnshownFields(previous, reworked) {
  if (!isPlainObject(reworked)) return reworked;
  const out = JSON.parse(JSON.stringify(reworked));
  if (!isPlainObject(previous)) return out;
  Object.entries(BUNDLE_PLACES).forEach(([place, { objectsOf, keyOf }]) => {
    const names = unshownNamesAt(place);
    const waiting = new Map();
    objectsOf(previous).filter(isPlainObject).forEach((object) => {
      const key = keyOf(object);
      if (key) waiting.set(key, [...(waiting.get(key) || []), object]);
    });
    objectsOf(out).filter(isPlainObject).forEach((object) => {
      const key = keyOf(object);
      const queue = key ? waiting.get(key) : null;
      const from = queue && queue.length > 0 ? queue.shift() : null;
      if (!from) return;
      names.forEach((name) => {
        if (object[name] === undefined && from[name] !== undefined) object[name] = JSON.parse(JSON.stringify(from[name]));
      });
    });
  });
  return out;
}

/**
 * A story map with no beat's `kind` (phase 18, run 2b, R21; run 2c, R31): a copy of the map with
 * the kind taken off each beat in a section and each beat under `leftOut`, and every other field as
 * the map holds it, a left-out beat whole. The kind is the retired form of a beat, which pulled the
 * draft toward a scene, then the evidence; the map writer's schema no longer asks for it, and a map
 * stored before that change may hold it.
 *
 * The one rule for a beat's kind, in two forms: the map's rework prints the map it starts from
 * through this step, since it hands back a whole map (ai-nodes.js mapReworkCall), and the map as
 * the article writer is shown it builds on it (mapAsShown). The map the stop stores, the edits, the
 * settle and the state read the map whole. The map it is given is untouched; anything that is no
 * map passes through, and so does a beat that is no object.
 *
 * @param {Object|null} map
 * @returns {Object|null}
 */
function mapWithoutBeatKinds(map) {
  if (!isPlainObject(map)) return map;
  const shown = JSON.parse(JSON.stringify(map));
  const withoutKind = (beat) => {
    if (!isPlainObject(beat)) return beat;
    const { kind: _kind, ...rest } = beat;
    return rest;
  };
  if (Array.isArray(shown.sections)) {
    shown.sections = shown.sections.map((section) => (isPlainObject(section) && Array.isArray(section.beats)
      ? { ...section, beats: section.beats.map(withoutKind) }
      : section));
  }
  if (Array.isArray(shown.leftOut)) shown.leftOut = shown.leftOut.map(withoutKind);
  return shown;
}

/**
 * The story map as the article writer and its rework are shown it (phase 18, run 2b, R20; run 2c,
 * R31; run 2h, R50; the final review's item 1): the map with no beat's kind (mapWithoutBeatKinds),
 * then each beat under `leftOut` cut to its id and its title (its "move") alone, since a struck
 * beat's synopsis and evidence would hand back what the director took out, and without `gapNote`,
 * `dropped` and `weaveChanges`, the map's notes to the director. The first two would hand the
 * writer a lead the director has not settled into the story; `weaveChanges`, the map writer's list
 * of what it changed to fit in the director's changes at the meeting, holds short map lines (a
 * beat's working title) the writer is told nothing about and could print. The map the stop stores,
 * the stamp, the checks, the fact check, the judge and the page read the map whole; this copy is
 * only what <STORY_MAP> prints. The map it is given is untouched; anything
 * that is no map passes through, and so does a left-out entry that is no object.
 *
 * @param {Object|null} map - the map as the article reads it (ai-nodes.js articleMapOf)
 * @returns {Object|null}
 */
function mapAsShown(map) {
  if (!isPlainObject(map)) return map;
  const shown = mapWithoutBeatKinds(map);
  delete shown.gapNote;
  delete shown.dropped;
  delete shown.weaveChanges;
  if (Array.isArray(shown.leftOut)) {
    shown.leftOut = shown.leftOut.map((beat) => {
      if (!isPlainObject(beat)) return beat;
      const titled = {};
      if (beat.id !== undefined) titled.id = beat.id;
      if (beat.move !== undefined) titled.move = beat.move;
      return titled;
    });
  }
  return shown;
}

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
   * @param {Object} [options]
   * @param {boolean} [options.withCharacterContext=true] - false prints the roster without the
   *   character context the builder holds (phase 18, run 2b, R22: the article writer's form)
   * @returns {string}
   */
  _rosterSection({ withCharacterContext = true } = {}) {
    return generateRosterSection(this.themeName, this.canonicalCharacters, withCharacterContext ? this.characterData : null,
      this.sessionConfig?.rosterPronouns, this.sessionConfig?.roster, this.sessionConfig?.journalistFirstName);
  }

  /**
   * Build the <INVESTIGATION_OBSERVATIONS> section from the director's raw notes.
   *
   * Shared by the article prompt and (phase 1, brief 1.5) the outline prompt: the
   * planner that decides what each section does had never read the director's own
   * account of the investigation. One renderer, one wording, so the outline and the
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
   * follow-up: the header says the follow-up is Nova's own reporting, from the epilogue
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
      ? "\nThe follow-up from Nova's day is the <EPILOGUE> below. In the story it is Nova's own reporting from the rest of that day."
      : '';
    // Phase 18, run 2h (R47): the one label over the notes opens the block, where "The director's
    // notes on the session, as written." stood, and the block's own lines follow it.
    return `<INVESTIGATION_OBSERVATIONS>
${DIRECTOR_NOTES_LABEL}
Each block below says what it is.${epilogueLine}

${notes}
</INVESTIGATION_OBSERVATIONS>`;
  }

  /**
   * Build the <DIRECTOR_GUIDANCE> section (Q2 decision): the standing notes.
   *
   * Appended LAST to the map and article writers' user prompts. Recency bias is the
   * point: the director's notes have to survive several thousand tokens of rule files.
   * Brief 4.7c: the notes are its one input (buildDirectorGuidanceSection).
   *
   * @param {Array} [gateNotes] - directorGateNotes entries carried into this prompt
   * @returns {string} XML section, or '' when no note has text
   */
  _buildDirectorGuidance(gateNotes = []) {
    const section = buildDirectorGuidanceSection(gateNotes);
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
All accounts together${sumSource}: $${total.toLocaleString('en-US')}. That is what the buyer paid out during the investigation, the sales and the first-burial bonus; a transfer moves money between accounts and adds nothing to it.
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
   * Phases 14 and 15 (R5): with a guest reporter, their line (buildSessionFacts'
   * guestReporterLine) follows the roster.
   * Brief E (R7): the time-of-day line (buildSessionFacts' timeOfDayLine) opens it, so every
   * writer and judge that reads SESSION_FACTS knows when the investigation ran.
   *
   * Final fix wave (K1): who was in the room follows the reporting mode, read through the one
   * mode rule (isOnSite). On site, the writer was in the room too, beside Blake, working it for
   * the story (the on-site mode block): its name joins Blake's in the exception, and the theme's
   * line for it (writerInTheRoom) follows Blake's, pointing at the mode block. Remote, the
   * sentence is as it was. Both keep "not one of the players" and the head count.
   *
   * @param {Object|null} sessionFacts - ai-nodes.js buildSessionFacts
   * @returns {string} the XML section, or '' without facts
   */
  _sessionFactsSection(sessionFacts) {
    if (!sessionFacts) return '';
    const n = sessionFacts.playerCount;
    const guest = sessionFacts.guestReporterLine ? `${sessionFacts.guestReporterLine}\n\n` : '';
    // Phases 14 and 15 (R7): when the investigation ran, first; none with no sale and no exposure
    const when = sessionFacts.timeOfDayLine ? `${sessionFacts.timeOfDayLine}\n\n` : '';
    // K1: on site, the writer was in the room too, beside Blake
    const writer = writerInTheRoom(this.themeName, this.sessionConfig);
    const inTheRoom = writer ? ` and ${writer.name}` : '';
    const writerLine = writer ? `${writer.line} ` : '';
    return `
<SESSION_FACTS>
${when}INVESTIGATION ROSTER (${n} players):
${sessionFacts.roster.join('\n')}

${guest}${renderSessionFactsVerdict(sessionFacts)}

Only the ${n} players above were at the investigation. Every other character except Blake${inTheRoom} appears only through the memories and documents. Blake was in the room too, making deals, and acts and speaks there as the record shows. ${writerLine}Nova is not one of the players. When the article counts the people at the investigation, it counts these ${n} players.
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
    userPrompt += this._buildDirectorGuidance(options.gateNotes || []);

    return { systemPrompt, userPrompt };
  }

  /**
   * The map writer's system prompt, shared with its rework (2.3): its opening alone
   * (systemPromptOpening; brief 4.13b), the theme's identity line, the mode block, then the
   * world and the limits from the theme's rules folder (R14). The brief and the map writer's own
   * part (<brief>, <job-map>) go last in the user prompt.
   *
   * @returns {Promise<string>}
   * @throws {Error} for a theme with no story map (lib/map.js mapSchemaFor), such as the
   *   parked detective (R1): the outline stage's detective branch went with the old stage;
   *   for a theme with no identity line for the map writer or no rules folder, naming it
   */
  async buildOutlineSystemPrompt() {
    mapSchemaFor(this.themeName);
    return systemPromptOpening(this.themeName, 'outline', this.sessionConfig);
  }

  /**
   * The map writer's user prompt up to, not including, <DIRECTOR_GUIDANCE> (phase 4, brief
   * 4.6). Shared with the map's rework, which follows it with its revision block and then
   * its own <DIRECTOR_GUIDANCE>.
   *
   * The settled weave comes first, as the writer's task (spec 5.1), then the task itself and
   * the theme's slots, each by its key with its description from the theme's config (phase
   * 18, run 2c, R33: a slot's stock heading is not printed here), then what the outline writer read: the director's notes, the photos
   * with the director's descriptions, the record with the investigation's timeline, the money, the
   * session facts with the director's accusation, the roster with pronouns (phase 3, 3.10;
   * T9), the map's <SCHEMA> (fix 3.2b) and the brief and <job-map> last (the integrator's placement
   * ruling). The arcs, the arc analysis and the selected arcs went with their channels (R4),
   * and the arc stage's <SHOULD_CONSIDER> with the arc selection.
   *
   * @returns {Promise<string>}
   * @throws {Error} with no settled weave: the map lays out the weave the meeting settled; for a
   *   slot of the theme's with no description, naming the slot and the theme (run 2e)
   */
  async buildOutlineUserSections(settledWeave, photos = [], shellAccounts = [], sessionFacts = null, options = {}) {
    if (typeof settledWeave !== 'string' || !settledWeave.trim()) {
      throw new Error('The map writer reads the settled weave first, and this thread holds no weave: the story meeting settles it. Go back to the story meeting.');
    }
    // Phase 18, run 2e: <SLOTS> prints each slot's description from the theme's config (R33);
    // a slot with none stops the prompt (sectionNamesLines).
    const slotLines = sectionNamesLines(this.themeName);
    const observationsSection = this._buildInvestigationObservations(options.directorNotes, options.directorCorrections, options.evidenceBundle);
    // Brief 2.1: every usable document in full, once, with the investigation's timeline.
    const recordSection = renderRecordView(options.evidenceBundle, { sessionConfig: this.sessionConfig });
    const rosterSection = rosterWithPronounsSection(this.sessionConfig, this.canonicalCharacters);
    const photoList = Array.isArray(photos) ? photos : [];
    // Brief 4.6b: the entry renderPhotoListEntry marks [hero image].
    const heroMarked = photoList.some((photo) => Boolean(photo && photo.hero));
    // Brief 4.6c: the meeting's approval note among the notes <DIRECTOR_GUIDANCE> prints, by
    // the rule the map checks take "note" as a source by.
    const meetingNote = meetingNoteOf({ directorGateNotes: options.gateNotes });

    return `${settledWeave}

${mapTask(heroMarked, meetingNote)}

<SLOTS>
The sections the map can use, by the name the map gives each. Use the ones the story needs, in the order its steps need them.
${slotLines.join('\n')}
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

${loadRuleSet('outline', { theme: this.themeName }).craft}`;
  }

  /**
   * The article writer's prompt (phase 2, 2.3; phase 4, brief 4.7b): its system prompt
   * (buildArticleSystemPrompt), its user sections (buildArticleUserSections), then
   * <DIRECTOR_GUIDANCE> last, with the standing notes, so they outrank the rules above. The
   * article reworker is built from the same two builders (ai-nodes.js
   * buildArticleRevisionPrompt), so whatever this writer is given reaches its rework without
   * a second copy. The arc selection's guidance (`_outlineGuidance`) went with its last
   * readers (R4), and the outline judge's <SHOULD_CONSIDER> with the outline judge (brief
   * 4.6).
   *
   * @param {string} settledWeave - the settled weave (prompt-renderers/settled-weave.js)
   * @param {Object} map - the story map as the article reads it: the map as the director
   *   left it, less the photos the director has left out since (ai-nodes.js articleMapOf)
   * @param {Array} shellAccounts - Shell account data for financial summary
   * @param {Object|null} sessionFacts - Session facts for non-roster character guardrail
   * @param {Object|null} directorNotes - Director observations for article grounding
   * @param {Object} options - { gateNotes, evidenceBundle, directorCorrections, photoDescriptions,
   *   photos, schema }: `schema` is the one the call is given, printed in <SCHEMA>; the writer's
   *   (WRITER_BUNDLE_SCHEMA) when absent
   * @returns {Promise<{systemPrompt: string, userPrompt: string}>}
   */
  async buildArticlePrompt(settledWeave, map, shellAccounts = [], sessionFacts = null, directorNotes = null, options = {}) {
    const systemPrompt = await this.buildArticleSystemPrompt();
    let userPrompt = await this.buildArticleUserSections(
      settledWeave, map, shellAccounts, sessionFacts, directorNotes, options
    );

    // The standing notes, LAST, so they outrank the rules above (Q2; spec 2026-09-19 §5.3).
    userPrompt += this._buildDirectorGuidance(options.gateNotes || []);

    return { systemPrompt, userPrompt };
  }

  /**
   * The article writer's system prompt, shared with the article reworker (2.3): its opening
   * (systemPromptOpening; brief 4.13b), the theme's identity line, the mode block, the world
   * and the limits from the theme's folder (R14), then the roster with pronouns (phase
   * 3, 3.2: the integrator's placement ruling). The roster prints here alone (M20: the user
   * prompt's <RULES> carried a second copy).
   *
   * Phase 18, run 2b (R22): the roster without the character context, the model's digest of the
   * documents. The article writer has the documents themselves in the record, and the digest
   * carried the documents' pronouns, which the roster overrides. Since run 2h the judges' roster
   * prints without it too (evaluator-nodes.js renderJudgeRosterSection, `withCharacterContext:
   * false`).
   *
   * @returns {Promise<string>}
   * @throws {Error} for a theme with no story map (lib/map.js mapSchemaFor), such as the
   *   parked detective (R1): the article writer writes from the map, and the article
   *   stage's detective branch went with the old stages (phase 4, brief 4.7b); for a theme
   *   with no identity line for the article writer or no rules folder, naming it
   */
  async buildArticleSystemPrompt() {
    mapSchemaFor(this.themeName);
    return `${systemPromptOpening(this.themeName, 'article', this.sessionConfig)}

${this._rosterSection({ withCharacterContext: false })}`;
  }

  /**
   * The article writer's user prompt up to, not including, <DIRECTOR_GUIDANCE> (brief
   * 4.7b): the settled weave, the map, the task, then the data, the session facts, the
   * generation instruction with its schema, and the brief and <job-article> last. Shared with the
   * article reworker (2.3), which follows it with its revision block and then its own
   * <DIRECTOR_GUIDANCE>. Takes buildArticlePrompt's arguments; options.gateNotes is the
   * tail's and is not read here.
   *
   * @returns {Promise<string>}
   * @throws {Error} for a theme with no story map, such as the parked detective (R1); with
   *   no settled weave, or no map: the article is written from both
   */
  async buildArticleUserSections(settledWeave, map, shellAccounts = [], sessionFacts = null, directorNotes = null, options = {}) {
    mapSchemaFor(this.themeName);
    if (typeof settledWeave !== 'string' || !settledWeave.trim()) {
      throw new Error('The article writer reads the settled weave first, and this thread holds no weave: the story meeting settles it. Go back to the story meeting.');
    }
    if (!map || typeof map !== 'object' || Array.isArray(map) || !Array.isArray(map.sections)) {
      throw new Error('The article writer writes from the story map, and this thread holds no map: the map\'s stop settles it. Go back to the map.');
    }
    // Brief 2.1: the record, once, in the data part. Phase 4 (brief 4.6; R5): the arc
    // packages that named each arc's documents went; the record is whole.
    const recordSection = renderRecordView(options.evidenceBundle, { sessionConfig: this.sessionConfig });
    return this._journalistArticleUserSections(
      settledWeave, map, shellAccounts, sessionFacts, directorNotes, options, recordSection
    );
  }

  /**
   * The journalist article writer's user prompt up to <DIRECTOR_GUIDANCE>.
   *
   * Brief 4.7b (spec 6.1): the settled weave first, then the story map as the director left
   * it (<STORY_MAP>, where the approved outline printed until phase 4), then the task
   * (ARTICLE_TASK), then what the writer read before: the data, the roster and verdict, the
   * generation instruction with its schema, and the brief and <job-article> last (phase 3, 3.2:
   * the integrator's placement ruling; phase 18, R45; the world and the limits are in the system
   * prompt). The instruction takes the sections, their ids and the top photo from the map,
   * and the headings, the headline and the deck as the task gives them (ARTICLE_TASK), so it
   * names none of the theme's slots. The HERO IMAGE line went: the map's top photo is the
   * hero, and the instruction names it.
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
   * editor writes a sidebar entry's owner. Phase 18 (R13; run 2b, R23): the schema printed in
   * <SCHEMA> is the writer's (WRITER_BUNDLE_SCHEMA: the full one less every field the
   * instruction's six items do not name), and it is the schema the SDK is given for the call, so
   * the instruction lists no field to leave out. A rework passes the schema its call is given in
   * options.schema (ai-nodes.js articleReworkCall: with the changed-edits field on a send-back
   * that carries the director's edits), so the copy it prints is the tool's. The money tracker
   * prints itself from the ledger (M2).
   *
   * Phase 18, run 2c (R34; the wording doc's part 6): the instruction offers four blocks, a
   * paragraph, a quote, an inline card and a photo. The caption that names a document and the
   * list are no longer offered, and their shapes are gone from the writer's schema
   * (UNOFFERED_BLOCK_TYPES); the full schema, the validator and the template keep them.
   *
   * Phase 18, run 2b (R20): <STORY_MAP> prints the map as the writer is shown it (mapAsShown):
   * no beat's kind, and each left-out beat by its id and title. The cards line, the top photo
   * and the photos read the map they are given, whole.
   *
   * Run 2c (the wording doc's parts 4 and 6): the sentences about Blake no longer print here, and
   * neither does their tag, <NARRATIVE_TENSIONS>: they are in the notes once, and the map places
   * what the story needs of Blake. Run 2e: the builder takes no argument for them.
   *
   * Phase 3 (3.9; T13, the integrator's ruling): the article places every photo the
   * director has not excluded, so the writer is given every kept photo
   * (options.photos, from articleWriterInputs): the hero image, then every other photo
   * the director kept but the whiteboard. A hero the director excluded comes as none.
   * PHOTOS prints each one's entry once (renderPhotoListEntry, the entry the article
   * judge lists too: the 4b fix batch).
   *
   * Phase 4 (brief 4.6; R5): the arc packages went; the writer reads the record whole.
   *
   * Phase 4b (brief 1E; R4): the map's beats carry their evidence in <STORY_MAP>, as its label
   * says, and the evidence-card line names the map's cards, each flagged piece's document beside
   * its beat (mapCardsLine).
   *
   * @returns {string}
   */
  _journalistArticleUserSections(settledWeave, map, shellAccounts, sessionFacts, directorNotes, options, recordSection) {
    const photos = Array.isArray(options.photos) ? options.photos.filter(photo => photo && photo.filename) : [];
    const photoSection = photos.length > 0
      ? `PHOTOS (every photo the director has not excluded, without the whiteboard${photos[0].hero ? ': the map\'s top photo first, marked [hero image], then the rest' : ''}; each gives the names identified in it and the director's description):

${photos.map((photo, i) => renderPhotoListEntry(photo, i, options.photoDescriptions)).join('\n\n')}`
      : 'PHOTOS: none';

    const guests = guestReportersOf(this.sessionConfig);
    const byline = [
      // K3: the theme's default when the session holds no stamp (writerFirstNameOf)
      `"author": "${writerFirstNameOf(this.themeName, this.sessionConfig.journalistFirstName)} Nova | NovaNews"`,
      '"title": "Senior Investigative Correspondent"',
      // Phase 17 (R5; the read's addendum f): each guest reporter's credit whole, "Name | Role" or
      // "Name" with no role, joined with " || "; none with no guest reporter
      ...(guests.length > 0
        ? [`"guestReporter": "${guests.map(guest => (guest.role ? `${guest.name} | ${guest.role}` : guest.name)).join(' || ')}"`]
        : [])
    ].join(', ');

    // R7: the map's top photo prints at the top of the article, and code stamps it as the hero.
    // Brief 4.7c: read through topPhotoOf on the map these inputs pass, as PHOTOS, the stamp
    // and the judge read it (ai-nodes.js articleWriterInputs).
    const topPhoto = topPhotoOf(map);
    const heroLine = topPhoto
      ? `3. "heroImage": {"filename": "${topPhoto}", "caption": "..."}: the map's top photo, printed at the top of the article.`
      : '3. The map has no top photo, so the bundle has no "heroImage".';

    return `${settledWeave}

<${STORY_MAP_TAG}>
${STORY_MAP_LABEL}
${SECTION_NAMES_LINE}
${sectionNamesLines(this.themeName).join('\n')}
${JSON.stringify(mapAsShown(map), null, 2)}
</${STORY_MAP_TAG}>

${ARTICLE_TASK}

<DATA_CONTEXT>
${photoSection}

${recordSection}
${this._buildFinancialSummary(shellAccounts)}
${this._buildInvestigationObservations(directorNotes, options.directorCorrections, options.evidenceBundle)}

</DATA_CONTEXT>
${this._sessionFactsSection(sessionFacts)}

<GENERATION_INSTRUCTION>
Write the article as a ContentBundle: JSON in the shape of the schema at the end of this instruction. Every object takes only the fields the schema lists for it, and every "type" only the values listed.

1. "sections": the article's sections, one for each section of the map, in the map's order. Each has:
   - "id": the slot of the map's section it writes, as the map gives it.
   - "type": one of "narrative", "evidence-highlight", "investigation-notes" or "conclusion".
   - "heading": the section's heading, as the task above gives it. A section whose heading is empty or cut takes no "heading" and prints untitled.
   - "content": an array of blocks, each one of these:
     * {"type": "paragraph", "text": "..."}
     * {"type": "quote", "text": "...", "attribution": "..."}: "attribution" is the speaker.
     * {"type": "evidence-card", "tokenId": "...", "headline": "...", "content": "...", "owner": "...", "significance": "critical" | "supporting" | "contextual"}: an inline card, printed whole in the body. "content" is copied from ${DOCUMENT_POINTER}, and "owner" is that document's owner as the record gives it. ${mapCardsLine(map, options.evidenceBundle)}
     * {"type": "photo", "filename": "...", "caption": "..."}: an inline photo, by its exact filename.
2. "evidenceCards": the sidebar's entries. Each names a document by its id in "tokenId", with a "headline", a one-line "summary" under 100 characters, and its "significance".
${heroLine}
4. "headline": {"main": "...", "deck": "..."}: the headline and the deck as the task above gives them.
5. "byline": {${byline}}.
6. "metadata": {"sessionId": "...", "theme": "journalist", "generatedAt": "<an ISO 8601 timestamp>"}. The server stamps these values.

These are the fields the article prints, and the money tracker prints itself from the ledger.

<SCHEMA>
The ContentBundle's shape: field names, types, enum values and required fields.

\`\`\`json
${JSON.stringify(options.schema || WRITER_BUNDLE_SCHEMA, null, 2)}
\`\`\`
</SCHEMA>
</GENERATION_INSTRUCTION>

${loadRuleSet('article', { theme: this.themeName }).craft}`;
  }

  /**
   * Fail loud when a writer's rules did not load.
   *
   * A reworker built without a rule file its writer read would run without those rules,
   * and nothing in the output would show it. Phase 2 (2.3): each reworker is its writer's
   * prompt plus a revision block, so the reworkers check their writer's phase (ai-nodes.js
   * buildOutlineRevisionPrompt, buildArticleRevisionPrompt).
   *
   * Phase 3 (3.2): the writers read the rule set, so the check is the rule-set loader's
   * own, which throws naming every missing or empty rule file. Phase 4 (brief 4.7c; R1):
   * the parked detective's branch, which checked its craft files through the theme loader,
   * went with the old stages its writers wrote. Brief 4.13 (R14): the check reads the
   * rules folder of the builder's theme, so the parked detective, which names none, fails
   * it, named.
   *
   * @param {'outlineGeneration'|'articleGeneration'} phase - the writer's phase
   * @throws {Error} on a phase no writer reads; for a theme with no rules folder, naming it;
   *   or naming each missing or empty rule file
   */
  async requirePhasePrompts(phase) {
    const call = WRITER_RULE_SET_CALLS[phase];
    if (!call) {
      throw new Error(`[PromptBuilder] No writer reads phase "${phase}"; phases: ${Object.keys(WRITER_RULE_SET_CALLS).join(', ')}`);
    }
    loadRuleSet(call, { theme: this.themeName });
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
  // Brief 4.7b: the tag the article writer prints the story map in
  STORY_MAP_TAG,
  // Phase 18, run 2b (R23): the article writer's one shape, from the full schema by one list:
  // the schema printed and given to the SDK, the previous article a rework is shown, and the
  // carry of the fields the writer is not shown into a reworked article
  UNSHOWN_BUNDLE_FIELDS,
  // Run 2c (R34): the block types the writer's schema leaves out
  UNOFFERED_BLOCK_TYPES,
  writerBundleSchemaOf,
  WRITER_BUNDLE_SCHEMA,
  bundleAsShown,
  carryUnshownFields,
  // Run 2c (R31): one rule for a beat's kind in two forms: the strip, which the map's rework
  // prints its map through, and the story map as the article writer is shown it, built on it
  mapWithoutBeatKinds,
  mapAsShown,
  filterGateNotes,
  buildReportingModeBlock,
  // Brief 4.13b: the opening of every writer's and judge's system prompt, which the weave
  // writer (arc-specialist-nodes.js) and the judges (evaluator-nodes.js) call too, so the
  // placement has one home.
  systemPromptOpening
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

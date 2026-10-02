/**
 * Arc Specialist Nodes - Parallel specialist analysis for report generation
 *
 * Commit 8.8: Replaces sequential 4-node pattern with single orchestrated node.
 * Commit 8.9: Migrated to file-based specialist agents in .claude/agents/
 * Commit 8.10: SDK requires programmatic agent definitions via `agents` parameter.
 * Commit 8.11: Factory function with absolute paths to fix subagent workingDirectory.
 * Commit 8.12: PARALLEL SPECIALIST ARCHITECTURE
 *   - Replaced Task tool subagents with direct parallel SDK calls
 *   - Promise.all() for concurrent specialist execution (~1.5min vs ~4.5min)
 *   - Synthesis call with full context (orchestrator pattern preserved)
 *   - Programmatic validation node for strict evidence ID matching
 *   - No evidence truncation - all IDs passed to enable strict validation
 *
 * Architecture (Commit 8.12):
 * - 3 parallel specialist SDK calls (financial, behavioral, victimization)
 * - 1 synthesis SDK call to combine findings into arcs
 * - 1 programmatic validation node for evidence/roster validation
 * - Target: 3.5 minutes total (down from 10+)
 *
 * Benefits:
 * - ~3x faster execution via parallelization
 * - 100% evidence grounding via strict ID validation
 * - 100% roster coverage via name validation with fuzzy matching
 * - Better error isolation (one specialist failure doesn't block others)
 *
 * See ARCHITECTURE_DECISIONS.md 8.12 for design rationale.
 */

const { PHASES } = require('../state');
const { isSdkTimeoutError } = require('../../llm');
// The pure module, not lib/llm's index: several node tests mock lib/llm with a factory.
const { isRefusalError } = require('../../llm/refusal');
const {
  buildValidEvidenceIds,
  validateRosterName,
  getSdkClient,
  isKnownNPC,  // Commit 8.17: NPC validation (accepts NPCs from theme config)
  isNonRosterPC,  // Commit 8.xx: Non-roster PC validation (three-category model)
  getNonRosterPCs,  // Commit 8.xx: Get all non-roster PCs for a session
  buildRevisionContext: buildRevisionContextDRY  // DRY revision context helper (renamed to avoid local shadow)
} = require('./node-helpers');
const { getThemeNPCs, getCanonicalName } = require('../../theme-config');  // Commit 8.17+: Theme-configurable NPCs; getCanonicalName uses Notion-derived map
const { traceNode } = require('../../observability');

// Commit 8.13: Import centralized rules loader for evidence boundaries
// Commit 8.14: Use full reference content instead of summaries to avoid file reads
// Commit 8.xx: Removed unused loadReferenceRules, getEvidenceBoundariesSummary, getAntiPatternsSummary
// (used only by deleted parallel specialist architecture)

// Commit 8.28: Import split-call architecture
const {
  // Commit 8.28: Split-call architecture (preferred)
  CORE_ARC_SYSTEM_PROMPT,
  CORE_ARC_SCHEMA,
  INTERWEAVING_SYSTEM_PROMPT,
  INTERWEAVING_SCHEMA,
  // Commit 8.15: Player-focus-guided schema (used by reviseArcs)
  PLAYER_FOCUS_GUIDED_SCHEMA,
  // Phase 3 (3.3): the detective's prompts and schemas, parked with its theme (D13)
  DETECTIVE_CORE_ARC_SYSTEM_PROMPT,
  DETECTIVE_CORE_ARC_SCHEMA,
  DETECTIVE_INTERWEAVING_SYSTEM_PROMPT,
  DETECTIVE_INTERWEAVING_SCHEMA,
  DETECTIVE_PLAYER_FOCUS_GUIDED_SCHEMA
  // Commit 8.xx: Removed legacy parallel architecture imports
  // (SPECIALIST_AGENT_NAMES, getSpecialistAgents, ORCHESTRATOR_*, SYNTHESIS_*, SPECIALIST_*)
} = require('../../sdk-client/subagents');

const { renderDirectorEnrichmentBlock, directorTensionSentences } = require('../../prompt-renderers/director-notes-renderer');
const { renderRecordView, recordIdOf, isBuriedTransactionRow } = require('../../prompt-renderers/record-view');
const { withSessionClock } = require('../../prompt-renderers/session-clock');
const { DERIVED_LABELS } = require('../../prompt-renderers/derived-labels');
const { renderArcAccusation, renderWhiteboardConnections } = require('../../prompt-renderers/director-words-renderer');
const { isNoCulpritVerdict, blamesNoCharacter, directorAccusationText } = require('../../accusation-verdict');
const { withReportingModeBlock, buildDirectorGuidanceSection, filterGateNotes } = require('../../prompt-builder');
const { loadRuleSet } = require('../../rule-set');
const { WRITER_QUESTIONS_PROPERTY, writerQuestionsOf, carriedWriterQuestions, questionedRosterNames } = require('../../writer-questions');

/**
 * Whether a call keeps the detective's parked text (spec D13). The journalist reads
 * the rule set; the detective keeps today's prompts, rules and schemas until a
 * detective session is planned.
 *
 * @param {string} [theme]
 * @returns {boolean}
 */
function isParkedDetective(theme) {
  return theme === 'detective';
}

/**
 * The director's standing notes for the arc writer and the arc reworker (phase 2,
 * brief 2.2).
 *
 * The same section the outline and article prompts carry, built by the same two
 * functions (prompt-builder.js), with the gate `arc-selection`: the note this rework
 * is acting on is already its HUMAN FEEDBACK and is filtered out; every earlier note
 * stands. Before this, a second send back at the arc stop lost the first note.
 *
 * In practice only the reworker shows any: a rollback to arc selection or earlier
 * clears the notes, so the arc writer runs with none (wave-1 ruling R7).
 *
 * @param {Object} state
 * @returns {string} '\n\n<DIRECTOR_GUIDANCE>...' or '' when there are no notes
 */
function buildArcStandingNotes(state) {
  const notes = filterGateNotes(state.directorGateNotes || [], state._arcFeedback || null, 'arc-selection');
  const section = buildDirectorGuidanceSection(null, notes);
  return section ? `\n\n${section}` : '';
}

/**
 * The two arc system prompts, with the session's reporting-mode block.
 *
 * Brief 1.5: these are fixed constants, so the mode was never in them. The arc
 * writer for the last remote session put "I watched" into its summaries, and
 * those summaries are what the outline and then the article are built from. The
 * block goes where the article's goes: immediately after the identity line.
 *
 * Phase 3 (3.1): the block depends on the theme (the journalist's comes from the rule
 * set's mode files, the detective keeps its own), so each composer takes it, with
 * this file's default.
 *
 * Phase 3 (3.3): the journalist's prompt also carries the rule set's world and truth
 * rules (loadRuleSet's `core`), after the mode block, by the placement ruling: the
 * identity line, the mode block, <world>, <truth-rules>, then the prompt's own text.
 * The call's craft files go in its user prompt. The detective keeps today's prompt.
 *
 * @param {Object} [sessionConfig] - state.sessionConfig, carrying reportingMode
 * @param {string} [theme='journalist'] - state.theme
 * @returns {string}
 */
function coreArcSystemPrompt(sessionConfig, theme = 'journalist') {
  if (isParkedDetective(theme)) return withReportingModeBlock(DETECTIVE_CORE_ARC_SYSTEM_PROMPT, sessionConfig, theme);
  return withReportingModeBlock(withRuleSetCore(CORE_ARC_SYSTEM_PROMPT, 'arc'), sessionConfig, theme);
}

/** @see coreArcSystemPrompt */
function interweavingSystemPrompt(sessionConfig, theme = 'journalist') {
  if (isParkedDetective(theme)) return withReportingModeBlock(DETECTIVE_INTERWEAVING_SYSTEM_PROMPT, sessionConfig, theme);
  return withReportingModeBlock(withRuleSetCore(INTERWEAVING_SYSTEM_PROMPT, 'interweaving'), sessionConfig, theme);
}

/**
 * A system prompt with the rule set's core (the world, then the truth rules) right
 * after its identity line, where withReportingModeBlock then puts the mode block
 * before it.
 *
 * @param {string} systemPrompt - a prompt whose first line is its identity
 * @param {'arc'|'interweaving'} call - the rule set's call
 * @returns {string}
 */
function withRuleSetCore(systemPrompt, call) {
  const identityLine = systemPrompt.split('\n', 1)[0];
  const rest = systemPrompt.slice(identityLine.length).replace(/^\n+/, '');
  return `${identityLine}\n\n${loadRuleSet(call).core}\n\n${rest}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// DRY HELPERS (Commit 8.28)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract player focus context from state (DRY helper)
 *
 * Commit 8.28: Shared extraction used by both core arc and revision prompts
 *
 * @param {Object} state - Current workflow state
 * @returns {Object} Player focus context with accusation, whiteboard, directorProse, directorQuotes, directorTransactionLinks, directorPostInvestigation, roster, primaryInvestigation
 */
function extractPlayerFocusContext(state) {
  const playerFocus = state.playerFocus || {};
  const directorNotes = state.directorNotes || {};
  const sessionConfig = state.sessionConfig || {};

  return {
    accusation: playerFocus.accusation || {},
    whiteboard: playerFocus.whiteboardContext || {},
    // Enriched director-notes shape (2026-04): rawProse primary, quotes + tx refs + post-investigation news as structured extras
    directorProse: directorNotes.rawProse || '',
    directorQuotes: directorNotes.quotes || [],
    directorTransactionLinks: directorNotes.transactionReferences || [],
    directorPostInvestigation: directorNotes.postInvestigationDevelopments || [],
    roster: sessionConfig.roster || [],
    primaryInvestigation: playerFocus.primaryInvestigation || 'General investigation'
  };
}

/**
 * Build output format section for prompts (DRY helper)
 *
 * Commit 8.28: Placed at TOP of prompts for recency bias
 * This ensures the model remembers the wrapper structure
 *
 * @param {string} schemaDescription - Human-readable description of expected output structure
 * @returns {string} Formatted output section
 */
function buildOutputFormatSection(schemaDescription) {
  return `## OUTPUT FORMAT (CRITICAL - Follow exactly)

Return valid JSON matching this structure:
${schemaDescription}

CRITICAL: Your response MUST be a valid JSON object with the wrapper structure shown above.
Do NOT return a raw array - always use the object wrapper with "narrativeArcs" key.`;
}

/**
 * Create default interweaving for graceful degradation
 *
 * Commit 8.28: Fallback when Call 2 (interweaving enrichment) fails
 *
 * @returns {Object} Empty interweaving structure
 */
function createDefaultInterweaving() {
  return {
    sharedCharacters: [],
    bridgeOpportunities: [],
    callbackSeeds: [],
    convergenceRole: ''
  };
}

/**
 * Create default interweaving plan for graceful degradation
 *
 * @returns {Object} Empty interweaving plan
 */
function createDefaultInterweavingPlan() {
  return {
    suggestedOrder: [],
    convergencePoint: '',
    keyCallbacks: []
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SPLIT-CALL PROMPT BUILDERS (Commit 8.28)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build the three-category character block (ROSTER PCs / NPCs / NON-ROSTER PCs).
 *
 * Shared by the arc GENERATION and arc REVISION prompts. The revision prompt used
 * to omit it entirely while asking the model to fix roster-coverage failures — the
 * single most common structural failure — so the reviser could not tell a missing
 * roster PC from a legitimately-absent NPC or non-roster PC, and "fixes" invented
 * placements for characters who were never in the session.
 *
 * Phase 3 (3.7; C7, C15): the journalist's ROSTER PCs line counts a player covered by
 * a placement the record shows or by a question of kind "player" to the director
 * about them, as the arc check does (fix 3.7b). The detective keeps "MUST have
 * placements" (D13).
 *
 * @param {string[]} roster - session roster (first names)
 * @param {string} theme - 'journalist' | 'detective'
 * @param {string[]} allCharacters - every known game character (Notion-derived)
 * @returns {string}
 */
function buildCharacterCategoriesBlock(roster = [], theme = 'journalist', allCharacters = []) {
  const themeNPCs = getThemeNPCs(theme);
  const nonRosterPCs = getNonRosterPCs(roster, allCharacters, themeNPCs);

  return `### Character Categories for characterPlacements

**ROSTER PCs** (${theme === 'journalist' ? 'each has a placement the record shows, or a writerQuestions entry of kind "player" about them - they were in the room; how Nova learned of them is set by the reporting mode' : 'MUST have placements - present at the investigation'}):
${JSON.stringify(roster)}

**NPCs** (valid in placements, don't count for coverage):
${themeNPCs.join(', ')}

**NON-ROSTER PCs** (can mention from evidence only):
${nonRosterPCs.length > 0 ? nonRosterPCs.join(', ') : '(none this session)'}
${nonRosterPCs.length > 0 ? `- These are valid game characters not playing this session
- CAN be mentioned if they appear in evidence
- Roles must be evidence-based: "Mentioned in X's memory"
- Add caveats when using: "Based on memory evidence only"` : ''}
`;
}

/**
 * Build prompt for core arc generation (Call 1)
 *
 * Commit 8.28: OUTPUT FORMAT at TOP for recency bias
 * Excludes interweaving rules to reduce complexity
 *
 * Phase 2 (2.3): the writer's sections (buildCoreArcSections), then its revision
 * hook and its standing notes. The arc reworker is built from the same sections, so
 * whatever this writer is given reaches its reworker without a second copy.
 *
 * @param {Object} state - Current workflow state
 * @returns {string} Prompt for core arc generation
 */
function buildCoreArcPrompt(state) {
  // Phase 3 (3.3): the journalist writer carries no revision hook of its own. Its
  // text ("Do not just regenerate - IMPROVE") was fixed rework text (TH7), and every
  // rework goes through reviseArcs, whose revision context is buildRevisionContext's.
  const hook = isParkedDetective(state.theme) ? buildArcRevisionContext(state) : '';
  return `${buildCoreArcSections(state)}${hook}${buildArcStandingNotes(state)}`;
}

/**
 * The arc writer's user prompt up to, not including, its revision hook and its
 * <DIRECTOR_GUIDANCE>. Shared with the arc reworker (2.3), so the reworker carries
 * whatever the writer is given, the rule set's craft files included (M23).
 *
 * @param {Object} state - Current workflow state
 * @returns {string}
 */
function buildCoreArcSections(state) {
  return isParkedDetective(state.theme)
    ? buildDetectiveCoreArcSections(state)
    : buildJournalistCoreArcSections(state);
}

/**
 * The journalist arc writer's label for the director's notes (phase 3, brief 3.3):
 * T1's record for the room, and the one mapping T1 does not state, that backstory in
 * the notes is Nova's reading. The writer prints it as its notes heading; the arc
 * judge (evaluator-nodes.js) imports it, so both name the notes in one text.
 */
const ARC_NOTES_LABEL = `The Director's Notes (the record for the room, under T1)
Backstory in the notes, what the director knows about the characters beyond what the session showed, is Nova's reading under T1.`;

/**
 * The journalist arc writer's OUTPUT FORMAT line for `writerQuestions` (fix 3.7b,
 * finding 2): the list is optional and stays empty unless the record leaves
 * something only the director can settle (C15), then one entry's shape in
 * placeholders. `kind` lists the schema's values and `about` is shown in the schema's
 * own wording (WRITER_QUESTIONS_PROPERTY), so the format and the schema say one thing.
 *
 * @returns {string}
 */
function writerQuestionsFormatLine() {
  const { kind, about } = WRITER_QUESTIONS_PROPERTY.items.properties;
  return `"writerQuestions" stays [] unless the record leaves something only the director can settle (C15). Each entry:
{ "kind": ${kind.enum.map((value) => JSON.stringify(value)).join(' | ')}, "about": ${JSON.stringify(about.description)}, "question": "The question for the director" }`;
}

/**
 * The journalist arc writer's sections (phase 3, brief 3.3): the output format; what
 * the room concluded (the accusation, the whiteboard, the director's notes and
 * corrections and their sentences about Blake and the Valet, the investigation
 * focus, the roster, the character categories and context); the generation rules;
 * the record with its morning timeline and the valid ids; the stages in a summary;
 * the three lenses in analysisNotes; and the rule set's craft files, last, by the
 * placement ruling.
 *
 * Phase 3 (3.7): the output format carries `writerQuestions`, the questions C15 has
 * the writer raise to the director, and the roster lines count a player covered by a
 * placement the record shows or by a question of kind "player" about them (C7; fix
 * 3.7b).
 *
 * The truth rules (in the system prompt) state what the old SECTION 4 and 4.5 said
 * about evidence and time, and contradicted parts of them: they named each memory's
 * exposer, read an account's name for involvement, dated the party "the murder night"
 * and called the notes "GROUND TRUTH". Those sections are gone, and the sales come
 * from the record view's timeline instead of the writer's own buried list.
 *
 * @param {Object} state - Current workflow state
 * @returns {string}
 */
function buildJournalistCoreArcSections(state) {
  const context = extractPlayerFocusContext(state);
  const evidenceSummary = extractEvidenceSummary(state.evidenceBundle || {});
  const allCharacters = Object.keys(state.canonicalCharacters || {});
  const { craft } = loadRuleSet('arc');
  const blakeSentences = directorTensionSentences(state.narrativeTensions, context.directorProse);

  // Output format at TOP for recency bias. Brief 1.2: the summary is the claim
  // itself, in the third person, with no presence claim.
  const outputFormat = buildOutputFormatSection(`{
  "narrativeArcs": [
    {
      "id": "arc-[descriptive-slug]",
      "title": "Compelling arc title",
      "summary": "1 to 3 plain sentences stating what this thread claims happened. Third person, no reporter persona, no presence claims.",
      "arcSource": "accusation" | "whiteboard" | "observation" | "discovered",
      "keyEvidence": ["exact-id-1", "exact-id-2"],
      "characterPlacements": { "RosterName": "Role in this arc" },
      "evidenceStrength": "strong" | "moderate" | "weak" | "speculative",
      "caveats": ["What complicates this arc"],
      "unansweredQuestions": ["What gaps exist"],
      "emotionalHook": "What makes this compelling",
      "playerEmphasis": "high" | "medium" | "low",
      "storyRelevance": "critical" | "supporting" | "contextual",
      "analysisNotes": {
        "financial": "What the money lens shows for this arc",
        "behavioral": "What the behaviour lens shows for this arc",
        "victimization": "What the victimization lens shows for this arc"
      }
    }
  ],
  "synthesisNotes": "How you addressed player conclusions and what patterns emerged",
  "writerQuestions": []
}

${writerQuestionsFormatLine()}`);

  const characterContext = state.characterData?.characters && Object.keys(state.characterData.characters).length > 0 ? `
### Character Context (${DERIVED_LABELS.characterContext})
${Object.entries(state.characterData.characters).map(([name, data]) => {
  const parts = [];
  if (data.groups?.length) parts.push(`Member of: ${data.groups.join(', ')}`);
  if (data.role) parts.push(`Role: ${data.role}`);
  if (data.relationships) {
    const rels = Object.entries(data.relationships).slice(0, 4).map(([k, v]) => `${k} (${v})`).join(', ');
    if (rels) parts.push(`Relationships: ${rels}`);
  }
  return parts.length > 0 ? `- ${name}: ${parts.join(' | ')}` : null;
}).filter(Boolean).join('\n')}

IMPORTANT: Take group memberships from the paper documents in <RECORD>, not from memory content. Where this list differs from those documents, the documents decide.
` : '';

  // The director's sentences about Blake and the Valet, the one tension the code
  // gathers since 3.6 (directorTensionSentences drops the retired types).
  const blakeSection = blakeSentences.length > 0 ? `
### Blake and the Valet in the director's notes
${DERIVED_LABELS.narrativeTensions}

${blakeSentences.map(sentence => `- ${sentence}`).join('\n')}
` : '';

  return `# Core Arc Generation

${outputFormat}

---

## SECTION 1: WHAT PLAYERS CONCLUDED (PRIMARY - Your arcs must address this)

### The Accusation (REQUIRED ARC)
${renderArcAccusation(context.accusation, directorAccusationText(state), "Players' Reasoning")}

You MUST generate an arc that addresses this accusation. Even if evidence is weak, include this arc and mark it appropriately with evidenceStrength="speculative" if needed.

${renderWhiteboardConnections(context.whiteboard)}

### ${ARC_NOTES_LABEL}

${renderDirectorEnrichmentBlock({
  rawProse: context.directorProse,
  quotes: context.directorQuotes,
  transactionReferences: context.directorTransactionLinks,
  postInvestigationDevelopments: context.directorPostInvestigation,
  corrections: state.inputReviewCorrections || [],
  sessionConfig: withSessionClock(state.sessionConfig, state.evidenceBundle)
})}
${blakeSection}
### Primary Investigation Focus
${context.primaryInvestigation}

### Session Roster (the players at the investigation)
${JSON.stringify(context.roster)}

${buildCharacterCategoriesBlock(context.roster, 'journalist', allCharacters).trimEnd()}
${characterContext}
---

## SECTION 2: ARC GENERATION RULES

Generate 3-5 narrative arcs following this priority:

### Priority 1: ACCUSATION ARC (Required)
- Must directly address the accusation above
- arcSource: "accusation"
- Include even if evidenceStrength is "speculative"
- If evidence is thin, use caveats to acknowledge uncertainty

### Priority 2: WHITEBOARD/OBSERVATION ARCS (1-3 arcs)
- Generated from significant whiteboard connections or director observations
- arcSource: "whiteboard" or "observation"
- Should have at least "weak" evidenceStrength

### Priority 3: DISCOVERED ARC (Optional, max 1)
- A pattern in the record that the room did not take up, framed as just that
- arcSource: "discovered"
- Must have evidenceStrength "strong" or "moderate"

---

## SECTION 3: THE RECORD

The ${evidenceSummary.exposedTokens.length} exposed memories and ${evidenceSummary.exposedPaper.length} paper documents in full, then the morning timeline: every sale, exposure, bonus and transfer, in time order on the morning clock.
${renderRecordView(state.evidenceBundle, { sessionConfig: state.sessionConfig })}

### All Valid Evidence IDs for keyEvidence (EXPOSED LAYER 1 ONLY)
${JSON.stringify(evidenceSummary.allEvidenceIds)}

CRITICAL: keyEvidence arrays MUST contain IDs from this list ONLY.

---

## SECTION 4: STAGES IN AN ARC SUMMARY

Each arc summary says which stage each of its events belongs to (T7): the party, as what a memory shows; the investigation, in the third person, as the reporting mode allows; Nova's day, only as the epilogue gives it.

---

## SECTION 5: THE THREE LENSES IN analysisNotes

Write each arc's three lenses, as <craft-arcs> sets them out, into analysisNotes, one field per lens. Where the record holds nothing for a lens, write that it holds nothing.
- financial: the money lens, read from the morning timeline
- behavioral: the behaviour lens
- victimization: the victimization lens

---

## SECTION 6: CRAFT GUIDANCE

${craft}
`;
}

/**
 * The detective arc writer's sections: today's text, parked with its theme (spec D13).
 * Phase 3 rewrote the journalist's (buildJournalistCoreArcSections).
 *
 * @param {Object} state - Current workflow state
 * @returns {string}
 */
function buildDetectiveCoreArcSections(state) {
  const context = extractPlayerFocusContext(state);
  const evidenceSummary = extractEvidenceSummary(state.evidenceBundle || {});

  // Character list derived from Notion (state.canonicalCharacters) instead of hardcoded
  // config. The three-category block itself is built by buildCharacterCategoriesBlock,
  // shared with the REVISION prompt.
  const theme = state.theme || 'journalist';
  const allCharacters = Object.keys(state.canonicalCharacters || {});

  // Output format at TOP for recency bias
  //
  // Brief 1.2: the summary is what the director reads on the arc card and what
  // the outline is then built from, and "2-3 sentences describing this narrative
  // thread" came back as the reporter telling the story, presence claims
  // included. What the stop needs is the claim itself.
  const outputFormat = buildOutputFormatSection(`{
  "narrativeArcs": [
    {
      "id": "arc-[descriptive-slug]",
      "title": "Compelling arc title",
      "summary": "1 to 3 plain sentences stating what this thread claims happened. Third person, no reporter persona, no presence claims.",
      "arcSource": "accusation" | "whiteboard" | "observation" | "discovered",
      "keyEvidence": ["exact-id-1", "exact-id-2"],
      "characterPlacements": { "RosterName": "Role in this arc" },
      "evidenceStrength": "strong" | "moderate" | "weak" | "speculative",
      "caveats": ["What complicates this arc"],
      "unansweredQuestions": ["What gaps exist"],
      "emotionalHook": "What makes this compelling",
      "playerEmphasis": "high" | "medium" | "low",
      "storyRelevance": "critical" | "supporting" | "contextual",
      "analysisNotes": {
        "financial": "Relevant transaction patterns",
        "behavioral": "Relevant director observations",
        "victimization": "Relevant targeting patterns"
      }
    }
  ],
  "synthesisNotes": "How you addressed player conclusions and what patterns emerged"
}`);

  return `# Core Arc Generation

${outputFormat}

---

## SECTION 1: WHAT PLAYERS CONCLUDED (PRIMARY - Your arcs must address this)

### The Accusation (REQUIRED ARC)
${renderArcAccusation(context.accusation, directorAccusationText(state), "Players' Reasoning")}

You MUST generate an arc that addresses this accusation. Even if evidence is weak, include this arc and mark it appropriately with evidenceStrength="speculative" if needed.

${renderWhiteboardConnections(context.whiteboard)}

### Director Observations (GROUND TRUTH - Director witnessed these behaviors)
The director's prose below is the AUTHORITATIVE source. Use it to ground arcs in behavioral reality.

${renderDirectorEnrichmentBlock({
  rawProse: context.directorProse,
  quotes: context.directorQuotes,
  transactionReferences: context.directorTransactionLinks,
  postInvestigationDevelopments: context.directorPostInvestigation,
  corrections: state.inputReviewCorrections || [],
  sessionConfig: withSessionClock(state.sessionConfig, state.evidenceBundle)
})}

### Primary Investigation Focus
${context.primaryInvestigation}

### Session Roster (ALL characters who need placement)
${JSON.stringify(context.roster)}

${buildCharacterCategoriesBlock(context.roster, theme, allCharacters)}

${state.characterData?.characters && Object.keys(state.characterData.characters).length > 0 ? `
### Character Context (${DERIVED_LABELS.characterContext})
${Object.entries(state.characterData.characters).map(([name, data]) => {
  const parts = [];
  if (data.groups?.length) parts.push(`Member of: ${data.groups.join(', ')}`);
  if (data.role) parts.push(`Role: ${data.role}`);
  if (data.relationships) {
    const rels = Object.entries(data.relationships).slice(0, 4).map(([k, v]) => `${k} (${v})`).join(', ');
    if (rels) parts.push(`Relationships: ${rels}`);
  }
  return parts.length > 0 ? `- ${name}: ${parts.join(' | ')}` : null;
}).filter(Boolean).join('\n')}

IMPORTANT: Take group memberships from the paper documents in <RECORD>, not from memory content. Where this list differs from those documents, the documents decide.
` : ''}

---

## SECTION 2: ARC GENERATION RULES

Generate 3-5 narrative arcs following this priority:

### Priority 1: ACCUSATION ARC (Required)
- Must directly address the accusation above
- arcSource: "accusation"
- Include even if evidenceStrength is "speculative"
- If evidence is thin, use caveats to acknowledge uncertainty

### Priority 2: WHITEBOARD/OBSERVATION ARCS (1-3 arcs)
- Generated from significant whiteboard connections or director observations
- arcSource: "whiteboard" or "observation"
- Should have at least "weak" evidenceStrength

### Priority 3: DISCOVERED ARC (Optional, max 1)
- Only if evidence strongly supports something players completely missed
- arcSource: "discovered"
- Must have evidenceStrength "strong" or "moderate"

---

## SECTION 3: EVIDENCE BUNDLE

### Exposed Documents (${evidenceSummary.exposedTokens.length} memories - Layer 1, PARTY MEMORIES; ${evidenceSummary.exposedPaper.length} paper documents - Layer 1, PARTY CONTEXT)
The memories describe events from THE PARTY NIGHT. Content is party-era; exposure is investigation-era.
${renderRecordView(state.evidenceBundle, { buried: false })}

### Buried Transactions (${evidenceSummary.buriedTransactions.length} items - Layer 2, INVESTIGATION ACTIONS)
These transactions occurred DURING THE INVESTIGATION when players chose to bury memories.
Token identity is intentionally hidden - Nova CANNOT know whose memories were buried.
${JSON.stringify(evidenceSummary.buriedTransactions, null, 2)}

### All Valid Evidence IDs for keyEvidence (EXPOSED LAYER 1 ONLY)
${JSON.stringify(evidenceSummary.allEvidenceIds)}

CRITICAL: keyEvidence arrays MUST contain IDs from this list ONLY.

---

## SECTION 4: EVIDENCE BOUNDARIES (rules for the data above)

### Layer 1 - EXPOSED (Full Reportability)
- CAN quote full memory contents, describe what memory reveals
- CAN draw conclusions from content, name who exposed each memory

### Layer 2 - BURIED (Observable Only)
- CAN report: shell account names, dollar amounts, timing patterns
- CANNOT report: whose memories went to which accounts, content of buried memories

### Layer 3 - DIRECTOR NOTES (Priority Hierarchy)
1. ACCUSATION = PRIMARY (what players concluded)
2. DIRECTOR OBSERVATIONS = GROUND TRUTH
3. WHITEBOARD = SUPPORTING CONTEXT

### Anti-Patterns
- Never use "token" (say "memory")
- Never use em-dashes
- Never claim to know buried content

---

## SECTION 4.5: TEMPORAL AWARENESS (CRITICAL)

THE PARTY and THE INVESTIGATION are TWO DIFFERENT TIMELINES. Your arc summaries must respect this distinction.

| Timeline | Source | What It Describes | Nova's Access | Language Markers |
|----------|--------|-------------------|---------------|-----------------|
| **THE PARTY** (past) | Memory token content, paper evidence | Events from the murder night | Nova VIEWS recordings. She was NOT there. | "The memory shows," "In the recording" |
| **THE INVESTIGATION** (present) | Director observations, burial transactions, player behavior | The game session where characters piece together what happened | Set by the reporting mode in your system prompt: on site, Nova witnessed it; remote, it reached her as tips from people who were there. | "During the investigation," "was seen," "the room heard" — third person, never a first-person presence claim |

**Rules for arc summaries:**
- Memory CONTENT → party-night events (past tense, framed as recordings)
- Who EXPOSED or BURIED a memory → investigation events (present; name who did it, in the third person)
- Director observations → investigation events (behavioral ground truth from the director; third person, no presence claim)
- Paper evidence → party context (documents from before the investigation)

**WRONG:** "During the party, Sarah exposed three memories about the lab."
(Sarah exposed memories during the INVESTIGATION, not the party.)

**RIGHT:** "Sarah exposed three memories during the investigation, all depicting lab events from the night of the party."

---
${state.narrativeTensions?.tensions?.length > 0 ? `
## SECTION 4.6: NARRATIVE TENSIONS (programmatic cross-references)

These possible contradictions were identified by comparing public behavior with Black Market activity.
The ones the record supports are strong narrative opportunities. ${DERIVED_LABELS.narrativeTensions}

${state.narrativeTensions.tensions.map(t => `- [${t.type}] ${t.narrativeNote}`).join('\n')}

---
` : ''}
## SECTION 5: THREE-LENS ANALYSIS REQUIREMENT

For each arc, analyze through all three lenses and document in analysisNotes:

### Financial Lens
- Transaction patterns that support this arc
- Account naming that suggests involvement

### Behavioral Lens
- Director observations that support this arc
- Character dynamics relevant to this arc

### Victimization Lens
- Targeting patterns that support this arc
- Victim/operator relationships
`;
}

/**
 * Build prompt for interweaving enrichment (Call 2)
 *
 * Commit 8.28: Compact prompt with arcs + roster.
 * Brief 2.1: plus the whole record view (documents and buried transactions). The
 * callbacks and bridges this call plans are details from the documents, and it used
 * to see only the arc summaries. It has no other listing of either part, so the
 * whole view appears here once (R2).
 *
 * @param {Array} coreArcs - Generated arcs from Call 1 (required, non-empty)
 * @param {Array} roster - Character roster (defaults to empty array if invalid)
 * @param {Object|null} [evidenceBundle] - the curated bundle the record view renders
 * @param {Object|null} [sessionConfig] - the session's parse, for the record view's
 *   morning timeline (its exposures, adjustments and clock; phase 3, brief 3.5)
 * @param {string} [theme='journalist'] - the session's theme: the journalist's prompt
 *   ends with the rule set's craft files (phase 3, brief 3.3); the detective keeps
 *   today's text (D13)
 * @returns {string} Prompt for interweaving enrichment
 * @throws {Error} If coreArcs is not a non-empty array
 */
function buildInterweavingPrompt(coreArcs, roster, evidenceBundle = null, sessionConfig = null, theme = 'journalist') {
  // M2: Input validation
  if (!Array.isArray(coreArcs) || coreArcs.length === 0) {
    throw new Error('buildInterweavingPrompt: coreArcs must be a non-empty array');
  }
  if (!Array.isArray(roster)) {
    console.warn('[buildInterweavingPrompt] roster is not an array, using empty array');
    roster = [];
  }

  // Compact arc representation - only fields needed for interweaving
  const compactArcs = coreArcs.map(arc => ({
    id: arc.id,
    title: arc.title,
    summary: arc.summary,
    arcSource: arc.arcSource,
    characterPlacements: arc.characterPlacements
  }));

  if (!isParkedDetective(theme)) return journalistInterweavingPrompt(compactArcs, roster, evidenceBundle, sessionConfig);

  return `# Interweaving Enrichment

Analyze the following narrative arcs and identify how they can interweave for compulsive readability.

## GENERATED ARCS

${JSON.stringify(compactArcs, null, 2)}

## ROSTER (for identifying shared characters)

${JSON.stringify(roster)}

## THE RECORD (the documents the arcs rest on)

${renderRecordView(evidenceBundle, { sessionConfig })}

## YOUR TASK

For each arc, provide:

1. **sharedCharacters** - Which characters in this arc also appear in OTHER arcs?
   These are natural bridge points for transitions.

2. **bridgeOpportunities** - How can this arc connect to others?
   - shared_character: Same person appears in different context
   - causal_chain: This arc explains WHY another happened
   - temporal: Events overlap in time
   - contradiction: This arc recontextualizes another

3. **callbackSeeds** - What details in this arc could pay off later?
   Example: "Vic's confident smile" planted early, pays off when we learn she knew all along.

4. **convergenceRole** - How does this arc contribute to the central event (murder/accusation)?

Also provide an **interweavingPlan** with:
- suggestedOrder: Optimal arc sequence for maximum payoff
- convergencePoint: Where all threads meet
- keyCallbacks: Specific [plant → payoff] opportunities

## OUTPUT FORMAT

{
  "arcInterweaving": [
    {
      "arcId": "arc-id-from-above",
      "interweaving": {
        "sharedCharacters": ["Character1", "Character2"],
        "bridgeOpportunities": [
          { "toArc": "other-arc-id", "bridgeType": "shared_character", "bridgeDetail": "..." }
        ],
        "callbackSeeds": ["Detail that can pay off later"],
        "convergenceRole": "How this arc connects to the murder/accusation"
      }
    }
  ],
  "interweavingPlan": {
    "suggestedOrder": ["arc-id-1", "arc-id-2", ...],
    "convergencePoint": "The murder revelation / accusation climax",
    "keyCallbacks": [
      { "plantIn": "arc-id-1", "payoffIn": "arc-id-3", "detail": "Specific callback opportunity" }
    ]
  }
}`;
}

/**
 * The journalist's interweaving prompt (phase 3, brief 3.3): the arcs, the roster, the
 * whole record view, the task and the output format, then the rule set's craft files
 * for this call, last, by the placement ruling. The bridge types are the system
 * prompt's principles; the convergence and the order are C16's, in <craft-arcs>. The
 * task names the fields that hold each and restates none of them (spec section 8:
 * each rule appears once).
 *
 * @param {Array} compactArcs - the arcs, as buildInterweavingPrompt cuts them
 * @param {Array} roster
 * @param {Object|null} evidenceBundle
 * @param {Object|null} sessionConfig
 * @returns {string}
 */
function journalistInterweavingPrompt(compactArcs, roster, evidenceBundle, sessionConfig) {
  return `# Interweaving Enrichment

Analyze the following narrative arcs and identify how they can interweave for compulsive readability.

## GENERATED ARCS

${JSON.stringify(compactArcs, null, 2)}

## ROSTER (for identifying shared characters)

${JSON.stringify(roster)}

## THE RECORD (the documents the arcs rest on, and the morning timeline)

${renderRecordView(evidenceBundle, { sessionConfig })}

## YOUR TASK

For each arc, provide:

1. **sharedCharacters** - Which characters in this arc also appear in OTHER arcs?
   These are natural bridge points for transitions.

2. **bridgeOpportunities** - How can this arc connect to others? Each bridge has one of the four bridge types: shared_character, causal_chain, temporal or contradiction.

3. **callbackSeeds** - Which details in this arc, from the record, could come back changed later?

4. **convergenceRole** - What does this arc bring to the convergence?

Also provide an **interweavingPlan** with:
- suggestedOrder: the arc ids, in the order <craft-arcs> gives the arcs
- convergencePoint: this session's convergence point, as <craft-arcs> describes the convergence
- keyCallbacks: Specific [plant → payoff] opportunities

## OUTPUT FORMAT

{
  "arcInterweaving": [
    {
      "arcId": "arc-id-from-above",
      "interweaving": {
        "sharedCharacters": ["Character1", "Character2"],
        "bridgeOpportunities": [
          { "toArc": "other-arc-id", "bridgeType": "shared_character", "bridgeDetail": "..." }
        ],
        "callbackSeeds": ["A detail from the record that can come back changed later"],
        "convergenceRole": "What this arc brings to the convergence"
      }
    }
  ],
  "interweavingPlan": {
    "suggestedOrder": ["arc-id-1", "arc-id-2", ...],
    "convergencePoint": "Where this session's threads converge",
    "keyCallbacks": [
      { "plantIn": "arc-id-1", "payoffIn": "arc-id-3", "detail": "Specific callback opportunity" }
    ]
  }
}

## CRAFT GUIDANCE

${loadRuleSet('interweaving').craft}
`;
}

// ═══════════════════════════════════════════════════════════════════════════
// SPLIT-CALL SDK HELPERS (Commit 8.28)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate core arcs (Call 1 of split-call pattern)
 *
 * Commit 8.28: First SDK call with simplified schema
 *
 * @param {Object} state - Current workflow state
 * @param {Object} config - Graph config with SDK client
 * @returns {Promise<Object>} Core arcs result containing:
 *   - narrativeArcs: Array of arc objects (3-5 typically)
 *   - synthesisNotes: String describing synthesis approach
 * @throws {Error} If SDK call fails or result structure is invalid
 */
async function generateCoreArcs(state, config) {
  console.log('[generateCoreArcs] Starting Call 1: Core arc generation');
  const startTime = Date.now();

  const sdkClient = getSdkClient(config, 'generateCoreArcs');
  const prompt = buildCoreArcPrompt(state);

  console.log(`[generateCoreArcs] Prompt built: ${prompt.length} characters`);

  try {
    const result = await sdkClient({
      prompt,
      systemPrompt: coreArcSystemPrompt(state.sessionConfig, state.theme),
      model: 'opus',
      // Phase 3 (3.7): the detective's copy leaves out the writer's questions (D13).
      jsonSchema: isParkedDetective(state.theme) ? DETECTIVE_CORE_ARC_SCHEMA : CORE_ARC_SCHEMA,
      disableTools: true,  // Commit 8.xx: Pure structured output, no tool access needed
      label: 'Core arc generation (Call 1)'
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    // H2: Validate result structure before returning
    if (!result || !Array.isArray(result.narrativeArcs)) {
      console.error('[generateCoreArcs] Invalid result structure:', JSON.stringify(result, null, 2).slice(0, 500));
      throw new Error('Core arc generation returned invalid structure: narrativeArcs must be an array');
    }

    if (result.narrativeArcs.length === 0) {
      console.warn('[generateCoreArcs] Warning: No arcs generated - this may indicate prompt issues');
    }

    console.log(`[generateCoreArcs] Complete: ${result.narrativeArcs.length} arcs in ${duration}s`);

    return result;
  } catch (error) {
    console.error('[generateCoreArcs] Error:', error.message);
    throw error;  // Let caller handle error routing
  }
}

/**
 * Enrich arcs with interweaving metadata (Call 2 of split-call pattern)
 *
 * Commit 8.28: Second SDK call with compact prompt
 * Uses graceful degradation - returns null on failure instead of throwing.
 *
 * @param {Array} coreArcs - Generated arcs from Call 1 (must be non-empty)
 * @param {Array} roster - Character roster for identifying shared characters
 * @param {Object} config - Graph config with SDK client
 * @param {Object} [sessionConfig] - state.sessionConfig, for the reporting-mode block
 * @param {Object|null} [evidenceBundle] - state.evidenceBundle, for the record view (brief 2.1)
 * @returns {Promise<Object>} Interweaving result on success containing:
 *   - arcInterweaving: Array of { arcId, interweaving } objects
 *   - interweavingPlan: { suggestedOrder, convergencePoint, keyCallbacks }
 *   On failure (graceful degradation - the caller uses defaults): { _failed: true, _error }
 *   where _error is the thrown message, so a declined request stays named in state.
 */
async function enrichWithInterweaving(coreArcs, roster, config, sessionConfig, evidenceBundle = null) {
  console.log('[enrichWithInterweaving] Starting Call 2: Interweaving enrichment');
  const startTime = Date.now();

  const sdkClient = getSdkClient(config, 'enrichWithInterweaving');
  // No state here: the graph config carries the session's theme (createGraphAndConfig).
  const theme = config?.configurable?.theme;
  const prompt = buildInterweavingPrompt(coreArcs, roster, evidenceBundle, sessionConfig, theme);

  console.log(`[enrichWithInterweaving] Prompt built: ${prompt.length} characters`);

  try {
    const result = await sdkClient({
      prompt,
      systemPrompt: interweavingSystemPrompt(sessionConfig, theme),
      model: 'opus',
      disableTools: true,          // H21: pure analysis over the arcs in the prompt
      jsonSchema: isParkedDetective(theme) ? DETECTIVE_INTERWEAVING_SCHEMA : INTERWEAVING_SCHEMA,
      label: 'Interweaving enrichment (Call 2)'
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[enrichWithInterweaving] Complete: ${result?.arcInterweaving?.length || 0} arcs enriched in ${duration}s`);

    return result;
  } catch (error) {
    // Graceful degradation - log but don't throw. The message travels on so the arc
    // cache records WHY the defaults were used (a declined request names its category).
    console.error('[enrichWithInterweaving] Error (graceful degradation):', error.message);
    return { _failed: true, _error: error.message };
  }
}

/**
 * Merge core arcs with interweaving metadata
 *
 * Commit 8.28: Combines results from both calls
 * Handles graceful degradation when Call 2 fails
 *
 * @param {Object} coreResult - Result from generateCoreArcs containing:
 *   - narrativeArcs: Array of arc objects with id, title, summary, etc.
 *   - synthesisNotes: String describing synthesis approach
 * @param {Object|null} interweavingResult - Result from enrichWithInterweaving ({_failed, _error} or null on failure)
 * @returns {Object} Merged result with all arc fields including interweaving metadata,
 *   and the arc writer's `writerQuestions` (phase 3, 3.7; the interweaving call has none)
 * @throws {Error} If coreResult is invalid or narrativeArcs is not an array
 */
function mergeArcsWithInterweaving(coreResult, interweavingResult) {
  // H1: Defensive checks for coreResult
  if (!coreResult || typeof coreResult !== 'object') {
    console.error('[mergeArcsWithInterweaving] Invalid coreResult:', coreResult);
    throw new Error('mergeArcsWithInterweaving: coreResult is required');
  }

  const { narrativeArcs, synthesisNotes } = coreResult;
  // Phase 3 (3.7): the arc writer's questions for the director (C15) survive the merge.
  const writerQuestions = writerQuestionsOf(coreResult.writerQuestions);

  // H1: Validate narrativeArcs is an array before calling .map()
  if (!Array.isArray(narrativeArcs)) {
    console.error('[mergeArcsWithInterweaving] narrativeArcs is not an array:', narrativeArcs);
    throw new Error('mergeArcsWithInterweaving: narrativeArcs must be an array');
  }

  // If interweaving failed, use defaults
  if (!interweavingResult || interweavingResult._failed) {
    console.log('[mergeArcsWithInterweaving] Using default interweaving (Call 2 failed)');
    return {
      narrativeArcs: narrativeArcs.map(arc => ({
        ...arc,
        interweaving: createDefaultInterweaving()
      })),
      synthesisNotes,
      interweavingPlan: createDefaultInterweavingPlan(),
      writerQuestions,
      _interweavingFailed: true,
      _interweavingError: interweavingResult?._error || null
    };
  }

  // Build lookup map for interweaving by arc ID
  const interMap = new Map(
    (interweavingResult.arcInterweaving || []).map(item => [item.arcId, item.interweaving])
  );

  // M1: Detect and warn about arc ID mismatches
  const coreIds = new Set(narrativeArcs.map(arc => arc.id));
  const interIds = new Set(interMap.keys());
  const missingInter = [...coreIds].filter(id => !interIds.has(id));
  const orphanedInter = [...interIds].filter(id => !coreIds.has(id));

  if (missingInter.length > 0 || orphanedInter.length > 0) {
    console.warn('[mergeArcsWithInterweaving] Arc ID mismatch detected:',
      missingInter.length > 0 ? `Missing interweaving for: ${missingInter.join(', ')}` : '',
      orphanedInter.length > 0 ? `Orphaned interweaving for: ${orphanedInter.join(', ')}` : ''
    );
  }

  // Merge interweaving into arcs
  const mergedArcs = narrativeArcs.map(arc => ({
    ...arc,
    interweaving: interMap.get(arc.id) || createDefaultInterweaving()
  }));

  return {
    narrativeArcs: mergedArcs,
    synthesisNotes,
    interweavingPlan: interweavingResult.interweavingPlan || createDefaultInterweavingPlan(),
    writerQuestions
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build arc-specific revision context from evaluator feedback
 *
 * H3: Renamed from buildRevisionContext to avoid confusion with the DRY
 * buildRevisionContext imported from node-helpers.js (aliased as buildRevisionContextDRY).
 * This local version takes state directly and is used for embedding revision
 * guidance in arc-related prompts.
 *
 * @param {Object} state - State with validationResults and arcRevisionCount
 * @returns {string} Revision guidance section or empty string for first attempt
 */
function buildArcRevisionContext(state) {
  const revisionCount = state.arcRevisionCount || 0;
  const validationResults = state.validationResults;

  if (revisionCount === 0 || !validationResults) {
    return '';  // First attempt, no feedback yet
  }

  const issues = validationResults.issues || [];
  const feedback = validationResults.feedback || '';
  const criteriaScores = validationResults.criteriaScores || {};

  const issuesText = issues.length > 0
    ? issues.map((issue, i) => `  ${i + 1}. ${issue}`).join('\n')
    : '  None specified';

  const scoresText = Object.entries(criteriaScores)
    .map(([key, val]) => `  - ${key}: ${val.score} (${val.notes || 'no notes'})`)
    .join('\n');

  return `

═══════════════════════════════════════════════════════════════════════════
REVISION ${revisionCount}: Address these issues from the previous attempt
═══════════════════════════════════════════════════════════════════════════

EVALUATOR FEEDBACK:
${feedback || 'No specific feedback provided'}

ISSUES TO FIX:
${issuesText}

CRITERIA SCORES:
${scoresText || '  Not available'}

Focus on addressing the specific issues above. Do not just regenerate - IMPROVE.`;
}

/**
 * Analyze arcs with player-focus-guided comprehensive call
 *
 * Commit 8.15: NEW ARCHITECTURE - Single call with player focus FIRST
 *
 * Replaces parallel specialists + synthesis with:
 * - Single SDK call with comprehensive prompt (~20K tokens)
 * - Player conclusions drive arc generation (not evidence patterns)
 * - 5-minute timeout
 * - New arc fields: arcSource, evidenceStrength, caveats, unansweredQuestions
 *
 * Performance: ~4-5 minutes (down from ~7 minutes)
 * - Single call vs 4 calls (3 specialists + synthesis)
 * - No redundant context transmission
 *
 * Skip logic: If narrativeArcs already exist with content, skip processing.
 *
 * @param {Object} state - Current state with evidence, player focus, etc.
 * @param {Object} config - Graph config with SDK client
 * @returns {Object} Partial state update with narrativeArcs
 */
async function analyzeArcsPlayerFocusGuided(state, config) {
  console.log('[analyzeArcsPlayerFocusGuided] Starting split-call analysis (Commit 8.28)');
  const startTime = Date.now();

  // Debug: Log key input data to verify prompt assembly
  const pf = state.playerFocus || {};
  const wbCtx = pf.whiteboardContext || {};
  const acc = pf.accusation || {};
  const directorNotes = state.directorNotes || {};

  // Flatten evidence bundle for counting
  const exposedData = state.evidenceBundle?.exposed || {};
  const buriedData = state.evidenceBundle?.buried || {};
  const exposedCount = (Array.isArray(exposedData.tokens) ? exposedData.tokens.length : 0) +
                       (Array.isArray(exposedData.paperEvidence) ? exposedData.paperEvidence.length : 0);
  const buriedCount = (Array.isArray(buriedData.transactions) ? buriedData.transactions.length : 0) +
                      (Array.isArray(buriedData.relationships) ? buriedData.relationships.length : 0);

  console.log(`[analyzeArcsPlayerFocusGuided] Input data check:`);
  console.log(`  - accusation.accused: ${JSON.stringify(acc.accused || [])}`);
  console.log(`  - accusation.charge: ${acc.charge || 'MISSING'}`);
  // Phase 3 (3.5): the whiteboard parse keeps the board's regions, each under the
  // players' own heading; suspectsExplored is no longer written.
  console.log(`  - whiteboard.regions: ${JSON.stringify((wbCtx.regions || []).map(r => r?.label || ''))}`);
  console.log(`  - director: ${(directorNotes.rawProse || '').length} chars prose, ${(directorNotes.quotes || []).length} quotes, ${(directorNotes.transactionReferences || []).length} tx refs`);
  console.log(`  - evidenceBundle: exposed=${exposedCount}, buried=${buriedCount}`);
  console.log(`  - roster: ${JSON.stringify(state.sessionConfig?.roster || [])}`);

  // Skip if arcs already exist (resume case)
  if (state.narrativeArcs && state.narrativeArcs.length > 0) {
    console.log('[analyzeArcsPlayerFocusGuided] Skipping - narrativeArcs already exist');
    return {
      currentPhase: PHASES.ARC_SYNTHESIS
    };
  }

  // Skip if no evidence to analyze
  if (!state.evidenceBundle && !state.preprocessedEvidence) {
    console.log('[analyzeArcsPlayerFocusGuided] Skipping - no evidence available');
    return {
      narrativeArcs: [],
      _arcAnalysisCache: {
        synthesizedAt: new Date().toISOString(),
        error: 'No evidence available',
        architecture: 'split-call'
      },
      currentPhase: PHASES.ARC_SYNTHESIS,
    };
  }

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // CALL 1: Core Arc Generation — SINGLE attempt (TRC-2 de-layering).
    // Any failure (timeout or not) propagates to the node's outer catch, which throws;
    // the graph-level retryPolicy on this node is the sole retrier (no in-node ×
    // graph attempt multiplication).
    // ═══════════════════════════════════════════════════════════════════════
    const call1Start = Date.now();
    const coreResult = await generateCoreArcs(state, config);
    const call1Duration = ((Date.now() - call1Start) / 1000).toFixed(1);
    if (!coreResult || !coreResult.narrativeArcs || coreResult.narrativeArcs.length === 0) {
      throw new Error('Call 1 returned no arcs');
    }
    console.log(`[analyzeArcsPlayerFocusGuided] Call 1 complete: ${coreResult.narrativeArcs.length} arcs in ${call1Duration}s`);

    // ═══════════════════════════════════════════════════════════════════════
    // CALL 2: Interweaving Enrichment (2 min timeout, graceful degradation)
    // ═══════════════════════════════════════════════════════════════════════
    const call2Start = Date.now();
    const roster = state.sessionConfig?.roster || [];
    const interweavingResult = await enrichWithInterweaving(coreResult.narrativeArcs, roster, config, state.sessionConfig, state.evidenceBundle);
    const call2Duration = ((Date.now() - call2Start) / 1000).toFixed(1);

    if (interweavingResult && !interweavingResult._failed) {
      console.log(`[analyzeArcsPlayerFocusGuided] Call 2 complete: interweaving added in ${call2Duration}s`);
    } else {
      console.log(`[analyzeArcsPlayerFocusGuided] Call 2 failed: using default interweaving (${call2Duration}s)`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MERGE: Combine results from both calls
    // ═══════════════════════════════════════════════════════════════════════
    const mergedResult = mergeArcsWithInterweaving(coreResult, interweavingResult);
    const { narrativeArcs, synthesisNotes, interweavingPlan, writerQuestions } = mergedResult;

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[analyzeArcsPlayerFocusGuided] Complete: ${narrativeArcs?.length || 0} arcs in ${totalDuration}s (Call1: ${call1Duration}s, Call2: ${call2Duration}s)`);

    // Log arc sources for verification
    if (narrativeArcs && narrativeArcs.length > 0) {
      const arcSourceCounts = {};
      narrativeArcs.forEach(arc => {
        arcSourceCounts[arc.arcSource] = (arcSourceCounts[arc.arcSource] || 0) + 1;
      });
      console.log(`[analyzeArcsPlayerFocusGuided] Arc sources: ${JSON.stringify(arcSourceCounts)}`);

      // Verify accusation arc exists
      const hasAccusationArc = narrativeArcs.some(arc => arc.arcSource === 'accusation');
      if (!hasAccusationArc) {
        console.warn('[analyzeArcsPlayerFocusGuided] WARNING: No accusation arc generated');
      }
    }

    return {
      narrativeArcs: narrativeArcs || [],
      _arcAnalysisCache: {
        synthesizedAt: new Date().toISOString(),
        synthesisNotes: synthesisNotes || '',
        interweavingPlan: interweavingPlan || {},
        // Phase 3 (3.7): the arc stop shows them; no later prompt prints them
        writerQuestions: writerQuestions || [],
        arcCount: narrativeArcs?.length || 0,
        architecture: 'split-call',
        interweavingFailed: mergedResult._interweavingFailed || false,
        interweavingError: mergedResult._interweavingError || null,
        timing: {
          call1: `${call1Duration}s`,
          call2: `${call2Duration}s`,
          total: `${totalDuration}s`,
          retries: 0
        }
      },
      currentPhase: PHASES.ARC_SYNTHESIS,
    };

  } catch (error) {
    // N7 fail-loud: returning [] arcs makes an outage indistinguishable from
    // "genuinely no arcs" at the selection screen, and force-forward can carry [] into
    // the article. Throw so retryPolicy retries transient failures and a persistent
    // one surfaces against the clean pre-node snapshot for operator /resume.
    const isTimeout = isSdkTimeoutError(error);
    console.error(`[analyzeArcsPlayerFocusGuided] ${isTimeout ? 'Timeout' : 'Error'}:`, error.message);
    // The original stays the cause, so a declined request is still named and still
    // permanent after the re-wrap (retry.js reads the cause chain).
    throw new Error(`Arc analysis failed${isTimeout ? ' (timeout)' : ''}: ${error.message}`, { cause: error });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REVISION NODE - Targeted fixes with previous output context
// ═══════════════════════════════════════════════════════════════════════════
//
// This node handles arc revisions by providing the FULL previous output
// along with specific feedback from the evaluator. This solves the
// "whack-a-mole" problem where fixing one issue caused regression of
// previously-correct output.
//
// Data flow:
// 1. incrementArcRevision preserves arcs in _previousArcs, clears narrativeArcs
// 2. reviseArcs receives _previousArcs + validationResults
// 3. Uses buildRevisionContext helper (DRY) to format context
// 4. Makes targeted fixes, returns new arcs, clears _previousArcs

/**
 * Revise arcs with previous output context for targeted fixes
 *
 * Called after incrementArcRevision when evaluator says arcs need work.
 * Uses the centralized buildRevisionContext helper for DRY formatting.
 *
 * Key difference from analyzeArcs: receives PREVIOUS OUTPUT + FEEDBACK
 * so it can make targeted fixes instead of regenerating from scratch.
 *
 * @param {Object} state - Current state with _previousArcs, validationResults
 * @param {Object} config - Graph config with SDK client
 * @returns {Object} Partial state update with narrativeArcs, cleared _previousArcs
 */
async function reviseArcs(state, config) {
  const revisionCount = state.arcRevisionCount || 0;
  console.log(`[reviseArcs] Starting arc revision ${revisionCount}`);
  const startTime = Date.now();

  // Get previous arcs (preserved by incrementArcRevision)
  const previousArcs = state._previousArcs;
  if (!previousArcs || previousArcs.length === 0) {
    // CRITICAL: This should never happen in normal flow.
    // If we're here, incrementArcRevision ran with null/empty narrativeArcs.
    console.error('[reviseArcs] CRITICAL: No previous arcs to revise. This indicates incrementArcRevision ran with null/empty narrativeArcs.');
    return {
      narrativeArcs: [],
      _previousArcs: null,
      _arcFeedback: null,
      errors: [{
        phase: PHASES.ARC_SYNTHESIS,
        type: 'revision-no-previous-output',
        message: 'Cannot revise: no previous arcs available. Increment node may have run with null narrativeArcs.',
        timestamp: new Date().toISOString()
      }],
      currentPhase: PHASES.ERROR
    };
  }

  // Get SDK client
  const sdkClient = getSdkClient(config, 'reviseArcs');

  try {
    // The prompt is built inside the try (final fix wave): buildArcReworkOutputAddendum
    // throws on purpose when the schema drifts, and that must reach state as this
    // node's error contract, not reject the graph.
    // Build revision context using centralized helper (DRY)
    const { contextSection, previousOutputSection } = buildRevisionContextDRY({
      phase: 'arcs',
      revisionCount,
      // Brief 2.3: a send back's banner names the round it opens, as the stop shows it.
      round: (state.humanArcRevisionCount || 0) + 1,
      validationResults: state.validationResults,
      previousOutput: previousArcs,
      humanFeedback: state._arcFeedback || null,
      theme: state.theme
    });
    const revisionPrompt = buildArcRevisionPrompt(state, contextSection, previousOutputSection);
    const result = await sdkClient({
      prompt: revisionPrompt,
      systemPrompt: getArcRevisionSystemPrompt(!!state._arcFeedback, state.sessionConfig, state.theme),
      model: 'opus',
      jsonSchema: arcReworkSchema(state.theme),
      disableTools: true,        // Pure analytical task — no tool access needed
      label: `Arc revision ${revisionCount}`
    });

    const { narrativeArcs, synthesisNotes, interweavingPlan: revisedPlan, writerQuestions: returnedQuestions } = result || {};

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[reviseArcs] Complete: ${narrativeArcs?.length || 0} arcs in ${duration}s`);

    // Verify improvements
    if (narrativeArcs && narrativeArcs.length > 0) {
      const hasAccusationArc = narrativeArcs.some(arc => arc.arcSource === 'accusation');
      console.log(`[reviseArcs] Accusation arc present: ${hasAccusationArc}`);
    }

    // Brief 2.2: the rework keeps the interweaving plan. It is asked for one (the
    // schema always allowed it); the cache this return replaces used to drop it, so
    // the outline writer's <arc-analysis> lost the plan after any arc rework. A rework
    // that returns none keeps the previous plan and says so.
    // "Has a plan" is hasInterweavingPlan, the rule the arc reworker's prompt and the
    // outline judge use (final fix wave): an empty returned plan no longer replaces a
    // real previous one, and an empty previous plan is not claimed as kept.
    const previousPlan = state._arcAnalysisCache?.interweavingPlan || null;
    const planReturned = hasInterweavingPlan(revisedPlan);
    const keptPrevious = !planReturned && hasInterweavingPlan(previousPlan);
    if (!planReturned) {
      console.warn(`[reviseArcs] Rework returned no interweaving plan; ${keptPrevious ? 'keeping the previous plan' : 'no previous plan to keep'}`);
    }

    return {
      narrativeArcs: narrativeArcs || [],
      _previousArcs: null,  // Clear temporary field after use
      _arcFeedback: null,   // Clear human feedback after consumption
      _arcAnalysisCache: {
        synthesizedAt: new Date().toISOString(),
        synthesisNotes: synthesisNotes || '',
        interweavingPlan: planReturned ? revisedPlan : (keptPrevious ? previousPlan : createDefaultInterweavingPlan()),
        ...(keptPrevious && { interweavingFromPreviousRound: true }),
        // Phase 3 (3.7; R5): only the director's note answers a question, so an
        // automatic pass keeps every previous one beside the rework's own.
        writerQuestions: carriedWriterQuestions(returnedQuestions, state._arcAnalysisCache?.writerQuestions, {
          afterDirectorNote: Boolean(state._arcFeedback)
        }),
        arcCount: narrativeArcs?.length || 0,
        architecture: 'player-focus-guided-revision',
        revisionNumber: revisionCount,
        timing: {
          total: `${duration}s`
        }
      },
      currentPhase: PHASES.ARC_SYNTHESIS
    };

  } catch (error) {
    // A declined request is never the free timeout retry below, whatever words its
    // explanation carries: it would be declined again.
    const isTimeout = !isRefusalError(error) &&
      error.message?.includes('timeout') && error.message?.includes('limit');

    // Graceful timeout recovery: preserve previous arcs, don't consume revision slot
    // Cap consecutive timeouts to prevent infinite retry loops with degraded SDK
    const consecutiveTimeouts = (state._arcAnalysisCache?._consecutiveTimeouts || 0) + 1;
    if (isTimeout && previousArcs?.length > 0 && consecutiveTimeouts < 3) {
      console.warn(`[reviseArcs] Timeout ${consecutiveTimeouts}/2 - preserving ${previousArcs.length} previous arcs (free retry)`);
      return {
        narrativeArcs: previousArcs,
        _previousArcs: null,
        _arcFeedback: state._arcFeedback,  // Preserve for retry — don't lose human intent
        _arcAnalysisCache: {
          synthesizedAt: new Date().toISOString(),
          // Brief 2.2: the previous arcs are kept, so their plan is kept with them.
          ...(state._arcAnalysisCache?.interweavingPlan && { interweavingPlan: state._arcAnalysisCache.interweavingPlan }),
          // Phase 3 (3.7): and their questions.
          writerQuestions: writerQuestionsOf(state._arcAnalysisCache?.writerQuestions),
          _revisionTimedOut: true,
          _revisionAttempt: revisionCount,
          _consecutiveTimeouts: consecutiveTimeouts,
          architecture: 'player-focus-guided-revision-timeout'
        },
        // Decrement counters — timeout is a free retry
        arcRevisionCount: Math.max(0, (state.arcRevisionCount || 1) - 1),
        humanArcRevisionCount: Math.max(0, (state.humanArcRevisionCount || 1) - 1),
        currentPhase: PHASES.ARC_SYNTHESIS
      };
    }

    // Non-timeout errors: existing behavior
    console.error('[reviseArcs] Error:', error.message);
    return {
      narrativeArcs: [],
      _previousArcs: null,
      _arcFeedback: null,
      _arcAnalysisCache: {
        synthesizedAt: new Date().toISOString(),
        _error: error.message,
        architecture: 'player-focus-guided-revision',
        revisionNumber: revisionCount
      },
      errors: [{
        phase: PHASES.ARC_SYNTHESIS,
        type: 'arc-revision-failed',
        message: error.message,
        timestamp: new Date().toISOString()
      }],
      currentPhase: PHASES.ERROR
    };
  }
}

/**
 * The rules the arc reworker's system prompt adds after its writer's, one set per
 * kind of rework: the journalist's (phase 3, brief 3.3; TH7).
 *
 * The first line names the task the rework's revision context gives it: the
 * director's note on a send back, the check's or the evaluation's findings on an
 * automatic pass. How much of the previous arcs a rework keeps is the revision
 * context's to say (buildRevisionContext), from the director's note, so no fixed
 * "preserve" or "do not regenerate" text is here: on 091826 that text turned the
 * director's "rethink" into a relabel. The rethink rule is the revision context's too,
 * the one place every reworker shares, so the send back's rules add only what it
 * does not say: a corrected game mechanic reaches every arc (3.3 review, finding 2).
 *
 * Phase 3 (3.10; R23): the automatic pass's line names its task and leaves the scope
 * to the revision context, which states it once. It used to end "and this rework
 * answers it", every finding the context lists, the suggestions among them.
 */
const ARC_REVISION_RULES = {
  human: `You are reworking the arcs you wrote: the director sent them back, and the director's note in the revision context is the task.

The director knows the game, so a note that corrects a game mechanic (burial attribution, evidence boundaries) corrects every arc it touches, not only the one it names.`,

  evaluator: `You are reworking the arcs you wrote after an automatic check or evaluation; the revision context lists what it found and what this rework fixes.`
};

/**
 * The detective's arc rework rules, today's text, parked with its theme (spec D13).
 *
 * Human feedback: allows conceptual arc replacement.
 * Evaluator feedback: targeted fixes only.
 */
const DETECTIVE_ARC_REVISION_RULES = {
  human: `You are revising narrative arcs based on human reviewer feedback for "About Last Night."

The human reviewer has domain expertise about the game mechanics. Their feedback takes ABSOLUTE PRIORITY.

RULES:
1. Address the human's feedback completely - this is your primary task
2. You MAY replace entire arcs if the feedback warrants it
3. You MAY restructure arc narratives to address conceptual issues
4. PRESERVE arcs and arc content the feedback does not mention
5. If the feedback corrects a game mechanic (e.g., burial attribution, evidence boundaries), apply the correction ACROSS ALL arcs, not just the one mentioned
6. Output complete arcs with all required fields - do not return partial arcs
7. Maintain the same JSON schema structure as the input arcs`,

  // Evaluator-driven revision: targeted fixes only
  evaluator: `You are revising narrative arcs for an investigative article about "About Last Night".

CRITICAL REVISION RULES:
1. You are IMPROVING existing arcs, not generating from scratch
2. The previous output is provided - PRESERVE everything that's working well
3. Only modify the specific issues identified in the feedback
4. Maintain the same overall arc structure and organization
5. Output complete arcs with all required fields

Your goal is TARGETED FIXES that address the evaluator's feedback while preserving all the good work from the previous attempt.

Do NOT:
- Regenerate arcs from scratch (you lose good content)
- Change things that weren't flagged as issues
- Drop arcs that were working well
- Introduce new problems while fixing old ones

DO:
- Read the previous output carefully
- Identify exactly what needs to change
- Make minimal, surgical fixes
- Verify your changes address the feedback
- Return the complete updated arc set`
};

/**
 * Get system prompt for arc revision: the arc writer's system prompt, then the
 * rework rules for this kind of rework (phase 2, 2.3).
 *
 * The writer's system prompt brings the game context, the six principles (three
 * lenses, evidence boundaries, temporal awareness among them) and the output
 * requirements, none of which the reworker had. It also brings the session's
 * reporting-mode block, right after the identity line (brief 1.5: a rework left
 * mode-blind would put the presence claims back into a remote session's arcs).
 *
 * @param {boolean} hasHumanFeedback - Whether revision is driven by human rejection
 * @param {Object} [sessionConfig] - state.sessionConfig, carrying reportingMode
 * @param {string} [theme] - state.theme; coreArcSystemPrompt's default when absent
 * @returns {string} System prompt
 */
function getArcRevisionSystemPrompt(hasHumanFeedback = false, sessionConfig = undefined, theme = undefined) {
  return `${coreArcSystemPrompt(sessionConfig, theme)}\n\n${arcRevisionRules(hasHumanFeedback, theme)}`;
}

/**
 * The arc rework rules for one kind of rework and theme.
 *
 * @param {boolean} hasHumanFeedback - a send back (true) or an automatic pass
 * @param {string} [theme='journalist']
 * @returns {string}
 */
function arcRevisionRules(hasHumanFeedback, theme = 'journalist') {
  const rules = isParkedDetective(theme) ? DETECTIVE_ARC_REVISION_RULES : ARC_REVISION_RULES;
  return hasHumanFeedback ? rules.human : rules.evaluator;
}

/**
 * The arc reworker's output schema for a theme: the detective's keeps today's wording
 * for the convergence and the order (D13).
 *
 * @param {string} [theme]
 * @returns {Object}
 */
function arcReworkSchema(theme) {
  return isParkedDetective(theme) ? DETECTIVE_PLAYER_FOCUS_GUIDED_SCHEMA : PLAYER_FOCUS_GUIDED_SCHEMA;
}

/**
 * Whether an interweaving plan says anything: an order, a convergence point or a
 * callback, the fields the schema defines. The degradation default
 * (createDefaultInterweavingPlan), `{}` and an array do not.
 *
 * The one rule for "has a plan" (phase 2 final fix wave): reviseArcs (whether the
 * rework returned one, and whether a previous one is kept), the arc reworker's
 * PREVIOUS INTERWEAVING PLAN section and the outline judge's INTERWEAVING PLAN
 * section all call it.
 *
 * @param {Object|null|undefined} plan
 * @returns {boolean}
 */
function hasInterweavingPlan(plan) {
  if (!plan || typeof plan !== 'object') return false;
  return (Array.isArray(plan.suggestedOrder) && plan.suggestedOrder.length > 0) ||
    (typeof plan.convergencePoint === 'string' && plan.convergencePoint.trim() !== '') ||
    (Array.isArray(plan.keyCallbacks) && plan.keyCallbacks.length > 0);
}

/**
 * One schema field as a prompt line: its name, its shape when it is a list, and the
 * schema's own description of it.
 *
 * @param {string} name
 * @param {Object} spec - the field's JSON-schema node
 * @returns {string}
 */
function describeSchemaField(name, spec) {
  let shape = '';
  if (spec.type === 'array' && spec.items?.type === 'object' && spec.items.properties) {
    const keys = Object.entries(spec.items.properties).map(([key, sub]) =>
      Array.isArray(sub.enum) ? `"${key}": ${sub.enum.map(v => `"${v}"`).join(' | ')}` : `"${key}"`);
    shape = ` (a list of {${keys.join(', ')}})`;
  } else if (spec.type === 'array') {
    shape = ' (a list)';
  }
  return `- "${name}"${shape}${spec.description ? `: ${spec.description}` : ''}`;
}

/**
 * What an arc rework returns beyond the writer's OUTPUT FORMAT (phase 2, 2.3;
 * integrator ruling on the reworker's output instructions).
 *
 * The reworker carries the writer's `## OUTPUT FORMAT` unchanged, and it lists no
 * interweaving fields: the writer's call returns none, and the interweaving call adds
 * them afterwards. The reworker has no interweaving call, so its schema,
 * PLAYER_FOCUS_GUIDED_SCHEMA, asks for them itself, and a model following the format
 * block alone would drop the plan brief 2.2 requires it to keep. This names the two
 * fields in the schema's own words: the lines are generated from the schema's
 * properties and descriptions, so there is one wording.
 *
 * @param {boolean} hasPlan - whether the prompt shows a PREVIOUS INTERWEAVING PLAN
 * @param {string} [theme] - the schema whose words it prints (arcReworkSchema)
 * @returns {string}
 * @throws {Error} when the schema no longer defines either field
 */
function buildArcReworkOutputAddendum(hasPlan, theme = 'journalist') {
  const schema = arcReworkSchema(theme);
  const arcFields = schema.properties?.narrativeArcs?.items?.properties?.interweaving?.properties;
  const planFields = schema.properties?.interweavingPlan?.properties;
  if (!arcFields || !planFields) {
    throw new Error('buildArcReworkOutputAddendum: PLAYER_FOCUS_GUIDED_SCHEMA no longer defines interweaving / interweavingPlan');
  }
  const lines = (fields) => Object.entries(fields).map(([name, spec]) => describeSchemaField(name, spec)).join('\n');
  const planRule = hasPlan
    ? 'A PREVIOUS INTERWEAVING PLAN is shown above: keep it, or update it for the revised arcs. Do not drop it.'
    : 'No previous plan is shown: write one for the revised arcs.';
  return `## WHAT THIS REWORK RETURNS

The OUTPUT FORMAT at the top is the arc writer's. A rework returns that object with two more fields, as its schema defines them.

Each arc's "interweaving" object:
${lines(arcFields)}

The top-level "interweavingPlan" object:
${lines(planFields)}

${planRule}`;
}

/**
 * Build revision prompt with previous arcs and feedback
 *
 * Phase 2 (2.3): the arc writer's sections (buildCoreArcSections), then the revision
 * block, then the standing notes (<DIRECTOR_GUIDANCE>) last. The reworker used to
 * carry its own shorter copies of the accusation, the roster, the director's notes
 * and the valid ids; it now carries the writer's sections themselves, so it also has
 * the whiteboard, the investigation focus, the character context, the generation
 * rules, the record, the boundaries, temporal awareness, the tensions and the
 * three-lens requirement, and the valid ids follow the writer's rule.
 *
 * The writer's revision hook (buildArcRevisionContext) is not carried: the revision
 * context from buildRevisionContext is this prompt's.
 *
 * @param {Object} state - Current workflow state
 * @param {string} contextSection - Formatted revision context from helper
 * @param {string} previousOutputSection - Formatted previous output from helper
 * @returns {string} Complete revision prompt
 */
function buildArcRevisionPrompt(state, contextSection, previousOutputSection) {
  // Carry-over from 2.2 (wave-2 ruling W2): with no plan, the section is left out
  // rather than printed as `{}`, and the task does not ask to keep it.
  const previousPlan = state._arcAnalysisCache?.interweavingPlan;
  const hasPlan = hasInterweavingPlan(previousPlan);
  const planSection = hasPlan
    ? `\n\n### PREVIOUS INTERWEAVING PLAN\n${JSON.stringify(previousPlan, null, 2)}`
    : '';
  const keepPlan = hasPlan
    ? ' Keep the PREVIOUS INTERWEAVING PLAN where the arcs it names still stand, and change it only where the revision changed those arcs.'
    : '';
  // Phase 3 (3.7; R5): the questions the previous arcs raised to the director, so the
  // rework sees them in the version it starts from and returns those it did not
  // answer (C15). Left out when there are none; the detective has none (D13).
  const previousQuestions = isParkedDetective(state.theme) ? [] : writerQuestionsOf(state._arcAnalysisCache?.writerQuestions);
  const questionsSection = previousQuestions.length > 0
    ? `\n\n### PREVIOUS QUESTIONS FOR THE DIRECTOR (writerQuestions)\n${JSON.stringify(previousQuestions, null, 2)}`
    : '';

  return `${buildCoreArcSections(state)}
---

# Arc Revision Request

${contextSection}

---

${previousOutputSection}${planSection}${questionsSection}

---

${buildArcReworkOutputAddendum(hasPlan, state.theme)}

---

${arcReworkTask(state.theme, keepPlan)}${buildArcStandingNotes(state)}`;
}

/**
 * The arc rework's task, the last section before the standing notes.
 *
 * The journalist's (phase 3, brief 3.3; TH7) defers to the revision context for what
 * the rework changes and how far; the detective's keeps today's fixed text (D13).
 *
 * @param {string} [theme]
 * @param {string} keepPlan - the sentence about keeping a previous plan, or ''
 * @returns {string}
 */
function arcReworkTask(theme, keepPlan) {
  if (!isParkedDetective(theme)) {
    return `## YOUR TASK

1. Rework the PREVIOUS ARCS OUTPUT as the revision context above directs.
2. Return the whole arc set in the same JSON format, every arc with all its required fields.
3. Return the interweavingPlan (suggestedOrder, convergencePoint, keyCallbacks) for the revised arcs, and each arc's interweaving.${keepPlan}`;
  }
  return `## YOUR TASK

1. Review the PREVIOUS ARCS OUTPUT above
2. Review the ISSUES TO ADDRESS in the revision context
3. Make TARGETED FIXES to address those specific issues
4. PRESERVE everything that's working well
5. Return the complete updated arc set in the same JSON format
6. Return the interweavingPlan (suggestedOrder, convergencePoint, keyCallbacks) for the revised arcs, and each arc's interweaving.${keepPlan}

Remember: You are IMPROVING, not regenerating. The previous work was valuable - preserve what's good while fixing what's broken.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// EVIDENCE SUMMARY EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract evidence summary with ALL IDs for specialist prompts
 * NO TRUNCATION - specialists need complete ID list for accurate references
 *
 * @param {Object} evidenceBundle - Curated evidence bundle
 * @returns {Object} Evidence summary with complete ID lists
 */
function extractEvidenceSummary(evidenceBundle) {
  const exposed = evidenceBundle?.exposed || {};
  const buried = evidenceBundle?.buried || {};

  // Get ALL exposed tokens with IDs. Ids follow the record view's rule (brief 2.1),
  // so the valid-id list names each document by the id its <document> tag carries.
  const exposedTokens = (exposed.tokens || []).map(t => ({
    id: recordIdOf(t),
    owner: t.owner || t.ownerLogline,
    summary: t.summary,
    characterRefs: t.characterRefs || [],
    timeline: t.temporalContext || 'party-night'
  }));

  // Get ALL exposed paper evidence with IDs
  // A rescued item has no `id`: it is named by its Notion id, as in the view.
  const exposedPaper = (exposed.paperEvidence || []).map(p => ({
    id: recordIdOf(p) || p.name,
    name: p.name,
    summary: p.summary || p.description?.substring(0, 200),
    characterRefs: p.characterRefs || [],
    timeline: p.temporalContext || 'BACKGROUND'
  }));

  // Every buried transaction, by the record view's rule (isBuriedTransactionRow): a
  // memory no one sold has no account, amount or time and is not a transaction. The
  // arc writer, its reworker and the arc judge list the same sales the view does
  // (phase 2 final fix wave; on 092026 20 of the writer's 50 rows were all-null).
  const buriedTransactions = (buried.transactions || []).filter(isBuriedTransactionRow).map(t => ({
    // id intentionally omitted — prevents identity inference from token IDs
    shellAccount: t.shellAccount,
    amount: t.amount,
    time: t.time,
    timeline: t.temporalContext || 'investigation'
  }));

  return {
    exposedTokens,
    exposedPaper,
    buriedTransactions,
    // Valid keyEvidence IDs: EXPOSED ONLY (Layer 1)
    // Buried transactions are shown for context but cannot be cited as keyEvidence
    // This matches the evaluator's evidenceIdValidity check
    allEvidenceIds: [
      ...exposedTokens.map(t => t.id),
      ...exposedPaper.map(p => p.id)
      // NOTE: buriedTransactions intentionally excluded - they're Layer 2
      // Arcs can DISCUSS buried patterns but cannot CITE them as evidence
    ].filter(Boolean)
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY PARALLEL SPECIALIST ARCHITECTURE REMOVED (Commit 8.xx)
// ═══════════════════════════════════════════════════════════════════════════
//
// The following functions were removed as part of legacy cleanup:
// - callWithRetry, callFinancialSpecialist, callBehavioralSpecialist, callVictimizationSpecialist
// - buildSynthesisPrompt, synthesizeArcs, analyzeArcsWithSubagents
//
// Current architecture uses single-call player-focus-guided analysis.
// See analyzeArcsPlayerFocusGuided() above.
//

// ═══════════════════════════════════════════════════════════════════════════
// PROGRAMMATIC VALIDATION NODE (Commit 8.12, updated 8.15)
// ═══════════════════════════════════════════════════════════════════════════
//
// Validates arc structure programmatically AFTER generation.
// Strict ID matching replaces LLM semantic matching for evidence grounding.
// No LLM call required - pure programmatic validation.
//
// Commit 8.15: Added validation for new player-focus-guided fields:
// - arcSource (accusation | whiteboard | observation | discovered)
// - evidenceStrength (strong | moderate | weak | speculative)
// - accusationArcPresent structural check
// - caveats and unansweredQuestions arrays

// Valid enum values for new fields
const VALID_ARC_SOURCES = ['accusation', 'whiteboard', 'observation', 'discovered'];
const VALID_EVIDENCE_STRENGTHS = ['strong', 'moderate', 'weak', 'speculative'];

/**
 * Build revision guidance string for programmatic validation failures
 * Commit 8.27: Short-circuit expensive evaluator for obvious structural issues
 *
 * Phase 3 (3.7; C7, C15): the journalist's fix line offers both ways a player is
 * covered: a placement through what the record shows, or, where the record holds
 * nothing about them, a question of kind "player" to the director (fix 3.7b). It used to demand a placement,
 * which pushed the rework to invent one. The detective keeps its line (D13).
 *
 * @param {Array} issues - Array of structural issues with type/message/severity
 * @param {Array} missingRoster - Array of roster member names not covered in arcs
 * @param {string} [theme='journalist']
 * @returns {string} Formatted guidance for revision node
 */
function buildValidationRevisionGuidance(issues, missingRoster, theme = 'journalist') {
  const lines = ['PROGRAMMATIC VALIDATION FAILED - Fix these structural issues:'];

  issues.forEach(issue => {
    lines.push(`\n• ${issue.message}`);
  });

  if (missingRoster.length > 0 && isParkedDetective(theme)) {
    lines.push(`\nMissing roster members that MUST appear in characterPlacements:`);
    missingRoster.forEach(name => lines.push(`  - ${name}`));
    lines.push(`\nEnsure each missing member appears in at least one arc's characterPlacements.`);
  } else if (missingRoster.length > 0) {
    lines.push(`\nRoster members with no placement and no writerQuestions entry of kind "player" about them:`);
    missingRoster.forEach(name => lines.push(`  - ${name}`));
    lines.push(`\nGive each one a placement in an arc's characterPlacements through what the record shows they did, or, where the record holds nothing about them, a writerQuestions entry of kind "player" about them for the director (C15).`);
  }

  return lines.join('\n');
}

/**
 * Validate arc structure programmatically
 *
 * Commit 8.12: Programmatic validation for strict evidence/roster matching.
 * Commit 8.15: Added arcSource, evidenceStrength, and accusation arc validation.
 *
 * Runs AFTER analyzeArcsPlayerFocusGuided to:
 * - Validate keyEvidence IDs exist in evidence bundle
 * - Validate characterPlacements use roster names
 * - Filter arcs that lost all evidence
 * - Validate arcSource and evidenceStrength enums (8.15)
 * - Check for required accusation arc (8.15)
 * - Ensure caveats/unansweredQuestions are arrays (8.15)
 *
 * Phase 3 (brief 3.3): an arc with a missing or invalid source label is sent back for
 * a label (V5). It used to be relabelled "discovered", which the outline writer frames
 * as something the room missed, so a thread from the director's notes or the
 * whiteboard could reach print as the room's blind spot. The note that called a role
 * naming both victim and operator a "contradiction" is gone (V4): a character can be
 * both wronged and complicit.
 *
 * @param {Object} state - Current state with narrativeArcs, evidenceBundle, sessionConfig
 * @param {Object} config - Graph config (unused)
 * @returns {Object} Partial state update with validated narrativeArcs
 */
function validateArcStructure(state, config) {
  console.log('[validateArcStructure] Starting programmatic validation (Commit 8.17)');

  const arcs = state.narrativeArcs || [];
  const roster = (state.sessionConfig?.roster || []).filter(n => typeof n === 'string');
  const rosterLower = new Set(roster.map(n => n.toLowerCase()));

  // Commit 8.17: Get theme-specific NPCs for validation
  const theme = state.theme || config?.configurable?.theme || 'journalist';
  const themeNPCs = getThemeNPCs(theme);
  console.log(`[validateArcStructure] Theme "${theme}" NPCs: ${themeNPCs.join(', ') || '(none)'}`);

  // Get all valid game characters for non-roster PC detection (from Notion-derived map)
  const allCharacters = Object.keys(state?.canonicalCharacters || {});
  const nonRosterPCs = getNonRosterPCs(roster, allCharacters, themeNPCs);
  console.log(`[validateArcStructure] Non-roster PCs: ${nonRosterPCs.join(', ') || '(none)'}`);

  // Build valid evidence ID set using helper from node-helpers
  const validIds = buildValidEvidenceIds(state.evidenceBundle);

  console.log(`[validateArcStructure] Validating ${arcs.length} arcs against:`);
  console.log(`  - ${validIds.size} valid evidence IDs`);
  console.log(`  - ${roster.length} roster names`);

  // Early exit: Empty roster means we can't validate character placements
  // This likely indicates a data loading error upstream
  if (roster.length === 0) {
    console.error('[validateArcStructure] Empty roster - cannot validate character placements');
    return {
      narrativeArcs: arcs,  // Pass through unchanged
      _arcValidation: {
        inputCount: arcs.length,
        outputCount: arcs.length,
        error: 'Empty roster - character validation skipped',
        validatedAt: new Date().toISOString()
      },
      errors: [{
        phase: PHASES.ARC_SYNTHESIS,
        type: 'empty-roster',
        message: 'Cannot validate arcs: roster is empty (data loading error?)',
        timestamp: new Date().toISOString()
      }]
    };
  }

  let totalEvidenceRemoved = 0;
  let totalCharactersRemoved = 0;
  let totalCharactersCorrected = 0;
  const unlabelledArcs = [];  // arcs with a missing or invalid arcSource (V5)

  const validatedArcs = arcs.map((arc, index) => {
    const issues = [];

    // ═══════════════════════════════════════════════════════════════════════
    // 1. Validate keyEvidence IDs exist in evidence bundle
    // ═══════════════════════════════════════════════════════════════════════
    const originalEvidenceCount = (arc.keyEvidence || []).length;
    // Use map+filter to enable ID correction (not just filtering)
    const validatedEvidence = (arc.keyEvidence || [])
      .map(id => {
        // Check exact match
        if (validIds.has(id)) return id;

        // Try case-insensitive match and return corrected ID
        const lowerMatch = [...validIds].find(vid =>
          vid.toLowerCase() === id.toLowerCase()
        );
        if (lowerMatch) {
          issues.push(`Evidence ID "${id}" corrected to "${lowerMatch}"`);
          return lowerMatch;  // Return corrected ID
        }

        issues.push(`Removed invalid evidence ID: ${id}`);
        totalEvidenceRemoved++;
        return null;  // Mark for removal
      })
      .filter(id => id !== null);

    // ═══════════════════════════════════════════════════════════════════════
    // 2. Validate characterPlacements use roster names
    // ═══════════════════════════════════════════════════════════════════════
    const validatedPlacements = {};

    Object.entries(arc.characterPlacements || {}).forEach(([name, role]) => {
      // Use fuzzy matching helper (now uses Notion-derived canonical characters map)
      const canonicalChars = state?.canonicalCharacters || {};
      const matchedName = validateRosterName(name, roster, canonicalChars);

      if (matchedName) {
        // Roster member or canonical full name - preserve as-is
        validatedPlacements[matchedName] = role;

        // Note: since validateRosterName now returns the input name unchanged,
        // this "correction" logging will rarely trigger (only for case normalization)
        if (matchedName.toLowerCase() !== name.toLowerCase()) {
          issues.push(`Character "${name}" corrected to roster name "${matchedName}"`);
          totalCharactersCorrected++;
        }
      } else if (isKnownNPC(name, themeNPCs)) {
        // Commit 8.17: Known NPC from theme config - preserve as-is
        // NPCs are valid in characterPlacements but don't count toward roster coverage
        validatedPlacements[name] = role;
        // NPCs don't affect roster coverage checks
      } else if (isNonRosterPC(name, roster, allCharacters, themeNPCs)) {
        // Commit 8.xx: Non-roster PC - valid game character not playing this session
        // They appear in evidence about them but Nova didn't observe their behavior
        // Valid in characterPlacements (evidence-based mentions) but don't count for coverage
        validatedPlacements[name] = role;
        // Track non-roster PC for logging/debugging
        arc._nonRosterPCs = arc._nonRosterPCs || [];
        arc._nonRosterPCs.push(name);
        issues.push(`Character "${name}" is non-roster PC (evidence-based mention - valid)`);
        // Non-roster PCs don't affect roster coverage checks
      } else {
        issues.push(`Removed unknown character: ${name}`);
        totalCharactersRemoved++;
      }
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 3. Validate new player-focus-guided fields (Commit 8.15)
    // ═══════════════════════════════════════════════════════════════════════

    // A missing or invalid arcSource stays as the writer gave it and the arc goes
    // back for a label (phase 3, V5): see the invalid-arc-source issue below.
    const labelled = VALID_ARC_SOURCES.includes(arc.arcSource);
    if (!labelled) {
      issues.push(`Invalid arcSource "${arc.arcSource || 'missing'}" - sent back for a label`);
    }

    // Validate evidenceStrength enum (default to 'weak' if invalid/missing)
    let validatedEvidenceStrength = arc.evidenceStrength;
    if (!validatedEvidenceStrength || !VALID_EVIDENCE_STRENGTHS.includes(validatedEvidenceStrength)) {
      issues.push(`Invalid evidenceStrength "${arc.evidenceStrength || 'missing'}" - defaulting to "weak"`);
      validatedEvidenceStrength = 'weak';
    }

    // Ensure caveats is an array (default to empty array)
    const validatedCaveats = Array.isArray(arc.caveats) ? arc.caveats : [];
    if (!Array.isArray(arc.caveats) && arc.caveats) {
      issues.push(`caveats is not an array - converted to empty array`);
    }

    // Ensure unansweredQuestions is an array (default to empty array)
    const validatedQuestions = Array.isArray(arc.unansweredQuestions) ? arc.unansweredQuestions : [];
    if (!Array.isArray(arc.unansweredQuestions) && arc.unansweredQuestions) {
      issues.push(`unansweredQuestions is not an array - converted to empty array`);
    }

    // Ensure analysisNotes is an object with expected keys
    const validatedAnalysisNotes = {
      financial: arc.analysisNotes?.financial || '',
      behavioral: arc.analysisNotes?.behavioral || '',
      victimization: arc.analysisNotes?.victimization || ''
    };

    // Build validated arc with new fields
    const validatedArc = {
      ...arc,
      keyEvidence: validatedEvidence,
      characterPlacements: validatedPlacements,
      evidenceStrength: validatedEvidenceStrength,
      caveats: validatedCaveats,
      unansweredQuestions: validatedQuestions,
      analysisNotes: validatedAnalysisNotes
    };

    // Add validation metadata if there were issues
    if (issues.length > 0) {
      validatedArc._validationIssues = issues;
      console.log(`[validateArcStructure] Arc ${index + 1} "${arc.title}": ${issues.length} issues`);
      issues.forEach(issue => console.log(`    - ${issue}`));
    }

    if (!labelled) unlabelledArcs.push(validatedArc);
    return validatedArc;
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 5. Filter arcs and check structural requirements (Commit 8.15)
  // ═══════════════════════════════════════════════════════════════════════

  // Brief 2.2: a verdict that names no culprit (an accident, an overdose, self-harm).
  // Its accusation arc is about the verdict itself and may have no one to place.
  // Phase 3 (3.3): so may a verdict that blames an institution and names no character
  // (blamesNoCharacter, 3.5's parse of it).
  const verdict = state.sessionConfig?.accusation || state.playerFocus?.accusation;
  const noCulpritVerdict = isNoCulpritVerdict(verdict);
  const verdictNamesNoCharacter = noCulpritVerdict || blamesNoCharacter(verdict);

  // Filter arcs that lost all evidence AND characters
  // NOTE: For speculative arcs, we allow no evidence if arcSource is 'accusation'
  const viableArcs = validatedArcs.filter(arc => {
    const hasEvidence = arc.keyEvidence.length > 0;
    const hasCharacters = Object.keys(arc.characterPlacements).length > 0;
    const isAccusationArc = arc.arcSource === 'accusation';

    // Special case: accusation arc with speculative evidence is still valid
    if (isAccusationArc && !hasEvidence) {
      console.log(`[validateArcStructure] Accusation arc "${arc.title}" has no evidence - allowed (speculative)`);
      arc._noEvidence = true;
      // Still needs characters, unless the verdict names no character: then an arc
      // about the verdict with no one to place is the arc the rule asks for.
      return hasCharacters || verdictNamesNoCharacter;
    }

    if (!hasEvidence && !hasCharacters) {
      console.log(`[validateArcStructure] Filtering out arc "${arc.title}" - no evidence or characters`);
      return false;
    }

    if (!hasEvidence) {
      console.log(`[validateArcStructure] Warning: Arc "${arc.title}" has no valid evidence IDs`);
      arc._noEvidence = true;
    }

    return true;
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 6. Check for required accusation arc (structural requirement)
  // ═══════════════════════════════════════════════════════════════════════
  const hasAccusationArc = viableArcs.some(arc => arc.arcSource === 'accusation');
  if (!hasAccusationArc) {
    console.warn(`[validateArcStructure] STRUCTURAL ISSUE: No accusation arc present`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 7. Check roster coverage across all arcs (Commit 8.27)
  // Commit 8.xx: Accept both first names AND canonical full names for coverage
  // ═══════════════════════════════════════════════════════════════════════

  // Build mapping from canonical names to roster entries
  // e.g., "sarah blackwood" → "sarah", "sarah" → "sarah"
  const canonicalCharsForCoverage = state?.canonicalCharacters || {};
  const canonicalToRoster = new Map();
  roster.forEach(rosterName => {
    const nameLower = rosterName.toLowerCase();
    canonicalToRoster.set(nameLower, nameLower);
    const canonical = getCanonicalName(rosterName, canonicalCharsForCoverage);
    if (canonical.toLowerCase() !== nameLower) {
      canonicalToRoster.set(canonical.toLowerCase(), nameLower);
    }
  });

  const coveredRoster = new Set();
  viableArcs.forEach(arc => {
    Object.keys(arc.characterPlacements || {}).forEach(name => {
      // Check if name is a roster member OR a canonical full name
      const nameLower = name.toLowerCase();
      const mappedRoster = canonicalToRoster.get(nameLower);
      if (mappedRoster) {
        // Both "Sarah" and "Sarah Blackwood" add "sarah" to coverage
        coveredRoster.add(mappedRoster);
      }
    });
  });

  // Phase 3 (3.7; C7, C15): a roster member a question of kind "player" to the
  // director names counts as covered, by first name or full name
  // (questionedRosterNames; a pronoun or ledger question covers no one, fix 3.7b). A
  // player the record says nothing about is asked about, not placed by invention.
  // Journalist only: the detective's writer raises no questions (D13).
  const questionedRoster = isParkedDetective(theme)
    ? []
    : questionedRosterNames(state._arcAnalysisCache?.writerQuestions, roster, canonicalCharsForCoverage);
  const rosterCoveredByQuestion = questionedRoster.filter(name => !coveredRoster.has(name.toLowerCase()));
  rosterCoveredByQuestion.forEach(name => coveredRoster.add(name.toLowerCase()));

  const missingRoster = roster.filter(name => !coveredRoster.has(name.toLowerCase()));
  const rosterCoverage = roster.length > 0 ? coveredRoster.size / roster.length : 1;

  if (missingRoster.length > 0) {
    console.warn(`[validateArcStructure] STRUCTURAL ISSUE: Missing roster members: ${missingRoster.join(', ')}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 8. Determine structural pass/fail (Commit 8.27: gates evaluator vs revision)
  // ═══════════════════════════════════════════════════════════════════════
  const structuralIssues = [];

  if (missingRoster.length > 0) {
    structuralIssues.push({
      type: 'missing-roster-coverage',
      message: `Missing roster members: ${missingRoster.join(', ')}`,
      severity: 'structural'
    });
  }

  const unlabelledViable = unlabelledArcs.filter(arc => viableArcs.includes(arc));
  if (unlabelledViable.length > 0) {
    structuralIssues.push({
      type: 'invalid-arc-source',
      message: 'Arcs with no valid source label: ' +
        unlabelledViable.map(arc => `"${arc.title}" (${arc.id}), ${arc.arcSource ? `labelled "${arc.arcSource}"` : 'with no label'}`).join('; ') +
        '. Give each arc the arcSource for where its thread came from: accusation, whiteboard, observation or discovered.',
      severity: 'structural'
    });
  }

  if (!hasAccusationArc) {
    structuralIssues.push({
      type: 'no-accusation-arc',
      message: noCulpritVerdict
        ? 'No accusation arc present - must include an arc (arcSource "accusation") about the room\'s verdict, which names no culprit'
        : 'No accusation arc present - must include arc based on player accusation',
      severity: 'structural'
    });
  }

  const structuralPassed = structuralIssues.length === 0;

  // Build validationResults for revision node (same format as evaluator)
  const validationFeedback = structuralPassed ? null : {
    // B4 shared channel: validationResults is shared by all three revisers, so the
    // phase stamp is what stops reviseOutline/reviseContentBundle acting on arc
    // findings that happen to still be sitting in the channel.
    phase: 'arcs',
    ready: false,
    structuralPassed: false,
    issues: structuralIssues,
    revisionGuidance: buildValidationRevisionGuidance(structuralIssues, missingRoster, theme),
    criteriaScores: {
      rosterCoverage: rosterCoverage,
      accusationArcPresent: hasAccusationArc ? 1.0 : 0.0
    },
    source: 'programmatic-validation'
  };

  if (!structuralPassed) {
    console.log(`[validateArcStructure] Structural validation FAILED: ${structuralIssues.length} issues`);
  }

  // Count arc sources for logging
  const arcSourceCounts = {};
  viableArcs.forEach(arc => {
    arcSourceCounts[arc.arcSource] = (arcSourceCounts[arc.arcSource] || 0) + 1;
  });

  // Count evidence strengths for logging
  const evidenceStrengthCounts = {};
  viableArcs.forEach(arc => {
    evidenceStrengthCounts[arc.evidenceStrength] = (evidenceStrengthCounts[arc.evidenceStrength] || 0) + 1;
  });

  console.log(`[validateArcStructure] Complete:`);
  console.log(`  - Input: ${arcs.length} arcs`);
  console.log(`  - Output: ${viableArcs.length} valid arcs`);
  console.log(`  - Evidence IDs removed: ${totalEvidenceRemoved}`);
  console.log(`  - Characters removed: ${totalCharactersRemoved}`);
  console.log(`  - Characters corrected: ${totalCharactersCorrected}`);
  console.log(`  - Arc sources: ${JSON.stringify(arcSourceCounts)}`);
  console.log(`  - Evidence strengths: ${JSON.stringify(evidenceStrengthCounts)}`);
  console.log(`  - Accusation arc present: ${hasAccusationArc}`);
  console.log(`  - Roster coverage: ${(rosterCoverage * 100).toFixed(0)}% (${missingRoster.length} missing, ${rosterCoveredByQuestion.length} by a question)`);
  console.log(`  - Non-roster PCs in arcs: ${nonRosterPCs.length > 0 ? nonRosterPCs.join(', ') : '(none)'}`);
  console.log(`  - Structural passed: ${structuralPassed}`);

  return {
    narrativeArcs: viableArcs,
    _arcValidation: {
      inputCount: arcs.length,
      outputCount: viableArcs.length,
      evidenceIdsRemoved: totalEvidenceRemoved,
      charactersRemoved: totalCharactersRemoved,
      charactersCorrected: totalCharactersCorrected,
      arcSourceCounts,
      evidenceStrengthCounts,
      hasAccusationArc,
      rosterCoverage,
      missingRoster,
      rosterCoveredByQuestion,  // Phase 3 (3.7): covered by a question to the director, not a placement
      nonRosterPCs,  // Commit 8.xx: Valid game characters not in roster (evidence-based mentions)
      structuralPassed,  // Commit 8.27: gates routing to evaluator vs revision
      validatedAt: new Date().toISOString()
    },
    // Commit 8.27: Only set validationResults if structural issues detected
    // This enables revision node to receive feedback without expensive evaluator
    ...(validationFeedback && { validationResults: validationFeedback })
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK FACTORIES FOR TESTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create mock orchestrator for testing
 * @param {Object} options - Mock options
 * @returns {Function} Mock orchestrator function
 */
function createMockOrchestrator(options = {}) {
  const {
    specialistAnalyses = null,
    arcs = null,
    shouldFail = false,
    errorMessage = 'Mock orchestrator error'
  } = options;

  return async (state, config) => {
    if (shouldFail) {
      return {
        narrativeArcs: [],
        _arcAnalysisCache: { _error: errorMessage },
        errors: [{
          phase: PHASES.ARC_SYNTHESIS,
          type: 'orchestrator-failed',
          message: errorMessage,
          timestamp: new Date().toISOString()
        }],
        currentPhase: PHASES.ERROR
      };
    }

    const mockSpecialistAnalyses = specialistAnalyses || {
      financial: {
        accountPatterns: [{ description: 'Shell company pattern', confidence: 'high' }],
        timingClusters: [],
        suspiciousFlows: [{ description: 'Unusual transfer timing', confidence: 'medium' }],
        financialConnections: []
      },
      behavioral: {
        characterDynamics: [{ description: 'Alliance shift observed', confidence: 'high' }],
        behaviorCorrelations: [],
        zeroFootprintCharacters: [],
        behavioralInsights: []
      },
      victimization: {
        victims: [{ description: 'Primary victim identified', confidence: 'high' }],
        operators: [],
        selfBurialPatterns: [],
        targetingInsights: []
      }
    };

    const mockArcs = arcs || [
      {
        title: 'Mock Arc 1',
        summary: 'A mock narrative arc for testing',
        keyEvidence: ['evidence-1'],
        characterPlacements: {},
        emotionalHook: 'Mock emotional hook',
        playerEmphasis: 'high',
        storyRelevance: 'critical'
      }
    ];

    return {
      specialistAnalyses: mockSpecialistAnalyses,
      narrativeArcs: mockArcs,
      _arcAnalysisCache: {
        synthesizedAt: new Date().toISOString(),
        specialistDomains: Object.keys(mockSpecialistAnalyses),
        arcCount: mockArcs.length
      },
      currentPhase: PHASES.ARC_SYNTHESIS,
    };
  };
}

// Commit 8.xx: Removed deprecated createMockSpecialist and createMockSynthesizer
// Use createMockOrchestrator instead

module.exports = {
  // Commit 8.15: Player-focus-guided architecture (preferred)
  analyzeArcsPlayerFocusGuided: traceNode(analyzeArcsPlayerFocusGuided, 'analyzeArcsPlayerFocusGuided', {
    stateFields: ['playerFocus', 'evidenceBundle']
  }),

  // Revision node - uses previous output context for targeted fixes (DRY)
  reviseArcs: traceNode(reviseArcs, 'reviseArcs', {
    stateFields: ['_previousArcs', 'validationResults']
  }),

  // Programmatic validation node
  validateArcStructure: traceNode(validateArcStructure, 'validateArcStructure', {
    stateFields: ['narrativeArcs']
  }),

  // Mock factory (Commit 8.8)
  createMockOrchestrator,

  // The writers' builders the judges share, by name (final fix wave): the one rule
  // for "has an interweaving plan", and the arc writer's evidence summary (its
  // valid-id list and buried transactions).
  hasInterweavingPlan,
  extractEvidenceSummary,
  // The arc writer's director-notes label, which the arc judge prints too.
  ARC_NOTES_LABEL,

  // Export for testing
  _testing: {
    // Commit 8.28: Split-call architecture
    buildCoreArcPrompt,
    buildInterweavingPrompt,
    coreArcSystemPrompt,
    interweavingSystemPrompt,
    generateCoreArcs,
    enrichWithInterweaving,
    mergeArcsWithInterweaving,
    createDefaultInterweaving,
    createDefaultInterweavingPlan,
    extractPlayerFocusContext,
    extractEvidenceSummary,  // Used by current code
    buildOutputFormatSection,
    CORE_ARC_SYSTEM_PROMPT,
    CORE_ARC_SCHEMA,
    INTERWEAVING_SYSTEM_PROMPT,
    INTERWEAVING_SCHEMA,

    // Commit 8.15: Player-focus-guided schema (used by revision flow)
    PLAYER_FOCUS_GUIDED_SCHEMA,

    // Revision path prompt builder (for director-notes enrichment testing)
    buildArcRevisionPrompt,
    getArcRevisionSystemPrompt,
    buildCharacterCategoriesBlock,
    // Brief 2.2: standing notes at the arc stop
    buildArcStandingNotes,
    // Brief 2.3: the arc reworker is built from the writer's sections
    buildCoreArcSections,
    ARC_REVISION_RULES,
    hasInterweavingPlan,
    buildArcReworkOutputAddendum,
    // Phase 3 (3.3): the rework rules and schema by theme
    arcRevisionRules,
    arcReworkSchema
  }
};

// Self-test when run directly
if (require.main === module) {
  console.log('Arc Specialist Nodes Self-Test (Commit 8.8)\n');

  // Test with mock orchestrator
  const mockOrchestrator = createMockOrchestrator();

  const mockState = {
    sessionId: 'self-test',
    evidenceBundle: { exposed: [], buried: [], context: [] },
    preprocessedEvidence: { items: [{ id: 'test-1' }] },
    playerFocus: {
      primaryInvestigation: 'Who is the Valet?',
      whiteboard: { title: 'MARCUS BLACKWOOD IS DEAD', suspects: ['Victoria', 'Morgan'] }
    },
    sessionConfig: { roster: ['Alex', 'Victoria', 'Morgan'] }
  };

  const mockConfig = {};

  console.log('Testing mock orchestrator...');

  mockOrchestrator(mockState, mockConfig).then(result => {
    console.log('Specialist analyses:', Object.keys(result.specialistAnalyses || {}));
    console.log('Arcs synthesized:', result.narrativeArcs?.length);
    console.log('First arc title:', result.narrativeArcs?.[0]?.title);
    console.log('\nSelf-test complete.');
  }).catch(err => {
    console.error('Self-test failed:', err.message);
    process.exit(1);
  });
}

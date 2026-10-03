/**
 * The arc stage's nodes (phase 4, brief 4.4; spec
 * docs/superpowers/specs/2026-10-02-story-meeting-and-map.md sections 4.1, 4.2, 4.5 and 10).
 *
 * The arc writer writes one weave, the story the article will tell, in one call
 * (analyzeArcsPlayerFocusGuided); code checks it (validateArcStructure, lib/weave.js
 * checkWeave); the fact check scores the truth criteria and marks the weave it judged
 * (evaluator-nodes.js); and the arc rework (reviseArcs) fixes what a check or the fact
 * check found, or acts on the director's note. The director settles the weave at the
 * story meeting, and every later writer works from it.
 *
 * History: the arcs came from parallel specialists (8.12), then one player-focus-guided
 * call (8.15), then a split into the arc call and an interweaving call (8.28). On
 * 0926262 the five arcs ran to 1,300 to 2,100 words each, the interweaving call wrote
 * links the arc cards hid, the director's read of the session was filed as a caveat, and
 * the arc judge ran three times. Phase 4 replaces them with the weave: the long
 * write-ups, the interweaving call and the every-player rule at this stage went, and the
 * lens work stays in the writer's reasoning (C16). The detective's arc branches went with
 * them (ruling R1): its theme starts no session until it has its own stages.
 *
 * The graph's node names stay (analyzeArcs, validateArcs, evaluateArcs, reviseArcs), so
 * a thread's stop types and checkpoints keep their names (R3).
 */

const { PHASES } = require('../state');
const { isSdkTimeoutError } = require('../../llm');
// The pure module, not lib/llm's index: several node tests mock lib/llm with a factory.
const { isRefusalError } = require('../../llm/refusal');
const {
  buildValidEvidenceIds,
  getSdkClient,
  getNonRosterPCs,
  buildRevisionContext
} = require('./node-helpers');
const { getThemeNPCs } = require('../../theme-config');
const { traceNode } = require('../../observability');
const { WEAVE_SYSTEM_PROMPT, WEAVE_SCHEMA } = require('../../sdk-client/subagents');
const { renderDirectorEnrichmentBlock, directorTensionSentences } = require('../../prompt-renderers/director-notes-renderer');
const { renderRecordView, recordIdOf } = require('../../prompt-renderers/record-view');
const { withSessionClock } = require('../../prompt-renderers/session-clock');
const { DERIVED_LABELS } = require('../../prompt-renderers/derived-labels');
const { renderArcAccusation, renderWhiteboardConnections } = require('../../prompt-renderers/director-words-renderer');
const { directorAccusationText } = require('../../accusation-verdict');
// rosterWithPronounsSection: the roster with pronouns (phase 3, 3.10; T9), the one
// builder the arc writer and the outline writer print it with.
const { withReportingModeBlock, buildDirectorGuidanceSection, filterGateNotes, rosterWithPronounsSection } = require('../../prompt-builder');
const { loadRuleSet } = require('../../rule-set');
const { WEAVE_QUESTIONS_PROPERTY, weaveQuestionsOf, carriedWeaveQuestions } = require('../../writer-questions');
const {
  WEAVE_ROLES, CONNECTION_KINDS, LEDGER_RECEIPT, WEAVE_CHECKS_SOURCE, FACT_CHECK_MARK_KEY,
  isWeave, weaveForPrompt, weaveKey, weaveWordCount, factCheckMarkOf, isMeetingApproved, checkWeave
} = require('../../weave');

/**
 * The director's standing notes for the arc writer and the arc rework (phase 2, brief
 * 2.2).
 *
 * The same section the outline and article prompts carry, built by the same two
 * functions (prompt-builder.js), with the gate `arc-selection`: the note this rework is
 * acting on is already its HUMAN FEEDBACK and is filtered out; every earlier note
 * stands.
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
 * The arc writer's system prompt, with the session's reporting-mode block (brief 1.5)
 * and the rule set's world and truth rules (phase 3, 3.3): the identity line, the mode
 * block, <world>, <truth-rules>, then the prompt's own text. The call's craft files go
 * in its user prompt.
 *
 * @param {Object} [sessionConfig] - state.sessionConfig, carrying reportingMode
 * @param {string} [theme='journalist'] - state.theme, for the mode block
 * @returns {string}
 */
function weaveSystemPrompt(sessionConfig, theme = 'journalist') {
  return withReportingModeBlock(withRuleSetCore(WEAVE_SYSTEM_PROMPT, 'arc'), sessionConfig, theme);
}

/**
 * A system prompt with the rule set's core (the world, then the truth rules) right
 * after its identity line, where withReportingModeBlock then puts the mode block
 * before it.
 *
 * @param {string} systemPrompt - a prompt whose first line is its identity
 * @param {'arc'} call - the rule set's call
 * @returns {string}
 */
function withRuleSetCore(systemPrompt, call) {
  const identityLine = systemPrompt.split('\n', 1)[0];
  const rest = systemPrompt.slice(identityLine.length).replace(/^\n+/, '');
  return `${identityLine}\n\n${loadRuleSet(call).core}\n\n${rest}`;
}

/**
 * The room's conclusions and the director's words, from state.
 *
 * @param {Object} state - Current workflow state
 * @returns {Object} accusation, whiteboard, the director's prose and its indexes, the
 *   roster and the investigation focus
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
 * The director's words the weave's "from your notes" may quote: the notes, then the
 * input-review corrections.
 *
 * @param {Object} state
 * @returns {string[]}
 */
function directorWordsOf(state) {
  return [
    state.directorNotes && state.directorNotes.rawProse,
    ...(Array.isArray(state.inputReviewCorrections) ? state.inputReviewCorrections : [])
  ].filter(text => typeof text === 'string' && text.trim());
}

// ═══════════════════════════════════════════════════════════════════════════
// THE ARC WRITER'S PROMPT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The arc writer's label for the director's notes (phase 3, brief 3.3): T1's record for
 * the room, and the one mapping T1 does not state, where backstory in the notes falls.
 * Phase 3 (3.10; R12, rule-text read 2 section D): backstory is what Nova knows but the
 * record cannot back, T1's third point, which the label names and does not restate. The
 * writer prints it as its notes heading; the fact check (evaluator-nodes.js) prints it
 * too, so both name the notes in one text.
 */
const ARC_NOTES_LABEL = `The Director's Notes (the record for the room, under T1)
Backstory in the notes, what the director knows about the characters beyond what the session showed, is what Nova knows but the record cannot back: T1's third point.`;

/**
 * The OUTPUT FORMAT line for the weave's questions: the list stays empty unless the
 * record leaves something only the director can settle (C15), then one entry's shape,
 * its kinds and its `about` in the schema's own wording (WEAVE_QUESTIONS_PROPERTY), so
 * the format and the schema say one thing.
 *
 * @returns {string}
 */
function weaveQuestionsFormatLine() {
  const { kind, about } = WEAVE_QUESTIONS_PROPERTY.items.properties;
  return `"questions" stays [] unless the record leaves something only the director can settle (C15). Each entry:
{ "id": "q1", "kind": ${kind.enum.map(value => JSON.stringify(value)).join(' | ')}, "about": ${JSON.stringify(about.description)}, "question": "The question for the director", "changes": "What its answer changes in print" }`;
}

/**
 * The arc writer's OUTPUT FORMAT: the weave's shape with a placeholder in each field,
 * its roles and kinds listed from the schema's constants (lib/weave.js).
 *
 * @returns {string}
 */
function weaveOutputFormat() {
  const alternatives = (values) => values.map(value => JSON.stringify(value)).join(' | ');
  return `## OUTPUT FORMAT

Return one JSON object in this shape:
{
  "story": "The story in one to three plain sentences, in the third person",
  "question": "The question the story carries through the article",
  "headline": "A working headline",
  "fromYourNotes": "The director's own words the story rests on, copied exactly",
  "threads": [
    {
      "id": "t1",
      "claim": "What the thread claims happened, in one plain line in the third person",
      "role": ${alternatives(WEAVE_ROLES)},
      "receipt": "The id of the thread's strongest document from the Receipts list, or ${JSON.stringify(LEDGER_RECEIPT).replace(/"/g, '\\"')}",
      "reason": "For a left-out thread: one line on why the story does not need it",
      "verdict": true
    }
  ],
  "connections": [
    { "id": "c1", "kind": ${alternatives(CONNECTION_KINDS)}, "joins": ["t1", "t2"], "detail": "Where the two threads touch, named exactly" }
  ],
  "convergence": "Where the threads converge and the story lands",
  "strongerMainThread": { "thread": "t2", "reason": "Why it would carry a stronger story, in one line" },
  "questions": []
}

${weaveQuestionsFormatLine()}`;
}

/**
 * The arc writer's task (phase 4, brief 4.4): what the weave holds, field by field. It
 * points at C1 for the story, C16 for the threads, the connections and the convergence,
 * and C15 for the questions, and restates none of them; what it adds is how each rule
 * lands in the weave's fields. The lens work C16 sets out stays in the writer's
 * reasoning: the weave has no field for it.
 */
const WEAVE_TASK = `Write one weave of about 400 words, for the director to read in a few minutes at the story meeting.

- **story** and **question**: the thesis and the question that carries it, as C1 (<craft-story>) sets them out. When the director's notes end with their own read of the session, the story starts from it, and **fromYourNotes** holds the words it rests on: one unbroken passage, copied exactly from the notes or the corrections. When the notes end without a read, the story is your proposal from the record, and fromYourNotes stays out.
- **threads**, **connections** and **convergence**: the weave C16 (<craft-story>) sets out. Every thread you find stays in the weave, each in one line with its role, and a left-out thread gives its one-line reason. Each thread's receipt is the id of its strongest document from the Receipts list, or "${LEDGER_RECEIPT}". The thread that carries the room's verdict has "verdict": true.
- **strongerMainThread**: only when another thread would carry a stronger story as the main thread (C1): that thread's id and the reason, in one line.
- **questions**: C15's (<craft-questions>), each saying what its answer changes in print.`;

/**
 * The three-category character block: the roster, the theme's NPCs, and the game's
 * characters who are not playing this session.
 *
 * Phase 4 (brief 4.4): the every-player line is gone from the ROSTER PCs line. Every
 * player appears by the time the article is written, and the map places each (spec
 * 4.5); the weave holds the threads the story needs.
 *
 * @param {string[]} roster - session roster (first names)
 * @param {string} theme - the session's theme, for its NPCs
 * @param {string[]} allCharacters - every known game character (Notion-derived)
 * @returns {string}
 */
function buildCharacterCategoriesBlock(roster = [], theme = 'journalist', allCharacters = []) {
  const themeNPCs = getThemeNPCs(theme);
  const nonRosterPCs = getNonRosterPCs(roster, allCharacters, themeNPCs);

  return `### Character Categories

**ROSTER PCs** (they were in the room; how Nova learned of them is set by the reporting mode):
${JSON.stringify(roster)}

**NPCs** (the game's own characters, never players):
${themeNPCs.join(', ')}

**NON-ROSTER PCs** (game characters not playing this session):
${nonRosterPCs.length > 0 ? `${nonRosterPCs.join(', ')}\n- A thread names one only through what the record shows of them.` : '(none this session)'}
`;
}

/**
 * The arc writer's user prompt up to its <DIRECTOR_GUIDANCE>: the output format; what
 * the room concluded (the accusation and the director's account of it, the whiteboard
 * reading, the director's notes and corrections and their sentences about Blake and the
 * Valet, the investigation focus, the roster, the character categories, the roster with
 * pronouns and the character context); the record with its morning timeline and the
 * receipts the weave may give; the weave's task; and the rule set's craft files, last,
 * by the placement ruling. The arc rework opens with the same sections (phase 2, 2.3),
 * so whatever the writer reads reaches its rework.
 *
 * @param {Object} state - Current workflow state
 * @returns {string}
 */
function buildWeaveSections(state) {
  const context = extractPlayerFocusContext(state);
  const evidenceSummary = extractEvidenceSummary(state.evidenceBundle || {});
  const allCharacters = Object.keys(state.canonicalCharacters || {});
  const { craft } = loadRuleSet('arc');
  const blakeSentences = directorTensionSentences(state.narrativeTensions, context.directorProse);

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

  return `# The Weave

${weaveOutputFormat()}

---

## SECTION 1: WHAT THE ROOM CONCLUDED

### The Accusation
${renderArcAccusation(context.accusation, directorAccusationText(state), "Players' Reasoning")}

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

${buildCharacterCategoriesBlock(context.roster, state.theme || 'journalist', allCharacters).trimEnd()}

${rosterWithPronounsSection(state.sessionConfig, state.canonicalCharacters)}
${characterContext}
---

## SECTION 2: THE RECORD

The ${evidenceSummary.exposedTokens.length} exposed memories and ${evidenceSummary.exposedPaper.length} paper documents in full, then the morning timeline: every sale, exposure, bonus and transfer, in time order on the morning clock.
${renderRecordView(state.evidenceBundle, { sessionConfig: state.sessionConfig })}

### Receipts
A thread's receipt is one of these document ids, or "${LEDGER_RECEIPT}" for the ledger:
${JSON.stringify(evidenceSummary.allEvidenceIds)}

---

## SECTION 3: THE WEAVE

${WEAVE_TASK}

---

## SECTION 4: CRAFT GUIDANCE

${craft}
`;
}

/**
 * The arc writer's user prompt: its sections, then the director's standing notes, last.
 *
 * @param {Object} state - Current workflow state
 * @returns {string}
 */
function buildWeavePrompt(state) {
  return `${buildWeaveSections(state)}${buildArcStandingNotes(state)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// THE ARC WRITER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The weave a writer or a rework returned, as the state stores it: its fields as the
 * model wrote them, with only the well-formed questions kept.
 *
 * @param {Object} result - the model's output
 * @param {string} who - the call, for the error
 * @returns {Object}
 * @throws {Error} when the output holds no threads
 */
function weaveFromOutput(result, who) {
  if (!isWeave(result) || result.threads.length === 0) {
    throw new Error(`The ${who} returned no threads: its output is not a weave.`);
  }
  return { ...weaveForPrompt(result), questions: weaveQuestionsOf(result.questions) };
}

/**
 * The arc writer's one call: the weave, with the weave's schema.
 *
 * @param {Object} state - Current workflow state
 * @param {Object} config - Graph config with the SDK client
 * @returns {Promise<Object>} the weave
 * @throws {Error} when the call fails or returns no threads
 */
async function generateWeave(state, config) {
  const startTime = Date.now();
  const sdkClient = getSdkClient(config, 'generateWeave');
  const prompt = buildWeavePrompt(state);
  console.log(`[generateWeave] Prompt built: ${prompt.length} characters`);

  const result = await sdkClient({
    prompt,
    systemPrompt: weaveSystemPrompt(state.sessionConfig, state.theme),
    model: 'opus',
    jsonSchema: WEAVE_SCHEMA,
    disableTools: true,  // H21: pure structured output
    label: 'The weave'
  });

  const weave = weaveFromOutput(result, 'weave writer');
  console.log(`[generateWeave] Complete: ${weave.threads.length} threads, ${weaveWordCount(weave)} words, in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  return weave;
}

/**
 * The arc writer's node: one weave in one call (phase 4, brief 4.4).
 *
 * Skips when the thread already holds a weave (a replay). Fails loud (N7): a failed call
 * throws, so the node's retry policy retries a transient failure and a persistent one
 * surfaces against the clean pre-node snapshot for the director's resume. The old arc
 * channels (narrativeArcs, _arcAnalysisCache) are no longer written; they go with their
 * last readers.
 *
 * @param {Object} state - Current state: the evidence bundle, the room's conclusions,
 *   the director's notes, the roster
 * @param {Object} config - Graph config with the SDK client
 * @returns {Promise<Object>} `{weave, _arcReworkTimeout: null, currentPhase}`
 */
async function analyzeArcsPlayerFocusGuided(state, config) {
  if (isWeave(state.weave)) {
    console.log('[analyzeArcs] Skipping: the thread already holds a weave');
    return { currentPhase: PHASES.ARC_SYNTHESIS };
  }
  if (!state.evidenceBundle) {
    throw new Error('Arc analysis failed: the state holds no curated evidence bundle for the weave to read. Roll back to the evidence stop to curate it again.');
  }

  const directorNotes = state.directorNotes || {};
  const whiteboard = state.playerFocus?.whiteboardContext || {};
  console.log(`[analyzeArcs] Writing the weave: ${(directorNotes.rawProse || '').length} chars of notes, whiteboard.regions ${JSON.stringify((whiteboard.regions || []).map(r => r?.label || ''))}, roster ${JSON.stringify(state.sessionConfig?.roster || [])}`);

  try {
    const weave = await generateWeave(state, config);
    return {
      weave,
      _arcReworkTimeout: null,
      currentPhase: PHASES.ARC_SYNTHESIS
    };
  } catch (error) {
    const isTimeout = isSdkTimeoutError(error);
    console.error(`[analyzeArcs] ${isTimeout ? 'Timeout' : 'Error'}:`, error.message);
    // The original stays the cause, so a declined request is still named and still
    // permanent after the re-wrap (retry.js reads the cause chain).
    throw new Error(`Arc analysis failed${isTimeout ? ' (timeout)' : ''}: ${error.message}`, { cause: error });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// THE ARC REWORK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The rules the arc rework's system prompt adds after its writer's, one set per kind of
 * rework (phase 3, brief 3.3; TH7). The first line says why the rework runs and where its
 * task is: on a send back, the director's note in the revision context; on an automatic
 * pass, after a weave check or the fact check, the revision context lists what it found
 * and what the rework fixes. How much of the previous weave a rework keeps is the
 * revision context's to say (buildRevisionContext), once.
 */
const ARC_REVISION_RULES = {
  human: `You are reworking the weave you wrote: the director sent it back, and the director's note in the revision context is the task.

The director knows the game, so a note that corrects a game mechanic (burial attribution, evidence boundaries) corrects every thread it touches, not only the one it names.`,

  evaluator: 'You are reworking the weave you wrote after an automatic check or fact check; the revision context lists what it found and what this rework fixes.'
};

/**
 * The arc rework rules for one kind of rework.
 *
 * @param {boolean} hasHumanFeedback - a send back (true) or an automatic pass
 * @returns {string}
 */
function arcRevisionRules(hasHumanFeedback) {
  return hasHumanFeedback ? ARC_REVISION_RULES.human : ARC_REVISION_RULES.evaluator;
}

/**
 * The arc rework's system prompt: the arc writer's, then the rework rules for this kind
 * of rework (phase 2, 2.3). The writer's brings the mode block, the world and the truth
 * rules.
 *
 * @param {boolean} hasHumanFeedback - Whether the director sent the weave back
 * @param {Object} [sessionConfig] - state.sessionConfig, carrying reportingMode
 * @param {string} [theme] - state.theme; weaveSystemPrompt's default when absent
 * @returns {string}
 */
function getArcRevisionSystemPrompt(hasHumanFeedback = false, sessionConfig = undefined, theme = undefined) {
  return `${weaveSystemPrompt(sessionConfig, theme)}\n\n${arcRevisionRules(hasHumanFeedback)}`;
}

/**
 * The arc rework's task, the last section before the standing notes. It defers to the
 * revision context for what the rework changes and how far (TH7, R23).
 */
const ARC_REWORK_TASK = `## YOUR TASK

Rework the PREVIOUS WEAVE OUTPUT as the revision context above directs, and return the whole weave in the OUTPUT FORMAT at the top.`;

/**
 * The arc rework's prompt (phase 2, 2.3): the arc writer's sections, then the revision
 * block (the revision context, the previous weave, the task), then the standing notes
 * (<DIRECTOR_GUIDANCE>) last.
 *
 * @param {Object} state - Current workflow state
 * @param {string} contextSection - the revision context (buildRevisionContext)
 * @param {string} previousOutputSection - the previous weave (buildRevisionContext)
 * @returns {string}
 */
function buildArcRevisionPrompt(state, contextSection, previousOutputSection) {
  return `${buildWeaveSections(state)}
---

# Weave Rework

${contextSection}

---

${previousOutputSection}

---

${ARC_REWORK_TASK}${buildArcStandingNotes(state)}`;
}

/**
 * The weave a rework returned, as the state stores it:
 * - every question the rework did not answer is kept (carriedWeaveQuestions): an
 *   automatic pass keeps each previous question it left out;
 * - the fact check's mark: the fix (an automatic pass on a weave the fact check judged)
 *   keeps it, counting the fix; a check rework starts from a weave not yet judged, so
 *   there is none to keep; a director's round writes the weave without it, so the
 *   checks and the fact check run again on the new round.
 *
 * @param {Object} result - the rework's output
 * @param {Object} previous - the weave the rework started from
 * @param {{directorRound: boolean}} options
 * @returns {Object}
 */
function weaveFromRework(result, previous, { directorRound }) {
  const weave = {
    ...weaveFromOutput(result, 'arc rework'),
    questions: carriedWeaveQuestions(result && result.questions, previous.questions, { afterDirectorNote: directorRound })
  };
  const mark = directorRound ? null : factCheckMarkOf(previous);
  return mark ? { ...weave, [FACT_CHECK_MARK_KEY]: { ...mark, fixes: (mark.fixes || 0) + 1 } } : weave;
}

/**
 * The arc rework: one pass on the weave, after a failed check, after the fact check
 * found a breach, or on the director's note (`_arcFeedback`). Built from the writer's
 * own sections, with the weave's schema.
 *
 * A rework that times out keeps the weave it started from as a free retry (its counters
 * go back down) and records the timeout in `_arcReworkTimeout`, up to the third timeout
 * in a row, which ends the run in an error. Any other failure keeps the weave and ends
 * the run in an error, which the routing takes to the end.
 *
 * @param {Object} state - Current state: the weave, the findings, the director's note
 * @param {Object} config - Graph config with the SDK client
 * @returns {Promise<Object>} partial state
 */
async function reviseArcs(state, config) {
  const revisionCount = state.arcRevisionCount || 0;
  const previous = state.weave;
  if (!isWeave(previous)) {
    console.error('[reviseArcs] No weave to rework.');
    return {
      _arcFeedback: null,
      errors: [{
        phase: PHASES.ARC_SYNTHESIS,
        type: 'revision-no-previous-output',
        message: 'Cannot rework: the state holds no weave.',
        timestamp: new Date().toISOString()
      }],
      currentPhase: PHASES.ERROR
    };
  }

  const directorRound = Boolean(state._arcFeedback);
  const sdkClient = getSdkClient(config, 'reviseArcs');
  const startTime = Date.now();
  console.log(`[reviseArcs] Starting ${directorRound ? 'the director\'s round' : `automatic pass ${revisionCount}`}`);

  try {
    // Built inside the try, so a throw lands in state as this node's error contract.
    const { contextSection, previousOutputSection } = buildRevisionContext({
      phase: 'arcs',
      outputName: 'weave',
      revisionCount,
      // Brief 2.3: a send back's banner names the round it opens, as the stop shows it.
      round: (state.humanArcRevisionCount || 0) + 1,
      validationResults: state.validationResults,
      previousOutput: weaveForPrompt(previous),
      humanFeedback: state._arcFeedback || null,
      theme: state.theme
    });
    const result = await sdkClient({
      prompt: buildArcRevisionPrompt(state, contextSection, previousOutputSection),
      systemPrompt: getArcRevisionSystemPrompt(directorRound, state.sessionConfig, state.theme),
      model: 'opus',
      jsonSchema: WEAVE_SCHEMA,
      disableTools: true,
      label: `Arc revision ${revisionCount}`
    });

    const weave = weaveFromRework(result, previous, { directorRound });
    console.log(`[reviseArcs] Complete: ${weave.threads.length} threads, ${weaveWordCount(weave)} words, in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    return {
      weave,
      _arcFeedback: null,
      _arcReworkTimeout: null,
      currentPhase: PHASES.ARC_SYNTHESIS
    };
  } catch (error) {
    // A declined request is never the free timeout retry below, whatever words its
    // explanation carries: it would be declined again.
    const isTimeout = !isRefusalError(error) && error.message?.includes('timeout') && error.message?.includes('limit');
    const consecutive = ((state._arcReworkTimeout && state._arcReworkTimeout.consecutive) || 0) + 1;
    if (isTimeout && consecutive < 3) {
      console.warn(`[reviseArcs] Timeout ${consecutive}/2: keeping the weave as a free retry`);
      return {
        _arcFeedback: state._arcFeedback,  // kept for the retry: the director's intent is not lost
        _arcReworkTimeout: { consecutive, attempt: revisionCount, at: new Date().toISOString() },
        arcRevisionCount: Math.max(0, (state.arcRevisionCount || 1) - 1),
        humanArcRevisionCount: Math.max(0, (state.humanArcRevisionCount || 1) - 1),
        currentPhase: PHASES.ARC_SYNTHESIS
      };
    }

    console.error('[reviseArcs] Error:', error.message);
    return {
      _arcFeedback: null,
      _arcReworkTimeout: null,
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

// ═══════════════════════════════════════════════════════════════════════════
// THE RECORD'S IDS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The record's documents and sales, with every id a document is cited by.
 *
 * @param {Object} evidenceBundle - Curated evidence bundle
 * @returns {Object} the exposed memories and documents, and `allEvidenceIds`, the ids a
 *   receipt may name
 */
function extractEvidenceSummary(evidenceBundle) {
  const exposed = evidenceBundle?.exposed || {};

  // Ids follow the record view's rule (brief 2.1), so the list names each document by
  // the id its <document> tag carries.
  const exposedTokens = (exposed.tokens || []).map(t => ({
    id: recordIdOf(t),
    owner: t.owner || t.ownerLogline,
    summary: t.summary,
    characterRefs: t.characterRefs || [],
    timeline: t.temporalContext || 'party-night'
  }));

  // A rescued item has no `id`: it is named by its Notion id, as in the view.
  const exposedPaper = (exposed.paperEvidence || []).map(p => ({
    id: recordIdOf(p) || p.name,
    name: p.name,
    summary: p.summary || p.description?.substring(0, 200),
    characterRefs: p.characterRefs || [],
    timeline: p.temporalContext || 'BACKGROUND'
  }));

  return {
    exposedTokens,
    exposedPaper,
    // The exposed documents only: a buried sale is the ledger's, which a receipt names
    // as "ledger".
    allEvidenceIds: [
      ...exposedTokens.map(t => t.id),
      ...exposedPaper.map(p => p.id)
    ].filter(Boolean)
  };
}

/**
 * Whether an interweaving plan says anything: an order, a convergence point or a
 * callback. The one rule the outline judge reads a stored plan by (phase 2 final fix
 * wave). The arc stage writes no plan since phase 4 (brief 4.4); the rule goes with the
 * outline judge.
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

// ═══════════════════════════════════════════════════════════════════════════
// THE WEAVE CHECKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The weave checks' node (phase 4, brief 4.4; spec 4.5): code checks the weave the
 * writer wrote (lib/weave.js checkWeave), free, before the fact check.
 *
 * Writes validationResults on every outcome, stamped for the weave it checked (`phase`
 * and `weaveKey`), with each failure as one line that names the defect and its fix; a
 * rework reads them under the checks' own label (node-helpers.js CODE_CHECKS). Writes
 * `_arcValidation`, which the routing reads and the meeting shows: a check still failing
 * when the stop opens is kept there. Player coverage left this stage: the map places
 * every player.
 *
 * Once the meeting is approved it checks nothing and writes nothing, so a replay past
 * the meeting leaves a later stage's findings in validationResults as they were.
 *
 * @param {Object} state - Current state: the weave, the evidence bundle, the director's words
 * @returns {Object} partial state
 */
function validateArcStructure(state) {
  if (isMeetingApproved(state)) {
    console.log('[validateArcs] Skipping: the story meeting is approved');
    return {};
  }
  const weave = state.weave;
  const failures = checkWeave(weave, {
    recordIds: buildValidEvidenceIds(state.evidenceBundle),
    directorWords: directorWordsOf(state)
  });
  const key = weaveKey(weave);
  const passed = failures.length === 0;
  const words = weaveWordCount(weave);
  console.log(`[validateArcs] ${passed ? 'Passed' : `Failed: ${failures.map(f => f.type).join(', ')}`} (${words} words, weave ${key})`);

  return {
    _arcValidation: {
      weaveKey: key,
      passed,
      failures,
      words,
      checkedAt: new Date().toISOString()
    },
    validationResults: {
      phase: 'arcs',
      source: WEAVE_CHECKS_SOURCE,
      weaveKey: key,
      passed,
      ready: passed,
      structuralPassed: passed,
      structuralIssues: failures.map(f => f.message)
    }
  };
}

module.exports = {
  // The arc writer: one weave in one call (phase 4, brief 4.4)
  analyzeArcsPlayerFocusGuided: traceNode(analyzeArcsPlayerFocusGuided, 'analyzeArcsPlayerFocusGuided', {
    stateFields: ['playerFocus', 'evidenceBundle']
  }),

  // The arc rework: a check rework, the fact check's fix, or the director's round
  reviseArcs: traceNode(reviseArcs, 'reviseArcs', {
    stateFields: ['weave', 'validationResults']
  }),

  // The weave checks
  validateArcStructure: traceNode(validateArcStructure, 'validateArcStructure', {
    stateFields: ['weave']
  }),

  // Shared by name: the one rule for "has an interweaving plan" (the outline judge
  // reads a stored plan by it), the record's ids, and the director's-notes label the
  // fact check prints too.
  hasInterweavingPlan,
  extractEvidenceSummary,
  ARC_NOTES_LABEL,

  // Export for testing
  _testing: {
    weaveSystemPrompt,
    buildWeavePrompt,
    buildWeaveSections,
    generateWeave,
    weaveFromOutput,
    weaveFromRework,
    extractPlayerFocusContext,
    extractEvidenceSummary,
    buildArcRevisionPrompt,
    getArcRevisionSystemPrompt,
    arcRevisionRules,
    ARC_REVISION_RULES,
    ARC_REWORK_TASK,
    WEAVE_TASK,
    buildCharacterCategoriesBlock,
    buildArcStandingNotes,
    hasInterweavingPlan,
    directorWordsOf
  }
};

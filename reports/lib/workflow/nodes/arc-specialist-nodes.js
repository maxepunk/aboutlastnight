/**
 * The arc stage's nodes (phase 4, brief 4.4; spec
 * docs/superpowers/specs/2026-10-02-story-meeting-and-map.md sections 4.1, 4.2, 4.5 and 10).
 *
 * The arc writer writes one weave, the story the article will tell, in one call
 * (analyzeArcsPlayerFocusGuided); code checks it (validateArcStructure, lib/weave.js
 * checkWeave); the fact check scores the truth criteria and marks the weave it judged
 * (evaluator-nodes.js); and the arc rework (reviseArcs) fixes what a check or the fact
 * check found. The director settles the weave at the story meeting, and every later
 * writer works from it.
 *
 * The story meeting (brief 4.5): the director's round, a reweave or a send-back, marked
 * explicitly (`_meetingRound`), is the rework's too. A reweave fits the director's changes
 * in and keeps every line they did not touch; a send-back rethinks the weave as the note
 * asks. Code holds every pass but a send-back to the director's edits, keeps every answer
 * with its question, and keeps the writer's last weave as the meeting's baseline. The
 * checks read only the writer's text (R11): the director's share of the weave is never a
 * check's failure, and a check that finds a fault in it files a concern for the meeting.
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

const { PHASES, stopRoundOf } = require('../state');
const { CHECKPOINT_TYPES } = require('../checkpoint-helpers');
const { isSdkTimeoutError } = require('../../llm');
// The pure module, not lib/llm's index: several node tests mock lib/llm with a factory.
const { isRefusalError } = require('../../llm/refusal');
const {
  buildValidEvidenceIds,
  getSdkClient,
  getNonRosterPCs,
  buildRevisionContext
} = require('./node-helpers');
// Brief 4.13: the weave writer's and its reworks' identity lines are the theme's.
const { getThemeNPCs, identityLineOf } = require('../../theme-config');
const { traceNode } = require('../../observability');
const { WEAVE_SYSTEM_PROMPT, WEAVE_SCHEMA } = require('../../sdk-client/subagents');
const { renderDirectorEnrichmentBlock, directorTensionSentences } = require('../../prompt-renderers/director-notes-renderer');
const { renderRecordView, recordIdOf } = require('../../prompt-renderers/record-view');
const { withSessionClock } = require('../../prompt-renderers/session-clock');
const { DERIVED_LABELS } = require('../../prompt-renderers/derived-labels');
const { renderArcAccusation, renderWhiteboardConnections } = require('../../prompt-renderers/director-words-renderer');
const { directorAccusationText } = require('../../accusation-verdict');
// rosterWithPronounsSection: the roster with pronouns (phase 3, 3.10; T9), the one
// builder the arc writer and the outline writer print it with. systemPromptOpening: the
// opening every writer's and judge's system prompt shares (brief 4.13b).
const { systemPromptOpening, buildDirectorGuidanceSection, filterGateNotes, rosterWithPronounsSection } = require('../../prompt-builder');
const { loadRuleSet } = require('../../rule-set');
const { WEAVE_QUESTIONS_PROPERTY, weaveQuestionsOf, carriedWeaveQuestions, withoutAnswers } = require('../../writer-questions');
const {
  WEAVE_ROLES, CONNECTION_KINDS, LEDGER_RECEIPT, WEAVE_CHECKS_SOURCE, FACT_CHECK_MARK_KEY, MEETING_ROUNDS, STRUCK_KEY,
  isWeave, weaveForPrompt, weaveKey, weaveWordCount, factCheckMarkOf, isMeetingApproved, meetingRoundOf,
  weaveFindings, withStruckConnections
} = require('../../weave');
const {
  carriedEdits, settleEdits, weaveDirectorsShare, directorEditConcern, isStrike, SEND_BACK_PASS, REWEAVE_PASS
} = require('../../hand-edit-diff');
// Brief 4.5: a send-back that carries the director's edits asks for the list of those it
// changed, as the outline's and the article's send-backs do (F1): one schema rule, one strip.
const { reworkSchemaWithChangedEdits, takeChangedEdits } = require('./ai-nodes');

/**
 * The director's standing notes for the arc writer and the arc rework (phase 2, brief
 * 2.2).
 *
 * The same section the outline and article prompts carry, built by the same two
 * functions (prompt-builder.js), with the gate `arc-selection`: on the director's round
 * (brief 4.5, by its mark) the round's note is already its HUMAN FEEDBACK and is filtered
 * out; every other note stands.
 *
 * @param {Object} state
 * @returns {string} '\n\n<DIRECTOR_GUIDANCE>...' or '' when there are no notes
 */
function buildArcStandingNotes(state) {
  const actingOn = meetingRoundOf(state) ? (state._arcFeedback || null) : null;
  const notes = filterGateNotes(state.directorGateNotes || [], actingOn, 'arc-selection');
  const section = buildDirectorGuidanceSection(notes);
  return section ? `\n\n${section}` : '';
}

/**
 * The arc writer's system prompt: its opening (lib/prompt-builder.js systemPromptOpening;
 * brief 4.13b), the theme's identity line, the session's reporting-mode block (brief 1.5),
 * <world> and <truth-rules> from the theme's rules folder (phase 3, 3.3; R14), then the
 * prompt's own text. The call's craft files go in its user prompt.
 *
 * @param {Object} [sessionConfig] - state.sessionConfig, carrying reportingMode
 * @param {string} [theme='journalist'] - state.theme: its identity line, mode block and rules
 * @returns {string}
 */
function weaveSystemPrompt(sessionConfig, theme = 'journalist') {
  return `${systemPromptOpening(theme, 'arc', sessionConfig)}\n\n${WEAVE_SYSTEM_PROMPT}`;
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
 * The arc writer's task (phase 4, briefs 4.4 and 4.5; ruling 10): which field holds what.
 * C1 states the story, its question and the stronger main thread; C16 the threads, their
 * roles, the connections and the convergence; C15 the questions. The task points at them
 * and states only what no rule says: where each lands in the weave's fields, the words
 * "from your notes" holds, the verdict flag, the receipt's source, and the shape of the
 * stronger main thread. The lens work C16 sets out stays in the writer's reasoning: the
 * weave has no field for it.
 */
const WEAVE_TASK = `Write one weave of about 400 words, for the director to read in a few minutes at the story meeting. C1 (<craft-story>) sets out the story, its question and the stronger main thread; C16 (<craft-story>) sets out the threads, their roles, the connections and the convergence. The fields hold them:

- **story**, **question** and **headline**: the thesis, the question that carries it, and a working headline.
- **fromYourNotes**: when the story starts from the director's read (C1), the words it rests on: one unbroken passage, copied exactly from the notes or the corrections. A story from the record rests on no words of the director's, and the field stays out.
- **threads**: every thread you find, each in its role, a left-out thread with its one line on why in **reason**. A thread's **receipt** is the id of its strongest document from the Receipts list, or "${LEDGER_RECEIPT}". The thread that carries the room's verdict has "verdict": true.
- **connections** and **convergence**: as C16 names them.
- **strongerMainThread**: when you see a stronger main thread (C1), its id as "thread" and your one-line reason as "reason".
- **questions**: C15's (<craft-questions>), each with what its answer changes in print as "changes".`;

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
 * by the placement ruling, from the theme's rules folder (R14). The arc rework opens with
 * the same sections (phase 2, 2.3), so whatever the writer reads reaches its rework.
 *
 * @param {Object} state - Current workflow state
 * @returns {string}
 */
function buildWeaveSections(state) {
  const context = extractPlayerFocusContext(state);
  const evidenceSummary = extractEvidenceSummary(state.evidenceBundle || {});
  const allCharacters = Object.keys(state.canonicalCharacters || {});
  const { craft } = loadRuleSet('arc', { theme: state.theme || 'journalist' });
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

/** Connections with no strike on any: the strike is the director's key alone (R12). */
function withoutStrikes(connections) {
  return connections.map((connection) => {
    if (!connection || typeof connection !== 'object' || !(STRUCK_KEY in connection)) return connection;
    const { [STRUCK_KEY]: _struck, ...live } = connection;
    return live;
  });
}

/**
 * The weave a writer or a rework returned, as the state stores it: its fields as the
 * model wrote them, with only the well-formed questions kept, and without the director's
 * keys (R12; brief 4.5b). An `answer` on a question and `struck` on a connection are
 * written only by the director at the meeting: WEAVE_SCHEMA leaves extra keys open, and a
 * model-written answer would show at the meeting as answered and print in the settled
 * weave as the director's words, and a model-written strike would take a connection out
 * of the story silently.
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
  const weave = weaveForPrompt(result);
  return {
    ...weave,
    ...(Array.isArray(weave.connections) && { connections: withoutStrikes(weave.connections) }),
    questions: withoutAnswers(weaveQuestionsOf(result.questions))
  };
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
 * channels (narrativeArcs, _arcAnalysisCache) are no longer written; they went with their
 * last readers (brief 4.6).
 *
 * @param {Object} state - Current state: the evidence bundle, the room's conclusions,
 *   the director's notes, the roster
 * @param {Object} config - Graph config with the SDK client
 * @returns {Promise<Object>} `{weave, _weaveBaseline, _arcReworkTimeout: null, currentPhase}`:
 *   the weave twice, since the writer's weave is the baseline the story meeting's diffs
 *   start from (brief 4.5)
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
      _weaveBaseline: weave,
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

/** A note may correct how the game works; the correction reaches every thread it touches. */
const NOTE_CORRECTS_A_MECHANIC = 'The director knows the game, so a note that corrects a game mechanic (burial attribution, evidence boundaries) corrects every thread it touches, not only the one it names.';

/**
 * Each kind of arc rework's task, the clause its first line gives after the theme's rework
 * identity (lib/theme-config.js identityLineOf, the call `arc-rework`; brief 4.13): why the
 * rework runs and where its task is (phase 3, brief 3.3; TH7; brief 4.5). On a send-back,
 * the director's note in the revision context; on a reweave, the director's changes the
 * revision context lists; on an automatic pass, after a weave check or the fact check, what
 * the revision context says it found. How much of the previous weave a rework keeps is the
 * revision context's to say (buildRevisionContext), once. Each clause opens with the mark
 * that joins it to the identity.
 */
const ARC_REWORK_CLAUSES = {
  'send-back': ": the director sent it back, and the director's note in the revision context is the task.",
  reweave: ': the director changed it at the story meeting and asked for a reweave, and the revision context lists the changes this rework fits in.',
  automatic: ' after an automatic check or fact check; the revision context lists what it found and what this rework fixes.'
};

/**
 * The rules the arc rework's system prompt adds after its writer's, for one kind of
 * rework, by the story meeting's round mark (brief 4.5; lib/weave.js meetingRoundOf): the
 * theme's rework identity with the rework's task, and on the director's round the line on
 * a note that corrects a game mechanic.
 *
 * @param {'reweave'|'send-back'|null} round - the director's round, or null for an automatic pass
 * @param {string} theme - the theme the rework holds, whose rework identity opens the rules
 * @returns {string}
 * @throws {TypeError} on any other round, such as the old boolean
 * @throws {Error} for a theme with no rework identity line, naming it
 */
function arcRevisionRules(round, theme) {
  if (round !== null && !MEETING_ROUNDS.includes(round)) {
    throw new TypeError(`arcRevisionRules takes the story meeting's round mark: 'reweave', 'send-back' or null (got ${JSON.stringify(round)}).`);
  }
  const line = `${identityLineOf(theme, 'arc-rework')}${ARC_REWORK_CLAUSES[round === null ? 'automatic' : round]}`;
  return round === null ? line : `${line}\n\n${NOTE_CORRECTS_A_MECHANIC}`;
}

/**
 * The arc rework's system prompt: the arc writer's, then the rework rules for this kind
 * of rework (phase 2, 2.3). The writer's brings the theme's identity line, the mode block,
 * the world and the truth rules.
 *
 * @param {'reweave'|'send-back'|null} [round=null] - the director's round, by its mark
 * @param {Object} [sessionConfig] - state.sessionConfig, carrying reportingMode
 * @param {string} [theme='journalist'] - state.theme, read by the writer's part and the
 *   rework rules alike (weaveSystemPrompt's default)
 * @returns {string}
 */
function getArcRevisionSystemPrompt(round = null, sessionConfig = undefined, theme = 'journalist') {
  return `${weaveSystemPrompt(sessionConfig, theme)}\n\n${arcRevisionRules(round, theme)}`;
}

/**
 * The arc rework's task, the last section before the standing notes. It defers to the
 * revision context for what the rework changes and how far (TH7, R23).
 */
const ARC_REWORK_TASK = `## YOUR TASK

Rework the PREVIOUS WEAVE OUTPUT as the revision context above directs, and return the whole weave in the OUTPUT FORMAT at the top.`;

/**
 * The task's line on a struck connection's id (brief 4.14a), printed when <HAND_EDITS> lists
 * a connection the director struck. The rework reads the weave without it (lib/weave.js
 * weaveForRework), so its id looks free; a connection the rework adds under it is another
 * connection, which code gives an id of its own (withStruckConnections).
 */
const ARC_REWORK_STRUCK_IDS = 'Each connection <HAND_EDITS> marks struck keeps its id while it stays out of the story: give a connection you add an id that no connection in the PREVIOUS WEAVE OUTPUT or in <HAND_EDITS> holds.';

/**
 * The arc rework's prompt (phase 2, 2.3): the arc writer's sections, then the revision
 * block (the revision context, the previous weave, the task), then the standing notes
 * (<DIRECTOR_GUIDANCE>) last.
 *
 * @param {Object} state - Current workflow state
 * @param {string} contextSection - the revision context (buildRevisionContext)
 * @param {string} previousOutputSection - the previous weave (buildRevisionContext)
 * @param {Object} [options]
 * @param {boolean} [options.struck] - whether the context's <HAND_EDITS> lists a connection
 *   the director struck, so the task says its id stays taken (brief 4.14a)
 * @returns {string}
 */
function buildArcRevisionPrompt(state, contextSection, previousOutputSection, { struck = false } = {}) {
  return `${buildWeaveSections(state)}
---

# Weave Rework

${contextSection}

---

${previousOutputSection}

---

${ARC_REWORK_TASK}${struck ? ` ${ARC_REWORK_STRUCK_IDS}` : ''}${buildArcStandingNotes(state)}`;
}

/**
 * The weave a rework returned, as the state stores it (weaveFromOutput: no answer and no
 * strike the rework wrote):
 * - the questions (carriedWeaveQuestions, briefs 4.5 and 4.5b): every answered question,
 *   its words and the director's answer kept (it may take a new id), and every question the
 *   rework did not answer, whatever kind of rework; an answer the rework wrote is no answer;
 * - the connections the director struck, which the rework never saw (they are out of its
 *   view), back where they sat, still struck (withStruckConnections). The struck connection
 *   itself, returned under its id, comes back live, and code strikes it again (settleEdits),
 *   except on a send-back, which may change an edit; any other connection the rework
 *   returned under a struck id keeps its words and joins under an id of its own, numbered
 *   after every connection id the round has used (brief 4.14a);
 * - the fact check's mark: the fix (an automatic pass on a weave the fact check judged)
 *   keeps it, counting the fix; a check rework starts from a weave not yet judged, so
 *   there is none to keep; a director's round writes the weave without it, so the
 *   checks and the fact check run again on the new round.
 *
 * @param {Object} result - the rework's output
 * @param {Object} previous - the weave the rework started from
 * @param {Object} options
 * @param {boolean} options.directorRound
 * @param {Object|null} [options.roundStart] - the weave the director's round started from
 *   (state `_weaveMarks.from`), when a round ran: its connection ids stay taken
 * @returns {Object}
 */
function weaveFromRework(result, previous, { directorRound, roundStart = null }) {
  const weave = withStruckConnections({
    ...weaveFromOutput(result, 'arc rework'),
    questions: carriedWeaveQuestions(result && result.questions, previous.questions)
  }, weaveForPrompt(previous), { roundStart });
  const mark = directorRound ? null : factCheckMarkOf(previous);
  return mark ? { ...weave, [FACT_CHECK_MARK_KEY]: { ...mark, fixes: (mark.fixes || 0) + 1 } } : weave;
}

/**
 * The arc rework's call for a state, as reviseArcs sends it (brief 4.5): the one place it
 * is built, so scripts/render-prompts.js renders exactly what the node sends, for an
 * automatic pass, a reweave and a send-back alike. The round mark decides the rework's
 * system prompt, its scope (buildRevisionContext) and, on a send-back that carries the
 * director's edits, the schema that asks which edits it changed. A director's round reads
 * no finding from before the round. The version the rework starts from is read with the
 * connections the director struck, which <HAND_EDITS> lists and the rework's own view of
 * the weave leaves out.
 *
 * @param {Object} state - the weave, the findings, the round mark and its note, the
 *   director's standing edits
 * @returns {{meetingRound: string|null, before: Object, edits: Object[], asksForChangedEdits: boolean,
 *            prompt: string, systemPrompt: string, jsonSchema: Object, label: string}}
 */
function arcReworkCall(state) {
  const revisionCount = state.arcRevisionCount || 0;
  const meetingRound = meetingRoundOf(state);
  const directorRound = meetingRound !== null;
  const note = directorRound ? (state._arcFeedback || null) : null;
  const before = weaveForPrompt(state.weave);
  const edits = carriedEdits(state._weaveHandEdits, before);
  const asksForChangedEdits = meetingRound === 'send-back' && edits.length > 0;
  const { contextSection, previousOutputSection } = buildRevisionContext({
    phase: 'arcs',
    outputName: 'weave',
    revisionCount,
    // Brief 2.3: a round's banner names the round it opens, as the stop shows it (task 4.12c:
    // the stop's round, the one rule).
    round: stopRoundOf(CHECKPOINT_TYPES.ARC_SELECTION, state),
    validationResults: directorRound ? null : state.validationResults,
    previousOutput: before,
    handEdits: state._weaveHandEdits,
    humanFeedback: note,
    meetingRound
  });
  return {
    meetingRound,
    before,
    edits,
    asksForChangedEdits,
    prompt: buildArcRevisionPrompt(state, contextSection, previousOutputSection, { struck: edits.some(isStrike) }),
    systemPrompt: getArcRevisionSystemPrompt(meetingRound, state.sessionConfig, state.theme),
    jsonSchema: asksForChangedEdits ? reworkSchemaWithChangedEdits(WEAVE_SCHEMA) : WEAVE_SCHEMA,
    label: `Arc revision ${revisionCount}`
  };
}

/**
 * The arc rework: one pass on the weave, built from the writer's own sections, with the
 * weave's schema (arcReworkCall). An automatic pass runs after a failed check or after
 * the fact check found a breach, and fixes what it found in the writer's text. The
 * director's round (brief 4.5), marked `_meetingRound`, runs on a reweave or a send-back
 * at the story meeting: a reweave fits the director's changes in and keeps every other
 * line; a send-back rethinks the weave as the note asks (TH7) and may change one of the
 * director's edits, saying why (the changed-edits list its schema adds). Neither reads a
 * finding from before the round.
 *
 * Every pass but a send-back is held to the director's standing edits: code puts back
 * each line it changed and strikes again, by id, each struck connection it brought back
 * (lib/hand-edit-diff.js settleEdits), and the round's report (`_weaveHandEditReport`)
 * records each change and each restore. On every pass, a connection the rework returned
 * under a struck connection's id that is not the struck connection keeps its words and
 * joins under an id of its own (weaveFromRework; brief 4.14a), and the task says each struck
 * connection's id stays taken (ARC_REWORK_STRUCK_IDS). The weave a pass leaves is the writer's last
 * weave (`_weaveBaseline`), the meeting's next diffs start from it; a director's round
 * also keeps the version the director left (`_weaveMarks`), from which the meeting reads
 * what the round changed.
 *
 * A rework that times out keeps the weave it started from and gives back only the count
 * its pass raised (ruling 5). An automatic pass is then retried free by the routing. The
 * director's round does not run (ruling 6): the meeting reopens with the director's
 * version, and `_arcReworkTimeout` names the round and its note, which the stop says did
 * not run. The third timeout in a row ends the run in an error, as any other failure
 * does, which the routing takes to the end.
 *
 * @param {Object} state - Current state: the weave, the findings, the round mark and its
 *   note, the director's standing edits
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
      _meetingRound: null,
      errors: [{
        phase: PHASES.ARC_SYNTHESIS,
        type: 'revision-no-previous-output',
        message: 'Cannot rework: the state holds no weave.',
        timestamp: new Date().toISOString()
      }],
      currentPhase: PHASES.ERROR
    };
  }

  const meetingRound = meetingRoundOf(state);
  const directorRound = meetingRound !== null;
  const note = directorRound ? (state._arcFeedback || null) : null;
  const sdkClient = getSdkClient(config, 'reviseArcs');
  const startTime = Date.now();
  console.log(`[reviseArcs] Starting ${directorRound ? `the director's ${meetingRound}` : `automatic pass ${revisionCount}`}`);

  try {
    // Built inside the try, so a throw lands in state as this node's error contract.
    const call = arcReworkCall(state);
    const result = await sdkClient({
      prompt: call.prompt,
      systemPrompt: call.systemPrompt,
      model: 'opus',
      jsonSchema: call.jsonSchema,
      disableTools: true,
      label: call.label
    });

    const { output, reasons } = takeChangedEdits(result);
    let pass = revisionCount;
    if (meetingRound === 'send-back') pass = SEND_BACK_PASS;
    else if (meetingRound === 'reweave') pass = REWEAVE_PASS;
    const settled = settleEdits(state._weaveHandEditReport, {
      edits: call.edits,
      before: call.before,
      // Brief 4.14a: the weave the round started from keeps its connection ids taken, so a
      // connection the fix adds after a round is never marked as one the round changed.
      after: weaveFromRework(output, previous, { directorRound, roundStart: (state._weaveMarks && state._weaveMarks.from) || null }),
      pass,
      reasons: call.asksForChangedEdits ? reasons : []
    });
    const weave = settled.output;
    console.log(`[reviseArcs] Complete: ${weave.threads.length} threads, ${weaveWordCount(weave)} words, in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    return {
      weave,
      _weaveBaseline: weaveForPrompt(weave),
      _weaveHandEditReport: settled.report,
      ...(directorRound && { _weaveMarks: { round: meetingRound, from: call.before, at: new Date().toISOString() } }),
      _meetingRound: null,
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
      const at = new Date().toISOString();
      if (directorRound) {
        console.warn(`[reviseArcs] Timeout ${consecutive}/2: the director's ${meetingRound} did not run; the meeting reopens with the director's version`);
        return {
          _meetingRound: null,
          _arcFeedback: null,
          _arcReworkTimeout: { consecutive, attempt: revisionCount, round: meetingRound, note, at },
          humanArcRevisionCount: Math.max(0, (state.humanArcRevisionCount || 1) - 1),
          currentPhase: PHASES.ARC_SYNTHESIS
        };
      }
      console.warn(`[reviseArcs] Timeout ${consecutive}/2: keeping the weave as a free retry`);
      return {
        _arcReworkTimeout: { consecutive, attempt: revisionCount, at },
        arcRevisionCount: Math.max(0, (state.arcRevisionCount || 1) - 1),
        currentPhase: PHASES.ARC_SYNTHESIS
      };
    }

    console.error('[reviseArcs] Error:', error.message);
    return {
      _meetingRound: null,
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

// ═══════════════════════════════════════════════════════════════════════════
// THE WEAVE CHECKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The weave checks' node (phase 4, brief 4.4; spec 4.5): code checks the weave the
 * writer wrote (lib/weave.js weaveFindings), free, before the fact check.
 *
 * Writes validationResults on every outcome, stamped for the weave it checked (`phase`
 * and `weaveKey`), with each failure as one line that names the defect and its fix; a
 * rework reads them under the checks' own label (node-helpers.js CODE_CHECKS). Writes
 * `_arcValidation`, which the routing reads and the meeting shows: a check still failing
 * when the stop opens is kept there. Player coverage left this stage: the map places
 * every player.
 *
 * The checks read only the writer's text (R11, brief 4.5): the director's share of the
 * weave, read from the standing edits it carries, is never a failure. A fault in the
 * director's own change, such as a receipt they typed that names no document, is a
 * concern under the edit's id, kept in `_arcValidation.concerns` for the meeting to show
 * beside the line; no rework reads it.
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
  const directorsShare = weaveDirectorsShare(carriedEdits(state._weaveHandEdits, weaveForPrompt(weave)));
  const { failures, concerns } = weaveFindings(weave, {
    recordIds: buildValidEvidenceIds(state.evidenceBundle),
    directorWords: directorWordsOf(state),
    directorsShare
  });
  const key = weaveKey(weave);
  const passed = failures.length === 0;
  const words = weaveWordCount(weave, directorsShare);
  console.log(`[validateArcs] ${passed ? 'Passed' : `Failed: ${failures.map(f => f.type).join(', ')}`} (${words} words, weave ${key})${concerns.length > 0 ? `, ${concerns.length} concern(s) about the director's changes` : ''}`);

  return {
    _arcValidation: {
      weaveKey: key,
      passed,
      failures,
      concerns: concerns.map(c => directorEditConcern(c.editIds, c.finding)),
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
    stateFields: ['weave', 'validationResults', '_meetingRound']
  }),

  // The weave checks
  validateArcStructure: traceNode(validateArcStructure, 'validateArcStructure', {
    stateFields: ['weave']
  }),

  // Shared by name: the record's ids, and the director's-notes label the fact check
  // prints too. (hasInterweavingPlan went with the outline judge, its last reader:
  // phase 4, brief 4.6.)
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
    arcReworkCall,
    getArcRevisionSystemPrompt,
    arcRevisionRules,
    ARC_REWORK_CLAUSES,
    NOTE_CORRECTS_A_MECHANIC,
    ARC_REWORK_TASK,
    ARC_REWORK_STRUCK_IDS,
    WEAVE_TASK,
    buildCharacterCategoriesBlock,
    buildArcStandingNotes,
    directorWordsOf
  }
};

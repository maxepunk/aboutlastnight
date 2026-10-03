/**
 * Report Generation Graph - Sequential Architecture
 *
 * Assembles the complete LangGraph StateGraph for report generation.
 * Uses native LangGraph interrupt() for human checkpoints with DEDICATED
 * checkpoint nodes (SRP - separate data from checkpoints).
 *
 * Graph Flow (45 nodes - Commit 8.26: SRP checkpoint separation):
 *
 * PHASE 0: Input Parsing (reached from checkpointAwaitContext, not from START)
 * 0.1 parseRawInput → checkpointInputReview [interrupt: input-review]
 *   → [conditional] reparse: back to parseRawInput | forward: 0.2 finalizeInput
 *
 * PHASE 1: Data Acquisition (SEQUENTIAL)
 * 1.1 initializeSession → 1.2 loadDirectorNotes
 *   → fetchMemoryTokens → fetchPaperEvidence
 *
 * NOTE: Data acquisition runs as a single sequential addEdge chain — no parallel
 * branches, no Send() fan-in. The photo chain is NOT here: see PHASE 2.36.
 *
 * PHASE 1.35-1.8: Sequential Checkpoints & Processing
 * → checkpointPaperEvidence [interrupt: paper-evidence-selection]
 * → checkpointAwaitRoster [interrupt: await-roster]
 * → checkpointAwaitContext [interrupt: await-full-context]
 * → parseRawInput → checkpointInputReview [interrupt: input-review]
 * → preprocessEvidence → extractCharacterData → checkpointPreCuration [interrupt: pre-curation]
 * → curateEvidenceBundle → checkpointEvidenceAndPhotos [interrupt: evidence-photos] → processRescuedItems
 *
 * PHASE 2: The weave (phase 4, brief 4.4) and the story meeting (brief 4.5)
 * → analyzeArcs (the arc writer: one weave) → validateArcs (the weave checks)
 * → evaluateArcs (the fact check) → checkpointArcSelection [interrupt: arc-selection,
 *   the story meeting]
 * → [rework loop: one check rework and one fact-check fix per round]
 * The meeting's approve goes forward to the photos; a reweave or a send-back is the
 * director's round: incrementArcRevision → reviseArcs → validateArcs → evaluateArcs,
 * then the meeting again.
 *
 * PHASE 2.36: Photo branch (photo late-join)
 * checkpointArcSelection --forward--> checkpointPhotos [interrupt: photos]
 *   → fetchSessionPhotos → preprocessPhotos → analyzePhotos → detectWhiteboard
 *   → checkpointCharacterIds [interrupt: character-ids] → parseCharacterIds
 *   → finalizePhotoAnalyses → buildArcEvidencePackages
 * (The chain's PHASE numbers — 1.4/1.42/1.43/1.65/1.66/1.665/1.67 — are historical;
 *  they predate the move and are display-only strings.)
 *
 * PHASE 3: Outline Generation
 * → generateOutline → evaluateOutline
 * → checkpointOutline [interrupt: outline] → [revision loop]
 *
 * PHASE 4: Article Generation
 * → generateContentBundle → evaluateArticle
 * → checkpointArticle [interrupt: article] → [revision loop]
 * → validateContentBundle
 *
 * PHASE 5: Assembly
 * → assembleHtml → COMPLETE
 *
 * Checkpoint Pattern (SRP):
 * - Data nodes are PURE (no interrupt calls) - can be called outside LangGraph
 * - Dedicated checkpoint nodes handle interrupt() for human approval
 * - Server resumes with Command({ resume: data })
 *
 * Checkpointing Storage:
 * - MemorySaver for testing (in-memory)
 * - SqliteSaver for production (persistent)
 */

const { StateGraph, START, END, MemorySaver } = require('@langchain/langgraph');
const { ReportStateAnnotation, PHASES, REVISION_CAPS } = require('./state');
const nodes = require('./nodes');
const { isTransientError } = require('../llm/retry');
const { weaveKey, factCheckMarkOf, isWeave, isWeaveJudged, isMeetingApproved, meetingRoundOf } = require('../weave');

// P3.1 — Transient-only auto-retry for LLM-calling nodes.
// initialInterval is MILLISECONDS in @langchain/langgraph 1.0.7 (verified against
// node_modules/@langchain/langgraph/dist/pregel/utils/index.d.ts), so 2000 = 2s.
// retryOn is the FIXED-INTERFACE classifier: rate-limit/5xx/overloaded/timeouts retry;
// auth/permission/invalid-request/StructuredOutputExtractionError throw straight through.
const LLM_RETRY = { retryPolicy: { maxAttempts: 3, initialInterval: 2000, retryOn: isTransientError } };

// ═══════════════════════════════════════════════════════════════════════════
// ROUTING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

// NOTE: routeEntryPoint removed - simplified to single incremental flow
// START always goes directly to initializeSession
// parseRawInput runs after checkpointAwaitContext (not at entry)

// ═══════════════════════════════════════════════════════════════════════════
// NOTE: Approval-based routing functions removed in interrupt() migration
// (routeInputReview, routePaperEvidenceSelection, routeCharacterIdCheckpoint,
//  routePreCurationCheckpoint, routeEvidenceApproval)
// Checkpoints now use native LangGraph interrupt() in nodes themselves.
// See lib/workflow/checkpoint-helpers.js for the new pattern.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Route after the weave's fact check (phase 4, brief 4.4; R6): a breach the fact check
 * found gets its one fix, and then the story meeting's stop opens with no second judge
 * call. The fact check's mark on the weave (lib/weave.js) says what it found and how
 * many fixes have run; an approved meeting, a weave with no breach, and a weave already
 * fixed go to the stop.
 *
 * @param {Object} state - Current graph state
 * @returns {string} 'checkpoint', 'revise', or 'error'
 */
function routeArcEvaluation(state) {
  if (state.currentPhase === PHASES.ERROR) {
    return 'error';
  }
  const mark = factCheckMarkOf(state.weave);
  if (!isMeetingApproved(state) && mark && mark.ready === false && (mark.fixes || 0) < REVISION_CAPS.ARCS) {
    console.log('[routeArcEvaluation] The fact check found a breach: one automatic fix');
    return 'revise';
  }
  return 'checkpoint';
}

/**
 * Route function for outline evaluation results
 * @param {Object} state - Current graph state
 * @returns {string} 'checkpoint', 'revise', or 'error'
 */
function routeOutlineEvaluation(state) {
  if (state.currentPhase === PHASES.ERROR) {
    return 'error';
  }

  const evalHistory = state.evaluationHistory || [];
  const phaseEvals = evalHistory.filter(e => e.phase === 'outline');
  const lastEval = phaseEvals[phaseEvals.length - 1];
  const atCap = (state.outlineRevisionCount || 0) >= REVISION_CAPS.OUTLINE;

  if (lastEval?.ready || atCap) {
    return 'checkpoint';
  }

  return 'revise';
}

/**
 * Route function for article evaluation results
 * @param {Object} state - Current graph state
 * @returns {string} 'checkpoint', 'revise', or 'error'
 */
function routeArticleEvaluation(state) {
  if (state.currentPhase === PHASES.ERROR) {
    return 'error';
  }

  const evalHistory = state.evaluationHistory || [];
  const phaseEvals = evalHistory.filter(e => e.phase === 'article');
  const lastEval = phaseEvals[phaseEvals.length - 1];
  const atCap = (state.articleRevisionCount || 0) >= REVISION_CAPS.ARTICLE;

  if (lastEval?.ready || atCap) {
    return 'checkpoint';
  }

  return 'revise';
}

/**
 * Route function after outline human checkpoint
 * Approve → forward to content generation
 * Reject → revision loop (outlineApproved stays false)
 * @param {Object} state - Current graph state
 * @returns {string} 'forward' or 'revise'
 */
function routeAfterOutlineCheckpoint(state) {
  if (state.outlineApproved) return 'forward';
  return 'revise';
}

/**
 * Route function after article human checkpoint
 * Approve → forward to validation
 * Reject → revision loop (articleApproved stays false)
 * @param {Object} state - Current graph state
 * @returns {string} 'forward' or 'revise'
 */
function routeAfterArticleCheckpoint(state) {
  if (state.articleApproved) return 'forward';
  return 'revise';
}

/**
 * Route after the story meeting's stop (brief 4.5): three outcomes. An approved meeting
 * goes forward to the photos; a reweave and a send-back, the director's rounds, go to the
 * rework. A stop with neither (a resume the meeting does not know) fails loud.
 *
 * Brief 1.4: the director's rounds are not limited, so there is no cap to force forward
 * at. The forced forward sent an EMPTY selection down the whole paid pipeline on the
 * fourth send back.
 *
 * @param {Object} state - Current graph state
 * @returns {string} 'forward' or 'revise'
 */
function routeAfterArcCheckpoint(state) {
  if (isMeetingApproved(state)) return 'forward';
  if (meetingRoundOf(state)) return 'revise';
  throw new Error('[routeAfterArcCheckpoint] The story meeting holds neither an approval nor a round: it takes approve, reweave or send-back.');
}

// NOTE: routeOutlineValidation and routeArticleValidation removed in Commit 8.23
// Programmatic validation was too brittle (checked form, not substance)
// Trust Opus evaluators for quality judgment instead

/**
 * Route function after the input-review checkpoint (CODE-REVIEW B2/B8)
 *
 * The director either approves the parse (forward) or rejects it with written
 * corrections (reparse). checkpointInputReview nulls the parse outputs on a
 * reject, so parseRawInput actually re-runs; it consumes and clears
 * _inputCorrections, so the loop terminates at the next gate.
 *
 * Anything else — including a reject with blank feedback — forwards, because a
 * 'reparse' with nothing to correct would spin.
 *
 * @param {Object} state - Current graph state
 * @returns {string} 'reparse' or 'forward'
 */
function routeAfterInputReview(state) {
  const corrections = state._inputCorrections;
  if (typeof corrections === 'string' && corrections.trim()) {
    console.log('[routeAfterInputReview] Corrections supplied — re-parsing input');
    return 'reparse';
  }
  return 'forward';
}

/**
 * Route function for schema validation
 * @param {Object} state - Current graph state
 * @returns {string} 'error' or 'continue'
 */
function routeSchemaValidation(state) {
  // Check currentPhase set by validateContentBundle, not accumulated errors.
  // errors uses append reducer so old schema-validation errors persist across retries.
  return state.currentPhase === PHASES.ERROR ? 'error' : 'continue';
}

/**
 * Route after the weave checks (phase 4, brief 4.4; R6): a failed check sends a weave
 * the fact check has not judged back for one rework in the round, before the fact check
 * runs. Everything else goes on to the fact check's node, which skips a judged weave and
 * an approved meeting: a passing weave, a check still failing after its rework (kept for
 * the meeting to show), a judged weave, and a check result stamped for another weave. A
 * rework that failed ends the run in an error.
 *
 * @param {Object} state - Current graph state with _arcValidation
 * @returns {string} 'evaluate', 'revise' or 'error'
 */
function routeArcValidation(state) {
  if (state.currentPhase === PHASES.ERROR) {
    return 'error';
  }
  const check = state._arcValidation;
  const failedOnThisWeave = Boolean(check && check.passed === false && isWeave(state.weave) && check.weaveKey === weaveKey(state.weave));
  if (!failedOnThisWeave || isMeetingApproved(state) || isWeaveJudged(state.weave)) {
    return 'evaluate';
  }
  if ((state.arcRevisionCount || 0) >= REVISION_CAPS.ARCS) {
    console.log('[routeArcValidation] A check still fails after the round\'s rework: on to the fact check, the failure kept for the meeting');
    return 'evaluate';
  }
  console.log(`[routeArcValidation] A check failed (${(check.failures || []).map(f => f.type).join(', ')}): one rework`);
  return 'revise';
}

// NOTE: routeArcSelectionApproval, routeOutlineApproval, routeArticleApproval
// removed in interrupt() migration. See checkpoint-helpers.js.

// ═══════════════════════════════════════════════════════════════════════════
// NOTE: Checkpoint-setting nodes removed in interrupt() migration
// (setPaperEvidenceCheckpoint, setCharacterIdCheckpoint, setPreCurationCheckpoint,
//  setArcSelectionCheckpoint, setOutlineCheckpoint, setArticleCheckpoint)
//
// Checkpoints now use native LangGraph interrupt() directly in content nodes.
// Skip logic moved into checkpointInterrupt() helper in checkpoint-helpers.js.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Count one more pass on the weave (phase 4, brief 4.4).
 *
 * A reweave or a send-back opens a round of the director's (briefs 1.4 and 4.5): it
 * spends no automated budget, and the automatic count starts over. Its round mark
 * (`_meetingRound`), never the note's presence, says the pass is the director's, so a
 * reweave with no note is a round too. An automatic pass, a check rework or the fact
 * check's fix, counts toward the round. The weave stays where it is: the rework reads it
 * as the version it starts from. No history stub is needed, since the fact check skips by
 * its mark on the weave, which the rework of a director's round writes without
 * (lib/weave.js).
 */
async function incrementArcRevision(state) {
  const round = meetingRoundOf(state);
  const isHumanDriven = round !== null;
  const newEvalCount = isHumanDriven
    ? 0
    : (state.arcRevisionCount || 0) + 1;
  const newHumanCount = isHumanDriven
    ? (state.humanArcRevisionCount || 0) + 1
    : (state.humanArcRevisionCount || 0);
  const kind = isHumanDriven ? `the director's ${round}` : (isWeaveJudged(state.weave) ? "the fact check's fix" : 'a check rework');

  console.log(`[incrementArcRevision] count=${newEvalCount}, humanCount=${newHumanCount}, ${kind}`);

  return {
    arcRevisionCount: newEvalCount,
    humanArcRevisionCount: newHumanCount
  };
}

/**
 * What triggered this automated pass, for the history stub the trace reads: the
 * programmatic check or the evaluation. The last record for the phase says which —
 * only the fact-check branch of evaluatePhase stamps `source: 'fact-check'`.
 *
 * @param {Object} state - Current graph state
 * @param {string} phase - 'outline' or 'article'
 * @returns {string} 'fact-check' or 'evaluator'
 */
function automatedRevisionSource(state, phase) {
  const phaseEvals = (state.evaluationHistory || []).filter(e => e?.phase === phase);
  const lastEval = phaseEvals[phaseEvals.length - 1];
  return lastEval?.source === 'fact-check' ? 'fact-check' : 'evaluator';
}

/**
 * The stop's trace after one more automatic pass (phase 2, brief 2.7).
 *
 * Only an increment sees both what the pass starts from and why it runs: the
 * reworker clears `_previousOutline`/`_previousContentBundle` on every exit, and the
 * next evaluation overwrites `validationResults`, so the "why" is copied here before
 * either happens. The findings are read the way buildRevisionContext reads them: a
 * `validationResults` stamped for another phase is not this pass's reason.
 *
 * Entries from another round are dropped as the new one is added. The server already
 * resets the channel on a send back, so this only matters if that reset were ever
 * missed; it keeps the channel at the current round's passes, at most the automated
 * budget of them.
 *
 * @param {Object} state - Current graph state
 * @param {string} phase - 'outline' or 'article'
 * @param {Array|null} trace - the stop's trace channel as it stands
 * @param {Object|null} before - the outline or bundle the rework starts from
 * @param {number} pass - the automated pass number in this round (1-based)
 * @param {number} round - the round number (1-based, as the stop's banner shows it)
 * @param {string} source - automatedRevisionSource's answer
 * @returns {Array} the full trace, for the REPLACE channel
 */
function traceWithPass(state, phase, trace, before, pass, round, source) {
  const vr = state.validationResults;
  const own = vr && typeof vr === 'object' && (!vr.phase || vr.phase === phase) ? vr : null;
  const list = (value) => (Array.isArray(value) ? value.filter(v => typeof v === 'string') : []);
  const entry = {
    pass,
    round,
    trigger: source === 'fact-check' ? 'check' : 'evaluation',
    findings: {
      structuralIssues: list(own?.structuralIssues),
      advisoryWarnings: list(own?.advisoryWarnings),
      criteriaScores: own?.criteriaScores && typeof own.criteriaScores === 'object'
        ? { ...own.criteriaScores }
        : null,
      revisionGuidance: typeof own?.revisionGuidance === 'string' && own.revisionGuidance.trim()
        ? own.revisionGuidance
        : null
    },
    before: before === undefined ? null : before,
    at: new Date().toISOString()
  };
  const thisRound = (Array.isArray(trace) ? trace : []).filter(e => e && e.round === round);
  return [...thisRound, entry];
}

/**
 * Increment outline revision count and preserve/clear outline for regeneration
 * Preserves current outline in _previousOutline for revision context
 * Clears outline so generateOutline skip logic doesn't trigger
 *
 * Brief 1.4: two counters, the way incrementArcRevision has had them. A send back
 * opens a ROUND (never capped) and starts the automated budget over; a failed check
 * or a failed evaluation spends one automated pass inside the current round. The
 * discriminator is the feedback slot, which the server writes on a send back and the
 * reviser clears as it consumes it, so it is present here on the human pass only.
 *
 * Brief 2.7: an automatic pass also adds its entry to `_outlineTrace`. A send-back
 * rework is not an automatic pass and writes nothing there.
 */
async function incrementOutlineRevision(state) {
  const isHumanDriven = !!state._outlineFeedback;
  const newCount = isHumanDriven ? 0 : (state.outlineRevisionCount || 0) + 1;
  const newHumanCount = isHumanDriven
    ? (state.humanOutlineRevisionCount || 0) + 1
    : (state.humanOutlineRevisionCount || 0);
  const source = isHumanDriven ? 'human' : automatedRevisionSource(state, 'outline');

  console.log(`[incrementOutlineRevision] automatedPass=${newCount}, round=${newHumanCount + 1}, source=${source}`);

  return {
    outlineRevisionCount: newCount,
    humanOutlineRevisionCount: newHumanCount,
    _previousOutline: state.outline,
    outline: null,
    ...(!isHumanDriven && {
      _outlineTrace: traceWithPass(state, 'outline', state._outlineTrace, state.outline, newCount, newHumanCount + 1, source)
    }),
    evaluationHistory: {
      phase: 'outline',
      ready: false,
      reason: 'revision-invalidated',
      source,
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Increment article revision count and preserve/clear content for regeneration
 * Preserves current contentBundle in _previousContentBundle for revision context
 * Clears contentBundle and assembledHtml so generateContentBundle skip logic doesn't trigger
 *
 * Two counters, as incrementOutlineRevision above (brief 1.4), and the same trace
 * entry on an automatic pass only (brief 2.7), in `_articleTrace`.
 */
async function incrementArticleRevision(state) {
  const isHumanDriven = !!state._articleFeedback;
  const newCount = isHumanDriven ? 0 : (state.articleRevisionCount || 0) + 1;
  const newHumanCount = isHumanDriven
    ? (state.humanArticleRevisionCount || 0) + 1
    : (state.humanArticleRevisionCount || 0);
  const source = isHumanDriven ? 'human' : automatedRevisionSource(state, 'article');

  console.log(`[incrementArticleRevision] automatedPass=${newCount}, round=${newHumanCount + 1}, source=${source}`);

  return {
    articleRevisionCount: newCount,
    humanArticleRevisionCount: newHumanCount,
    _previousContentBundle: state.contentBundle,
    contentBundle: null,
    assembledHtml: null,
    ...(!isHumanDriven && {
      _articleTrace: traceWithPass(state, 'article', state._articleTrace, state.contentBundle, newCount, newHumanCount + 1, source)
    }),
    evaluationHistory: {
      phase: 'article',
      ready: false,
      reason: 'revision-invalidated',
      source,
      timestamp: new Date().toISOString()
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GRAPH BUILDER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create the report generation StateGraph
 *
 * @returns {Object} Uncompiled StateGraph builder
 */
function createGraphBuilder() {
  const builder = new StateGraph(ReportStateAnnotation);

  // ═══════════════════════════════════════════════════════
  // ADD NODES - Phase 0: Input Parsing (Commit 8.9)
  // ═══════════════════════════════════════════════════════

  builder.addNode('parseRawInput', nodes.parseRawInput, LLM_RETRY);
  // B2: the input-review interrupt lives in its own node. LangGraph re-executes an
  // interrupted node from its top on resume, so hosting it inside parseRawInput made
  // every approve re-pay three SDK calls and three file writes.
  builder.addNode('checkpointInputReview', nodes.checkpointInputReview);
  builder.addNode('finalizeInput', nodes.finalizeInput);

  // ═══════════════════════════════════════════════════════
  // ADD NODES - Phase 1: Data Acquisition (Sequential)
  // ═══════════════════════════════════════════════════════

  builder.addNode('initializeSession', nodes.initializeSession);
  builder.addNode('loadDirectorNotes', nodes.loadDirectorNotes);

  // Evidence fetching
  builder.addNode('fetchMemoryTokens', nodes.fetchMemoryTokens);
  builder.addNode('fetchPaperEvidence', nodes.fetchPaperEvidence);

  // Photo processing
  builder.addNode('fetchSessionPhotos', nodes.fetchSessionPhotos);
  builder.addNode('preprocessPhotos', nodes.preprocessPhotos);

  // Whiteboard detection
  builder.addNode('detectWhiteboard', nodes.detectWhiteboard);

  // ═══════════════════════════════════════════════════════
  // ADD NODES - Phase 1.35-1.8: Sequential Checkpoints & Processing
  // Dedicated checkpoint nodes follow SRP (data separate from checkpoints)
  // ═══════════════════════════════════════════════════════

  // Checkpoint: Paper evidence selection
  builder.addNode('checkpointPaperEvidence', nodes.checkpointPaperEvidence);

  // Checkpoint: Photos (photo late-join) — head of the Phase 2.36 photo branch
  builder.addNode('checkpointPhotos', nodes.checkpointPhotos);

  // Checkpoint: Await roster (incremental input - Phase 4f)
  // Pauses for user to provide roster via /approve endpoint
  builder.addNode('checkpointAwaitRoster', nodes.checkpointAwaitRoster);

  // Photo analysis (pure - no checkpoint; sequential in the data-fetch chain)
  builder.addNode('analyzePhotos', nodes.analyzePhotos, LLM_RETRY);

  // Checkpoint: Character IDs
  builder.addNode('checkpointCharacterIds', nodes.checkpointCharacterIds);
  builder.addNode('parseCharacterIds', nodes.parseCharacterIds, LLM_RETRY);
  builder.addNode('finalizePhotoAnalyses', nodes.finalizePhotoAnalyses, LLM_RETRY);

  // Checkpoint: Await full context (incremental input - Phase 4f)
  // Pauses for user to provide accusation, sessionReport, directorNotes via /approve
  builder.addNode('checkpointAwaitContext', nodes.checkpointAwaitContext);

  // Tag tokens with exposed/buried disposition (after parseRawInput provides orchestratorParsed)
  builder.addNode('tagTokenDispositions', nodes.tagTokenDispositions);

  // Evidence preprocessing (pure - no checkpoint)
  builder.addNode('preprocessEvidence', nodes.preprocessEvidence, LLM_RETRY);

  // Character data extraction (pre-curation, Haiku-powered)
  builder.addNode('extractCharacterData', nodes.extractCharacterData, LLM_RETRY);

  // Checkpoint: Pre-curation approval
  builder.addNode('checkpointPreCuration', nodes.checkpointPreCuration);

  // Evidence curation (pure data node - no interrupt, SRP)
  builder.addNode('curateEvidenceBundle', nodes.curateEvidenceBundle, LLM_RETRY);
  // Evidence checkpoint (SRP: interrupt separated from curateEvidenceBundle)
  builder.addNode('checkpointEvidenceAndPhotos', nodes.checkpointEvidenceAndPhotos);
  builder.addNode('processRescuedItems', nodes.processRescuedItems);

  // Contradiction surfacing (programmatic, no LLM - pipeline accuracy improvements)
  builder.addNode('surfaceContradictions', nodes.surfaceContradictions);

  // ═══════════════════════════════════════════════════════
  // ADD NODES - Phase 2: The weave (phase 4, brief 4.4)
  // ═══════════════════════════════════════════════════════

  // The arc writer: one weave in one call, from the room's conclusions and the record
  builder.addNode('analyzeArcs', nodes.analyzeArcsPlayerFocusGuided, LLM_RETRY);

  // The weave checks: programmatic, no model call (lib/weave.js checkWeave)
  builder.addNode('validateArcs', nodes.validateArcStructure);

  // The fact check: the truth criteria, once per round (no interrupt - SRP: checkpoint separate)
  builder.addNode('evaluateArcs', nodes.evaluateArcs, LLM_RETRY);

  // The story meeting's stop - interrupt() here (Commit 8.26: SRP separation)
  builder.addNode('checkpointArcSelection', nodes.checkpointArcSelection);

  // The arc rework: a check rework, the fact check's fix, or the director's round
  builder.addNode('incrementArcRevision', incrementArcRevision);
  builder.addNode('reviseArcs', nodes.reviseArcs, LLM_RETRY);

  // ═══════════════════════════════════════════════════════
  // ADD NODES - Phase 2.4: Arc Evidence Packages (Phase 1 Fix)
  // ═══════════════════════════════════════════════════════

  // Runs after arc selection, before outline generation
  // Extracts full quotable content and enriched photos per arc
  builder.addNode('buildArcEvidencePackages', nodes.buildArcEvidencePackages);

  // ═══════════════════════════════════════════════════════
  // ADD NODES - Phase 3: Outline Generation
  // ═══════════════════════════════════════════════════════

  builder.addNode('generateOutline', nodes.generateOutline, LLM_RETRY);
  // NOTE: validateOutlineStructure removed in Commit 8.23 - trust Opus evaluators instead
  // Outline evaluation (no interrupt - SRP: checkpoint separate)
  builder.addNode('evaluateOutline', nodes.evaluateOutline, LLM_RETRY);

  // Outline checkpoint - interrupt() here (Commit 8.26: SRP separation)
  builder.addNode('checkpointOutline', nodes.checkpointOutline);
  // NOTE: setOutlineCheckpoint removed - interrupt() now in evaluateOutline
  builder.addNode('incrementOutlineRevision', incrementOutlineRevision);
  // Revision node - uses buildRevisionContext helper for targeted fixes
  builder.addNode('reviseOutline', nodes.reviseOutline, LLM_RETRY);

  // ═══════════════════════════════════════════════════════
  // ADD NODES - Phase 4: Article Generation
  // ═══════════════════════════════════════════════════════

  builder.addNode('generateContentBundle', nodes.generateContentBundle, LLM_RETRY);
  // NOTE: validateArticleContent removed in Commit 8.23 - trust Opus evaluators instead
  // Article evaluation (no interrupt - SRP: checkpoint separate)
  builder.addNode('evaluateArticle', nodes.evaluateArticle, LLM_RETRY);

  // Article checkpoint - interrupt() here (Commit 8.26: SRP separation)
  builder.addNode('checkpointArticle', nodes.checkpointArticle);
  // NOTE: setArticleCheckpoint removed - interrupt() now in evaluateArticle
  builder.addNode('incrementArticleRevision', incrementArticleRevision);
  // Revision node - uses buildRevisionContext helper for targeted fixes
  builder.addNode('reviseContentBundle', nodes.reviseContentBundle, LLM_RETRY);
  builder.addNode('validateContentBundle', nodes.validateContentBundle, LLM_RETRY);

  // ═══════════════════════════════════════════════════════
  // ADD NODES - Phase 5: Assembly
  // ═══════════════════════════════════════════════════════

  builder.addNode('assembleHtml', nodes.assembleHtml);

  // ═══════════════════════════════════════════════════════
  // ADD EDGES - Entry Point (Simplified Incremental Flow)
  // Always start with initialization - parseRawInput comes after checkpointAwaitContext
  // ═══════════════════════════════════════════════════════

  builder.addEdge(START, 'initializeSession');

  // ═══════════════════════════════════════════════════════
  // ADD EDGES - Phase 1: Data Acquisition (SEQUENTIAL)
  // Data acquisition runs as a single sequential chain (no parallel branches).
  // ═══════════════════════════════════════════════════════

  builder.addEdge('initializeSession', 'loadDirectorNotes');

  // Sequential data acquisition: evidence only (the photo chain left Phase 1).
  builder.addEdge('loadDirectorNotes', 'fetchMemoryTokens');
  builder.addEdge('fetchMemoryTokens', 'fetchPaperEvidence');

  // Photo processing MOVED to Phase 2.36 (photo late-join): nothing before
  // buildArcEvidencePackages consumes photo analyses, and the director needs the
  // run to progress while the photos are still being curated and cleaned.

  // ═══════════════════════════════════════════════════════
  // ADD EDGES - Phase 1.35-1.8: Sequential Checkpoints & Processing
  // Incremental input flow: parseRawInput after checkpointAwaitContext
  // preprocessEvidence runs AFTER tagTokenDispositions so tokens have correct disposition
  // ═══════════════════════════════════════════════════════

  // After evidence fetching, proceed to paper evidence checkpoint
  builder.addEdge('fetchPaperEvidence', 'checkpointPaperEvidence');

  // Paper evidence selection → await roster (skip preprocessEvidence - runs later after tokens tagged)
  builder.addEdge('checkpointPaperEvidence', 'checkpointAwaitRoster');

  // After roster provided → await full context (incremental input). The photo
  // chain used to sit between these two; it now hangs off arc selection.
  builder.addEdge('checkpointAwaitRoster', 'checkpointAwaitContext');

  // After full context provided → parse raw input (produces playerFocus, sessionConfig)
  builder.addEdge('checkpointAwaitContext', 'parseRawInput');

  // Parse raw input → input-review checkpoint (B2: dedicated interrupt node)
  builder.addEdge('parseRawInput', 'checkpointInputReview');

  // Input review → conditional: approve forwards, reject-with-corrections re-parses
  builder.addConditionalEdges('checkpointInputReview', routeAfterInputReview, {
    reparse: 'parseRawInput',
    forward: 'finalizeInput'
  });

  // Finalize input → tag token dispositions (re-tag with orchestratorParsed)
  builder.addEdge('finalizeInput', 'tagTokenDispositions');

  // Tag tokens → preprocess evidence (NOW tokens have correct disposition)
  builder.addEdge('tagTokenDispositions', 'preprocessEvidence');

  // Preprocess evidence → character data extraction → pre-curation checkpoint
  builder.addEdge('preprocessEvidence', 'extractCharacterData');
  builder.addEdge('extractCharacterData', 'checkpointPreCuration');

  // Pre-curation → evidence curation (has interrupt for evidence-photos)
  builder.addEdge('checkpointPreCuration', 'curateEvidenceBundle');

  // Curation → checkpoint → rescued items → arc analysis
  builder.addEdge('curateEvidenceBundle', 'checkpointEvidenceAndPhotos');
  builder.addEdge('checkpointEvidenceAndPhotos', 'processRescuedItems');
  builder.addEdge('processRescuedItems', 'surfaceContradictions');
  builder.addEdge('surfaceContradictions', 'analyzeArcs');

  // ═══════════════════════════════════════════════════════
  // ADD EDGES - Phase 2: The weave (phase 4, brief 4.4; R6)
  // ═══════════════════════════════════════════════════════

  // The arc writer → the weave checks → [conditional routing]
  builder.addEdge('analyzeArcs', 'validateArcs');

  // After the checks: a failed check sends a weave the fact check has not judged back
  // for the round's one rework; everything else goes on to the fact check's node; a
  // rework that failed ends the run.
  builder.addConditionalEdges('validateArcs', routeArcValidation, {
    evaluate: 'evaluateArcs',
    revise: 'incrementArcRevision',
    error: END
  });

  // After the fact check: a breach gets its one fix, then the checks run on the fix and
  // the stop opens with no second judge call (the fact check skips a judged weave).
  builder.addConditionalEdges('evaluateArcs', routeArcEvaluation, {
    checkpoint: 'checkpointArcSelection',  // Route to checkpoint node, not directly to next phase
    revise: 'incrementArcRevision',
    error: END
  });

  // Checkpoint → conditional: approve enters the PHOTO BRANCH, reject enters the revision loop
  builder.addConditionalEdges('checkpointArcSelection', routeAfterArcCheckpoint, {
    forward: 'checkpointPhotos',
    revise: 'incrementArcRevision'
  });

  // Rework loop: increment → rework → the checks (never back to the arc writer)
  builder.addEdge('incrementArcRevision', 'reviseArcs');
  builder.addEdge('reviseArcs', 'validateArcs');

  // ═══════════════════════════════════════════════════════
  // ADD EDGES - Phase 2.36: Photo branch (photo late-join)
  // An independent INPUT branch, not a stage of the main line: it hangs off arc
  // selection and joins at buildArcEvidencePackages, the first node that folds
  // photo analyses into arc data. Placing it here also gives analyzePhotos a
  // populated playerFocus, which was always null when the chain ran at 1.65.
  // ═══════════════════════════════════════════════════════

  builder.addEdge('checkpointPhotos', 'fetchSessionPhotos');
  builder.addEdge('fetchSessionPhotos', 'preprocessPhotos');
  builder.addEdge('preprocessPhotos', 'analyzePhotos');
  builder.addEdge('analyzePhotos', 'detectWhiteboard');
  builder.addEdge('detectWhiteboard', 'checkpointCharacterIds');
  builder.addEdge('checkpointCharacterIds', 'parseCharacterIds');
  builder.addEdge('parseCharacterIds', 'finalizePhotoAnalyses');
  builder.addEdge('finalizePhotoAnalyses', 'buildArcEvidencePackages');

  // Arc evidence packages → outline generation
  builder.addEdge('buildArcEvidencePackages', 'generateOutline');

  // ═══════════════════════════════════════════════════════
  // ADD EDGES - Phase 3: Outline Generation
  // Commit 8.23: Removed programmatic validation, trust Opus evaluators
  // ═══════════════════════════════════════════════════════

  builder.addEdge('generateOutline', 'evaluateOutline');

  // Outline evaluation routing (Commit 8.26: SRP - checkpoint separate from evaluation)
  // checkpoint: evaluation ready, proceed to checkpoint node for human approval
  // revise: needs work, loop back for revision
  // error: fatal error, end workflow
  builder.addConditionalEdges('evaluateOutline', routeOutlineEvaluation, {
    checkpoint: 'checkpointOutline',  // Route to checkpoint node, not directly to next phase
    revise: 'incrementOutlineRevision',
    error: END
  });

  // Checkpoint → conditional: approve forwards, reject enters revision loop
  builder.addConditionalEdges('checkpointOutline', routeAfterOutlineCheckpoint, {
    forward: 'generateContentBundle',
    revise: 'incrementOutlineRevision'
  });

  // Revision loop: increment → revise → evaluate (NOT back to generateOutline)
  // reviseOutline receives previous output + feedback for TARGETED fixes
  builder.addEdge('incrementOutlineRevision', 'reviseOutline');
  builder.addEdge('reviseOutline', 'evaluateOutline');

  // ═══════════════════════════════════════════════════════
  // ADD EDGES - Phase 4: Article Generation
  // Commit 8.23: Removed programmatic validation, trust Opus evaluators
  // ═══════════════════════════════════════════════════════

  builder.addEdge('generateContentBundle', 'evaluateArticle');

  // Article evaluation routing (Commit 8.26: SRP - checkpoint separate from evaluation)
  // checkpoint: evaluation ready, proceed to checkpoint node for human approval
  // revise: needs work, loop back for revision
  // error: fatal error, end workflow
  builder.addConditionalEdges('evaluateArticle', routeArticleEvaluation, {
    checkpoint: 'checkpointArticle',  // Route to checkpoint node, not directly to next phase
    revise: 'incrementArticleRevision',
    error: END
  });

  // Checkpoint → conditional: approve forwards, reject enters revision loop
  builder.addConditionalEdges('checkpointArticle', routeAfterArticleCheckpoint, {
    forward: 'validateContentBundle',
    revise: 'incrementArticleRevision'
  });

  // Revision loop: increment → revise → evaluate (NOT back to generateContentBundle)
  // reviseContentBundle receives previous output + feedback for TARGETED fixes
  builder.addEdge('incrementArticleRevision', 'reviseContentBundle');
  builder.addEdge('reviseContentBundle', 'evaluateArticle');

  // Schema validation routing
  builder.addConditionalEdges('validateContentBundle', routeSchemaValidation, {
    error: END,
    continue: 'assembleHtml'
  });

  // ═══════════════════════════════════════════════════════
  // ADD EDGES - Phase 5: Assembly
  // ═══════════════════════════════════════════════════════

  builder.addEdge('assembleHtml', END);

  return builder;
}

// ═══════════════════════════════════════════════════════════════════════════
// GRAPH FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Recursion limit for graph execution.
 * Graph has 27+ nodes and revision loops can exceed LangGraph's default of 25 steps.
 * IMPORTANT: Must be passed to invoke(), NOT compile() - LangGraph JS ignores compile options.
 */
const RECURSION_LIMIT = 75;

/**
 * Create compiled report graph with MemorySaver checkpointing
 * Use for testing or ephemeral sessions
 *
 * @returns {Object} Compiled StateGraph
 */
function createReportGraph() {
  const builder = createGraphBuilder();
  const checkpointer = new MemorySaver();
  return builder.compile({ checkpointer });
}

/**
 * Create compiled report graph with custom checkpointer
 * Use for production with SqliteSaver or other persistent storage
 *
 * @param {Object} checkpointer - Checkpointer instance (MemorySaver, SqliteSaver, etc.)
 * @returns {Object} Compiled StateGraph
 */
function createReportGraphWithCheckpointer(checkpointer) {
  const builder = createGraphBuilder();
  return builder.compile({ checkpointer });
}

/**
 * Create compiled report graph without checkpointing
 * Use for simple one-shot execution (no pause/resume)
 *
 * @returns {Object} Compiled StateGraph
 */
function createReportGraphNoCheckpoint() {
  const builder = createGraphBuilder();
  return builder.compile();
}

module.exports = {
  // Main factory functions
  createReportGraph,
  createReportGraphWithCheckpointer,
  createReportGraphNoCheckpoint,

  // Config constants - must be passed to invoke(), not compile()
  RECURSION_LIMIT,

  // For testing
  _testing: {
    createGraphBuilder,
    // Routing functions - evaluation-based (evaluation/schema logic)
    routeArcValidation,
    routeArcEvaluation,
    routeOutlineEvaluation,
    routeArticleEvaluation,
    routeSchemaValidation,
    // Routing functions - checkpoint-based (human approval routing)
    routeAfterInputReview,
    routeAfterArcCheckpoint,
    routeAfterOutlineCheckpoint,
    routeAfterArticleCheckpoint,
    // Revision handlers (kept)
    incrementArcRevision,
    incrementOutlineRevision,
    incrementArticleRevision
    // NOTE: routeEntryPoint removed - simplified to direct START → initializeSession
    // NOTE: Approval-based routing and checkpoint nodes removed in interrupt() migration
    // See checkpoint-helpers.js for new pattern
  }
};

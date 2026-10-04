/**
 * Evaluator Nodes - Per-phase quality evaluation for report generation workflow
 *
 * Handles the evaluation sub-phases (2.3, 4.2) of the pipeline:
 * - evaluateArcs: the story meeting's fact check on the weave (phase 4, brief 4.4)
 * - evaluateArticle: Check voice consistency, anti-patterns, evidence integration
 *
 * Phase 4 (brief 4.6; spec 5.4): no model judge reads the map. The outline judge left
 * the graph; the map's code checks (map-nodes.js) take its place.
 *
 * Added in Commit 8.6 to implement per-phase evaluator pattern.
 * Each evaluator determines if content is READY for human review.
 * Evaluators do NOT skip human approval - they determine readiness.
 *
 * Pattern: DRY factory creates evaluators with shared logic.
 * Each phase has specific quality criteria.
 *
 * Evaluator flow:
 * 1. Check quality criteria
 * 2. If ready=true → checkpoint for human approval
 * 3. If ready=false AND under revision cap → revise
 * 4. If ready=false AND at cap → checkpoint with issues visible
 *
 * All nodes follow the LangGraph pattern:
 * - Accept (state, config) parameters
 * - Return partial state updates (add to evaluationHistory)
 * - Use PHASES constants for currentPhase values
 * - Support revision caps from REVISION_CAPS
 *
 * See ARCHITECTURE_DECISIONS.md 8.6.4-8.6.5 for design rationale.
 */

const { PHASES, REVISION_CAPS } = require('../state');
// NOTE: CHECKPOINT_TYPES still imported for getCheckpointType (used in routing)
// checkpointInterrupt removed in Commit 8.26 (SRP - moved to checkpoint-nodes.js)
const { CHECKPOINT_TYPES } = require('../checkpoint-helpers');
const { GraphInterrupt } = require('@langchain/langgraph');
const { safeParseJson, getSdkClient, formatIssuesForMessage, STRUCTURAL_PASS_SCORE, leadingRuleIds } = require('./node-helpers');
const { traceNode } = require('../../observability');
const { getThemeNPCEntries } = require('../../theme-config');
const { factCheckContentBundle } = require('../../content-bundle-fact-check');
// Phase 3 (3.4): each journalist judge reads the rule set its writer reads, through
// the writers' own loader and mode-block placement (lib/rule-set.js, prompt-builder.js).
const { loadRuleSet } = require('../../rule-set');
const { withReportingModeBlock } = require('../../prompt-builder');
// Phase 2, brief 2.4: the judges read the record and the director's words through
// the same renderers and builders the writers use, so a judge sees what it judges.
const { renderRecordView } = require('../../prompt-renderers/record-view');
const { withSessionClock } = require('../../prompt-renderers/session-clock');
const { renderDirectorEnrichmentBlock } = require('../../prompt-renderers/director-notes-renderer');
const { renderSessionFactsVerdict, renderArcAccusation, renderPhotoListEntry } = require('../../prompt-renderers/director-words-renderer');
const { directorAccusationText } = require('../../accusation-verdict');
// The writers' own builders: the writers' SESSION_FACTS, the article writer's inputs (its
// photos, 3.9), the PromptBuilder (whose roster method gives the roster section, and
// whose money summary the article judge prints, 3.9), the one rule for a kept photo (the
// 4b fix batch), and the whiteboard's filename (task 4c-fix). ARC_NOTES_LABEL is the arc
// writer's label for the director's notes, which the weave's fact check prints as its
// notes heading (one source, fix 3.4b).
const { ARC_NOTES_LABEL } = require('./arc-specialist-nodes');
const {
  buildSessionFacts, articleWriterInputs, getPromptBuilder, isPhotoExcluded, whiteboardFilenameOf
} = require('./ai-nodes');
// Phase 3 (3.7): the article judge's JSON of the outline and the article leaves the
// writers' questions out. Brief 4.7a: the director's answers at the story meeting, which
// the fact check reads among the director's words (T1).
const { withoutWriterQuestions, weaveQuestionsOf, isAnswered, WEAVE_ANSWER_KEY } = require('../../writer-questions');
// Phase 4 (brief 4.4): the weave the fact check judges, the mark it leaves on it, and
// the meeting's approval it skips on. Brief 4.5: the weave as the fact check judges it
// (no struck connection, no answer), and the director's answers, which it reads as record.
const { isWeave, weaveForPrompt, weaveForJudge, weaveKey, withFactCheckMark, isWeaveJudged, isMeetingApproved } = require('../../weave');
const { renderDirectorAnswers } = require('../../prompt-renderers/settled-weave');
// Brief 4.7a: the players the map places, for the fact check's roster check: Everyone's one
// function (console/outline-edit-logic.js mapTally) over the map's roster (lib/map.js).
const { mapTally } = require('../../../console/outline-edit-logic');
const { mapRosterOf } = require('../../map');
// The page's own rule for whether the writer's money tracker prints (printedWriterTracker).
const { writerTrackerPrints } = require('../../template-assembler');
// F1 (spec 2026-10-02 section 7): the director's edits are final. The article judge reads
// the edits the judged output carries, and the verdict guard moves a finding about one of
// them to advisoryWarnings under the one prefix.
const {
  carriedEdits, formatEditLines, locateQuotedText, directorEditConcern, concernEditIds, concernFinding, DIRECTOR_EDIT_PREFIX,
  EDIT_LINES_GUIDE, WEAVE_EDIT_LINES_GUIDE, PRINTED_FIELDS, isMap
} = require('../../hand-edit-diff');

// ═══════════════════════════════════════════════════════════════════════════
// QUALITY CRITERIA DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

// Each phase resolves its criteria through getPhaseCriteria(phase, theme): the weave's
// fact check scores the truth criteria alone (phase 4, brief 4.4); the article judge adds
// its weighted criteria (getArticleCriteria). The detective's arc criteria went with its
// arc stage (ruling R1), and the outline judge with the map (brief 4.6).

// ═══════════════════════════════════════════════════════════════════════════
// TRUTH CRITERIA (phase 3, 3.4; spec section 4 and R2)
// ═══════════════════════════════════════════════════════════════════════════
//
// A truth-rule breach is a definite error with the draft, so it goes back for an
// automatic rework: flagging it to the director would only hand the director the
// same fix. One structural criterion per group of rules, journalist only. They carry
// no weight: the weighted criteria make the score, and a truth criterion decides
// readiness alone (createEvaluator holds a failed one to not-ready, whatever the
// judge's own structuralPassed says).
//
// So each criterion asks only what its judge can check against its own prompts, and
// only what the judged output can hold (3.4 fix round 1): a clause the judge cannot
// check scores low and sends the draft to a rework that has nothing to fix. A group
// is worded per judge, and `reads` names the material each judge's criterion checks
// against (TRUTH_MATERIAL); the tests find every one in that judge's prompts.
//
// `phases` limits a group to the judges whose output it scores. A weave places no photos
// and prints nothing, so the weave's fact check leaves out photos and the fiction's
// words: there a criterion could only misfire, at the cost of an automatic fix. The
// outline judge's wordings went with it (phase 4, brief 4.6).
//
// Phase 4 (brief 4.4): the arc stage's judge is the weave's fact check, and each of its
// questions is worded for the weave (the `arcs` phase keeps its name, as the stop types
// do, R3).

/** What each judge scores, as the truth criteria name it. */
const TRUTH_SUBJECTS = { arcs: 'the weave', article: 'the article' };

/**
 * The material a truth criterion reads, by the heading or tag its judge's prompts print
 * it under. The first twelve are the judge's inputs; the last two are the judged output's
 * own text, which only the article holds (the weave places neither cards nor photos).
 */
const TRUTH_MATERIAL = Object.freeze({
  record: '<RECORD>',                       // the exposed documents (renderRecordView)
  timeline: '<morning-timeline>',           // the ledger and the evidence log, on the morning clock
  financialSummary: '<FINANCIAL_SUMMARY>',  // the account totals the article writer copies (3.9)
  notes: '<DIRECTOR_NOTES>',                // the director's notes (renderDirectorEnrichmentBlock)
  answers: '<DIRECTOR_ANSWERS>',            // the director's answers at the story meeting (renderDirectorAnswers; brief 4.5)
  epilogue: '<EPILOGUE>',                   // Nova's day, from the director's notes
  verdict: '<DIRECTOR_ACCUSATION>',         // the room's verdict, in the director's words
  roster: 'CANONICAL CHARACTER ROSTER:',    // each player with the roster's pronoun
  whiteboard: '### The Whiteboard',         // the whiteboard, as context (renderWhiteboardConnections)
  photos: '\nPHOTOS (',                     // the photos the judged writer was given, with the director's descriptions
  modeBlock: '<mode-',                      // the session's reporting-mode block (system prompt)
  truthRules: '<truth-rules>',              // the truth rules, T14's production words among them (system prompt)
  printedCards: '"type": "evidence-card"',  // the article's cards, as CONTENT BUNDLE prints them
  printedCaptions: '"caption": '            // the article's captions, as CONTENT BUNDLE prints them
});

// Brief 4.5 (T1): after a director's round at the story meeting the weave's fact check
// reads the director's answers to the weave's questions as the director's words, record as
// the notes are. The three questions an answer can settle read them: the evidence (an
// answer says what a player did), the money (an answer says what a ledger line was) and
// the pronouns (an answer gives a pronoun the roster lacks).
const TRUTH_GROUPS = [
  {
    key: 'evidenceTruth',
    rules: ['T1', 'T3', 'T4', 'T6'],
    reads: (phase) => (phase === 'arcs' ? ['record', 'timeline', 'notes', 'answers'] : ['record', 'timeline', 'notes']),
    // Phase 3 (3.9): T4 as round 7 words it (R21).
    describe: (s, phase) => `Is every claim in ${s} written as its evidence allows${phase === 'arcs' ? ", the director's answers at the story meeting included as record, as the notes are" : ''} (T1), with no buried memory's content or owner stated as fact (T3); with a person tied to an account as fact only where the director saw the sale or it was made openly in front of the room, and an account's name never a reason to suspect its namesake (T4); and with no exposer named that neither the evidence log nor the director's notes name (T6)?`
  },
  {
    key: 'moneyTruth',
    rules: ['T5'],
    // Phase 3 (3.9; the integrator's ruling): the article judge reads the
    // FINANCIAL_SUMMARY its writer copies, so a correct code-made total is never taken
    // for a sum the writer made up. The arc writer has no summary, so its judge has the
    // timeline alone. The buyer is Nova's suspicion (T5, R11).
    //
    // Final review (judges-factcheck[0]): each source is named by what it gives. The
    // summary's totals are the close of the morning's, and the director's notes record
    // balances said or shown in the room before then (092026's read-out of the balances,
    // 092626's "$4 million in the RW account"), so a judge reads such a line as that
    // moment's figure (T1) and never "corrects" it to a closing total.
    reads: (phase) => (phase === 'arcs' ? ['timeline', 'notes', 'answers'] : ['timeline', 'financialSummary', 'notes']),
    describe: (s, phase) => `Does the money in ${s} run from the buyer to the seller's chosen account, with NeurAI and its board written as Nova's suspicion of who the buyer is and never as fact, and the ledger's money taken as the morning's payments for erasure (T5)? Each figure is as its source gives it: each sale, the first-burial bonus and each transfer as the ledger gives it;${phase === 'arcs' ? '' : ' each total at the close of the morning as FINANCIAL_SUMMARY gives it;'} ${phase === 'arcs' ? "a balance the director's notes record as said or shown in the room as that moment's figure; and a ledger line the director's answer at the story meeting explains as that answer gives it (T1)." : "and a balance the director's notes record as said or shown in the room as that moment's figure (T1)."}`
  },
  {
    key: 'verdictTruth',
    rules: ['T2'],
    reads: () => ['verdict', 'notes'],
    // Phase 4 (brief 4.4; T2 as rewritten): the map places the theories the room debated,
    // so the weave's question asks for the verdict as the official story alone.
    describe: (s, phase) => (phase === 'arcs'
      ? `Is the verdict in ${s} told as the room's official story, ungraded against any hidden answer (T2)? The theories the room debated are the map's to place, so the weave keeps T2 whether it names them or not.`
      : `Is the verdict in ${s} told as the room's official story, with the alternative theories the room debated reported, and left ungraded against any hidden answer (T2)?`)
  },
  {
    key: 'stagesTruth',
    rules: ['T7'],
    reads: () => ['record', 'modeBlock', 'epilogue', 'timeline'],
    // Phase 3 (3.9): T7's point on Nova's intent (R21).
    describe: (s) => `In ${s}, is the party met only through memories, the investigation told as the reporting mode allows, Nova's day taken from the epilogue alone, and every logged time on the morning clock (T7)? What Nova says NovaNews is still chasing is Nova's own intent and needs no epilogue.`
  },
  {
    key: 'novaPositionTruth',
    rules: ['T8'],
    reads: () => ['modeBlock'],
    // Phase 3 (3.9): T8's first sentence as round 7 words it (R21).
    describe: (s) => `In ${s}, is Nova the uninterested third party, reporting on the room from outside its choices: Nova never votes, joins the room's accusation or exposes a memory, and witnesses only what this session's mode block allows (T8)?`
  },
  {
    key: 'playersTruth',
    rules: ['T9', 'T11'],
    reads: (phase) => (phase === 'arcs' ? ['roster', 'answers'] : ['roster']),
    describe: (s, phase) => `Does every player in ${s} take the pronoun the roster gives${phase === 'arcs' ? ", or, where the roster gives none, the pronoun the director's answer at the story meeting gives" : ''} (T9), and does the judgement in ${s} land on the characters' choices, with no player's looks described (T11)?`
  },
  {
    key: 'wordsTruth',
    rules: ['T12'],
    // Only the article prints a card's text; the weave names a receipt by id.
    reads: (phase) => (phase === 'article' ? ['record', 'notes', 'printedCards'] : ['record', 'notes']),
    describe: (s, phase) => (phase === 'article'
      ? 'Is every quoted line in the article word for word from the record or the director\'s notes and in its real speaker\'s mouth, and does every card copy the record with no id or timestamp in its text (T12)?'
      : `Is every quoted line in ${s} word for word from the record or the director's notes, and in its real speaker's mouth (T12)?`)
  },
  {
    key: 'photosTruth',
    rules: ['T13'],
    phases: ['article'],
    // The article judge reads the photos its writer was given (renderArticleJudgePhotos):
    // since 3.9, every photo the director kept, so "every photo in PHOTOS" is T13's
    // every-photo check (the integrator's ruling).
    reads: () => ['photos', 'whiteboard', 'printedCaptions'],
    describe: () => 'Does the article print every photo in PHOTOS and no other, the hero image as its hero, cite nothing from the whiteboard, and give each printed photo a caption that keeps the subject and action of the director\'s description wherever PHOTOS gives one (T13)?'
  },
  {
    key: 'fictionTruth',
    rules: ['T14'],
    phases: ['article'],
    reads: () => ['truthRules'],
    describe: (s) => `Does every line of ${s} that reaches print speak the fiction's own words, with no production word in it (T14)?`
  }
];

/**
 * The truth criteria one journalist judge scores, each worded for that judge.
 *
 * @param {'arcs'|'article'} phase
 * @returns {Object<string, {description: string, rules: string[], reads: string[], type: 'structural', truth: true}>}
 */
function truthCriteria(phase) {
  const subject = TRUTH_SUBJECTS[phase];
  if (!subject) throw new Error(`Unknown evaluation phase: ${phase}`);
  return Object.fromEntries(TRUTH_GROUPS
    .filter((group) => !group.phases || group.phases.includes(phase))
    .map((group) => [group.key, {
      description: group.describe(subject, phase),
      rules: group.rules,
      reads: group.reads(phase),
      type: 'structural',
      truth: true
    }]));
}

/**
 * The weave's fact check's criteria (phase 4, brief 4.4; spec 4.5): the truth criteria,
 * worded for the weave, and nothing else. Its weighted criteria went: player coverage
 * left the arc stage for the map, the code checks hold the receipts and the verdict
 * thread, and no notes on the writing reach the story meeting. One set for every theme:
 * the detective's arc criteria went with its arc stage (ruling R1).
 *
 * @returns {Object} the truth criteria
 */
function getArcCriteria() {
  return truthCriteria('arcs');
}

/**
 * Get theme-aware article evaluation criteria
 * @param {string} theme - 'journalist' or 'detective'
 * @returns {Object} Article quality criteria
 */
function getArticleCriteria(theme = 'journalist') {
  if (theme === 'detective') {
    return {
      voiceConsistency: {
        description: 'Does report maintain third-person investigative detective voice (professional, analytical)?',
        weight: 0.20,
        type: 'structural'
      },
      antiPatterns: {
        description: 'Are anti-patterns avoided? (token terminology, game mechanics, character sheet references; the in-world phrase "memory token" is allowed)',
        weight: 0.15,
        type: 'structural'
      },
      visualDistribution: {
        description: 'Are visual components distributed for compelling narrative flow (not clustered)? Goal is a compelling GIFT for players, not quota compliance.',
        weight: 0.10,
        type: 'advisory'
      },
      arcThreading: {
        description: 'Does each section answer a DIFFERENT QUESTION about the same underlying facts? Sections should be analytically distinct, not repetitive.',
        weight: 0.10,
        type: 'structural'
      },
      evidenceIntegration: {
        description: 'Is evidence woven in naturally?',
        weight: 0.15,
        type: 'advisory'
      },
      characterPlacement: {
        description: 'Are all roster members mentioned?',
        weight: 0.15,
        type: 'advisory'
      },
      emotionalResonance: {
        description: 'Does article deliver the promised experience?',
        weight: 0.15,
        type: 'advisory'
      }
    };
  }

  // Journalist. Phase 3 (3.4): each criterion names the rule or craft item it scores
  // and keeps its type and weight; the truth criteria follow. Phase 3 (3.9; R2, R22): a
  // structural criterion holds to the plan's wording, with no craft clause of its own.
  return {
    // STRUCTURAL CRITERIA - Block if failed (weight sum: 0.55)
    voiceConsistency: {
      description: 'Does Nova write in the first person throughout (C12), with "we" only as T8 and the mode block allow it?',
      weight: 0.20,
      type: 'structural'
    },
    // Phase 3 (3.9; R4; final review judges-factcheck[2]): C4's em-dash house rule and
    // T14's production words only. It read the whole of C4 into a must-fix slot and
    // docked the gate's article for its length, which R4 makes an advisory flag.
    antiPatterns: {
      description: 'Does Nova\'s own prose keep C4\'s house rule, with no em-dash, and does every printed line speak the fiction\'s own words, with no production word (T14)? "Memory token" is the fiction\'s own word. C4\'s length and its other craft are craft findings, outside this criterion.',
      weight: 0.15,
      type: 'structural'
    },
    // BASELINE §4 class 6: both remote sessions of the last five were written as
    // on-site, and there was no criterion for it at all. Phase 2 (2.6): a remote
    // article that announced its absence five times was praised for it. Phase 3
    // (3.4): exposed memories reach Nova by turn-in, never as tips (spec T6, T8).
    // Phase 3 (3.9): the remote mode block and T8 of round 7 (R13, R21): the room's
    // events are told as scenes, attributed where it matters, not each one sourced.
    reporterMode: {
      description: 'Does the article keep T8 as this session\'s mode block states it? It fails on Nova voting, joining the room\'s accusation or exposing a memory; and, in a remote session, on a claim to have seen or heard the room, or on the absence stated more than once. Remotely, the room\'s events are told as scenes, with attribution where it matters: a line someone was overheard saying, a claim about a person. Exposed memories reach Nova by turn-in, anonymous unless the evidence log or the director\'s notes name who turned one in.',
      weight: 0.10,
      type: 'structural'
    },
    visualDistribution: {
      description: 'Do the cards and photos spread through the article, each where it serves the flow (C9, C4)?',
      weight: 0.05,
      type: 'advisory'
    },
    arcThreading: {
      description: 'Is every section an essential part of one narrative, carrying the threads forward from its own angle, with nothing front-loaded into THE STORY (C2)? Not every arc appears in every section.',
      weight: 0.10,
      type: 'structural'
    },
    // ADVISORY CRITERIA - Warn but don't block (weight sum: 0.45)
    evidenceIntegration: {
      description: 'Is each card the receipt for a claim the thesis rests on, set in the prose that makes the claim (C9)?',
      weight: 0.15,
      type: 'advisory'
    },
    characterPlacement: {
      description: 'Does every roster player appear through something the record shows they did (C7)?',
      weight: 0.15,
      type: 'advisory'
    },
    emotionalResonance: {
      description: 'Does the article keep the promise <world> opens with: the players see themselves, catch what they missed, and see how their choices shaped the official story?',
      weight: 0.10,
      type: 'advisory'
    },
    ...truthCriteria('article')
  };
}

/**
 * One phase's criteria for a theme: the one place a judge's criteria are resolved
 * (createEvaluator, and scripts/lib/render-calls.js for the renders).
 *
 * @param {'arcs'|'article'} phase
 * @param {string} [theme='journalist']
 * @returns {Object}
 */
function getPhaseCriteria(phase, theme = 'journalist') {
  switch (phase) {
    case 'arcs': return getArcCriteria();
    case 'article': return getArticleCriteria(theme);
    default: throw new Error(`No quality criteria defined for phase: ${phase}`);
  }
}

/**
 * The truth criteria a judge scored below the structural bar.
 *
 * @param {Object} evaluation - the judge's output
 * @param {Object} criteria - the criteria the judge was given
 * @returns {Array<{key: string, rules: string[], notes: *, fix: *}>}
 */
function failedTruthCriteria(evaluation, criteria) {
  const scores = (evaluation && evaluation.criteriaScores) || {};
  return Object.entries(criteria || {})
    .filter(([key, criterion]) => criterion && criterion.truth && scores[key]
      && typeof scores[key].score === 'number' && scores[key].score < STRUCTURAL_PASS_SCORE)
    .map(([key, criterion]) => ({ key, rules: criterion.rules, notes: scores[key].notes, fix: scores[key].fix }));
}

/**
 * The truth criteria a judge left out of its scores (no numeric score). Each counts as
 * not scored: it is logged by name and does not hold the output (fix 3.4b, ruled).
 *
 * @param {Object} evaluation - the judge's output
 * @param {Object} criteria - the criteria the judge was given
 * @returns {string[]} the criteria's keys
 */
function unscoredTruthCriteria(evaluation, criteria) {
  const scores = (evaluation && evaluation.criteriaScores) || {};
  return Object.entries(criteria || {})
    .filter(([key, criterion]) => criterion && criterion.truth
      && !(scores[key] && typeof scores[key].score === 'number'))
    .map(([key]) => key);
}

/**
 * One structural issue for each failed truth criterion the judge wrote no issue for
 * under any of its rule ids: the rule ids, then the criterion's notes and fix.
 *
 * @param {Array} failed - failedTruthCriteria
 * @param {string[]} written - the judge's own structuralIssues
 * @returns {string[]}
 */
function truthIssueLines(failed, written) {
  const writtenIds = new Set((Array.isArray(written) ? written : []).flatMap(leadingRuleIds));
  return failed
    .filter(({ rules }) => !rules.some(rule => writtenIds.has(rule)))
    .map(({ key, rules, notes, fix }) => {
      const text = [notes, fix].filter(t => typeof t === 'string' && t.trim()).map(t => t.trim()).join(' ');
      return `${rules.join(', ')}: ${text || `the ${key} criterion failed.`}`;
    });
}

/**
 * The output each judge scores: the one the director's edits are found in. The weave
 * without its code-owned keys (brief 4.5): the parts the guard reads of it leave out the
 * connections the director struck and the answers (lib/hand-edit-diff.js weaveParts).
 *
 * @param {'arcs'|'article'} phase
 * @param {Object} state
 * @returns {Object|null}
 */
function judgedOutput(phase, state) {
  if (phase === 'article') return state.contentBundle || null;
  if (phase === 'arcs') return isWeave(state.weave) ? weaveForPrompt(state.weave) : null;
  return null;
}

/**
 * The director's edits the judged output carries (F1; spec 2026-10-02 section 7), in id
 * order: the one list the judge's prompt prints, the verdict guard reads and the fact
 * check locates (createEvaluator, buildFactCheckArgs, scripts/lib/render-calls.js). At the
 * story meeting (brief 4.5), the director's changes the weave carries, each strike among
 * them.
 *
 * @param {'arcs'|'article'} phase
 * @param {Object} state
 * @returns {Object[]}
 */
function judgedEdits(phase, state) {
  if (phase === 'article') return carriedEdits(state._articleHandEdits, state.contentBundle);
  if (phase === 'arcs') return carriedEdits(state._weaveHandEdits, judgedOutput('arcs', state));
  return [];
}

/**
 * The rule ids each criterion scores, by criterion: the truth criteria's (phase 3, 3.4).
 * The verdict a rework reads carries them (`criteriaRules`), so a send-back's rework can
 * keep a criterion's notes and fix away when an issue under its rules is located in the
 * director's newest edits (FA, requirement 5; node-helpers.js withoutDirectorsFindings).
 *
 * @param {Object} criteria
 * @returns {Object<string, string[]>}
 */
function criteriaRulesOf(criteria) {
  return Object.fromEntries(Object.entries(criteria || {})
    .filter(([, criterion]) => criterion && Array.isArray(criterion.rules) && criterion.rules.length > 0)
    .map(([key, criterion]) => [key, [...criterion.rules]]));
}

/** A criterion's notes and fix, as one text. */
function criterionText(value) {
  if (!value || typeof value !== 'object') return '';
  return [value.notes, value.fix].filter(t => typeof t === 'string' && t.trim()).map(t => t.trim()).join(' ');
}

/** A criterion score below the structural bar. */
function scoredBelowBar(value) {
  return Boolean(value && typeof value === 'object' && typeof value.score === 'number' && value.score < STRUCTURAL_PASS_SCORE);
}

/** Does a finding open with this criterion's name ("evidenceTruth: ...")? */
function opensWithName(finding, key) {
  return new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(String(finding || ''));
}

/**
 * The verdict guard (F1, completed by FA): an edit is the final word on its text, so a
 * finding about the director's text is the director's to weigh, never an automatic
 * pass's task. It decides what reaches the stop, what reaches the rework and whether the
 * output is ready. With no edits, nothing moves: the judge's issues and the truth lines
 * are the structural issues, a failed truth criterion holds the output, and the rework
 * reads the judge's criteria, advisories and guidance as they came, as before F1.
 *
 * With edits standing (lib/hand-edit-diff.js locateQuotedText finds whose text a finding
 * quotes: an edit's text, the text a cut removed, a sentence a rewrite removed):
 * - A structural issue that quotes the director's text moves to the concerns, under the
 *   prefix and the edits' ids, whatever else it quotes (FA, requirement 1): in such an
 *   issue a quote of the writer's text is usually where the problem sits or where a fix
 *   would go. A finding the judge filed under the prefix and a standing id moves as it is.
 * - A judge's advisory that quotes the director's text is a concern in its place, never a
 *   suggestion for the rework (FA, requirement 6).
 * - A criterion whose notes or fix quote the director's text keeps them from the rework
 *   (final review, finding 1), and one that failed joins the concerns unless a concern
 *   already covers it: one under its rule ids or its name or, for a criterion with no
 *   rule ids, one about the same edit.
 * - A criterion a concern covers keeps its notes and fix from the rework, and holds the
 *   output only while a structural issue under its rule ids remains (FA, requirement 5).
 *   A failed truth criterion that no finding names and no concern covers is a must-fix
 *   line (truthIssueLines).
 * - The judge's guidance (one step per structural issue) stays out of the rework when an
 *   issue moved, or when it quotes the director's text: its steps would fix that text.
 * - Ready: no structural issue remains, and every structural criterion that failed is one
 *   a concern covers (FA, requirement 5). The judge's own structuralPassed does not hold
 *   an output with nothing left to fix (final review, finding 6).
 *
 * @param {Object} args
 * @param {Object} args.evaluation - the judge's output
 * @param {Object} args.criteria - the criteria the judge was given
 * @param {Object[]} args.edits - judgedEdits
 * @param {Object|null} args.output - judgedOutput
 * @param {string[]} [args.record] - recordTexts, the record as the judge read it
 * @returns {{kept: string[], moved: string[], concerns: string[], advisories: string[],
 *            failedTruth: Array, holding: string[], ready: boolean, criteriaScores: Object,
 *            revisionGuidance: string}}
 *   `kept`: the structural issues; `advisories`: the judge's advisories, each that quotes
 *   the director's text as a concern in its place; `moved` and `concerns` (from criteria):
 *   the other findings about the director's edits; `holding`: the criteria that hold the
 *   output; `criteriaScores` and `revisionGuidance`: what the rework reads (validationResults)
 */
function guardDirectorEdits({ evaluation, criteria, edits, output, record = [] }) {
  const judged = evaluation && typeof evaluation === 'object' ? evaluation : {};
  const issues = judged.structuralIssues || [];
  const advisories = Array.isArray(judged.advisoryWarnings) ? judged.advisoryWarnings : [];
  const failedTruth = failedTruthCriteria(judged, criteria);
  const judgeReady = judged.structuralPassed !== undefined ? judged.structuralPassed : judged.ready;
  if (!Array.isArray(edits) || edits.length === 0) {
    return {
      kept: [...issues, ...truthIssueLines(failedTruth, issues)],
      moved: [],
      concerns: [],
      advisories,
      failedTruth,
      holding: failedTruth.map(({ key }) => key),
      ready: failedTruth.length > 0 ? false : judgeReady,
      criteriaScores: judged.criteriaScores,
      revisionGuidance: judged.revisionGuidance
    };
  }

  const standing = new Set(edits.map((edit) => edit.id));
  const aboutStanding = (text) => concernEditIds(text).some((id) => standing.has(id));
  const quotedEdits = (text) => locateQuotedText(text, edits, output, { record }).editIds;

  const kept = [];
  const moved = [];
  issues.forEach((issue) => {
    if (aboutStanding(issue)) {
      moved.push(issue);
      return;
    }
    const ids = quotedEdits(issue);
    if (ids.length > 0) moved.push(directorEditConcern(ids, issue));
    else kept.push(issue);
  });
  const advisoriesOut = advisories.map((advisory) => {
    if (aboutStanding(advisory)) return advisory;
    const ids = quotedEdits(advisory);
    return ids.length > 0 ? directorEditConcern(ids, advisory) : advisory;
  });

  const scores = judged.criteriaScores && typeof judged.criteriaScores === 'object' ? judged.criteriaScores : {};
  const rulesOf = (key) => (criteria && criteria[key] && Array.isArray(criteria[key].rules) ? criteria[key].rules : []);
  const quoting = new Map();   // criterion -> the edits its notes and fix quote
  Object.entries(scores).forEach(([key, value]) => {
    const ids = quotedEdits(criterionText(value));
    if (ids.length > 0) quoting.set(key, ids);
  });
  const covers = (concern, key) => {
    const finding = concernFinding(concern) || '';
    if (opensWithName(finding, key)) return true;
    const rules = rulesOf(key);
    return rules.length > 0
      ? leadingRuleIds(finding).some((id) => rules.includes(id))
      : concernEditIds(concern).some((id) => (quoting.get(key) || []).includes(id));
  };
  const written = [...moved, ...advisoriesOut.filter((advisory) => !forTheRework(advisory))];
  const concerns = [...quoting]
    .filter(([key]) => scoredBelowBar(scores[key]) && criterionText(scores[key]) && !written.some((concern) => covers(concern, key)))
    .map(([key, ids]) => directorEditConcern(ids, `${rulesOf(key).length > 0 ? rulesOf(key).join(', ') : key}: ${criterionText(scores[key])}`));
  const covered = (key) => [...written, ...concerns].some((concern) => covers(concern, key));

  const criteriaScores = judged.criteriaScores && typeof judged.criteriaScores === 'object'
    ? Object.fromEntries(Object.entries(judged.criteriaScores).map(([key, value]) => {
      if (!(covered(key) || quoting.has(key)) || !value || typeof value !== 'object') return [key, value];
      const { notes, fix, ...score } = value;
      return [key, score];
    }))
    : judged.criteriaScores;

  kept.push(...truthIssueLines(
    failedTruth.filter(({ key }) => !covered(key)),
    [...kept, ...written.map((concern) => concernFinding(concern) || '')]
  ));

  const holding = Object.keys(scores).filter((key) => criteria && criteria[key] && criteria[key].type === 'structural'
    && scoredBelowBar(scores[key])
    && (!covered(key) || kept.some((issue) => leadingRuleIds(issue).some((id) => rulesOf(key).includes(id)))));

  const guidance = judged.revisionGuidance;
  const guidanceAboutEdits = moved.length > 0 || (typeof guidance === 'string' && quotedEdits(guidance).length > 0);

  return {
    kept,
    moved,
    concerns,
    advisories: advisoriesOut,
    failedTruth,
    holding,
    ready: kept.length === 0 && holding.length === 0,
    criteriaScores,
    revisionGuidance: guidanceAboutEdits ? '' : guidance
  };
}

/** Not a concern about one of the director's edits: what a rework may read (validationResults). */
function forTheRework(warning) {
  return !(typeof warning === 'string' && warning.startsWith(DIRECTOR_EDIT_PREFIX));
}

/**
 * Whether a judge is truth-only (phase 4, brief 4.4): every criterion it scores is a truth
 * criterion, so the truth criteria are the whole evaluation. Its schema
 * (TRUTH_ONLY_EVALUATION_JSON_SCHEMA) and its verdict (truthOnlyVerdict) follow from its
 * criteria, and a test holds its prompt's OUTPUT FORMAT (truthOnlyOutputFormat) to the same
 * rule, so the article judge takes on all three when its criteria shrink to the truth groups.
 *
 * @param {Object} criteria
 * @returns {boolean}
 */
function isTruthOnly(criteria) {
  const list = Object.values(criteria || {});
  return list.length > 0 && list.every((criterion) => Boolean(criterion && criterion.truth));
}

/**
 * A truth-only judge's verdict, held to its contract after the verdict guard (phase 4,
 * brief 4.4, fix round 1): spec 4.5 lets no notes on the writing reach the meeting, and an
 * automatic pass reads only must-fix work. Each criterion the judge was given keeps its
 * definition's type, so a breach's fix never reaches the rework as a suggestion; a
 * criterion it was not given goes; and its advisories are only its concerns about the
 * director's edits (DIRECTOR_EDIT_PREFIX, as the guard leaves them), which the stop shows
 * and no rework reads (forTheRework).
 *
 * Readiness follows from the contract alone (brief 4.5, ruling 8): the verdict is ready
 * when no structural issue remains and no truth criterion holds, whatever the judge's own
 * structuralPassed says, on the path with no edits and on the edits path alike. "When it
 * finds a breach, one automatic fix runs" (spec 4.5): a breach the judge listed holds the
 * output though the judge called it passed, and a criterion outside the contract, which
 * the verdict leaves out, holds nothing, so no fix runs with nothing to fix.
 *
 * @param {Object} guard - guardDirectorEdits' result
 * @param {Object} criteria - the judge's criteria, every one a truth criterion (isTruthOnly)
 * @returns {Object} the guard's result with its `advisories` and `criteriaScores` held to the
 *   contract, its `ready` read from the contract, and `outsideContract`: the criteria and
 *   advisories it left out, for the log
 */
function truthOnlyVerdict(guard, criteria) {
  const given = (key) => Object.prototype.hasOwnProperty.call(criteria, key);
  const scores = guard.criteriaScores && typeof guard.criteriaScores === 'object' ? guard.criteriaScores : null;
  const criteriaScores = scores
    ? Object.fromEntries(Object.entries(scores)
      .filter(([key]) => given(key))
      .map(([key, value]) => [key, value && typeof value === 'object' ? { ...value, type: criteria[key].type } : value]))
    : guard.criteriaScores;
  const holding = (Array.isArray(guard.holding) ? guard.holding : []).filter(given);
  return {
    ...guard,
    holding,
    ready: guard.kept.length === 0 && holding.length === 0,
    advisories: guard.advisories.filter((advisory) => !forTheRework(advisory)),
    criteriaScores,
    outsideContract: [
      ...(scores ? Object.keys(scores).filter((key) => !given(key)) : []),
      ...guard.advisories.filter(forTheRework)
    ]
  };
}

/**
 * The director's answers at the story meeting, each word for word (brief 4.7a; T1 as
 * rewritten: the answers count like the notes). Only answered questions give one.
 *
 * @param {Object} state
 * @returns {string[]}
 */
function meetingAnswers(state) {
  const weave = state.weave;
  return weaveQuestionsOf(weave && weave.questions).filter(isAnswered).map((question) => question[WEAVE_ANSWER_KEY]);
}

/**
 * The director's words: the notes, the input-review corrections, the accusation and, since
 * brief 4.7a, the answers at the story meeting (T1). The fact check's pronoun check reads
 * them (buildFactCheckArgs), and the verdict guard reads them as record (recordTexts).
 *
 * @param {Object} state
 * @returns {string[]}
 */
function directorWords(state) {
  const notes = state.directorNotes || {};
  return [
    notes.rawProse,
    ...(Array.isArray(state.inputReviewCorrections) ? state.inputReviewCorrections : []),
    directorAccusationText(state),
    ...meetingAnswers(state)
  ].filter(text => typeof text === 'string' && text.trim());
}

/**
 * The roster players the map, as the director left it, places in a beat (brief 4.7a):
 * Everyone, from the map's one function for it (console/outline-edit-logic.js mapTally)
 * over the map's roster (lib/map.js mapRosterOf). The fact check's roster check covers
 * these alone; a state holding no map gives none, and every roster player is checked.
 *
 * @param {Object} state
 * @returns {string[]|undefined}
 */
function mapPlacedPlayers(state) {
  if (!isMap(state.outline)) return undefined;
  const { everyone } = mapTally(state.outline, { roster: mapRosterOf(state.sessionConfig, state.canonicalCharacters) });
  return everyone.flatMap((section) => section.players);
}

/**
 * The record as the article judge reads it, for the verdict guard (F1, fix
 * round 1, finding 2): the documents and the morning timeline (renderRecordView), the
 * director's words and the director's photo descriptions. A passage a finding quotes from
 * here that the writer's text also prints is the record the finding cites, not the
 * writer's text (lib/hand-edit-diff.js locateQuotedText).
 *
 * @param {Object} state
 * @returns {string[]}
 */
function recordTexts(state) {
  const descriptions = state.photoDescriptions && typeof state.photoDescriptions === 'object'
    ? Object.values(state.photoDescriptions)
    : [];
  return [
    renderRecordView(state.evidenceBundle, { sessionConfig: state.sessionConfig }),
    ...directorWords(state),
    ...descriptions
  ].filter(text => typeof text === 'string' && text.trim());
}

/**
 * The fact check's arguments for one state: the one place they are built
 * (createEvaluator, and scripts/lib/render-calls.js for the renders).
 *
 * Phase 3 (3.4): the theme's NPC entries (Blake's missing pronoun included), the
 * roster's pronouns and the director's words (the notes, the input-review
 * corrections and the accusation) for the pronoun check, and the guest reporter for
 * the head count.
 *
 * The 4b fix batch (T13): the session photos the director excluded, by the one rule
 * (ai-nodes.js isPhotoExcluded), so the photo check reads an excluded photo as no
 * usable reference and its fix lines offer only the kept photos.
 *
 * Task 4c-fix (T13): the whiteboard photo's filename, from where the writers get it
 * (ai-nodes.js whiteboardFilenameOf), so a printed whiteboard is an invalid reference
 * and no fix line offers it.
 *
 * F1 (spec 2026-10-02 section 7): the director's edits the bundle carries (judgedEdits),
 * so a structural hit in the director's text, or caused by the director's cut, is a
 * concern for the director.
 *
 * Phase 4 (brief 4.6; R5): the cards' sources are the record's alone, the evidence
 * bundle's; the arc packages went.
 *
 * Brief 4.7a: the players the map places (mapPlacedPlayers), so a roster player the map as
 * the director left it does not place is no finding; and the director's answers at the
 * story meeting among the director's words (T1).
 *
 * @param {Object} state
 * @returns {Object}
 */
function buildFactCheckArgs(state) {
  const theme = state.theme || 'journalist';
  const config = state.sessionConfig || {};
  const directorText = directorWords(state).join('\n');
  return {
    contentBundle: state.contentBundle,
    evidenceBundle: state.evidenceBundle,
    roster: config.roster,
    placedPlayers: mapPlacedPlayers(state),
    sessionPhotos: state.sessionPhotos,
    excludedPhotos: (Array.isArray(state.sessionPhotos) ? state.sessionPhotos : [])
      .filter(photo => typeof photo === 'string' && isPhotoExcluded(state, photo)),
    whiteboardPhoto: whiteboardFilenameOf(state),
    reportingMode: config.reportingMode,
    npcs: getThemeNPCEntries(theme),
    rosterPronouns: config.rosterPronouns || null,
    directorText,
    guestReporter: config.guestReporter || null,
    theme,
    directorEdits: judgedEdits('article', state)
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EVALUATION OUTPUT SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Structured-output schema for every phase evaluator (Commit 8.21 shape).
 *
 * PROMPT-REVIEW B4: `criteriaScores: {type:'object'}` and bare `{type:'array'}`
 * issue lists left the emitted shape entirely up to the model, and nothing
 * downstream could read it — buildRevisionContext rendered the per-criterion
 * objects as `[object Object]`. The per-criterion shape (and the string-ness of
 * the two issue lists) is now part of the contract, so the notes/fix the prompt
 * asks for actually survive into the revision prompt.
 *
 * NOTE: no `format` keyword anywhere (SDK #277 — see reports/CLAUDE.md).
 *
 * Phase 3 (3.9; final review judges-factcheck[1], the integrator's ruling): the judge
 * writes a criterion's `fix` only below the bar, and `revisionGuidance` holds only the
 * steps that fix the structural issues. Every passing criterion used to carry a fix and
 * the guidance optional steps, and the automatic reworks acted on them. Shared by both
 * themes, as outputFormat is.
 */
const EVALUATION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    ready: { type: 'boolean' },
    overallScore: { type: 'number' },
    structuralPassed: { type: 'boolean' },
    criteriaScores: {
      type: 'object',
      description: 'One entry per criterion, keyed by criterion name.',
      additionalProperties: {
        type: 'object',
        required: ['score'],
        properties: {
          score: { type: 'number' },
          type: { type: 'string', description: 'structural or advisory' },
          notes: { type: 'string', description: 'Specific explanation naming the characters, IDs or sections at fault' },
          fix: { type: 'string', description: `Only for a score below ${STRUCTURAL_PASS_SCORE}: the one concrete action that brings this criterion up to ${STRUCTURAL_PASS_SCORE}` }
        }
      }
    },
    structuralIssues: {
      type: 'array',
      items: { type: 'string' },
      description: 'Issues that MUST be fixed, one self-contained sentence each'
    },
    advisoryWarnings: {
      type: 'array',
      items: { type: 'string' },
      description: 'Suggestions, not blockers, one self-contained sentence each'
    },
    revisionGuidance: {
      type: 'string',
      description: 'One step per structural issue, each the fix for that issue; empty when there is none'
    },
    confidence: { type: 'string' }
  },
  required: ['ready', 'overallScore', 'structuralPassed']
};

/**
 * What a truth-only judge writes in advisoryWarnings (phase 4, brief 4.4, fix round 1):
 * only its concerns about the director's edits, which the guard and the stop read under
 * DIRECTOR_EDIT_PREFIX (renderJudgeDirectorEdits says how to write one). Its truth
 * criteria are the whole evaluation, so it has no suggestion to give: spec 4.5 lets no
 * notes on the writing reach the meeting. One wording, for the schema and the OUTPUT FORMAT.
 */
const TRUTH_ONLY_ADVISORY_WARNINGS = "only a concern about one of the director's edits; empty when there is none";

/**
 * The structured-output schema a truth-only judge is sent (phase 4, brief 4.4, fix round
 * 1): the judges' schema with no criterion `type`, since each truth criterion's type is
 * its definition's (truthOnlyVerdict sets it), and advisoryWarnings kept for the concerns
 * about the director's edits. Every other field is EVALUATION_JSON_SCHEMA's. The weave's
 * fact check is the first; the article judge moves onto it with its truth-only criteria.
 */
const TRUTH_ONLY_EVALUATION_JSON_SCHEMA = (() => {
  const schema = structuredClone(EVALUATION_JSON_SCHEMA);
  delete schema.properties.criteriaScores.additionalProperties.properties.type;
  schema.properties.advisoryWarnings.description = TRUTH_ONLY_ADVISORY_WARNINGS;
  return schema;
})();

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

// getSdkClient imported from node-helpers.js

const SECTION_RULE = '═══════════════════════════════════════════════════════════════════════════';

/** A boxed section heading, as every judge prompt draws them. */
function boxedHeading(title) {
  return `${SECTION_RULE}\n${title}\n${SECTION_RULE}`;
}

/**
 * The judges' JSON shape, restated in the prompt (the schema itself is EVALUATION_JSON_SCHEMA).
 *
 * Phase 3 (3.9): the must-fix work only, as the schema asks it. Shared by both themes,
 * so the parked detective's judges change with it (the integrator's ruling; a named
 * detective hunk).
 *
 * @param {string} notes - what a criterion's notes hold, for this judge
 * @param {Object} [options]
 * @param {boolean} [options.truthOnly] - a truth-only judge's contract (truthOnlyOutputFormat)
 */
function outputFormat(notes, { truthOnly = false } = {}) {
  const typeLine = truthOnly ? '' : '\n      "type": "structural" | "advisory",';
  const advisories = truthOnly ? TRUTH_ONLY_ADVISORY_WARNINGS : 'issues that are suggestions, not blockers';
  return `OUTPUT FORMAT (JSON):
{
  "ready": boolean,
  "overallScore": number (0-1),
  "structuralPassed": boolean,
  "criteriaScores": {
    "criterionName": {
      "score": number,${typeLine}
      "notes": "${notes}",
      "fix": "only for a score below ${STRUCTURAL_PASS_SCORE}: the one concrete action that brings this criterion up to ${STRUCTURAL_PASS_SCORE}"
    }
  },
  "structuralIssues": [ "issues that MUST be fixed" ],
  "advisoryWarnings": [ "${advisories}" ],
  "revisionGuidance": "one step per structural issue, each the fix for that issue (Step 1: ..., Step 2: ...); empty when there is none",
  "confidence": "high" | "medium" | "low"
}`;
}

/**
 * A truth-only judge's OUTPUT FORMAT (phase 4, brief 4.4, fix round 1), as
 * TRUTH_ONLY_EVALUATION_JSON_SCHEMA states it: the judges' shape with no criterion type,
 * and advisoryWarnings kept for a concern about one of the director's edits. The weave's
 * fact check prints it after TRUTH_ONLY_EVALUATION_RULES; the article judge prints it
 * when it moves onto those rules.
 *
 * @param {string} notes - what a criterion's notes hold, for this judge
 * @returns {string}
 */
function truthOnlyOutputFormat(notes) {
  return outputFormat(notes, { truthOnly: true });
}

/** The weighted criteria of one type, one line each with its percentage. */
function weightedCriteriaList(criteria, wanted) {
  return Object.entries(criteria)
    .filter(([_, { type, truth }]) => !truth && (wanted === 'structural' ? type === 'structural' : (type === 'advisory' || !type)))
    .map(([key, { description, weight }]) =>
      `- ${key} (${Math.round(weight * 100)}%): ${description}`)
    .join('\n');
}

/**
 * Build system prompt for evaluation
 *
 * Phase 3 (3.4): the journalist judges read the rule set (journalistEvaluationSystemPrompt);
 * the detective's article judge is unchanged (detectiveEvaluationSystemPrompt, spec D13).
 * Phase 4 (brief 4.4): the weave's fact check is one prompt for every theme, since the
 * detective's arc judge went with its arc stage (ruling R1); the outline judge went with
 * the map, for both themes (brief 4.6).
 *
 * @param {string} phase - Phase name (arcs, article)
 * @param {Object} criteria - Quality criteria for phase
 * @param {string} theme - Theme name ('journalist' or 'detective')
 * @param {Object} [options]
 * @param {Object|null} [options.sessionConfig] - journalist: its reportingMode picks the mode block
 * @returns {string} System prompt
 */
function buildEvaluationSystemPrompt(phase, criteria, theme = 'journalist', { sessionConfig = null } = {}) {
  if (theme === 'detective' && phase !== 'arcs') return detectiveEvaluationSystemPrompt(phase, criteria);
  return journalistEvaluationSystemPrompt(phase, criteria, sessionConfig);
}

/**
 * The detective's article judge's system prompt, as it was before phase 3 (parked, spec
 * D13; __tests__/unit/workflow/evaluator-nodes.test.js pins it by hash). Its arc judge
 * went with its arc stage (phase 4, brief 4.4; ruling R1), and its outline judge with the
 * map (brief 4.6; R1).
 *
 * @param {string} phase
 * @param {Object} criteria
 * @returns {string}
 */
function detectiveEvaluationSystemPrompt(phase, criteria) {
  // Commit 8.15: Separate structural vs advisory criteria in prompt
  const structuralCriteria = weightedCriteriaList(criteria, 'structural');
  const advisoryCriteria = weightedCriteriaList(criteria, 'advisory');
  const criteriaSections = `${boxedHeading('STRUCTURAL CRITERIA (MUST PASS - these block if failed)')}
${structuralCriteria}

${boxedHeading('ADVISORY CRITERIA (Warn but don\'t block - these are quality guidance)')}
${advisoryCriteria}

EVALUATION RULES:
1. Score each criterion as: pass (1.0), partial (0.5), fail (0.0)
2. STRUCTURAL criteria MUST score >= ${STRUCTURAL_PASS_SCORE} to pass (these are hard requirements)
3. ADVISORY criteria are guidance only - low scores are warnings, not blockers
4. Content is READY if ALL structural criteria pass
5. Content is NOT READY only if a STRUCTURAL criterion fails`;

  if (phase === 'article') {
    return `You are the ARTICLE Evaluator for an investigative article about "About Last Night" - a crime thriller game.

Your task is to evaluate if the article content is ready for human review.

${boxedHeading('IMMUTABLE INPUTS (DO NOT suggest changes to these - they are fixed upstream)')}
The following inputs were approved in earlier phases and CANNOT be modified:
- outline: The article structure is approved
- selectedArcs: The narrative arcs are locked
- evidenceBundle: The evidence is curated and final

Your feedback should focus on how the ARTICLE EXECUTES the outline, not changing the outline.

${boxedHeading('EVALUATION GOAL: COMPELLING GIFT FOR PLAYERS')}
The article should feel like a real investigative piece that celebrates the players' gameplay experience.
Visual distribution serves narrative flow, NOT quota compliance.
A tight article with 3 perfectly-placed evidence cards beats a bloated one with 10 forced cards.

${criteriaSections}

CRITICAL CHECKS:
- voiceConsistency: Report MUST use third-person investigative voice ("The investigation revealed", "Evidence indicates")
- antiPatterns: Report MUST NOT contain the bare system label "token" (the in-world phrase "memory token" is ALLOWED and correct), "Act 1/2/3", game terminology, "character sheet"

CRITICAL: Your feedback MUST be actionable. Include:
- SPECIFIC lines with voice issues
- SPECIFIC anti-patterns found with line locations
- CONCRETE fixes (not "improve voice" but "change 'I discovered' to 'The investigation revealed'")


${outputFormat('specific explanation with line references')}

Remember: You determine READINESS for human review, not approval. Human always makes final decision.
STRUCTURAL issues block. ADVISORY issues are warnings for human consideration.`;
  }

  // Fallback for any unknown phase (shouldn't happen)
  throw new Error(`Unknown evaluation phase: ${phase}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// THE JOURNALIST JUDGES' RULES (phase 3, 3.4)
// ═══════════════════════════════════════════════════════════════════════════
//
// Placement ruling (plan, "Rulings"): the world, the truth rules and the mode block go
// in the system prompt, the stable frame, read first; the judge's craft reference goes
// in the user prompt, after the material it judges (buildEvaluationUserPrompt).

/** The rule-set call each journalist judge reads (lib/rule-set.js): its writer's list. */
const JUDGE_RULE_CALLS = { arcs: 'judge-arc', article: 'judge-article' };

/** The writer whose output each judge judges, as the prompts name it. */
const JUDGED_WRITERS = { arcs: 'arc writer', article: 'article writer' };

/**
 * How a truth finding quotes the text at fault, per judge. A breach in the weave names
 * the thread it is in (phase 4, brief 4.4), so the fix and the meeting find its line.
 */
const TRUTH_FINDING_QUOTE = {
  arcs: 'quotes the text at fault, names the thread it is in by its id (or the field, for the story, the question, the headline, the convergence or a connection)',
  article: 'quotes the sentence and names its section'
};

/**
 * The scoring rules a truth-only judge reads (phase 4, brief 4.4): its truth criteria
 * are the whole evaluation, with no weighted average and no advisory criteria, and
 * overallScore comes from the truth criteria. The weave's fact check reads them now; the
 * article judge moves onto them in its own slice. Its output contract follows them
 * (truthOnlyOutputFormat), and code holds its verdict to that contract (truthOnlyVerdict).
 */
const TRUTH_ONLY_EVALUATION_RULES = `EVALUATION RULES:
1. The truth criteria above are the whole evaluation: each finding is a breach of a truth rule.
2. Score each truth criterion from 0.0 to 1.0. The output is READY, with structuralPassed true, when every truth criterion scores ${STRUCTURAL_PASS_SCORE} or more.
3. overallScore is the lowest truth-criterion score.`;

/** The journalist judges' scoring rules (M30: they say how the score is made). */
const JOURNALIST_EVALUATION_RULES = `EVALUATION RULES:
1. Score each criterion from 0.0 to 1.0.
2. STRUCTURAL criteria MUST score >= ${STRUCTURAL_PASS_SCORE} to pass (these are hard requirements); a truth criterion with any breach fails.
3. ADVISORY criteria are guidance only - low scores are warnings, not blockers
4. Content is READY if ALL structural criteria pass, the truth criteria among them
5. overallScore is the weighted average of the weighted criteria's scores, by the percentages above. The truth criteria carry no percentage: they decide readiness alone.`;

/**
 * The truth criteria and how to write a breach, or '' when the criteria carry none.
 *
 * @param {'arcs'|'article'} phase
 * @param {Object} criteria
 * @returns {string}
 */
function truthCriteriaSection(phase, criteria) {
  const lines = Object.entries(criteria)
    .filter(([_, { truth }]) => truth)
    .map(([key, { rules, description }]) => `- ${key} (${rules.join(', ')}; must pass): ${description}`);
  if (lines.length === 0) return '';
  return `${boxedHeading('TRUTH RULES (MUST PASS: a breach is a definite error, so the output goes back for a rework)')}
Each criterion below scores the truth rules it names, against the record and the director's words in the evaluation prompt. One breach fails it: score it below ${STRUCTURAL_PASS_SCORE}.
${lines.join('\n')}

Write each breach as its own structuralIssues entry, so the rework can fix it. The entry opens with the rule ids and a colon, ${TRUTH_FINDING_QUOTE[phase]}, names the record it contradicts, and gives the fix:
T3: "<the text at fault>" states what a buried memory said; the record holds only its sale (<time>, <amount>, <account>). Report the sale instead.

`;
}

/**
 * Where a craft finding goes: should-consider, naming its item.
 *
 * Phase 3 (3.9; R22): a craft finding is an editor's note for the director, never a
 * blocker and never the rework's task. Nothing in code holds a draft on an advisory,
 * a truth-labelled one included (R22): only a truth criterion below the bar holds it
 * (failedTruthCriteria).
 */
function craftFindingsSection(phase) {
  return `${boxedHeading('CRAFT FINDINGS (should-consider)')}
The evaluation prompt ends with the craft guidance the ${JUDGED_WRITERS[phase]} followed, as your reference for craft. A craft finding that no criterion above scores goes in advisoryWarnings and opens with its item's id, such as C10: an editor's note for the director, never a blocker.`;
}

/**
 * A journalist judge's system prompt: the identity line, the session's mode block, the
 * world and the truth rules (loadRuleSet), then the judge's own instructions.
 *
 * The 4b fix batch (3.9 review minor 4): each judge's "MUST be actionable" block asks
 * for concrete fixes for the criteria scored below the bar and the structural issues,
 * the two places the OUTPUT FORMAT asks for them; it used to ask for them in general.
 * Judge text writes the bar as STRUCTURAL_PASS_SCORE, the detective's included.
 *
 * @param {'arcs'|'article'} phase
 * @param {Object} criteria - getPhaseCriteria(phase, 'journalist'), or any criteria to render
 * @param {Object|null} sessionConfig - its reportingMode picks the mode block
 * @returns {string}
 */
function journalistEvaluationSystemPrompt(phase, criteria, sessionConfig) {
  const call = JUDGE_RULE_CALLS[phase];
  if (!call) throw new Error(`Unknown evaluation phase: ${phase}`);
  const { core } = loadRuleSet(call);
  const writer = JUDGED_WRITERS[phase];
  const judged = TRUTH_SUBJECTS[phase];
  const frame = `The rules above are the ones the ${writer} followed: judge ${judged} by them, against the record and the director's words in the evaluation prompt.`;
  // The article judge: the truth criteria, then the weighted criteria, the craft findings
  // and the weighted scoring rules.
  const judging = () => `${truthCriteriaSection(phase, criteria)}${boxedHeading('STRUCTURAL CRITERIA (MUST PASS - these block if failed)')}
${weightedCriteriaList(criteria, 'structural')}

${boxedHeading('ADVISORY CRITERIA (Warn but don\'t block - these are quality guidance)')}
${weightedCriteriaList(criteria, 'advisory')}

${craftFindingsSection(phase)}

${JOURNALIST_EVALUATION_RULES}`;

  let prompt;
  if (phase === 'arcs') {
    // Phase 4 (brief 4.4; spec 4.5): the weave's fact check scores the truth criteria
    // alone, by the truth-only rules, and reads no craft file (RULE_SET_CALLS['judge-arc']).
    // Its weighted criteria, its craft findings and the arc lists (roster coverage, NPCs
    // in placements, source labels) went with the arcs.
    prompt = `You are the WEAVE fact check for an investigative article about one session of the game: you check the weave the arc writer wrote, before the director reads it at the story meeting.

${core}

Your task is to find each breach of the truth rules in the weave. ${frame}

${truthCriteriaSection(phase, criteria)}${TRUTH_ONLY_EVALUATION_RULES}

${truthOnlyOutputFormat('the breach: the text at fault, the thread it is in, and the record it contradicts')}`;
  } else {
    prompt = `You are the ARTICLE Evaluator for an investigative article about "About Last Night" - a crime thriller game.

${core}

Your task is to evaluate if the article content is ready for human review. ${frame}

${boxedHeading('IMMUTABLE INPUTS (DO NOT suggest changes to these - they are fixed upstream)')}
The following inputs were approved in earlier phases and CANNOT be modified:
- outline: The article structure is approved
- selectedArcs: The narrative arcs are locked
- evidenceBundle: The evidence is curated and final

Your feedback should focus on how the ARTICLE EXECUTES the outline, not changing the outline.

${boxedHeading('EVALUATION GOAL: COMPELLING GIFT FOR PLAYERS')}
The article should feel like a real investigative piece that celebrates the players' gameplay experience.
Visual distribution serves narrative flow, NOT quota compliance.

${judging()}

CRITICAL: Your feedback MUST be actionable. Include:
- SPECIFIC lines with voice issues
- SPECIFIC anti-patterns found with line locations
- CONCRETE fixes for each criterion scored below ${STRUCTURAL_PASS_SCORE} and each structural issue (not "improve voice" but "change 'The investigation revealed' to 'I discovered'")

${outputFormat('specific explanation with line references')}

Remember: You determine READINESS for human review, not approval. Human always makes final decision.
STRUCTURAL issues block. ADVISORY issues are warnings for human consideration.`;
  }

  // The mode block goes right after the identity line, where every writer has it.
  return withReportingModeBlock(prompt, sessionConfig, 'journalist');
}

// ═══════════════════════════════════════════════════════════════════════════
// WHAT EACH JUDGE SEES (phase 2, brief 2.4)
// ═══════════════════════════════════════════════════════════════════════════
//
// The judges used to score what they could not see: the outline and article
// judges had no documents, and the article judge was asked whether every roster
// member is named with no roster in its prompt. Each judge now reads the record view
// and the inputs its writer read, through the writers' own renderers and builders,
// with the roster with pronouns, the director's notes with the input-review
// corrections, and the director's accusation beside its parse (roadmap 2.4,
// docs/superpowers/plans/2026-09-22-roadmap.md). The outline judge went with the map
// (phase 4, brief 4.6).

/**
 * What a judge's PHOTOS list holds, in order (T13): the article judge's phrase (the 4b
 * fix batch).
 *
 * @param {Array<{hero?: boolean}>} photos - the list, hero first when there is one
 * @returns {string}
 */
function judgePhotosOrder(photos) {
  return photos[0]?.hero
    ? 'the hero image, then every other photo the director has not excluded'
    : 'every photo the director has not excluded';
}

/**
 * The article judge's photos (phase 3, 3.4 fix round 1): the photos the article writer
 * was given, so photosTruth asks a rework only for photos it can see.
 *
 * Phase 3 (3.9; T13, the integrator's ruling): built from the article writer's own
 * inputs (ai-nodes.js articleWriterInputs, options.photos): the hero image, then every
 * other photo the director kept, without the whiteboard, each once. It used to be the
 * arc packages' photos, so a kept photo no package listed reached neither the writer
 * nor the judge. Each is the writer's entry, from the writer's own builder: the names
 * identified in it and the director's description, joined by filename
 * (renderPhotoListEntry, the 4b fix batch).
 *
 * @param {Object} state
 * @returns {string}
 */
function renderArticleJudgePhotos(state) {
  const writerInputs = articleWriterInputs(state);
  const { photos = [], photoDescriptions = null } = writerInputs[writerInputs.length - 1] || {};
  if (photos.length === 0) return 'PHOTOS (the article writer was given none)';

  const entries = photos.map((photo, i) => renderPhotoListEntry(photo, i, photoDescriptions));
  return `PHOTOS (the ${photos.length} photos the article writer was given: ${judgePhotosOrder(photos)}, without the whiteboard photo; each gives the names identified in it and the director's description, joined by filename):

${entries.join('\n\n')}`;
}

/**
 * The account totals the article writer copies (phase 3, 3.9; the integrator's ruling):
 * the writers' own FINANCIAL_SUMMARY, from the same builder and
 * the same input (PromptBuilder#_buildFinancialSummary over state.shellAccounts), so
 * moneyTruth checks a writer's figures against the figures it was given. At the gate
 * five of eight verdicts took the correct code-made total for a sum the writer made.
 *
 * @param {Object} state
 * @returns {string} the block, or '' when no account has a positive total
 */
function renderJudgeFinancialSummary(state) {
  return getPromptBuilder(null, state)._buildFinancialSummary(state.shellAccounts || []).trim();
}

/**
 * The session roster for the article judge: the players present, by
 * the full names the writers' SESSION_FACTS lists (ai-nodes.js buildSessionFacts).
 *
 * @param {Object|null} sessionFacts
 * @returns {string}
 */
function renderJudgeSessionRoster(sessionFacts) {
  if (!sessionFacts) return 'SESSION ROSTER: none recorded for this session.';
  return `SESSION ROSTER (${sessionFacts.playerCount} players who were present at this session's investigation):
${sessionFacts.roster.join('\n')}`;
}

/**
 * The roster with pronouns, for every judge: the section the article writer's
 * system prompt carries, from the PromptBuilder roster method
 * (PromptBuilder#_rosterSection), reached through the writers' builder factory.
 * The detective theme's section has no pronouns, as the detective writer's has none.
 *
 * @param {Object} state
 * @returns {string}
 */
function renderJudgeRosterSection(state) {
  return getPromptBuilder(null, state)._rosterSection();
}

/**
 * The director's notes and input-review corrections, for every judge, through
 * the renderer every writer uses (director-notes-renderer.js, which appends
 * renderDirectorCorrectionsBlock). The corrections follow the notes, which are
 * never rewritten.
 *
 * @param {Object} state
 * @param {string} [heading] - the notes' heading; the weave's fact check gives the arc
 *   writer's own label (ARC_NOTES_LABEL), so the two read the notes under one text
 * @returns {string}
 */
function renderJudgeDirectorNotes(state, heading = "THE DIRECTOR'S NOTES (the director's own account of the investigation, with any input-review corrections after it):") {
  const notes = state.directorNotes || {};
  const listOf = (value) => (Array.isArray(value) ? value : []);
  return `${heading}
${renderDirectorEnrichmentBlock({
  rawProse: notes.rawProse || '',
  quotes: listOf(notes.quotes),
  transactionReferences: listOf(notes.transactionReferences),
  postInvestigationDevelopments: listOf(notes.postInvestigationDevelopments),
  corrections: state.inputReviewCorrections || [],
  sessionConfig: withSessionClock(state.sessionConfig, state.evidenceBundle)
})}`;
}

/**
 * The director's words and the roster for the article judge, which reads them as its
 * writer does: the session roster, the roster with pronouns,
 * the verdict as SESSION_FACTS prints it (renderSessionFactsVerdict: the parsed
 * accusation, then the director's account word for word, then the whiteboard),
 * and the director's notes with the corrections after them.
 *
 * @param {Object} state
 * @returns {string}
 */
function renderJudgeSessionContext(state) {
  const sessionFacts = buildSessionFacts(state);
  const verdictSection = sessionFacts ? `\n\n${renderSessionFactsVerdict(sessionFacts)}` : '';
  return `${renderJudgeSessionRoster(sessionFacts)}

${renderJudgeRosterSection(state)}${verdictSection}

${renderJudgeDirectorNotes(state)}`;
}

/**
 * The fact check's result for the bundle under review (wave-2 ruling W2): its
 * structural issues and its advisories, as two lists under a plain label. Nothing
 * else of the result object is shown.
 *
 * @param {Object|null} factCheck - factCheckContentBundle's result for this bundle
 * @returns {string}
 */
function renderJudgeFactCheck(factCheck) {
  const heading = 'THE FACT CHECK ON THIS BUNDLE (the pipeline\'s programmatic check of the content bundle above; it ran before this evaluation):';
  if (!factCheck) return `${heading}\nIt did not run: there was no content bundle to check.`;
  const list = (items) => {
    const lines = (Array.isArray(items) ? items : []).filter(item => typeof item === 'string' && item.trim());
    return { count: lines.length, text: lines.length > 0 ? lines.map(line => `- ${line}`).join('\n') : '- none' };
  };
  const structural = list(factCheck.structuralIssues);
  const advisory = list(factCheck.advisoryWarnings);
  return `${heading}
Structural issues (${structural.count}):
${structural.text}
Advisories (${advisory.count}):
${advisory.text}`;
}

/**
 * The director's edits in the judged output (F1; spec 2026-10-02 section 7), for the
 * article judge of both themes, right after the output it judges: each by
 * id, with its place and the director's text, or for a cut the text removed; under a
 * rewrite, each sentence it removed (FA). EDIT_LINES_GUIDE says how to read the lines,
 * in the same words the reworks' <HAND_EDITS> block uses. The text
 * is the director's own and record, so the judge scores the writer's text, and a
 * disagreement with an edit goes in advisoryWarnings under DIRECTOR_EDIT_PREFIX and the
 * edit's id, where the verdict guard and the console find it. The rule is about the
 * director's authority, not craft, so the parked detective reads it too (the
 * integrator's ruling), with a criterion of its own in the example. '' with no edits.
 *
 * The weave's fact check (brief 4.5; R11) reads the director's changes at the story
 * meeting the same way, right after the weave, in the meeting's own words
 * (WEAVE_EDIT_LINES_GUIDE): it judges the writer's text, and a breach in a change of the
 * director's is a concern for the meeting, under the change's id.
 *
 * @param {Object[]|undefined} edits - judgedEdits
 * @param {'arcs'|'article'} phase
 * @param {string} theme
 * @returns {string}
 */
function renderJudgeDirectorEdits(edits, phase, theme) {
  const list = Array.isArray(edits) ? edits : [];
  if (list.length === 0) return '';
  if (phase === 'arcs') {
    return `THE DIRECTOR'S EDITS (record: the director's own changes at the story meeting, each final as the director left it):
The lines below are the director's changes to the weave above. ${WEAVE_EDIT_LINES_GUIDE} A change is the final word on its text, so score each criterion, and write each structural issue, on the writer's text alone. Where a change of the director's breaks a truth rule, write the concern in advisoryWarnings, opening with the change's id and then the rule it concerns, as in: ${DIRECTOR_EDIT_PREFIX}E1: T1: <the concern>.

${formatEditLines(list)}`;
  }
  const output = 'the content bundle above';
  const example = `${DIRECTOR_EDIT_PREFIX}E1: ${theme === 'detective' ? 'evidenceIntegration' : 'T1'}: <the concern>`;
  return `THE DIRECTOR'S EDITS (record: the director's own text, each final as the director left it):
Each edit below is text the director wrote into ${output}, text they cut from it (marked cut), or a block they moved (marked moved). ${EDIT_LINES_GUIDE} An edit is the final word on its text, so score each criterion, and write each structural issue, on the writer's text alone. Where you disagree with an edit, or would bring back a cut or a removed sentence, write the concern in advisoryWarnings, opening with the edit's id and then the rule or criterion it concerns, as in: ${example}.

${formatEditLines(list)}`;
}

/**
 * A journalist judge's craft reference: its writer's craft files (loadRuleSet), for
 * the user prompt after the material it judges (the placement ruling). A craft finding
 * is should-consider; the system prompt says where it goes.
 *
 * @param {'arcs'|'article'} phase
 * @returns {string}
 */
function renderJudgeCraft(phase) {
  const { craft } = loadRuleSet(JUDGE_RULE_CALLS[phase]);
  return `THE CRAFT GUIDANCE the ${JUDGED_WRITERS[phase]} followed, your reference for craft findings:
${craft}`;
}

/**
 * The printed fields of each content block, by type: the one list (lib/hand-edit-diff.js
 * PRINTED_FIELDS), which the director's edits read their text from too (FA, known item 6).
 */
const PRINTED_BLOCK_FIELDS = PRINTED_FIELDS.blocks;

/** `source`'s own values for `keys`, in that order; a key it lacks is left out. */
function pickFields(source, keys) {
  const out = {};
  if (!source || typeof source !== 'object') return out;
  for (const key of keys) if (source[key] !== undefined) out[key] = source[key];
  return out;
}

/**
 * The content bundle as the journalist page prints it, for the article judge (phase 3,
 * 3.4; HY1): a judge reads only what the reader will read. On 092026 the judge scored
 * roster coverage from `voice_self_check`, the writer's own report on itself.
 *
 * Kept: the headline, kicker and deck; the byline's author, title and guest reporter;
 * the hero's filename and caption; each section's id and heading and each block's
 * printed fields (a block type the template does not know prints as a paragraph);
 * each sidebar entry's headline, summary and significance badge; and the writer's
 * `financialTracker` when the page prints it (printedWriterTracker: no ledger account
 * has a positive total). Ids and filenames stay as the names of what prints. Left out:
 * `voice_self_check`, `pullQuotes`, the top-level `photos`, the writer's tracker when
 * the page prints the ledger's in its place, `metadata`, `_revisionHistory`, a sidebar
 * entry's `content` and `owner`, the characters on a photo or the hero, and the byline's
 * location and date.
 *
 * @param {Object|null} bundle
 * @param {Array|null} [shellAccounts] - state.shellAccounts, the ledger the page prints from
 * @returns {Object}
 */
function printedBundle(bundle, shellAccounts) {
  if (!bundle || typeof bundle !== 'object') return {};
  const out = {};
  const tracker = printedWriterTracker(bundle.financialTracker, shellAccounts);
  if (bundle.headline && typeof bundle.headline === 'object') out.headline = pickFields(bundle.headline, PRINTED_FIELDS.headline);
  if (bundle.byline && typeof bundle.byline === 'object') out.byline = pickFields(bundle.byline, PRINTED_FIELDS.byline);
  if (bundle.heroImage && typeof bundle.heroImage === 'object') out.heroImage = pickFields(bundle.heroImage, PRINTED_FIELDS.heroImage);
  if (Array.isArray(bundle.sections)) {
    out.sections = bundle.sections
      .filter(section => section && typeof section === 'object')
      .map(section => ({
        ...pickFields(section, PRINTED_FIELDS.section),
        content: (Array.isArray(section.content) ? section.content : [])
          .filter(block => block && typeof block === 'object')
          .map(block => pickFields(block, PRINTED_BLOCK_FIELDS[block.type] || ['type', 'text']))
      }));
  }
  if (Array.isArray(bundle.evidenceCards)) {
    out.evidenceCards = bundle.evidenceCards
      .filter(entry => entry && typeof entry === 'object')
      .map(entry => pickFields(entry, PRINTED_FIELDS.sidebarCard));
  }
  if (tracker) out.financialTracker = tracker;
  return out;
}

/**
 * The writer's financial tracker as the page prints it: each entry's description and
 * amount, and the total. Whether the page prints it is the page's own rule
 * (template-assembler.js writerTrackerPrints, task 4.3b): when no ledger account has a
 * positive total and it has an entry. Otherwise the page prints the ledger's tracker, or
 * none, and this returns null.
 *
 * @param {Object|undefined} tracker - the bundle's financialTracker
 * @param {Array|null} shellAccounts - state.shellAccounts
 * @returns {{entries: Object[], totalExposed?: string}|null}
 */
function printedWriterTracker(tracker, shellAccounts) {
  if (!writerTrackerPrints(tracker, shellAccounts)) return null;
  const entries = tracker.entries
    .filter(entry => entry && typeof entry === 'object')
    .map(entry => pickFields(entry, PRINTED_FIELDS.trackerEntry));
  return { entries, ...pickFields(tracker, PRINTED_FIELDS.tracker) };
}

/**
 * Build user prompt with content to evaluate
 *
 * Phase 3 (3.4), journalist only: each judge's craft reference follows the material it
 * judges; the arc judge reads the record view's morning timeline in place of a buried
 * list of its own; the article judge reads only the bundle's printed fields, and its
 * mode line points at the mode block its system prompt carries. The detective's user
 * prompts are unchanged.
 *
 * Phase 3 (3.9), journalist only: the article judge reads its writer's FINANCIAL_SUMMARY
 * right after the record (renderJudgeFinancialSummary), and its PHOTOS is every photo
 * its writer was given (renderArticleJudgePhotos). Phase 4 (brief 4.6): the outline judge
 * went with the map.
 *
 * @param {string} phase - Phase name
 * @param {Object} state - Current state with content
 * @param {Object} [options]
 * @param {Object|null} [options.factCheck] - article only: the fact check's result
 *   for the bundle under review, as createEvaluator computed it this pass. The
 *   state's `_articleFactCheck` is not read: before this evaluation writes it, it
 *   belongs to the previous bundle.
 * @param {Object[]} [options.directorEdits] - the director's edits the judged output carries
 *   (judgedEdits; F1), printed right after that output: the article's, and at the story
 *   meeting the weave's (brief 4.5)
 * @returns {string} User prompt
 */
function buildEvaluationUserPrompt(phase, state, options = {}) {
  const journalist = (state.theme || 'journalist') !== 'detective';
  const directorEditsSection = renderJudgeDirectorEdits(options.directorEdits, phase, state.theme || 'journalist');
  const afterJudged = directorEditsSection ? `${directorEditsSection}\n\n` : '';
  switch (phase) {
    case 'arcs': {
      // Phase 4 (brief 4.4): the weave's fact check reads the weave, without its mark,
      // then what the arc writer read for the truth rules: the verdict beside the
      // director's account of it, the roster with pronouns, the director's notes under
      // the arc writer's own label, and the record with its morning timeline. The weave's
      // receipts and its verdict thread are the code checks', and no craft file is read.
      //
      // Brief 4.5: after a director's round it reads the weave as it judges it (no struck
      // connection, no answer), the director's changes right after it, and their answers
      // after the notes, as the director's words (T1).
      const answers = renderDirectorAnswers(state.weave && state.weave.questions);
      return `Check this weave against the record and the director's words:

WEAVE:
${JSON.stringify(weaveForJudge(state.weave) || null, null, 2)}

${afterJudged}THE ACCUSATION (the parsed verdict, then the director's account word for word):
${renderArcAccusation(state.playerFocus?.accusation, directorAccusationText(state), "Players' Reasoning")}

${renderJudgeRosterSection(state)}

${renderJudgeDirectorNotes(state, ARC_NOTES_LABEL)}${answers ? `\n\n${answers}` : ''}

${renderRecordView(state.evidenceBundle, { sessionConfig: state.sessionConfig })}

Is the weave free of truth-rule breaches?`;
    }

    case 'article': {
      // BASELINE §4 class 6: the evaluator could not score reporter mode because
      // it was never told which mode the session ran in.
      const reportingMode = state.sessionConfig?.reportingMode === 'remote' ? 'remote' : 'on-site';

      if (journalist) {
        // Phase 3 (3.4): the mode block in the system prompt states T8 for this mode
        // (exposed memories reach Nova by turn-in; since 3.9, remote, the room's events
        // are told as scenes), and reporterMode scores it; this line names the mode, once.
        // Phase 3 (3.9): the account totals the article writer copied, after the record.
        const articleMoney = renderJudgeFinancialSummary(state);
        return `Evaluate this article content:

REPORTING MODE FOR THIS SESSION: ${reportingMode} (the mode block in your instructions says what Nova could witness; reporterMode scores it)

${renderJudgeSessionContext(state)}

${renderRecordView(state.evidenceBundle, { sessionConfig: state.sessionConfig })}${articleMoney ? `\n\n${articleMoney}` : ''}

${renderArticleJudgePhotos(state)}

The content bundle below holds only the fields the published page prints.
CONTENT BUNDLE:
${JSON.stringify(printedBundle(state.contentBundle, state.shellAccounts), null, 2)}

${afterJudged}OUTLINE:
${JSON.stringify(withoutWriterQuestions(state.outline || {}), null, 2)}

${renderJudgeFactCheck(options.factCheck || null)}

${renderJudgeCraft('article')}

Is this article ready for human review?`;
      }

      const modeRule = reportingMode === 'remote'
        ? 'The reporter was NOT in the room. Every exposure, observation and the verdict reached them as tips from people who were there, and must be written and attributed that way. A first-person claim to have been present is a STRUCTURAL failure. The attribution shows the absence, so the article states it at most once: stating it more than once ("I was not there.", "I was not in that room.") is a reporterMode defect, not a sign of voice.'
        : 'The reporter watched the investigation from inside the room and spoke to people there, but was NOT at the party; the party reaches them only through exposed memories.';

      // Brief 2.4: the roster, the verdict, the notes and the record, each built by the
      // function the article writer's prompt uses (renderJudgeSessionContext), and the
      // fact check's result for this bundle.
      return `Evaluate this article content:

REPORTING MODE FOR THIS SESSION: ${reportingMode}
${modeRule}
In BOTH modes the reporter never votes and owns no exposed memory. "I voted", "my vote" and "one of them was mine" are STRUCTURAL failures either way.

${renderJudgeSessionContext(state)}

${renderRecordView(state.evidenceBundle, { sessionConfig: state.sessionConfig })}

CONTENT BUNDLE:
${JSON.stringify(withoutWriterQuestions(state.contentBundle || {}), null, 2)}

${afterJudged}OUTLINE:
${JSON.stringify(withoutWriterQuestions(state.outline || {}), null, 2)}

${renderJudgeFactCheck(options.factCheck || null)}

Is this article ready for human review?`;
    }

    default:
      throw new Error(`Unknown evaluation phase: ${phase}`);
  }
}

// safeParseJson imported from node-helpers.js

/**
 * Get revision count field name for phase
 * @param {string} phase - Phase name
 * @returns {string} State field name for revision count
 */
function getRevisionCountField(phase) {
  switch (phase) {
    case 'arcs': return 'arcRevisionCount';
    case 'article': return 'articleRevisionCount';
    default: throw new Error(`Unknown phase: ${phase}`);
  }
}

/**
 * Get revision cap for phase
 * @param {string} phase - Phase name
 * @returns {number} Maximum revisions allowed
 */
function getRevisionCap(phase) {
  switch (phase) {
    case 'arcs': return REVISION_CAPS.ARCS;
    case 'article': return REVISION_CAPS.ARTICLE;
    default: return 2;
  }
}

/**
 * Get checkpoint type for phase
 * @param {string} phase - Phase name
 * @returns {string} Checkpoint type constant
 */
function getCheckpointType(phase) {
  switch (phase) {
    case 'arcs': return CHECKPOINT_TYPES.ARC_SELECTION;
    case 'article': return CHECKPOINT_TYPES.ARTICLE;
    default: return null;
  }
}

/**
 * Get PHASES constant for evaluation phase
 * @param {string} phase - Phase name
 * @returns {string} PHASES constant value
 */
function getPhaseConstant(phase) {
  switch (phase) {
    case 'arcs': return PHASES.ARC_EVALUATION;
    case 'article': return PHASES.ARTICLE_EVALUATION;
    default: throw new Error(`Unknown phase: ${phase}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EVALUATOR FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create an evaluator function for a specific phase
 * DRY pattern: shared evaluation logic, phase-specific criteria
 *
 * @param {string} phase - Phase name (arcs, article)
 * @param {Object} options - Evaluator options
 * @returns {Function} Evaluator node function
 */
function createEvaluator(phase, options = {}) {
  const { model = 'haiku' } = options;

  // Validate the phase now; the criteria themselves are resolved per theme at runtime.
  getPhaseCriteria(phase, 'journalist');

  /**
   * Evaluator node function
   * @param {Object} state - Current state
   * @param {Object} config - Graph config
   * @returns {Object} Partial state update
   */
  return async function evaluatePhase(state, config) {
    // Resolve criteria: every phase's are theme-aware (phase 3, 3.4: the journalist's
    // carry the truth criteria; the detective's are unchanged).
    const theme = state.theme || 'journalist';
    const criteria = getPhaseCriteria(phase, theme);
    // Phase 4 (brief 4.4, fix round 1): a judge whose criteria are all truth criteria gets
    // the truth-only schema and verdict (the weave's fact check; the article judge in 4.7).
    const truthOnly = isTruthOnly(criteria);
    const phaseConstant = getPhaseConstant(phase);
    const revisionCountField = getRevisionCountField(phase);
    const revisionCap = getRevisionCap(phase);
    // NOTE: checkpointType removed in Commit 8.26 (SRP - checkpoints moved to checkpoint-nodes.js)
    const currentRevisions = state[revisionCountField] || 0;

    // Skip logic 1: If user has already approved this phase (checkpoint approval flag set)
    // For arcs: the story meeting's approval (lib/weave.js isMeetingApproved)
    // For article: articleApproved means user approved article at checkpoint
    const hasUserApproved = (
      (phase === 'arcs' && isMeetingApproved(state)) ||
      (phase === 'article' && state.articleApproved === true)
    );
    if (hasUserApproved) {
      console.log(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] Skipping - user already approved (downstream data exists)`);
      // Add synthetic evaluation history entry so router knows this phase passed
      return {
        evaluationHistory: {
          phase,
          timestamp: new Date().toISOString(),
          ready: true, // Mark as ready so router proceeds to next phase
          skippedReason: 'user-already-approved',
          confidence: 'high'
        },
        currentPhase: phaseConstant
      };
    }

    // Skip logic 2: the weave's fact check skips by its mark on the weave; the article
    // judge by its most recent evaluation.
    if (phase === 'arcs') {
      // Phase 4 (brief 4.4): the weave's fact check runs once per round. It marks the
      // weave it judged (below), and skips a marked weave: the fix keeps the mark, a
      // replay finds it, and only a director's round writes a weave without it. The
      // history is not read, so a rollback that clears it never costs a second call.
      if (isWeaveJudged(state.weave)) {
        console.log('[evaluateArcs] Skipping - the fact check has judged this weave');
        return { currentPhase: phaseConstant };
      }
      if (!isWeave(state.weave)) {
        console.log('[evaluateArcs] Skipping - the state holds no weave to check');
        return {
          evaluationHistory: { phase, timestamp: new Date().toISOString(), ready: false, reason: 'no-weave' },
          currentPhase: phaseConstant
        };
      }
    } else {
      // Skip logic 2: Check MOST RECENT evaluation for this phase
      // (not first ready=true — that persists across revisions and blocks re-evaluation)
      //
      // Phase 3 (3.9; the ledger's Gate 3 finding): an entry escalated to the director is
      // the verdict on the output at the stop, so a replay from START skips it as it skips
      // a ready one; the route then takes the cap to the stop. At the gate each replay at
      // an escalated stop paid for its evaluation again. Every rework and every rollback
      // appends a not-ready stub first (graph.js increment*Revision, api-helpers.js
      // buildRollbackState), so a changed output is always evaluated.
      const existingEvals = state.evaluationHistory || [];
      const phaseEvals = existingEvals.filter(e => e.phase === phase);
      const mostRecent = phaseEvals[phaseEvals.length - 1];
      if (mostRecent?.ready === true || mostRecent?.escalatedToHuman === true) {
        const why = mostRecent.ready === true ? 'is ready=true' : 'escalated to the director';
        console.log(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] Skipping - most recent ${phase} evaluation ${why}`);
        return {
          currentPhase: phaseConstant
        };
      }
    }

    console.log(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] Starting evaluation (revision ${currentRevisions}/${revisionCap})`);

    // ─────────────────────────────────────────────────────────────────────────
    // ARTICLE: programmatic fact-check BEFORE the Opus evaluation
    // (BASELINE.md §4 classes 1, 2, 5, 7 — mirrors validateArcStructure/evaluateArcs)
    //
    // The measured top failure class is evidence cards carrying invented text
    // under real token IDs: 15 items across 4 of 5 sessions, each a section-level
    // rewrite, and "invisible to the pipeline" — no criterion, no check. All five
    // sessions' article evaluations returned ready:true at 0.88-0.97 on articles
    // that then needed 20-41 manual fixes.
    //
    // These are string checks, so they run first and for free. A structural
    // failure under the revision cap short-circuits the Opus call entirely: there
    // is no sense paying for a quality opinion on a bundle we can already prove
    // misquotes its own sources. At the cap we DO run Opus and escalate to the
    // human with the fact-check attached, because a human needs the full picture.
    // ─────────────────────────────────────────────────────────────────────────
    let factCheck = null;
    // Guarded on contentBundle: reviseContentBundle's error path returns a null
    // bundle and the edge into here is unconditional. A MISSING bundle is not a
    // fact-check failure (it would report every roster member as uncovered and
    // route to a reviser that has nothing to revise) — let the normal path
    // handle it.
    if (phase === 'article' && state.contentBundle) {
      factCheck = factCheckContentBundle(buildFactCheckArgs(state));

      if (factCheck.structuralIssues.length > 0) {
        console.log(`[evaluateArticle] Fact-check found ${factCheck.structuralIssues.length} structural issue(s):`);
        factCheck.structuralIssues.forEach(i => console.log(`  - ${i}`));
      }
      if (factCheck.advisoryWarnings.length > 0) {
        factCheck.advisoryWarnings.forEach(w => console.log(`[evaluateArticle] fact-check advisory: ${w}`));
      }

      if (factCheck.structuralIssues.length > 0 && currentRevisions < revisionCap) {
        console.log('[evaluateArticle] Skipping Opus evaluation - routing straight to revision');
        return {
          evaluationHistory: {
            phase: 'article',
            timestamp: new Date().toISOString(),
            ready: false,
            source: 'fact-check',
            overallScore: 0,
            structuralPassed: false,
            structuralIssues: factCheck.structuralIssues,
            advisoryWarnings: factCheck.advisoryWarnings,
            revisionNumber: currentRevisions
          },
          validationResults: {
            phase: 'article',
            passed: false,
            structuralIssues: factCheck.structuralIssues,
            // F1: a concern about the director's edits is for the director; the rework
            // reads every other advisory.
            advisoryWarnings: factCheck.advisoryWarnings.filter(forTheRework),
            // Each issue string already names the card/tokenId/name and says what
            // to do; buildRevisionContext prints them verbatim to the reviser.
            feedback: factCheck.structuralIssues.join('\n')
          },
          _articleFactCheck: factCheck,
          currentPhase: phaseConstant
        };
      }
    }

    const sdk = getSdkClient(config, `evaluate-${phase}`);

    // F1 (spec 2026-10-02 section 7): the director's edits the judged output carries,
    // one list for the judge's prompt and the verdict guard below.
    const directorEdits = judgedEdits(phase, state);

    try {
      // The prompt is built inside the try (final fix wave): since 2.4 the build
      // creates a PromptBuilder and a ThemeLoader and calls the writers' input builders,
      // and a throw there must land in state like an SDK failure, not reject the graph.
      const systemPrompt = buildEvaluationSystemPrompt(phase, criteria, theme, { sessionConfig: state.sessionConfig || null });
      // Brief 2.4: the article judge reads the fact check's result for THIS bundle
      // (computed above), never the state's _articleFactCheck from the previous one.
      const prompt = buildEvaluationUserPrompt(phase, state, { factCheck, directorEdits });
      const jsonSchema = truthOnly ? TRUTH_ONLY_EVALUATION_JSON_SCHEMA : EVALUATION_JSON_SCHEMA;

      // SDK returns parsed object directly when jsonSchema is provided
      // Commit 8.23: disableTools prevents evaluator from using Grep/Read during evaluation
      const evaluation = await sdk({
        systemPrompt,
        prompt,
        model,
        jsonSchema,
        disableTools: true
      });

      // Commit 8.21: All phases use structuralPassed to determine readiness
      // Advisory issues become warnings, not blockers
      // Backward compat: if structuralPassed not provided, fall back to ready field
      // (guardDirectorEdits reads it).
      //
      // Phase 3 (3.4, R2): a truth-rule breach goes back automatically. A truth
      // criterion the judge scored below the structural bar holds the output to
      // not-ready, whatever the judge's own structuralPassed says, and each breach
      // reaches the rework and the evaluation bar under its rule ids: the judge's own
      // sentence when it wrote one under them, else its criterion notes and fix.
      //
      // F1 (spec 2026-10-02 section 7), the verdict guard: a finding about the director's
      // text moves to the concerns, and a truth criterion holds the output only while an
      // issue under its rules is still structural or its notes quote the writer's text.
      // When every structural issue moved and no truth criterion holds, the output is
      // ready. Fix round 1: the rework reads no criterion notes, fix or guidance located
      // in the director's text, and a record passage the writer's card prints is a
      // citation, not the writer's text (recordTexts). With no edits, this is the rule above.
      const guarded = guardDirectorEdits({
        evaluation,
        criteria,
        edits: directorEdits,
        output: judgedOutput(phase, state),
        record: directorEdits.length > 0 ? recordTexts(state) : []
      });
      // Phase 4 (brief 4.4, fix round 1): a truth-only judge's verdict is held to its
      // contract, so a note on the writing reaches neither the stop nor an automatic pass.
      const guard = truthOnly ? truthOnlyVerdict(guarded, criteria) : guarded;
      if (truthOnly && guard.outsideContract.length > 0) {
        console.log(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] Outside the truth-only contract, left out: ${JSON.stringify(guard.outsideContract)}`);
      }
      const judgeStructuralIssues = guard.kept;
      const isReady = guard.ready;
      if (guard.failedTruth.length > 0) {
        console.log(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] Truth criteria failed: ${guard.failedTruth.map(f => f.key).join(', ')}`);
      }
      if (guard.moved.length + guard.concerns.length > 0) {
        console.log(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] Findings on the director's edits, moved to the concerns: ${guard.moved.length + guard.concerns.length}`);
      }
      // A truth criterion the judge left out of its scores is not scored: logged by
      // name, never a hold on the output.
      const unscoredTruth = unscoredTruthCriteria(evaluation, criteria);
      if (unscoredTruth.length > 0) {
        console.log(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] Truth criteria not scored: ${unscoredTruth.join(', ')}`);
      }

      // Create evaluation history entry
      const historyEntry = {
        phase,
        timestamp: new Date().toISOString(),
        ready: isReady,
        overallScore: evaluation.overallScore,
        // Commit 8.15: Separate structural issues from advisory warnings. F1: the
        // findings the guard moved, then the director's criteria it carried to the
        // concerns, follow the judge's own advisories, for the stop. FA: an advisory that
        // quotes the director's text is a concern in its own place (guard.advisories).
        structuralIssues: judgeStructuralIssues,
        advisoryWarnings: [...guard.advisories, ...guard.moved, ...guard.concerns],
        issues: evaluation.issues || judgeStructuralIssues,  // Backward compat
        confidence: evaluation.confidence || 'medium',
        revisionNumber: currentRevisions
      };

      // Brief 1.3: EVERY outcome writes validationResults, not only a failure.
      //
      // validationResults is one channel shared by the three revisers, and until
      // this slice a pass and an escalation both left the PREVIOUS failure sitting
      // in it. So the next rework prompt — the one the director's send-back
      // triggers — described an evaluation state an hour out of date: on session
      // 091826 it said "Ready: NO" and listed four evidence-card defects the
      // reviser had already fixed.
      //
      // `feedback` and `revisionGuidance` carry the same text under both names, and
      // buildRevisionContext reads revisionGuidance first.
      //
      // A proven defect outranks an opinion. At the cap the fact-check runs
      // without short-circuiting, so Opus can return structuralPassed:true over
      // card defects the fact-check demonstrated. Whenever the fact-check holds
      // structural issues the record says passed:false whatever Opus returned,
      // so no rework prompt ever reads "Ready: YES" above its own ISSUES TO
      // ADDRESS list.
      const factCheckIssues = factCheck ? factCheck.structuralIssues : [];
      const criteriaRules = criteriaRulesOf(criteria);
      const buildValidationResults = (passed) => ({
        phase,
        // Phase 4 (brief 4.4): the weave's fact check stamps the weave it read, as the
        // weave checks do, so its fix and the meeting know the findings are this weave's.
        ...(phase === 'arcs' && { weaveKey: weaveKey(state.weave) }),
        passed: passed && factCheckIssues.length === 0,
        structuralIssues: [
          ...judgeStructuralIssues,
          ...factCheckIssues
        ],
        // F1: the concerns about the director's edits are the director's (the history
        // entry and _articleFactCheck carry them to the stop); the rework reads the rest.
        advisoryWarnings: [
          ...guard.advisories,
          ...((factCheck && factCheck.advisoryWarnings) || [])
        ].filter(forTheRework),
        issues: evaluation.issues,
        // F1, fix round 1: the judge's criteria and guidance as the guard leaves them for
        // the rework, with no notes, fix or guidance step located in the director's text.
        criteriaScores: guard.criteriaScores,
        // FA: each criterion's rule ids, for a later send-back's rework (withoutDirectorsFindings).
        ...(Object.keys(criteriaRules).length > 0 && { criteriaRules }),
        confidence: evaluation.confidence || 'medium',
        revisionGuidance: guard.revisionGuidance,
        feedback: guard.revisionGuidance
      });

      // Debug: Log evaluation result details
      console.log(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] Evaluation result:`);
      console.log(`  - ready: ${isReady}, score: ${evaluation.overallScore}`);
      console.log(`  - structuralPassed: ${evaluation.structuralPassed}`);
      if (evaluation.criteriaScores) {
        Object.entries(evaluation.criteriaScores).forEach(([key, val]) => {
          // The criterion's own type where the judge was given it: a truth-only judge writes none.
          const type = (criteria[key] && criteria[key].type) || (val && val.type);
          const typeLabel = type === 'structural' ? '[STRUCTURAL]' : '[advisory]';
          console.log(`  - ${typeLabel} ${key}: ${val.score} (${val.notes || 'no notes'})`);
        });
      }
      if (evaluation.structuralIssues && evaluation.structuralIssues.length > 0) {
        console.log(`  - STRUCTURAL ISSUES: ${JSON.stringify(evaluation.structuralIssues)}`);
      }
      if (evaluation.advisoryWarnings && evaluation.advisoryWarnings.length > 0) {
        console.log(`  - Advisory warnings: ${JSON.stringify(evaluation.advisoryWarnings)}`);
      }
      if (evaluation.issues && evaluation.issues.length > 0 && !evaluation.structuralIssues) {
        console.log(`  - issues: ${JSON.stringify(evaluation.issues)}`);
      }

      // Phase 4 (brief 4.4; R6): the weave's fact check marks the weave it judged, with
      // its verdict and no fix run yet. The route reads the mark: a breach gets its one
      // fix (graph.js routeArcEvaluation), and the fix keeps the mark, so the stop opens
      // without a second judge call. No escalation at a cap: the fix runs once.
      //
      // Brief 4.5 (R11): a finding located in the director's changes is a concern on the
      // mark, which the meeting shows beside the change's line; no rework reads it.
      if (phase === 'arcs') {
        const concerns = historyEntry.advisoryWarnings.filter((warning) => !forTheRework(warning));
        console.log(`[evaluateArcs] ${isReady ? 'No breach' : 'A breach: one automatic fix'} (score: ${evaluation.overallScore})${concerns.length > 0 ? `, ${concerns.length} concern(s) about the director's changes` : ''}`);
        return {
          evaluationHistory: historyEntry,
          validationResults: buildValidationResults(isReady),
          weave: withFactCheckMark(state.weave, {
            at: historyEntry.timestamp, ready: isReady, fixes: 0, ...(concerns.length > 0 && { concerns })
          }),
          currentPhase: phaseConstant
        };
      }

      // Determine next action based on evaluation result
      if (isReady) {
        console.log(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] Ready for human review (score: ${evaluation.overallScore})`);

        // Commit 8.26 (SRP): Checkpoint logic moved to dedicated checkpoint nodes
        // Evaluator just returns evaluationHistory; graph routes to checkpoint node
        return {
          evaluationHistory: historyEntry,
          ...(factCheck && { _articleFactCheck: factCheck }),
          validationResults: buildValidationResults(true),
          currentPhase: phaseConstant
        };
      }

      // Not ready - check revision cap
      if (currentRevisions >= revisionCap) {
        console.log(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] At revision cap - escalating to human (score: ${evaluation.overallScore})`);

        // B4: `evaluation.issues` is not part of the structural/advisory schema, so
        // this read produced "unspecified issues" on every real escalation. Use the
        // two lists the evaluator actually fills.
        const issuesText = formatIssuesForMessage([
          ...judgeStructuralIssues,
          ...(evaluation.advisoryWarnings || []),
          ...(Array.isArray(evaluation.issues) ? evaluation.issues : [])
        ]);

        // At the cap the human gets the WHOLE picture: the Opus findings plus the
        // programmatic ones we can prove (the fact-check ran above but did not
        // short-circuit, precisely because we are at the cap).
        const factCheckText = factCheck && factCheck.structuralIssues.length > 0
          ? ` Fact-check: ${factCheck.structuralIssues.join(' ')}`
          : '';
        const escalatedHistoryEntry = {
          ...historyEntry,
          escalatedToHuman: true,
          escalationReason: `Reached revision cap (${revisionCap}) with issues: ${issuesText}${factCheckText}`
        };

        // Commit 8.26 (SRP): Checkpoint logic moved to dedicated checkpoint nodes
        // Evaluator just returns escalated evaluationHistory; graph routes to checkpoint node
        return {
          evaluationHistory: escalatedHistoryEntry,
          ...(factCheck && { _articleFactCheck: factCheck }),
          validationResults: buildValidationResults(false),
          currentPhase: phaseConstant
        };
      }

      // Need revision - increment happens in dedicated increment nodes (graph.js)
      console.log(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] Needs revision (score: ${evaluation.overallScore})`);

      return {
        evaluationHistory: historyEntry,
        ...(factCheck && { _articleFactCheck: factCheck }),
        // Note: revision count incremented by incrementXxxRevision nodes in graph.js
        currentPhase: phaseConstant,
        // Return revision guidance in validationResults for revision nodes.
        //
        // B4 + shared channel: validationResults is ONE channel shared by the arc,
        // outline and article revisers, so it carries a `phase` stamp — a reviser
        // drops a block stamped for another phase rather than acting on it. And the
        // structuralIssues/advisoryWarnings the evaluator computed now travel with
        // it instead of being dropped after the log line above.
        validationResults: buildValidationResults(false)
      };

    } catch (error) {
      // GraphInterrupt is intentional - let it propagate to LangGraph executor
      if (error instanceof GraphInterrupt) {
        throw error;
      }

      console.error(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] Error:`, error.message);

      return {
        evaluationHistory: {
          phase,
          timestamp: new Date().toISOString(),
          ready: false,
          _error: error.message,
          revisionNumber: currentRevisions
        },
        ...(factCheck && { _articleFactCheck: factCheck }),
        errors: [{
          phase: phaseConstant,
          type: `${phase}-evaluation-failed`,
          message: error.message,
          timestamp: new Date().toISOString()
        }],
        currentPhase: PHASES.ERROR
      };
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EVALUATOR NODE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Evaluate narrative arcs for quality
 * Uses opus for high-quality evaluation (upgraded from haiku in Commit 8.17)
 */
const evaluateArcs = createEvaluator('arcs', { model: 'opus' });

/**
 * Evaluate article content for quality
 * Uses opus for high-quality evaluation (upgraded from haiku in Commit 8.22)
 */
const evaluateArticle = createEvaluator('article', { model: 'opus' });

// ═══════════════════════════════════════════════════════════════════════════
// MOCK FACTORY FOR TESTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create mock evaluator for testing
 * @param {string} phase - Phase name
 * @param {Object} options - Mock options
 * @returns {Function} Mock evaluator function
 */
function createMockEvaluator(phase, options = {}) {
  const {
    ready = true,
    overallScore = 0.85,
    issues = [],
    shouldFail = false,
    errorMessage = 'Mock evaluation error'
  } = options;

  return async function mockEvaluator(state, config) {
    const phaseConstant = getPhaseConstant(phase);
    const revisionCountField = getRevisionCountField(phase);
    const checkpointType = getCheckpointType(phase);
    const currentRevisions = state[revisionCountField] || 0;

    if (shouldFail) {
      return {
        evaluationHistory: {
          phase,
          timestamp: new Date().toISOString(),
          ready: false,
          _error: errorMessage,
          revisionNumber: currentRevisions
        },
        errors: [{
          phase: phaseConstant,
          type: `${phase}-evaluation-failed`,
          message: errorMessage,
          timestamp: new Date().toISOString()
        }],
        currentPhase: PHASES.ERROR
      };
    }

    const historyEntry = {
      phase,
      timestamp: new Date().toISOString(),
      ready,
      overallScore,
      issues,
      confidence: 'high',
      revisionNumber: currentRevisions
    };

    if (ready) {
      // Mock the checkpoint interrupt for testing
      // In real evaluators, checkpointInterrupt is called here
      return {
        evaluationHistory: historyEntry,
        currentPhase: phaseConstant
      };
    }

    return {
      evaluationHistory: historyEntry,
      [revisionCountField]: currentRevisions + 1,
      currentPhase: phaseConstant,
      validationResults: {
        passed: false,
        feedback: 'Mock revision guidance',
        issues
      }
    };
  };
}

module.exports = {
  // Main evaluator functions (wrapped with LangSmith tracing)
  evaluateArcs: traceNode(evaluateArcs, 'evaluateArcs', {
    stateFields: ['weave', 'evaluationHistory']
  }),
  evaluateArticle: traceNode(evaluateArticle, 'evaluateArticle', {
    stateFields: ['contentBundle', 'evaluationHistory']
  }),

  // Factory for custom evaluators
  createEvaluator,

  // Mock factory for testing
  createMockEvaluator,

  // Export for testing
  _testing: {
    EVALUATION_JSON_SCHEMA,
    // Phase 4 (brief 4.4): the scoring rules a truth-only judge reads, and its contract
    // (fix round 1): the OUTPUT FORMAT, the schema and the verdict held to them
    TRUTH_ONLY_EVALUATION_RULES,
    TRUTH_ONLY_ADVISORY_WARNINGS,
    TRUTH_ONLY_EVALUATION_JSON_SCHEMA,
    outputFormat,
    truthOnlyOutputFormat,
    isTruthOnly,
    truthOnlyVerdict,
    getArcCriteria,
    getArticleCriteria,
    getPhaseCriteria,
    truthCriteria,
    TRUTH_MATERIAL,
    printedBundle,
    buildFactCheckArgs,
    // F1: the director's edits at the judges (scripts/lib/render-calls.js repeats judgedEdits)
    judgedEdits,
    renderJudgeDirectorEdits,
    guardDirectorEdits,
    recordTexts,
    getSdkClient,
    buildEvaluationSystemPrompt,
    buildEvaluationUserPrompt,
    safeParseJson,
    getRevisionCountField,
    getRevisionCap,
    getCheckpointType,
    getPhaseConstant
  }
};

// Self-test when run directly
if (require.main === module) {
  console.log('Evaluator Nodes Self-Test\n');

  // Test with mock SDK client - returns parsed objects directly
  const mockSdkClient = async (options) => {
    // Return different scores based on phase
    if (options.systemPrompt.includes('WEAVE fact check')) {
      return {
        ready: true,
        overallScore: 0.85,
        criteriaScores: {
          coherence: { score: 0.9, notes: 'Good coherence' },
          evidenceGrounding: { score: 0.8, notes: 'Well grounded' }
        },
        issues: [],
        revisionGuidance: null,
        confidence: 'high'
      };
    }

    return {
      ready: true,
      overallScore: 0.75,
      criteriaScores: {},
      issues: [],
      revisionGuidance: null,
      confidence: 'medium'
    };
  };

  const mockState = {
    sessionId: 'self-test',
    weave: { story: 'Test story.', threads: [{ id: 't1', claim: 'Test claim.', role: 'main-thread', receipt: 'ledger', verdict: true }], connections: [], questions: [] },
    playerFocus: { primaryInvestigation: 'Who is the Valet?' },
    evidenceBundle: { exposed: [{ id: 'e1' }], buried: [] },
    contentBundle: { headline: { main: 'Test' }, sections: [] }
  };

  const mockConfig = {
    configurable: { sdkClient: mockSdkClient }
  };

  console.log('Testing evaluateArcs...');
  evaluateArcs(mockState, mockConfig).then(result => {
    console.log('Arcs result:', {
      ready: result.evaluationHistory?.ready,
      phase: result.currentPhase
    });

    console.log('\nTesting evaluateArticle...');
    return evaluateArticle(mockState, mockConfig);
  }).then(result => {
    console.log('Article result:', {
      ready: result.evaluationHistory?.ready,
      phase: result.currentPhase
    });

    console.log('\nSelf-test complete.');
  }).catch(err => {
    console.error('Self-test failed:', err.message);
    process.exit(1);
  });
}

/**
 * Evaluator Nodes - Per-phase quality evaluation for report generation workflow
 *
 * Handles the evaluation sub-phases (2.3, 4.2) of the pipeline:
 * - evaluateArcs: the story meeting's fact check on the weave (phase 4, brief 4.4)
 * - evaluateArticle: the article judge, which checks the article against the truth rules
 *   before the director reads it, after the code fact check (phase 4, brief 4.7a; spec 6.2)
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
// Phase 3 (3.4): each judge reads the rule set its writer reads, from the rules folder of its
// theme (R14), after its theme's identity line (brief 4.13) and the mode block: its system
// prompt opens as a writer's does (prompt-builder.js systemPromptOpening; brief 4.13b).
const { systemPromptOpening } = require('../../prompt-builder');
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
// Brief 4.7a: the director's answers at the story meeting, which the fact check reads
// among the director's words (T1).
const { weaveQuestionsOf, isAnswered, WEAVE_ANSWER_KEY } = require('../../writer-questions');
// Phase 4 (brief 4.4): the weave the fact check judges, the mark it leaves on it, and
// the meeting's approval it skips on. Brief 4.5: the weave as the fact check judges it
// (no struck connection, no answer), and the director's answers, which it reads as record.
const { isWeave, weaveForPrompt, weaveForJudge, weaveKey, withFactCheckMark, isWeaveJudged, isMeetingApproved } = require('../../weave');
// Brief 4.7a: the article judge reads the settled weave as every later writer does.
const { renderDirectorAnswers, settledWeaveOf } = require('../../prompt-renderers/settled-weave');
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
  EDIT_LINES_GUIDE, WEAVE_EDIT_LINES_GUIDE, PRINTED_FIELDS, isMap, ownsNoText
} = require('../../hand-edit-diff');

// ═══════════════════════════════════════════════════════════════════════════
// QUALITY CRITERIA DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

// Each phase resolves its criteria through getPhaseCriteria(phase, theme): the weave's
// fact check (phase 4, brief 4.4) and the article judge (brief 4.7a; spec 6.2) score the
// truth criteria alone, one set for every theme. The detective's arc and article criteria
// went with their old stages (ruling R1), and the outline judge with the map (brief 4.6).

// ═══════════════════════════════════════════════════════════════════════════
// TRUTH CRITERIA (phase 3, 3.4; spec section 4 and R2)
// ═══════════════════════════════════════════════════════════════════════════
//
// A truth-rule breach is a definite error with the draft, so it goes back for an
// automatic rework: flagging it to the director would only hand the director the
// same fix. One structural criterion per group of rules. They carry no weight: since
// phase 4 (briefs 4.4 and 4.7a) they are each judge's whole evaluation, and a truth
// criterion decides readiness alone (createEvaluator holds a failed one to not-ready,
// whatever the judge's own structuralPassed says).
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
 * The label line the article judge prints the map under (brief 4.7a), as it prints the
 * article under CONTENT BUNDLE: a line of its own, with the map's JSON after it.
 */
const JUDGE_MAP_LABEL = 'MAP:';

/**
 * The material a truth criterion reads, by the heading or tag its judge's prompts print
 * it under. The first sixteen are the judge's inputs; the last two are the judged
 * output's own text, which only the article holds (the weave places neither cards nor
 * photos).
 */
const TRUTH_MATERIAL = Object.freeze({
  record: '<RECORD>',                       // the exposed documents (renderRecordView)
  timeline: '<morning-timeline>',           // the ledger and the evidence log, on the morning clock
  financialSummary: '<FINANCIAL_SUMMARY>',  // the account totals the article writer copies (3.9)
  notes: '<DIRECTOR_NOTES>',                // the director's notes (renderDirectorEnrichmentBlock)
  corrections: '<DIRECTOR_CORRECTIONS>',    // the director's input-review corrections, after the notes (brief 4.7c)
  answers: '<DIRECTOR_ANSWERS>',            // the director's answers at the story meeting (renderDirectorAnswers; brief 4.5)
  weave: '<SETTLED_WEAVE>',                 // the weave as the director settled it, every question with its answer or none (settledWeaveOf; brief 4.7a)
  map: `\n${JUDGE_MAP_LABEL}\n`,           // the map as the director left it, its struck beats in leftOut (brief 4.7a)
  directorEdits: "THE DIRECTOR'S EDITS (",  // the director's edits, right after the output judged, when it carries one (renderJudgeDirectorEdits; brief 4.7f)
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
//
// Brief 4.7a (section B of the rule-text read): the article judge reads them too, and its
// questions follow T1, T2, T5 and T9 as rewritten: the evidence, the money, the verdict
// and the pronouns read the answers; the money reads the settled weave, which lists the
// questions left unanswered; the verdict reads the map, whose leftOut holds each theory the
// director struck.
//
// Brief 4.7c (T1, T9): an article question that names where the director's words come from
// names the four sources the fact check reads as the director's words (buildFactCheckArgs'
// directorWords): ARTICLE_DIRECTOR_WORDS, printed under DIRECTOR_WORDS_MATERIAL, which such a
// question reads. The weave's questions keep their wording.
//
// Brief 4.7d: the four are one list, DIRECTOR_WORDS_SOURCES, which builds all three: the
// questions' name for them, the materials the judge reads them under, and the texts the fact
// check and the verdict guard read (directorWords), so all three hold one order.

/**
 * The director's words (T1), source by source, in one order: its `label` as an article truth
 * question names it, the `material` the article judge reads it under (TRUTH_MATERIAL), and its
 * `texts` in state, each word for word.
 */
const DIRECTOR_WORDS_SOURCES = Object.freeze([
  { label: 'the notes', material: 'notes', texts: (state) => [state.directorNotes && state.directorNotes.rawProse] },
  { label: 'the input-review corrections', material: 'corrections', texts: (state) => (Array.isArray(state.inputReviewCorrections) ? state.inputReviewCorrections : []) },
  { label: 'the accusation', material: 'verdict', texts: (state) => [directorAccusationText(state)] },
  { label: 'the answers at the story meeting', material: 'answers', texts: (state) => meetingAnswers(state) }
].map(Object.freeze));

/** The director's words as an article truth question names them: each source's label, in order. */
const ARTICLE_DIRECTOR_WORDS = `(${DIRECTOR_WORDS_SOURCES.slice(0, -1).map((source) => source.label).join(', ')} and ${DIRECTOR_WORDS_SOURCES[DIRECTOR_WORDS_SOURCES.length - 1].label})`;

/** The materials the four sources print under, in the order directorWords holds them. */
const DIRECTOR_WORDS_MATERIAL = Object.freeze(DIRECTOR_WORDS_SOURCES.map((source) => source.material));

// Brief 4.10d: each group's `about` is what it checks, in plain words, which a failed
// criterion's line says when the judge gave it no notes (truthIssueLines).
const TRUTH_GROUPS = [
  {
    key: 'evidenceTruth',
    about: 'how the claims are written against their evidence',
    rules: ['T1', 'T3', 'T4', 'T6'],
    reads: (phase) => (phase === 'arcs' ? ['record', 'timeline', 'notes', 'answers'] : ['record', 'timeline', ...DIRECTOR_WORDS_MATERIAL]),
    // Phase 3 (3.9): T4 as round 7 words it (R21). Brief 4.7d (T1, T6): at the article, a
    // correction or an answer that names who turned a memory in is the director's words as
    // the notes are, so the T6 clause reads an exposer from the four sources its T1 clause
    // names. The weave's question keeps its wording.
    describe: (s, phase) => `Is every claim in ${s} written as its evidence allows, ${phase === 'arcs' ? "the director's answers at the story meeting included as record, as the notes are (T1)," : `the director's words ${ARTICLE_DIRECTOR_WORDS} included as record (T1);`} with no buried memory's content or owner stated as fact (T3); with a person tied to an account as fact only where the director saw the sale or it was made openly in front of the room, and an account's name never a reason to suspect its namesake (T4); and with no exposer named that neither the evidence log nor ${phase === 'arcs' ? "the director's notes" : "the director's words"} name (T6)?`
  },
  {
    key: 'moneyTruth',
    about: 'the money',
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
    //
    // Brief 4.7a (T5 as rewritten): a figure raised as a question at the story meeting
    // prints as the director's answer gives it, and stays out of print while the question
    // has no answer; the settled weave lists each question with its answer or none.
    reads: (phase) => (phase === 'arcs' ? ['timeline', 'notes', 'answers'] : ['timeline', 'financialSummary', ...DIRECTOR_WORDS_MATERIAL, 'weave']),
    describe: (s, phase) => `Does the money in ${s} run from the buyer to the seller's chosen account, with NeurAI and its board written as Nova's suspicion of who the buyer is and never as fact, and the ledger's money taken as the morning's payments for erasure (T5)? Each figure is as its source gives it: each sale, the first-burial bonus and each transfer as the ledger gives it;${phase === 'arcs' ? '' : ' each total at the close of the morning as FINANCIAL_SUMMARY gives it;'} ${phase === 'arcs' ? "a balance the director's notes record as said or shown in the room as that moment's figure; and a ledger line the director's answer at the story meeting explains as that answer gives it (T1)." : `a balance the director's words ${ARTICLE_DIRECTOR_WORDS} record as said or shown in the room as that moment's figure (T1); and a figure raised as a question at the story meeting as the director's answer gives it, and out of print when the question has no answer (T5).`}`
  },
  {
    key: 'verdictTruth',
    about: 'how the verdict is told',
    rules: ['T2'],
    reads: (phase) => (phase === 'arcs' ? ['verdict', 'notes'] : ['verdict', 'notes', 'answers', 'map', 'directorEdits']),
    // Phase 4 (brief 4.4; T2 as rewritten): the map places the theories the room debated,
    // so the weave's question asks for the verdict as the official story alone. Brief 4.7a:
    // the article reports every theory the map, as the director left it, carries, and a
    // theory in its leftOut, where the director's strikes go, stays out of print.
    //
    // Brief 4.7f (R11): the article's question reads the map as the director's desk edits
    // leave it, edits first. The map keeps the beat of a card the director cut at the desk, so
    // the question read such a theory as unreported, and a finding that quoted neither the cut
    // text nor the edit's id stayed structural (guardDirectorEdits): an automatic rework was
    // sent to bring the cut back. A theory the director wrote into the article from leftOut
    // read as a breach the same way. A sentence a rewrite took out is cut text too, as the
    // edit lines' removed: line names it.
    describe: (s, phase) => (phase === 'arcs'
      ? `Is the verdict in ${s} told as the room's official story, ungraded against any hidden answer (T2)? The theories the room debated are the map's to place, so the weave keeps T2 whether it names them or not.`
      : `Is the verdict in ${s} told as the room's official story, left ungraded against any hidden answer, with every alternative theory the room debated that a beat in the map's sections carries reported, and every theory in the map's leftOut, where a beat the director struck sits, kept out of print (T2)? The director's edits come first, where THE DIRECTOR'S EDITS lists them, so the map is read as they leave it: a theory the director cut, or took out in a rewrite, is out of its sections, and a theory the director's own text reports is in them, from its leftOut too.`)
  },
  {
    key: 'stagesTruth',
    about: 'the timeline',
    rules: ['T7'],
    reads: () => ['record', 'modeBlock', 'epilogue', 'timeline'],
    // Phase 3 (3.9): T7's point on Nova's intent (R21).
    describe: (s) => `In ${s}, is the party met only through memories, the investigation told as the reporting mode allows, Nova's day taken from the epilogue alone, and every logged time on the morning clock (T7)? What Nova says NovaNews is still chasing is Nova's own intent and needs no epilogue.`
  },
  {
    key: 'novaPositionTruth',
    about: "the reporter's role",
    rules: ['T8'],
    reads: () => ['modeBlock'],
    // Phase 3 (3.9): T8's first sentence as round 7 words it (R21).
    describe: (s) => `In ${s}, is Nova the uninterested third party, reporting on the room from outside its choices: Nova never votes, joins the room's accusation or exposes a memory, and witnesses only what this session's mode block allows (T8)?`
  },
  {
    key: 'playersTruth',
    about: "the players' pronouns or how the players are judged",
    rules: ['T9', 'T11'],
    // Brief 4.7a (T9 as rewritten): at the article, a pronoun the director's own words give
    // counts as the answer, and a player with none is written by name. Brief 4.7c: the
    // director's words are the four sources the fact check's pronoun check reads.
    reads: (phase) => (phase === 'arcs' ? ['roster', 'answers'] : ['roster', ...DIRECTOR_WORDS_MATERIAL]),
    describe: (s, phase) => `Does every player in ${s} take the pronoun the roster gives, or, where the roster gives none, ${phase === 'arcs' ? "the pronoun the director's answer at the story meeting gives" : `the pronoun the director's own words give ${ARTICLE_DIRECTOR_WORDS}, or else the player's name in place of a pronoun`} (T9), and does the judgement in ${s} land on the characters' choices, with no player's looks described (T11)?`
  },
  {
    key: 'wordsTruth',
    about: 'the quoted words',
    rules: ['T12'],
    // Only the article prints a card's text; the weave's evidence quotes the record under its
    // lines (phase 4b, brief 1B), which the weave's question reads. Brief 4.7c:
    // at the article, a line the director's words hold is quoted from them, any of the four.
    reads: (phase) => (phase === 'article' ? ['record', ...DIRECTOR_WORDS_MATERIAL, 'printedCards'] : ['record', 'notes']),
    describe: (s, phase) => (phase === 'article'
      ? `Is every quoted line in the article word for word from the record or the director's words ${ARTICLE_DIRECTOR_WORDS} and in its real speaker's mouth, and does every card copy the record with no id or timestamp in its text (T12)?`
      : `Is every quoted line in ${s} word for word from the record or the director's notes, and in its real speaker's mouth (T12)?`)
  },
  {
    key: 'photosTruth',
    about: 'the photos or their captions',
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
    about: 'keeping the fiction whole',
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
 * left the arc stage for the map, the code checks hold the evidence's sources and the
 * verdict thread, and no notes on the writing reach the story meeting. One set for every theme:
 * the detective's arc criteria went with its arc stage (ruling R1).
 *
 * @returns {Object} the truth criteria
 */
function getArcCriteria() {
  return truthCriteria('arcs');
}

/**
 * The article judge's criteria (phase 4, brief 4.7a; spec 6.2): the truth criteria, worded
 * for the article, and nothing else. The judge fixes errors of fact before the director
 * reads the article; its weighted criteria, its craft findings and its notes on the writing
 * went. One set for every theme: the detective's article criteria went with its old stages
 * (ruling R1).
 *
 * @returns {Object} the truth criteria
 */
function getArticleCriteria() {
  return truthCriteria('article');
}

/**
 * One phase's criteria for a theme: the one place a judge's criteria are resolved
 * (createEvaluator, and scripts/lib/render-calls.js for the renders). Since phase 4 both
 * judges score the truth criteria alone, one set for every theme (ruling R1).
 *
 * @param {'arcs'|'article'} phase
 * @param {string} [theme='journalist'] - the session's theme, which no judge's criteria vary by since R1
 * @returns {Object}
 */
function getPhaseCriteria(phase, theme = 'journalist') {
  switch (phase) {
    case 'arcs': return getArcCriteria();
    case 'article': return getArticleCriteria();
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
 * What a failed truth criterion's line says when the judge gave it no notes and no fix (brief
 * 4.10d): a plain sentence naming what failed by what the criterion checks (its group's
 * `about`), never its key. The director reads it at the desk past its rule ids, and the
 * rework reads it as must-fix.
 *
 * @param {string} key - the criterion's key
 * @returns {string}
 */
function unexplainedTruthFault(key) {
  const group = TRUTH_GROUPS.find((g) => g.key === key);
  return group ? `The judge found a fault in ${group.about} and gave no detail.` : 'The judge found a fault and gave no detail.';
}

/**
 * One structural issue for each failed truth criterion the judge wrote no issue for
 * under any of its rule ids: the rule ids, then the criterion's notes and fix, or, with
 * neither, a plain sentence saying what failed (unexplainedTruthFault).
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
      return `${rules.join(', ')}: ${text || unexplainedTruthFault(key)}`;
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
 *   would go. A finding the judge filed under the prefix and a standing edit that owns text
 *   moves as it is.
 * - A judge's advisory that quotes the director's text is a concern in its place, never a
 *   suggestion for the rework (FA, requirement 6).
 * - A finding the judge filed under the prefix and edits that own no text alone (lib/
 *   hand-edit-diff.js ownsNoText: a block the director moved at the desk, a connection they
 *   brought back at the meeting) is read by its quotes (task 4.5e): a place holds only the
 *   writer's text. A quote of the director's text makes it a concern under the edits it
 *   quotes, and a quote of the writer's words the writer's must-fix, whichever list the judge
 *   filed it in. One whose quotes locate nothing stays a concern beside the edits, as the
 *   judge filed it (task 4.5f): that is how a judge disagrees with the director's choice of a
 *   place, which no rework may change.
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

  const standing = new Map(edits.map((edit) => [edit.id, edit]));
  const located = (text) => locateQuotedText(text, edits, output, { record });
  const quotedEdits = (text) => located(text).editIds;
  /**
   * A finding the judge filed under the prefix and a standing edit (task 4.5e): `{concern:
   * true}` when an edit it names owns text, so it is a concern as it is; `{finding}`, its text
   * after the ids, when the edits it names own none (ownsNoText), so it is read by its quotes;
   * null when it names no standing edit.
   */
  const filed = (text) => {
    const named = concernEditIds(text).filter((id) => standing.has(id)).map((id) => standing.get(id));
    if (named.length === 0) return null;
    return named.every(ownsNoText) ? { finding: concernFinding(text) } : { concern: true };
  };
  /**
   * Where a finding goes, from either list: `{concern}`, the director's to weigh beside the
   * edit, or `{writers}`, the writer's must-fix; null for a finding filed under no standing
   * edit that quotes nothing of the director's, which stays in its own list as it is. A quote
   * of the director's text makes a concern under the edits it quotes, whatever else it quotes.
   * A finding filed under edits that own no text alone is the writer's only when it quotes the
   * writer's words; one whose quotes locate nothing stays a concern as the judge filed it
   * (task 4.5f).
   */
  const placeOf = (text) => {
    const prefixed = filed(text);
    if (prefixed && prefixed.concern) return { concern: text };
    const finding = prefixed ? prefixed.finding : text;
    const { editIds, writer } = located(finding);
    if (editIds.length > 0) return { concern: directorEditConcern(editIds, finding) };
    if (!prefixed) return null;
    return writer ? { writers: finding } : { concern: text };
  };

  const kept = [];
  const moved = [];
  issues.forEach((issue) => {
    const place = placeOf(issue);
    if (place && place.concern) moved.push(place.concern);
    else kept.push(place ? place.writers : issue);
  });
  const advisoriesOut = [];
  advisories.forEach((advisory) => {
    const place = placeOf(advisory);
    if (!place) advisoriesOut.push(advisory);
    else if (place.concern) advisoriesOut.push(place.concern);
    else kept.push(place.writers);
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
 * A truth-only judge's verdict, held to its contract after the verdict guard (phase 4,
 * brief 4.4, fix round 1): spec 4.5 lets no notes on the writing reach the meeting, and an
 * automatic pass reads only must-fix work. Both judges are truth-only since the article
 * judge's criteria shrank to the truth groups (brief 4.7a), so this is every judge's
 * verdict: the seam that chose between it and a weighted one went with the weighted
 * contract (brief 4.7c). Each criterion the judge was given keeps its
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
 * @param {Object} criteria - the judge's criteria, every one a truth criterion (truthCriteria)
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
 * brief 4.7a, the answers at the story meeting (T1), each source's texts in the order
 * DIRECTOR_WORDS_SOURCES gives them (brief 4.7d). The fact check's pronoun check reads them
 * (buildFactCheckArgs), and the verdict guard reads them as record (recordTexts).
 *
 * @param {Object} state
 * @returns {string[]}
 */
function directorWords(state) {
  return DIRECTOR_WORDS_SOURCES
    .flatMap((source) => source.texts(state))
    .filter(text => typeof text === 'string' && text.trim());
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
 * What a truth-only judge writes in advisoryWarnings (phase 4, brief 4.4, fix round 1):
 * only its concerns about the director's edits, which the guard and the stop read under
 * DIRECTOR_EDIT_PREFIX (renderJudgeDirectorEdits says how to write one). Its truth
 * criteria are the whole evaluation, so it has no suggestion to give: spec 4.5 lets no
 * notes on the writing reach the meeting. One wording, for the schema and the OUTPUT FORMAT.
 */
const TRUTH_ONLY_ADVISORY_WARNINGS = "only a concern about one of the director's edits; empty when there is none";

/**
 * The structured-output schema the judges are sent: the truth-only contract (phase 4, brief
 * 4.4, fix round 1), which both judges read, the weave's fact check (brief 4.4) and the
 * article judge (brief 4.7a). Its OUTPUT FORMAT (truthOnlyOutputFormat) restates it in the
 * prompt, and code holds the verdict to it (truthOnlyVerdict).
 *
 * PROMPT-REVIEW B4: `criteriaScores: {type:'object'}` and bare `{type:'array'}` issue lists
 * left the emitted shape entirely up to the model, and nothing downstream could read it:
 * buildRevisionContext rendered the per-criterion objects as `[object Object]`. The
 * per-criterion shape and the string-ness of the two issue lists are part of the contract,
 * so the notes and fix the prompt asks for survive into the revision prompt.
 *
 * Phase 3 (3.9; final review judges-factcheck[1], the integrator's ruling): the judge writes
 * a criterion's `fix` only below the bar, and `revisionGuidance` holds only the steps that
 * fix the structural issues.
 *
 * A criterion carries no `type`: each truth criterion's type is its definition's
 * (truthOnlyVerdict sets it). advisoryWarnings holds only the concerns about the director's
 * edits. The weighted schema this was derived from, with a criterion type and advisories as
 * suggestions, went with its last caller (brief 4.7c). The contract holds no `issues` array.
 *
 * NOTE: no `format` keyword anywhere (SDK #277; see reports/CLAUDE.md).
 */
const TRUTH_ONLY_EVALUATION_JSON_SCHEMA = {
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
      description: TRUTH_ONLY_ADVISORY_WARNINGS
    },
    revisionGuidance: {
      type: 'string',
      description: 'One step per structural issue, each the fix for that issue; empty when there is none'
    },
    confidence: { type: 'string' }
  },
  required: ['ready', 'overallScore', 'structuralPassed']
};

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
 * The judges' OUTPUT FORMAT (phase 4, brief 4.4, fix round 1): the truth-only contract as
 * TRUTH_ONLY_EVALUATION_JSON_SCHEMA states it, restated in the prompt. A criterion carries
 * no type, and advisoryWarnings is kept for a concern about one of the director's edits.
 * Both judges print it after TRUTH_ONLY_EVALUATION_RULES (briefs 4.4 and 4.7a).
 *
 * Phase 3 (3.9): the must-fix work only, as the schema asks it. Brief 4.7c: the weighted
 * format it was built from, with a type line and advisories as suggestions, went with its
 * last caller; this is the judges' one format.
 *
 * @param {string} notes - what a criterion's notes hold, for this judge
 * @returns {string}
 */
function truthOnlyOutputFormat(notes) {
  return `OUTPUT FORMAT (JSON):
{
  "ready": boolean,
  "overallScore": number (0-1),
  "structuralPassed": boolean,
  "criteriaScores": {
    "criterionName": {
      "score": number,
      "notes": "${notes}",
      "fix": "only for a score below ${STRUCTURAL_PASS_SCORE}: the one concrete action that brings this criterion up to ${STRUCTURAL_PASS_SCORE}"
    }
  },
  "structuralIssues": [ "issues that MUST be fixed" ],
  "advisoryWarnings": [ "${TRUTH_ONLY_ADVISORY_WARNINGS}" ],
  "revisionGuidance": "one step per structural issue, each the fix for that issue (Step 1: ..., Step 2: ...); empty when there is none",
  "confidence": "high" | "medium" | "low"
}`;
}

/**
 * Build system prompt for evaluation
 *
 * Phase 3 (3.4): the judges read the rule set (judgeSystemPrompt). Phase 4: each judge's
 * task, criteria and output contract are one for every theme, since the detective's judges
 * went with its old stages (ruling R1): the weave's fact check (brief 4.4) and the article
 * judge (brief 4.7a). The outline judge went with the map (brief 4.6). Brief 4.13 (R14):
 * the prompt's identity line, mode block and rules are the theme's.
 *
 * @param {string} phase - Phase name (arcs, article)
 * @param {Object} criteria - Quality criteria for phase
 * @param {string} [theme='journalist'] - the session's theme: its identity line, its mode
 *   block and its rules folder
 * @param {Object} [options]
 * @param {Object|null} [options.sessionConfig] - its reportingMode picks the mode block
 * @returns {string} System prompt
 */
function buildEvaluationSystemPrompt(phase, criteria, theme = 'journalist', { sessionConfig = null } = {}) {
  return judgeSystemPrompt(phase, criteria, theme, sessionConfig);
}

// ═══════════════════════════════════════════════════════════════════════════
// THE JUDGES' RULES (phase 3, 3.4; phase 4, briefs 4.4 and 4.7a)
// ═══════════════════════════════════════════════════════════════════════════
//
// Placement ruling (plan, "Rulings"): the world, the truth rules and the mode block go
// in the system prompt, the stable frame, read first. Since phase 4 no judge reads a craft
// file (spec section 11): neither writes notes on the writing.

/**
 * The rule-set call each judge reads (lib/rule-set.js): the world and the truth rules alone
 * (spec section 11). It names the judge's identity line in its theme's config too
 * (lib/theme-config.js identityLineOf; brief 4.13), which opens its system prompt; the
 * session's mode block follows it.
 */
const JUDGE_RULE_CALLS = { arcs: 'judge-arc', article: 'judge-article' };

/** The writer whose output each judge judges, as the prompts name it. */
const JUDGED_WRITERS = { arcs: 'arc writer', article: 'article writer' };

/** What a truth criterion's notes hold, per judge, as its OUTPUT FORMAT asks for them. */
const BREACH_NOTES = {
  arcs: 'the breach: the text at fault, the thread or connection it is in, the piece of evidence where one is at fault, and the record it contradicts',
  article: 'the breach: the sentence at fault, its section, and the record it contradicts'
};

/**
 * How a truth finding quotes the text at fault, per judge. A breach in the weave names
 * the thread it is in (phase 4, brief 4.4), so the fix and the meeting find its line, and
 * the piece of evidence where one is at fault (phase 4b, brief 1B; spec 6.2), so the fix can
 * cite something else.
 */
const TRUTH_FINDING_QUOTE = {
  arcs: 'quotes the text at fault, names the thread or connection it is in by its id (or the field, for the story, the question, the headline or the convergence) and, where a piece of evidence is at fault, the piece by its sources',
  article: 'quotes the sentence and names its section'
};

/**
 * The scoring rules a truth-only judge reads (phase 4, brief 4.4): its truth criteria
 * are the whole evaluation, with no weighted average and no advisory criteria, and
 * overallScore comes from the truth criteria. Both judges read them: the weave's fact
 * check (brief 4.4) and the article judge (brief 4.7a). Its output contract follows them
 * (truthOnlyOutputFormat), and code holds its verdict to that contract (truthOnlyVerdict).
 */
const TRUTH_ONLY_EVALUATION_RULES = `EVALUATION RULES:
1. The truth criteria above are the whole evaluation: each finding is a breach of a truth rule.
2. Score each truth criterion from 0.0 to 1.0. The output is READY, with structuralPassed true, when every truth criterion scores ${STRUCTURAL_PASS_SCORE} or more.
3. overallScore is the lowest truth-criterion score.`;

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
 * A judge's system prompt: its opening (prompt-builder.js systemPromptOpening; brief 4.13b),
 * the theme's identity line for the judge, the session's mode block, the world and the truth
 * rules, all from the theme's files (brief 4.13; R14), then its task, its truth criteria, the
 * truth-only scoring rules and the truth-only OUTPUT FORMAT.
 *
 * Phase 4: each judge scores the truth criteria alone and reads no craft file (spec
 * section 11): the weave's fact check (brief 4.4; spec 4.5) and the article judge (brief
 * 4.7a; spec 6.2). The article judge's weighted criteria, its craft findings, its "MUST be
 * actionable" block and its frame (the immutable inputs, the compelling gift) went with its
 * notes on the writing.
 *
 * @param {'arcs'|'article'} phase
 * @param {Object} criteria - getPhaseCriteria(phase), or any criteria to render
 * @param {string} theme - the session's theme
 * @param {Object|null} sessionConfig - its reportingMode picks the mode block
 * @returns {string}
 */
function judgeSystemPrompt(phase, criteria, theme, sessionConfig) {
  const call = JUDGE_RULE_CALLS[phase];
  if (!call) throw new Error(`Unknown evaluation phase: ${phase}`);
  const opening = systemPromptOpening(theme, call, sessionConfig);
  const judged = TRUTH_SUBJECTS[phase];
  const frame = `The rules above are the ones the ${JUDGED_WRITERS[phase]} followed: judge ${judged} by them, against the record and the director's words in the evaluation prompt.`;
  return `${opening}

Your task is to find each breach of the truth rules in ${judged}. ${frame}

${truthCriteriaSection(phase, criteria)}${TRUTH_ONLY_EVALUATION_RULES}

${truthOnlyOutputFormat(BREACH_NOTES[phase])}`;
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
 * article judge, right after the output it judges: each by
 * id, with its place and the director's text, or for a cut the text removed; under a
 * rewrite, each sentence it removed (FA). EDIT_LINES_GUIDE says how to read the lines,
 * in the same words the reworks' <HAND_EDITS> block uses. The text
 * is the director's own and record, so the judge scores the writer's text, and a
 * disagreement with an edit goes in advisoryWarnings under DIRECTOR_EDIT_PREFIX and the
 * edit's id, where the verdict guard and the console find it. '' with no edits. The
 * detective's own example went with its article judge (brief 4.7a; ruling R1).
 *
 * The weave's fact check (brief 4.5; R11) reads the director's changes at the story
 * meeting the same way, right after the weave, in the meeting's own words
 * (WEAVE_EDIT_LINES_GUIDE): it judges the writer's text, and a breach in a change of the
 * director's is a concern for the meeting, under the change's id.
 *
 * @param {Object[]|undefined} edits - judgedEdits
 * @param {'arcs'|'article'} phase
 * @returns {string}
 */
function renderJudgeDirectorEdits(edits, phase) {
  const list = Array.isArray(edits) ? edits : [];
  if (list.length === 0) return '';
  if (phase === 'arcs') {
    return `THE DIRECTOR'S EDITS (record: the director's own changes at the story meeting, each final as the director left it):
The lines below are the director's changes to the weave above. ${WEAVE_EDIT_LINES_GUIDE} A change is the final word on its text, so score each criterion, and write each structural issue, on the writer's text alone. Where a change of the director's breaks a truth rule, write the concern in advisoryWarnings, opening with the change's id and then the rule it concerns, as in: ${DIRECTOR_EDIT_PREFIX}E1: T1: <the concern>.

${formatEditLines(list)}`;
  }
  const output = 'the content bundle above';
  const example = `${DIRECTOR_EDIT_PREFIX}E1: T1: <the concern>`;
  return `THE DIRECTOR'S EDITS (record: the director's own text, each final as the director left it):
Each edit below is text the director wrote into ${output}, text they cut from it (marked cut), or a block they moved (marked moved). ${EDIT_LINES_GUIDE} An edit is the final word on its text, so score each criterion, and write each structural issue, on the writer's text alone. Where you disagree with an edit, or would bring back a cut or a removed sentence, write the concern in advisoryWarnings, opening with the edit's id and then the rule or criterion it concerns, as in: ${example}.

${formatEditLines(list)}`;
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
 * The article's truth criteria that score it against the session's mode block, by name,
 * for the user prompt's mode line (brief 4.7a): read from the criteria, so the line names
 * what the criteria read.
 *
 * @returns {string} such as "stagesTruth and novaPositionTruth"
 */
function modeBlockReaders() {
  const names = Object.entries(truthCriteria('article')).filter(([, c]) => c.reads.includes('modeBlock')).map(([key]) => key);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names.join('');
}

/**
 * Build user prompt with content to evaluate
 *
 * Phase 3 (3.4): the arc judge reads the record view's morning timeline in place of a
 * buried list of its own; the article judge reads only the bundle's printed fields, and
 * its mode line points at the mode block its system prompt carries.
 *
 * Phase 3 (3.9): the article judge reads its writer's FINANCIAL_SUMMARY right after the
 * record (renderJudgeFinancialSummary), and its PHOTOS is every photo its writer was given
 * (renderArticleJudgePhotos). Phase 4 (brief 4.6): the outline judge went with the map.
 *
 * Phase 4 (brief 4.7a): the article judge is one prompt for every theme (R1). It reads
 * the settled weave and the map as the director left it, and the director's answers at
 * the story meeting after the notes, and no craft file.
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
  const directorEditsSection = renderJudgeDirectorEdits(options.directorEdits, phase);
  const afterJudged = directorEditsSection ? `${directorEditsSection}\n\n` : '';
  switch (phase) {
    case 'arcs': {
      // Phase 4 (brief 4.4): the weave's fact check reads the weave, without its mark,
      // then what the arc writer read for the truth rules: the verdict beside the
      // director's account of it, the roster with pronouns, the director's notes under
      // the arc writer's own label, and the record with its morning timeline. The evidence's
      // sources and the verdict thread are the code checks', and no craft file is read.
      //
      // Phase 4b (brief 1B; spec 6.2): it opens by naming the evidence under each line, and
      // reads each line against its evidence and each piece against the record.
      //
      // Brief 4.5: after a director's round it reads the weave as it judges it (no struck
      // connection, no answer), the director's changes right after it, and their answers
      // after the notes, as the director's words (T1).
      const answers = renderDirectorAnswers(state.weave && state.weave.questions);
      return `Check this weave against the record and the director's words. Each thread and each connection carries its evidence: the pieces of the record it rests on, each with its sources, what it shows, and whether it supports the line or cuts against it. Read each line against its evidence, and each piece against the record.

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
      // Brief 4.7a (spec 6.2; R1): one judge for every theme, checking the article against
      // the truth rules. It reads, in order: the session's mode, named once (the mode block
      // in its system prompt states T8 for it); the roster, the verdict and the director's
      // notes as its writer reads them, with the director's answers at the story meeting
      // after the notes (T1); the record with its timeline, and the money figures the writer
      // copied; the photos the writer was given; the writer's task, the settled weave and the
      // map as the director left it, whose leftOut holds each theory the director struck
      // (T2); the article as the page prints it, with the director's edits right after it;
      // and the code fact check's result. It reads no craft file (spec section 11).
      const reportingMode = state.sessionConfig?.reportingMode === 'remote' ? 'remote' : 'on-site';
      const articleMoney = renderJudgeFinancialSummary(state);
      const answers = renderDirectorAnswers(state.weave && state.weave.questions);
      const settledWeave = settledWeaveOf(state);
      return `Check this article against the record and the director's words:

REPORTING MODE FOR THIS SESSION: ${reportingMode} (the mode block in your instructions says what Nova could witness; ${modeBlockReaders()} score the article against it)

${renderJudgeSessionContext(state)}${answers ? `\n\n${answers}` : ''}

${renderRecordView(state.evidenceBundle, { sessionConfig: state.sessionConfig })}${articleMoney ? `\n\n${articleMoney}` : ''}

${renderArticleJudgePhotos(state)}

${settledWeave ? `${settledWeave}\n\n` : ''}The map below is the one the article writer wrote from, as the director left it: the beats in its sections are what the article tells, and leftOut holds what it leaves out, each beat the director struck among them.
${JUDGE_MAP_LABEL}
${JSON.stringify(state.outline || {}, null, 2)}

The content bundle below holds only the fields the published page prints.
CONTENT BUNDLE:
${JSON.stringify(printedBundle(state.contentBundle, state.shellAccounts), null, 2)}

${afterJudged}${renderJudgeFactCheck(options.factCheck || null)}

Is the article free of truth-rule breaches?`;
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
    // Resolve criteria (getPhaseCriteria): since phase 4 each judge scores the truth
    // criteria alone, one set for every theme (ruling R1), and reads the truth-only
    // contract, its schema and its verdict (brief 4.4, fix round 1; the article judge since
    // brief 4.7a). Brief 4.7c: the weighted contract and the seam that chose it went.
    const theme = state.theme || 'journalist';
    const criteria = getPhaseCriteria(phase, theme);
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
    // Guarded on contentBundle. Since task 4.14e a rework that fails keeps its bundle
    // and its route (graph.js routeAfterArticleRework) never reaches here. A MISSING
    // bundle is not a fact-check failure (it would report every roster member as uncovered and
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

      // SDK returns parsed object directly when jsonSchema is provided
      // Commit 8.23: disableTools prevents evaluator from using Grep/Read during evaluation
      const evaluation = await sdk({
        systemPrompt,
        prompt,
        model,
        jsonSchema: TRUTH_ONLY_EVALUATION_JSON_SCHEMA,
        disableTools: true
      });

      // Brief 4.7c: readiness is the contract's (truthOnlyVerdict below): no structural issue
      // kept and no truth criterion holding. The judge's own structuralPassed and score,
      // which the weighted branch read, decide nothing.
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
      // Phase 4 (brief 4.4, fix round 1): the verdict is held to the truth-only contract,
      // so a note on the writing reaches neither the stop nor an automatic pass. Brief 4.7c:
      // an `issues` array lies outside the contract too (its schema and its OUTPUT FORMAT
      // hold none), so it is logged with the rest and read nowhere: not in the history
      // entry, not in validationResults, not in the escalation reason.
      const guard = truthOnlyVerdict(guarded, criteria);
      const outsideContract = [
        ...guard.outsideContract,
        ...(Array.isArray(evaluation.issues) && evaluation.issues.length > 0 ? [{ issues: evaluation.issues }] : [])
      ];
      if (outsideContract.length > 0) {
        console.log(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] Outside the truth-only contract, left out: ${JSON.stringify(outsideContract)}`);
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
        // Task 4.12c: the entry keeps no `issues` key. It repeated the structural issues for
        // the e2e harness, which reads `structuralIssues` since task 4.12a.
        structuralIssues: judgeStructuralIssues,
        advisoryWarnings: [...guard.advisories, ...guard.moved, ...guard.concerns],
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

        // B4: `evaluation.issues` is not part of the contract, so reading it produced
        // "unspecified issues" on every real escalation. Use the two lists the verdict fills.
        //
        // Brief 4.7a: the advisories as the verdict leaves them (guard.advisories), so the
        // escalation carries the judge's concerns about the director's edits and no note on
        // the writing (spec 6.3: none reaches the desk). Brief 4.7c: and never an `issues`
        // array a verdict carries outside its contract.
        const issuesText = formatIssuesForMessage([
          ...judgeStructuralIssues,
          ...guard.advisories
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
 * Create mock evaluator for testing. Its breaches go where the truth-only contract keeps them,
 * as createEvaluator writes them: `structuralIssues`, in the history entry and, when it is not
 * ready, in validationResults (brief 4.7d; the contract holds no `issues` array).
 *
 * @param {string} phase - Phase name
 * @param {Object} options - Mock options: ready, overallScore, structuralIssues, shouldFail,
 *   errorMessage
 * @returns {Function} Mock evaluator function
 */
function createMockEvaluator(phase, options = {}) {
  const {
    ready = true,
    overallScore = 0.85,
    structuralIssues = [],
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
      structuralIssues,
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
        structuralIssues
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
    // Phase 4 (brief 4.4): the scoring rules a truth-only judge reads, and its contract
    // (fix round 1): the OUTPUT FORMAT, the schema and the verdict held to them. Brief
    // 4.7c: the judges' one contract; the weighted one and the seam that chose it went.
    TRUTH_ONLY_EVALUATION_RULES,
    TRUTH_ONLY_ADVISORY_WARNINGS,
    TRUTH_ONLY_EVALUATION_JSON_SCHEMA,
    truthOnlyOutputFormat,
    truthOnlyVerdict,
    getArcCriteria,
    getArticleCriteria,
    getPhaseCriteria,
    truthCriteria,
    TRUTH_MATERIAL,
    // Brief 4.7d: the director's words, one list, and what it builds.
    DIRECTOR_WORDS_SOURCES,
    ARTICLE_DIRECTOR_WORDS,
    DIRECTOR_WORDS_MATERIAL,
    directorWords,
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

  // Each judge's stand-in returns parsed objects directly: a verdict in the truth-only
  // contract with no breach, every truth criterion of the phase it judges scored (brief 4.7d).
  const cleanVerdict = (phase) => ({
    ready: true,
    overallScore: 1,
    structuralPassed: true,
    criteriaScores: Object.fromEntries(Object.keys(getPhaseCriteria(phase)).map((key) => [key, { score: 1 }])),
    structuralIssues: [],
    advisoryWarnings: [],
    revisionGuidance: '',
    confidence: 'high'
  });
  const configFor = (phase) => ({ configurable: { sdkClient: async () => cleanVerdict(phase) } });

  const mockState = {
    sessionId: 'self-test',
    weave: { story: 'Test story.', threads: [{ id: 't1', name: 'Test thread', line: 'Test line.', role: 'main-thread', verdict: true, evidence: [{ sources: ['ledger'], shows: 'Test sale.', stance: 'supports' }] }], connections: [], questions: [] },
    playerFocus: { primaryInvestigation: 'Who is the Valet?' },
    evidenceBundle: { exposed: [{ id: 'e1' }], buried: [] },
    contentBundle: { headline: { main: 'Test' }, sections: [] }
  };

  console.log('Testing evaluateArcs...');
  evaluateArcs(mockState, configFor('arcs')).then(result => {
    console.log('Arcs result:', {
      ready: result.evaluationHistory?.ready,
      phase: result.currentPhase
    });

    console.log('\nTesting evaluateArticle...');
    return evaluateArticle(mockState, configFor('article'));
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

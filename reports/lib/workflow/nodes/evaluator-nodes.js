/**
 * Evaluator Nodes - Per-phase quality evaluation for report generation workflow
 *
 * Handles the evaluation sub-phases (2.3, 3.2, 4.2) of the pipeline:
 * - evaluateArcs: Check arc coherence, evidence grounding, narrative potential
 * - evaluateOutline: Check arc coverage, section balance, flow logic
 * - evaluateArticle: Check voice consistency, anti-patterns, evidence integration
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
const { safeParseJson, getSdkClient, formatIssuesForMessage, resolveArcs } = require('./node-helpers');
const { traceNode } = require('../../observability');
const { getThemeNPCs, getThemeNPCEntries } = require('../../theme-config');
const { factCheckContentBundle } = require('../../content-bundle-fact-check');
const { DERIVED_LABELS } = require('../../prompt-renderers/derived-labels');
// Phase 3 (3.4): each journalist judge reads the rule set its writer reads, through
// the writers' own loader and mode-block placement (lib/rule-set.js, prompt-builder.js).
const { loadRuleSet } = require('../../rule-set');
const { withReportingModeBlock } = require('../../prompt-builder');
// Phase 2, brief 2.4: the judges read the record and the director's words through
// the same renderers and builders the writers use, so a judge sees what it judges.
const { renderRecordView, isBuriedTransactionRow } = require('../../prompt-renderers/record-view');
const { withSessionClock } = require('../../prompt-renderers/session-clock');
const { renderDirectorEnrichmentBlock } = require('../../prompt-renderers/director-notes-renderer');
const { renderSessionFactsVerdict, renderArcAccusation, renderPhotoEntry, photoKey } = require('../../prompt-renderers/director-words-renderer');
const { directorAccusationText } = require('../../accusation-verdict');
// The writers' own builders: the arc writer's valid-id list, the writers'
// SESSION_FACTS, the outline writer's inputs (its photo list among them) with the
// hero it used, and the PromptBuilder (whose roster method gives the roster section).
// ARC_NOTES_LABEL is the arc writer's label for the director's notes, which the arc
// judge's directorNotes line prints (one source, fix 3.4b).
const { hasInterweavingPlan, extractEvidenceSummary, ARC_NOTES_LABEL } = require('./arc-specialist-nodes');
const { buildSessionFacts, outlineWriterInputs, reworkHeroImage, getPromptBuilder } = require('./ai-nodes');
// Phase 3 (3.7): the writers' questions for the director. The arc judge reads the arc
// writer's, for rosterCoverage; every judge's JSON of an output leaves them out.
const { writerQuestionsOf, withoutWriterQuestions } = require('../../writer-questions');
// The page's own rule for which money tracker prints (printedWriterTracker).
const { TemplateAssembler } = require('../../template-assembler');

// ═══════════════════════════════════════════════════════════════════════════
// QUALITY CRITERIA DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Quality criteria for each phase
 * Each criterion has a description, weight, and type (structural or advisory)
 *
 * Commit 8.15: Arc criteria updated for player-focus-guided architecture:
 * - STRUCTURAL criteria: Block if failed (rosterCoverage, evidenceIdValidity, accusationArcPresent)
 * - ADVISORY criteria: Warn but don't block (coherence, evidenceConfidenceBalance)
 *
 * The player-focus-guided architecture GUARANTEES playerFocusAlignment by design
 * (accusation arc is required, arcs are driven by player conclusions not evidence patterns)
 *
 * Phase 3 (3.4): `arcs` is the detective arc judge's set, unchanged (the detective is
 * parked, spec D13). The journalist's is getArcCriteria('journalist'): the same five
 * criteria reworded to name the rule they score, plus the truth criteria. Every phase
 * resolves its criteria through getPhaseCriteria(phase, theme).
 */
const QUALITY_CRITERIA = {
  arcs: {
    // ═══════════════════════════════════════════════════════════════════════
    // STRUCTURAL CRITERIA - Block if failed (weight sum: 0.75)
    // ═══════════════════════════════════════════════════════════════════════
    rosterCoverage: {
      description: 'Does every roster member have a placement in at least one arc?',
      weight: 0.30,
      type: 'structural'
    },
    evidenceIdValidity: {
      description: 'Are all keyEvidence IDs valid (exist in evidence bundle)?',
      weight: 0.25,
      type: 'structural'
    },
    accusationArcPresent: {
      description: 'Is there an arc with arcSource="accusation" addressing the player accusation?',
      weight: 0.20,
      type: 'structural'
    },

    // ═══════════════════════════════════════════════════════════════════════
    // ADVISORY CRITERIA - Warn but don't block (weight sum: 0.25)
    // ═══════════════════════════════════════════════════════════════════════
    coherence: {
      description: 'Do arcs tell a consistent story without contradictions?',
      weight: 0.15,
      type: 'advisory'
    },
    evidenceConfidenceBalance: {
      description: 'Are there arcs with strong/moderate evidence (not all speculative)?',
      weight: 0.10,
      type: 'advisory'
    }
  },
  // Outline criteria use getOutlineCriteria(theme) for theme-aware descriptions
  outline: null,  // Populated by getOutlineCriteria() at evaluation time
  // Article criteria use getArticleCriteria(theme) for theme-aware descriptions
  article: null  // Populated by getArticleCriteria() at evaluation time
};

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
// `phases` limits a group to the judges whose output it scores. Arcs place no photos
// and print nothing, so the arc judge leaves out photos and the fiction's words: there
// a criterion could only misfire, at the cost of an automatic arc rework.

/** What each judge scores, as the truth criteria name it. */
const TRUTH_SUBJECTS = { arcs: 'the arcs', outline: 'the outline', article: 'the article' };

/**
 * The material a truth criterion reads, by the heading or tag its judge's prompts print
 * it under. The first ten are the judge's inputs; the last two are the judged output's
 * own text, which only the article holds (an outline places cards by id and photos by
 * filename, and arcs place neither).
 */
const TRUTH_MATERIAL = Object.freeze({
  record: '<RECORD>',                       // the exposed documents (renderRecordView)
  timeline: '<morning-timeline>',           // the ledger and the evidence log, on the morning clock
  notes: '<DIRECTOR_NOTES>',                // the director's notes (renderDirectorEnrichmentBlock)
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

const TRUTH_GROUPS = [
  {
    key: 'evidenceTruth',
    rules: ['T1', 'T3', 'T4', 'T6'],
    reads: () => ['record', 'timeline', 'notes'],
    describe: (s) => `Is every claim in ${s} written as its evidence allows (T1), with no buried memory's content or owner stated as fact (T3), no account's name read as proof of who holds it (T4), and no exposer named that neither the evidence log nor the director's notes name (T6)?`
  },
  {
    key: 'moneyTruth',
    rules: ['T5'],
    reads: () => ['timeline'],
    describe: (s) => `Does the money in ${s} run from NeurAI's board to the seller's chosen account, with each figure as the ledger records it and nothing read as anyone's other wealth (T5)?`
  },
  {
    key: 'verdictTruth',
    rules: ['T2'],
    reads: () => ['verdict', 'notes'],
    describe: (s) => `Is the verdict in ${s} told as the room's official story, with the alternative theories the room debated reported, and left ungraded against any hidden answer (T2)?`
  },
  {
    key: 'stagesTruth',
    rules: ['T7'],
    reads: () => ['record', 'modeBlock', 'epilogue', 'timeline'],
    describe: (s) => `In ${s}, is the party met only through memories, the investigation told as the reporting mode allows, Nova's day taken from the epilogue alone, and every logged time on the morning clock (T7)?`
  },
  {
    key: 'novaPositionTruth',
    rules: ['T8'],
    reads: () => ['modeBlock'],
    describe: (s) => `In ${s}, is Nova the uninterested third party: outside the room's votes, accusations and exposures, and witnessing only what this session's mode block allows (T8)?`
  },
  {
    key: 'playersTruth',
    rules: ['T9', 'T11'],
    reads: () => ['roster'],
    describe: (s) => `Does every player in ${s} take the pronoun the roster gives (T9), and does the judgement in ${s} land on the characters' choices, with no player's looks described (T11)?`
  },
  {
    key: 'wordsTruth',
    rules: ['T12'],
    // Only the article prints a card's text; the arcs and the outline name cards by id.
    reads: (phase) => (phase === 'article' ? ['record', 'notes', 'printedCards'] : ['record', 'notes']),
    describe: (s, phase) => (phase === 'article'
      ? 'Is every quoted line in the article word for word from the record or the director\'s notes and in its real speaker\'s mouth, and does every card copy the record with no id or timestamp in its text (T12)?'
      : `Is every quoted line in ${s} word for word from the record or the director's notes, and in its real speaker's mouth (T12)?`)
  },
  {
    key: 'photosTruth',
    rules: ['T13'],
    phases: ['outline', 'article'],
    // The outline has one photo slot per arc and one in FOLLOW THE MONEY, and no
    // caption: placing every photo, and captioning it, is the article's work. The
    // article judge reads the photos its writer was given (renderArticleJudgePhotos).
    reads: (phase) => (phase === 'article' ? ['photos', 'whiteboard', 'printedCaptions'] : ['photos', 'whiteboard']),
    describe: (s, phase) => (phase === 'article'
      ? 'Does the article print every photo in PHOTOS and no other, the hero image as its hero, cite nothing from the whiteboard, and give each printed photo a caption that keeps the subject and action of the director\'s description wherever PHOTOS gives one (T13)?'
      : 'Does every photo the outline places come from PHOTOS, which leaves the whiteboard photo out, and does the outline cite nothing from the whiteboard (T13)? The outline has one photo slot for each arc and one in FOLLOW THE MONEY, and the article places the photos the outline has no slot for.')
  },
  {
    key: 'fictionTruth',
    rules: ['T14'],
    phases: ['outline', 'article'],
    reads: () => ['truthRules'],
    describe: (s) => `Does every line of ${s} that reaches print speak the fiction's own words, with no production word in it (T14)?`
  }
];

/**
 * The truth criteria one journalist judge scores, each worded for that judge.
 *
 * @param {'arcs'|'outline'|'article'} phase
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
 * The heading under which the journalist arc judge reads the arc writer's questions
 * for the director (phase 3, 3.7), which its rosterCoverage criterion names.
 */
const ARC_JUDGE_QUESTIONS_LABEL = 'QUESTIONS FOR THE DIRECTOR (writerQuestions):';

/**
 * The journalist arc judge's weighted criteria: QUALITY_CRITERIA.arcs, each reworded to
 * name the rule or craft item it scores, with the same weight and type.
 *
 * Phase 3 (3.7; C7, C15): rosterCoverage counts a player covered by a placement or by
 * a question to the director about them, as the arc check does. It stays structural.
 */
const JOURNALIST_ARC_CRITERIA = {
  rosterCoverage: {
    description: 'Does every roster member have a placement in at least one arc, or a question about them in QUESTIONS FOR THE DIRECTOR (C7, C15)?',
    weight: 0.30,
    type: 'structural'
  },
  evidenceIdValidity: {
    description: 'Are all keyEvidence IDs valid, each naming a document in the record (T1)?',
    weight: 0.25,
    type: 'structural'
  },
  accusationArcPresent: {
    description: 'Is there an arc with arcSource="accusation" that takes up the room\'s verdict (T2)?',
    weight: 0.20,
    type: 'structural'
  },
  coherence: {
    description: 'Do the arcs agree on the record\'s facts, with no two claims that cannot both be true (C3)? Arcs that pull against each other or against the room\'s verdict are the tension the article uses.',
    weight: 0.15,
    type: 'advisory'
  },
  evidenceConfidenceBalance: {
    description: 'Are there arcs with strong or moderate evidence, not all speculative (T1)?',
    weight: 0.10,
    type: 'advisory'
  }
};

/**
 * Get theme-aware arc evaluation criteria
 * @param {string} theme - 'journalist' or 'detective'
 * @returns {Object} Arc quality criteria
 */
function getArcCriteria(theme = 'journalist') {
  if (theme === 'detective') return QUALITY_CRITERIA.arcs;
  return { ...JOURNALIST_ARC_CRITERIA, ...truthCriteria('arcs') };
}

/**
 * Get theme-aware outline evaluation criteria
 * @param {string} theme - 'journalist' or 'detective'
 * @returns {Object} Outline quality criteria
 */
function getOutlineCriteria(theme = 'journalist') {
  const isDetective = theme === 'detective';

  if (isDetective) {
    return {
      // STRUCTURAL CRITERIA - Block if failed
      arcCoverage: {
        description: 'Does outline address all selected narrative threads?',
        weight: 0.25,
        type: 'structural'
      },
      requiredSections: {
        description: 'Are all required sections present (executiveSummary, evidenceLocker, suspectNetwork, outstandingQuestions, finalAssessment)?',
        weight: 0.25,
        type: 'structural'
      },
      sectionDifferentiation: {
        description: 'Does each section answer a DIFFERENT question about the case? No fact should repeat across sections.',
        weight: 0.20,
        type: 'structural'
      },
      // ADVISORY CRITERIA - Warn but don't block
      sectionBalance: {
        description: 'Are sections appropriately weighted within the ~750 word budget?',
        weight: 0.10,
        type: 'advisory'
      },
      flowLogic: {
        description: 'Does the report flow logically from summary through evidence to assessment?',
        weight: 0.05,
        type: 'advisory'
      },
      evidenceSynthesis: {
        description: 'Is evidence grouped thematically and synthesized (not listed individually)?',
        weight: 0.10,
        type: 'advisory'
      },
      wordBudget: {
        description: 'Are section word budgets reasonable for a ~750 word report?',
        weight: 0.05,
        type: 'advisory'
      }
    };
  }

  // Journalist outline criteria. Phase 3 (3.4): each names the rule or craft item it
  // scores, and keeps its type and weight; the truth criteria follow.
  return {
    // STRUCTURAL CRITERIA - Block if failed (weight sum: 0.70)
    arcCoverage: {
      description: 'Does the outline carry every selected arc, each in at least one section (C16)?',
      weight: 0.20,
      type: 'structural'
    },
    requiredSections: {
      description: 'Does each section the outline prints earn its place in the narrative, with the thesis deciding which sections exist and their order (C2)?',
      weight: 0.20,
      type: 'structural'
    },
    arcSectionFlow: {
      description: 'Is every section an essential part of one narrative, carrying the threads forward from its own angle, with nothing front-loaded into THE STORY (C2)? Not every arc appears in every section: each section carries the threads its angle needs.',
      weight: 0.20,
      type: 'structural'
    },
    visualDistributionPlan: {
      description: 'Do the cards and photos spread through the article, each placed where it pulls the reader on (C4, C9)?',
      weight: 0.10,
      type: 'structural'
    },
    // ADVISORY CRITERIA - Warn but don't block (weight sum: 0.30)
    sectionBalance: {
      description: 'Is the plan sized for an article of about 1,500 words, with the thesis deciding where the words go (C4)?',
      weight: 0.05,
      type: 'advisory'
    },
    flowLogic: {
      description: 'Does each section hand off to the next, building toward the thesis (C2)?',
      weight: 0.05,
      type: 'advisory'
    },
    photoPlacement: {
      description: 'Is each photo placed where the story reaches the moment it shows (T13)?',
      weight: 0.05,
      type: 'advisory'
    },
    wordBudget: {
      description: 'Do the section word budgets add up to about 1,500 words (C4)?',
      weight: 0.05,
      type: 'advisory'
    },
    // MOMENTUM CRITERIA - Compulsive Readability (Commit 8.24)
    loopArchitecture: {
      description: 'Do the arcs open questions that pull the reader forward and pay them off later, with details planted early coming back changed (C16, C4)?',
      weight: 0.025,
      type: 'advisory'
    },
    arcInterweaving: {
      description: 'Are the threads intercut across the sections, joined by callbacks and recontextualization rather than told one after another (C16)?',
      weight: 0.025,
      type: 'advisory'
    },
    visualMomentum: {
      description: 'Does each card and photo move the story on, closing a question an earlier section opened or opening the next one (C9, C4)?',
      weight: 0.025,
      type: 'advisory'
    },
    convergence: {
      description: 'Do the threads converge at a culmination near the end, where the thesis lands, kept for the end rather than spent early in THE STORY (C16)?',
      weight: 0.025,
      type: 'advisory'
    },
    ...truthCriteria('outline')
  };
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
  // and keeps its type and weight; the truth criteria follow.
  return {
    // STRUCTURAL CRITERIA - Block if failed (weight sum: 0.55)
    voiceConsistency: {
      description: 'Does Nova write in the first person throughout (C12), with "we" only as T8 and the mode block allow it?',
      weight: 0.20,
      type: 'structural'
    },
    antiPatterns: {
      description: 'Does the printed text keep the house style C4 states, with no em-dashes, and the fiction\'s own words, with no production word (T14)? "Memory token" is the fiction\'s own word.',
      weight: 0.15,
      type: 'structural'
    },
    // BASELINE §4 class 6: both remote sessions of the last five were written as
    // on-site, and there was no criterion for it at all. Phase 2 (2.6): a remote
    // article that announced its absence five times was praised for it. Phase 3
    // (3.4): exposed memories reach Nova by turn-in, never as tips (spec T6, T8).
    reporterMode: {
      description: 'Does the article keep T8 as this session\'s mode block states it? It fails on a first-person claim to have been in the warehouse in a remote session, on Nova voting, accusing or exposing, or on the absence stated more than once. Remotely, the room\'s events reach Nova by attribution to the people in the room, and exposed memories by turn-in, anonymous unless the evidence log or the director\'s notes name who turned one in.',
      weight: 0.10,
      type: 'structural'
    },
    visualDistribution: {
      description: 'Do the cards and photos spread through the article, each where it serves the flow, with the card counts a budget and never a quota (C9, C4)?',
      weight: 0.05,
      type: 'advisory'
    },
    arcThreading: {
      description: 'Is every section an essential part of one narrative, carrying the threads forward from its own angle, with nothing front-loaded into THE STORY and the thesis running through every section (C2)? Not every arc appears in every section.',
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
 * @param {'arcs'|'outline'|'article'} phase
 * @param {string} [theme='journalist']
 * @returns {Object}
 */
function getPhaseCriteria(phase, theme = 'journalist') {
  switch (phase) {
    case 'arcs': return getArcCriteria(theme);
    case 'outline': return getOutlineCriteria(theme);
    case 'article': return getArticleCriteria(theme);
    default: throw new Error(`No quality criteria defined for phase: ${phase}`);
  }
}

/** The bar a structural criterion must reach, as every judge prompt states it. */
const STRUCTURAL_PASS_SCORE = 0.8;

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

/** The rule ids an issue opens with ("T3: ...", "T4, T6: ..."), or none. */
function leadingRuleIds(issue) {
  const lead = String(issue == null ? '' : issue).match(/^\s*((?:T\d{1,2}(?:\s*(?:,|&|\/|and)\s*)?)+)/);
  return lead ? lead[1].match(/T\d{1,2}/g) : [];
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
 * The fact check's arguments for one state: the one place they are built
 * (createEvaluator, and scripts/lib/render-calls.js for the renders).
 *
 * Phase 3 (3.4): the theme's NPC entries (Blake's missing pronoun included), the
 * roster's pronouns and the director's words (the notes, the input-review
 * corrections and the accusation) for the pronoun check, and the guest reporter for
 * the head count.
 *
 * @param {Object} state
 * @returns {Object}
 */
function buildFactCheckArgs(state) {
  const theme = state.theme || 'journalist';
  const config = state.sessionConfig || {};
  const notes = state.directorNotes || {};
  const directorText = [
    notes.rawProse,
    ...(Array.isArray(state.inputReviewCorrections) ? state.inputReviewCorrections : []),
    directorAccusationText(state)
  ].filter(text => typeof text === 'string' && text.trim()).join('\n');
  return {
    contentBundle: state.contentBundle,
    arcEvidencePackages: state.arcEvidencePackages,
    evidenceBundle: state.evidenceBundle,
    roster: config.roster,
    sessionPhotos: state.sessionPhotos,
    reportingMode: config.reportingMode,
    npcs: getThemeNPCEntries(theme),
    rosterPronouns: config.rosterPronouns || null,
    directorText,
    guestReporter: config.guestReporter || null,
    theme
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
          fix: { type: 'string', description: 'One concrete action that would raise this score' }
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
    revisionGuidance: { type: 'string' },
    confidence: { type: 'string' }
  },
  required: ['ready', 'overallScore', 'structuralPassed']
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

// getSdkClient imported from node-helpers.js

/**
 * The detective arc judge's NPC lines, keyed by NPC name. Unchanged since phase 2:
 * the detective is parked (spec D13). The journalist judge reads each NPC's canon
 * line from the theme config instead (getNpcDescriptions, M26).
 */
const DETECTIVE_NPC_DESCRIPTIONS = {
  'Marcus': 'Marcus (the murder victim) - should appear in most arcs as the central victim',
  'Nova': 'Nova (the journalist narrator) - may appear as the article\'s narrator/voice',
  'Blake': 'Blake / Valet (NPC character) - may appear in relevant arcs',
  'Valet': null  // Alias for Blake, skip in descriptions
};

/**
 * Build NPC description list for evaluation prompts
 *
 * Journalist (phase 3, 3.4, M26): one line per NPC, its full name, its aliases and
 * its canon line, as lib/theme-config.js states them once for every prompt (the
 * roster section reads the same line). The detective keeps today's lines.
 *
 * @param {string} theme - Theme name ('journalist' or 'detective')
 * @returns {string} Formatted NPC descriptions for prompt injection
 */
function getNpcDescriptions(theme) {
  if (theme === 'journalist') {
    const entries = getThemeNPCEntries(theme).filter(entry => entry && typeof entry === 'object');
    return entries
      .filter(entry => !entry.aliasOf)
      .map(entry => {
        const aliases = entries.filter(alias => alias.aliasOf === entry.name).map(alias => `the ${alias.name}`);
        const also = aliases.length > 0 ? ` (also called ${aliases.join(', ')})` : '';
        return `- ${entry.fullName || entry.name}${also}${entry.role ? `: ${entry.role}` : ''}`;
      })
      .join('\n');
  }
  const npcs = getThemeNPCs(theme);
  const seen = new Set();
  return npcs
    .filter(name => {
      const desc = DETECTIVE_NPC_DESCRIPTIONS[name];
      if (!desc || seen.has(name)) return false;
      seen.add(name);
      return true;
    })
    .map(name => `- ${DETECTIVE_NPC_DESCRIPTIONS[name]}`)
    .join('\n');
}

const SECTION_RULE = '═══════════════════════════════════════════════════════════════════════════';

/** A boxed section heading, as every judge prompt draws them. */
function boxedHeading(title) {
  return `${SECTION_RULE}\n${title}\n${SECTION_RULE}`;
}

/** The judges' JSON shape, restated in the prompt (the schema itself is EVALUATION_JSON_SCHEMA). */
function outputFormat(notes) {
  return `OUTPUT FORMAT (JSON):
{
  "ready": boolean,
  "overallScore": number (0-1),
  "structuralPassed": boolean,
  "criteriaScores": {
    "criterionName": {
      "score": number,
      "type": "structural" | "advisory",
      "notes": "${notes}",
      "fix": "concrete action to improve this criterion"
    }
  },
  "structuralIssues": [ "issues that MUST be fixed" ],
  "advisoryWarnings": [ "issues that are suggestions, not blockers" ],
  "revisionGuidance": "Step 1: Fix structural issue. Step 2: Optional advisory fix.",
  "confidence": "high" | "medium" | "low"
}`;
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
 * the detective's judges are unchanged (detectiveEvaluationSystemPrompt, spec D13).
 *
 * @param {string} phase - Phase name (arcs, outline, article)
 * @param {Object} criteria - Quality criteria for phase
 * @param {string} theme - Theme name ('journalist' or 'detective')
 * @param {Object} [options]
 * @param {Object|null} [options.sessionConfig] - journalist: its reportingMode picks the mode block
 * @returns {string} System prompt
 */
function buildEvaluationSystemPrompt(phase, criteria, theme = 'journalist', { sessionConfig = null } = {}) {
  if (theme === 'detective') return detectiveEvaluationSystemPrompt(phase, criteria);
  return journalistEvaluationSystemPrompt(phase, criteria, sessionConfig);
}

/**
 * The detective judges' system prompts, as they were before phase 3 (parked, spec D13;
 * __tests__/unit/workflow/evaluator-nodes.test.js pins them by hash).
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
2. STRUCTURAL criteria MUST score >= 0.8 to pass (these are hard requirements)
3. ADVISORY criteria are guidance only - low scores are warnings, not blockers
4. Content is READY if ALL structural criteria pass
5. Content is NOT READY only if a STRUCTURAL criterion fails`;

  // For arcs phase, use structural/advisory distinction
  // Commit 8.17: Added immutability guidance and NPC allowlist
  if (phase === 'arcs') {
    return `You are the ARCS Evaluator for an investigative article about "About Last Night" - a crime thriller game.

Your task is to evaluate if the arcs are ready for human review.

${boxedHeading('IMMUTABLE INPUTS (DO NOT suggest changes to these - they are fixed upstream)')}
The following inputs were approved in earlier phases and CANNOT be modified:
- evidenceBundle: The curated evidence is final (exposed/buried structure is locked)
- playerFocus: The accusation and whiteboard conclusions are immutable
- directorNotes: The director's observations are ground truth - never question them
- roster: The session roster is fixed (these are the players who attended)

Your feedback should focus on how ARCS USE these inputs, not changing the inputs themselves.
Do NOT suggest adding new evidence, changing the roster, or modifying player conclusions.

${boxedHeading('KNOWN NPCs (Valid in characterPlacements despite NOT being on roster)')}
The following NPCs are valid in arc characterPlacements:
${getNpcDescriptions('detective')}

These are NOT roster members and should NOT be flagged as missing from roster coverage.
Do NOT remove them from characterPlacements or flag them as "non-roster characters".
Roster coverage ONLY applies to the actual player roster, not NPCs.

${boxedHeading('NON-ROSTER PCs (Valid for MENTIONS - evidence-based only)')}
Non-roster PCs are valid game characters who were NOT present at this session's investigation.
Examples: If Nat, Ezra, or others are NOT in the roster, they are non-roster PCs.

Non-roster PCs CAN appear in arc characterPlacements when:
- They are mentioned in exposed evidence (someone's memory about them)
- They are referenced in paper evidence documents

They should NOT be flagged as "missing from roster coverage" or as invalid.
However, their roles must be EVIDENCE-BASED, not OBSERVED:
- CORRECT: "Nat: Mentioned in Alex's memory as co-investor"
- WRONG: "Nat: Was seen coordinating with Vic" (the investigation did not observe this)

When a non-roster PC appears, add appropriate caveats to indicate evidence-based inference.

${criteriaSections}

CRITICAL DISTINCTION:
- accusationArcPresent: Check if any arc has arcSource="accusation"
- evidenceIdValidity: Check if keyEvidence IDs exist in the evidence bundle
- rosterCoverage: Check if every roster member appears in characterPlacements of at least one arc

CRITICAL: Your feedback MUST be actionable. Include:
- SPECIFIC names (characters missing from roster coverage)
- SPECIFIC evidence IDs (which IDs are invalid)
- CONCRETE fixes (not "improve grounding" but "Arc 2 should reference evidence ID xyz123")

${outputFormat('specific explanation with names/evidence')}

Remember: STRUCTURAL issues block. ADVISORY issues are warnings for human consideration.`;
  }

  // Commit 8.21: Use structural/advisory distinction for outline and article phases too
  if (phase === 'outline') {
    return `You are the OUTLINE Evaluator for an investigative case report about "About Last Night" - a crime thriller game.

Your task is to evaluate if the case report outline is ready for human review.

${boxedHeading('IMMUTABLE INPUTS (DO NOT suggest changes to these - they are fixed upstream)')}
The following inputs were approved in earlier phases and CANNOT be modified:
- selectedArcs: The arcs chosen for this case report are final
- evidenceBundle: The evidence is curated and locked

Your feedback should focus on how the OUTLINE USES these inputs, not changing the inputs.

${criteriaSections}

CRITICAL OUTLINE CHECKS:
- arcCoverage: Every selected thread should be addressed in the outline
- requiredSections: executiveSummary, evidenceLocker, suspectNetwork, outstandingQuestions, finalAssessment MUST exist
- sectionDifferentiation: Each section must answer a DIFFERENT question (no repeated facts)

CRITICAL: Your feedback MUST be actionable. Include:
- SPECIFIC arc titles that are missing coverage
- SPECIFIC section names that are missing
- CONCRETE fixes (not "add more detail" but "add section X with Y content")

${outputFormat('specific explanation')}

Remember: You determine READINESS for human review, not approval. Human always makes final decision.
STRUCTURAL issues block. ADVISORY issues are warnings for human consideration.`;
  }

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
const JUDGE_RULE_CALLS = { arcs: 'judge-arc', outline: 'judge-outline', article: 'judge-article' };

/** The writer whose output each judge judges, as the prompts name it. */
const JUDGED_WRITERS = { arcs: 'arc writer', outline: 'outline writer', article: 'article writer' };

/** How a truth finding quotes the text at fault, per judge. */
const TRUTH_FINDING_QUOTE = {
  arcs: 'quotes the claim and names its arc',
  outline: 'quotes the planned line and names its section',
  article: 'quotes the sentence and names its section'
};

/** The journalist judges' scoring rules (M30: they say how the score is made). */
const JOURNALIST_EVALUATION_RULES = `EVALUATION RULES:
1. Score each criterion from 0.0 to 1.0.
2. STRUCTURAL criteria MUST score >= 0.8 to pass (these are hard requirements); a truth criterion with any breach fails.
3. ADVISORY criteria are guidance only - low scores are warnings, not blockers
4. Content is READY if ALL structural criteria pass, the truth criteria among them
5. overallScore is the weighted average of the weighted criteria's scores, by the percentages above. The truth criteria carry no percentage: they decide readiness alone.`;

/**
 * The truth criteria and how to write a breach, or '' when the criteria carry none.
 *
 * @param {'arcs'|'outline'|'article'} phase
 * @param {Object} criteria
 * @returns {string}
 */
function truthCriteriaSection(phase, criteria) {
  const lines = Object.entries(criteria)
    .filter(([_, { truth }]) => truth)
    .map(([key, { rules, description }]) => `- ${key} (${rules.join(', ')}; must pass): ${description}`);
  if (lines.length === 0) return '';
  return `${boxedHeading('TRUTH RULES (MUST PASS: a breach is a definite error, so the output goes back for a rework)')}
Each criterion below scores the truth rules it names, against the record and the director's words in the evaluation prompt. One breach fails it: score it below 0.8.
${lines.join('\n')}

Write each breach as its own structuralIssues entry, so the rework can fix it. The entry opens with the rule ids and a colon, ${TRUTH_FINDING_QUOTE[phase]}, names the record it contradicts, and gives the fix:
T3: "<the text at fault>" states what a buried memory said; the record holds only its sale (<time>, <amount>, <account>). Report the sale instead.

`;
}

/** Where a craft finding goes: should-consider, naming its item. */
function craftFindingsSection(phase) {
  return `${boxedHeading('CRAFT FINDINGS (should-consider)')}
The evaluation prompt ends with the craft guidance the ${JUDGED_WRITERS[phase]} followed, as your reference for craft. A craft finding that no criterion above scores goes in advisoryWarnings and opens with its item's id, such as C10: a suggestion for the rework and the director, never a blocker.`;
}

/**
 * A journalist judge's system prompt: the identity line, the session's mode block, the
 * world and the truth rules (loadRuleSet), then the judge's own instructions.
 *
 * @param {'arcs'|'outline'|'article'} phase
 * @param {Object} criteria - getPhaseCriteria(phase, 'journalist'), or any criteria to render
 * @param {Object|null} sessionConfig - its reportingMode picks the mode block
 * @returns {string}
 */
function journalistEvaluationSystemPrompt(phase, criteria, sessionConfig) {
  const call = JUDGE_RULE_CALLS[phase];
  if (!call) throw new Error(`Unknown evaluation phase: ${phase}`);
  const { core } = loadRuleSet(call);
  const writer = JUDGED_WRITERS[phase];
  const judged = phase === 'arcs' ? 'the arcs' : phase === 'outline' ? 'the outline' : 'the article';
  const frame = `The rules above are the ones the ${writer} followed: judge ${judged} by them, against the record and the director's words in the evaluation prompt.`;
  const judging = `${truthCriteriaSection(phase, criteria)}${boxedHeading('STRUCTURAL CRITERIA (MUST PASS - these block if failed)')}
${weightedCriteriaList(criteria, 'structural')}

${boxedHeading('ADVISORY CRITERIA (Warn but don\'t block - these are quality guidance)')}
${weightedCriteriaList(criteria, 'advisory')}

${craftFindingsSection(phase)}

${JOURNALIST_EVALUATION_RULES}`;

  let prompt;
  if (phase === 'arcs') {
    prompt = `You are the ARCS Evaluator for an investigative article about "About Last Night" - a crime thriller game.

${core}

Your task is to evaluate if the arcs are ready for human review. ${frame}

${boxedHeading('IMMUTABLE INPUTS (DO NOT suggest changes to these - they are fixed upstream)')}
The following inputs were approved in earlier phases and CANNOT be modified:
- evidenceBundle: The curated evidence is final (exposed/buried structure is locked)
- playerFocus: The accusation and whiteboard conclusions are immutable
- directorNotes: ${ARC_NOTES_LABEL}
- roster: The session roster is fixed (these are the players who attended)

Your feedback should focus on how ARCS USE these inputs, not changing the inputs themselves.
Do NOT suggest adding new evidence, changing the roster, or modifying player conclusions.

${boxedHeading('KNOWN NPCs (Valid in characterPlacements despite NOT being on roster)')}
The following NPCs are valid in arc characterPlacements, each with its canon line:
${getNpcDescriptions('journalist')}

These are NOT roster members and should NOT be flagged as missing from roster coverage.
Do NOT remove them from characterPlacements or flag them as "non-roster characters".
Roster coverage ONLY applies to the actual player roster, not NPCs.

${boxedHeading('NON-ROSTER PCs (Valid for MENTIONS - evidence-based only)')}
Non-roster PCs are valid game characters who were NOT present at this session's investigation.
Examples: If Nat, Ezra, or others are NOT in the roster, they are non-roster PCs.

Non-roster PCs CAN appear in arc characterPlacements when:
- They are mentioned in exposed evidence (someone's memory about them)
- They are referenced in paper evidence documents

They should NOT be flagged as "missing from roster coverage" or as invalid.
However, their roles must be EVIDENCE-BASED, not OBSERVED:
- CORRECT: "Nat: Mentioned in Alex's memory as co-investor"
- WRONG: "Nat: Was seen coordinating with Vic" (Nova didn't see this)

When a non-roster PC appears, add appropriate caveats to indicate evidence-based inference.

${judging}

CRITICAL DISTINCTION:
- accusationArcPresent: Check if any arc has arcSource="accusation"
- evidenceIdValidity: Check if keyEvidence IDs exist in the evidence bundle
- rosterCoverage: Check that every roster member appears in characterPlacements of at least one arc, or has a question about them in QUESTIONS FOR THE DIRECTOR

CRITICAL: Your feedback MUST be actionable. Include:
- SPECIFIC names (characters missing from roster coverage)
- SPECIFIC evidence IDs (which IDs are invalid)
- CONCRETE fixes (not "improve grounding" but "Arc 2 should reference evidence ID xyz123")

${outputFormat('specific explanation with names/evidence')}

Remember: STRUCTURAL issues block. ADVISORY issues are warnings for human consideration.`;
  } else if (phase === 'outline') {
    prompt = `You are the OUTLINE Evaluator for an investigative article about "About Last Night" - a crime thriller game.

${core}

Your task is to evaluate if the article outline is ready for human review. ${frame}

${boxedHeading('IMMUTABLE INPUTS (DO NOT suggest changes to these - they are fixed upstream)')}
The following inputs were approved in earlier phases and CANNOT be modified:
- selectedArcs: The arcs chosen for this article are final
- photoAnalyses: The photo descriptions are fixed upstream. ${DERIVED_LABELS.photoDescriptions}
- evidenceBundle: The evidence is curated and locked

Your feedback should focus on how the OUTLINE USES these inputs, not changing the inputs.

${judging}

CRITICAL: Your feedback MUST be actionable. Include:
- SPECIFIC arc titles that are missing coverage
- SPECIFIC sections, by name
- CONCRETE fixes (not "add more detail" but "add section X with Y content")

${outputFormat('specific explanation')}

Remember: You determine READINESS for human review, not approval. Human always makes final decision.
STRUCTURAL issues block. ADVISORY issues are warnings for human consideration.`;
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
A tight article with 3 perfectly-placed evidence cards beats a bloated one with 10 forced cards.

${judging}

CRITICAL: Your feedback MUST be actionable. Include:
- SPECIFIC lines with voice issues
- SPECIFIC anti-patterns found with line locations
- CONCRETE fixes (not "improve voice" but "change 'The investigation revealed' to 'I discovered'")

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
// judges had no documents, the article judge was asked whether every roster
// member is named with no roster in its prompt, and the outline judge saw 5 of 9
// photos and a null interweaving plan. Each judge now reads the record view and
// the inputs its writer read, through the writers' own renderers and builders.
// All three get the roster with pronouns, the director's notes with the
// input-review corrections, and the director's accusation beside its parse
// (roadmap 2.4, docs/superpowers/plans/2026-09-22-roadmap.md).

/**
 * The interweaving plan the arc analysis produced.
 *
 * It lives in `_arcAnalysisCache.interweavingPlan` (arc-specialist-nodes.js), which
 * brief 2.2 keeps through an arc rework. The outline judge used to read
 * `state.narrativeArcsInterweavingPlan || state.interweavingPlan`, neither of which
 * is a state channel, so every outline evaluation was shown `null`.
 *
 * @param {Object} state
 * @returns {Object|null} the plan, or null when there is none or every field is empty
 */
function interweavingPlanOf(state) {
  const plan = state._arcAnalysisCache?.interweavingPlan;
  // The arc reworker's rule, one function (final fix wave).
  return hasInterweavingPlan(plan) ? plan : null;
}

/**
 * The outline judge's photos: exactly the set the outline writer could place, not
 * the first five analyses. That is the hero in its own slot, then the writer's own
 * list, both taken from the outline writer's inputs (`ai-nodes.js
 * outlineWriterInputs`, which the writer and its reworker build their prompts
 * from) with the hero they used (`reworkHeroImage`: the stored hero, else the one
 * generateOutline would select). Any exclusion the writer's list gains therefore
 * reaches the judge too.
 *
 * Each photo is the entry the outline writer gets (`renderPhotoEntry`: the
 * filename, the names identified in it, and the director's description from the
 * character-IDs stop, joined by filename), then its analysis, paired by the
 * renderer's one join key (`photoKey`).
 *
 * @param {Object} state
 * @returns {string}
 */
function renderJudgePhotos(state) {
  // outlineWriterInputs returns buildOutlinePrompt's arguments, in order: the hero
  // image is the third, the available photos the fourth, the options the last.
  const writerInputs = outlineWriterInputs(state, reworkHeroImage(state));
  const heroImage = writerInputs[2] || null;
  const availablePhotos = writerInputs[3] || [];
  const { photoDescriptions } = writerInputs[writerInputs.length - 1] || {};
  const analysisByKey = new Map(
    (state.photoAnalyses?.analyses || [])
      .filter(analysis => analysis && analysis.filename)
      .map(analysis => [photoKey(analysis.filename), analysis])
  );
  const heroAnalysis = heroImage ? analysisByKey.get(photoKey(heroImage)) : null;
  const heroNames = Array.isArray(heroAnalysis?.identifiedCharacters) ? heroAnalysis.identifiedCharacters : [];
  const photos = [
    ...(heroImage ? [{ filename: heroImage, identifiedCharacters: heroNames, hero: true }] : []),
    ...availablePhotos
  ];
  if (photos.length === 0) return 'PHOTOS:\nNo session photos available';

  const entries = photos.map((photo, i) => {
    const entry = renderPhotoEntry(
      { filename: photo.filename, names: photo.identifiedCharacters },
      photoDescriptions || null,
      '   '
    );
    const analysis = analysisByKey.get(photoKey(photo.filename));
    const analysisText = analysis
      ? JSON.stringify(analysis, null, 2).split('\n').join('\n   ')
      : 'none recorded for this photo';
    return `${i + 1}. ${photo.hero ? '[hero image] ' : ''}${entry}\n   Photo analysis: ${analysisText}`;
  });
  return `PHOTOS (all ${photos.length} photos the outline could place: the hero image, then every other session photo except the whiteboard; each gives the names identified in it, the director's description joined by filename, and its photo analysis):

${entries.join('\n\n')}`;
}

/**
 * The article judge's photos (phase 3, 3.4 fix round 1): the photos the article writer
 * was given, so photosTruth asks a rework only for photos it can see. The article
 * writer's inputs (ai-nodes.js articleWriterInputs) carry them as state.heroImage, the
 * arc evidence packages' photos (its ARC PHOTOS) and state.photoDescriptions.
 *
 * That is the hero image (the stored hero, else the one generateOutline would select,
 * as the outline judge reads it), then each photo the packages list, once, with the
 * whiteboard photo left out. Each is the writer's renderPhotoEntry line: the names
 * identified in it and the director's description, joined by filename. A hero no
 * package lists takes its names from its photo analysis, as the outline judge's does.
 *
 * @param {Object} state
 * @returns {string}
 */
function renderArticleJudgePhotos(state) {
  const heroImage = reworkHeroImage(state);
  const heroKey = heroImage ? photoKey(heroImage) : null;
  const whiteboardKey = state.whiteboardPhotoPath ? photoKey(state.whiteboardPhotoPath) : null;
  const packagePhotos = new Map();
  for (const pkg of state.arcEvidencePackages || []) {
    for (const photo of (Array.isArray(pkg?.photos) ? pkg.photos : [])) {
      const key = photo?.filename ? photoKey(photo.filename) : null;
      if (!key || key === whiteboardKey || packagePhotos.has(key)) continue;
      packagePhotos.set(key, { filename: photo.filename, names: photo.characters });
    }
  }
  const heroAnalysis = heroKey
    ? (state.photoAnalyses?.analyses || []).find(analysis => analysis?.filename && photoKey(analysis.filename) === heroKey)
    : null;
  const photos = [
    ...(heroImage ? [{ filename: heroImage, names: packagePhotos.get(heroKey)?.names || heroAnalysis?.identifiedCharacters || [], hero: true }] : []),
    ...[...packagePhotos].filter(([key]) => key !== heroKey).map(([, photo]) => photo)
  ];
  if (photos.length === 0) return 'PHOTOS (the article writer was given none)';

  const entries = photos.map((photo, i) => `${i + 1}. ${photo.hero ? '[hero image] ' : ''}${renderPhotoEntry(
    { filename: photo.filename, names: photo.names },
    state.photoDescriptions || null,
    '   '
  )}`);
  return `PHOTOS (the ${photos.length} photos the article writer was given: the hero image, then each photo the arc evidence packages list, without the whiteboard photo; each gives the names identified in it and the director's description, joined by filename):

${entries.join('\n\n')}`;
}

/**
 * The session roster for the outline and article judges: the players present, by
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
 * @returns {string}
 */
function renderJudgeDirectorNotes(state) {
  const notes = state.directorNotes || {};
  const listOf = (value) => (Array.isArray(value) ? value : []);
  return `THE DIRECTOR'S NOTES (the director's own account of the investigation, with any input-review corrections after it):
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
 * The director's words and the roster for the outline and article judges, which
 * read them as their writers do: the session roster, the roster with pronouns,
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
 * A journalist judge's craft reference: its writer's craft files (loadRuleSet), for
 * the user prompt after the material it judges (the placement ruling). A craft finding
 * is should-consider; the system prompt says where it goes.
 *
 * @param {'arcs'|'outline'|'article'} phase
 * @returns {string}
 */
function renderJudgeCraft(phase) {
  const { craft } = loadRuleSet(JUDGE_RULE_CALLS[phase]);
  return `THE CRAFT GUIDANCE the ${JUDGED_WRITERS[phase]} followed, your reference for craft findings:
${craft}`;
}

/** The printed fields of each content block, by type (templates/journalist/partials/content-blocks). */
const PRINTED_BLOCK_FIELDS = {
  paragraph: ['type', 'text'],
  quote: ['type', 'text', 'attribution'],
  'evidence-reference': ['type', 'tokenId', 'caption'],
  list: ['type', 'ordered', 'items'],
  photo: ['type', 'filename', 'caption'],
  'evidence-card': ['type', 'tokenId', 'headline', 'content', 'owner']
};

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
  if (bundle.headline && typeof bundle.headline === 'object') out.headline = pickFields(bundle.headline, ['main', 'kicker', 'deck']);
  if (bundle.byline && typeof bundle.byline === 'object') out.byline = pickFields(bundle.byline, ['author', 'title', 'guestReporter']);
  if (bundle.heroImage && typeof bundle.heroImage === 'object') out.heroImage = pickFields(bundle.heroImage, ['filename', 'caption']);
  if (Array.isArray(bundle.sections)) {
    out.sections = bundle.sections
      .filter(section => section && typeof section === 'object')
      .map(section => ({
        ...pickFields(section, ['id', 'heading']),
        content: (Array.isArray(section.content) ? section.content : [])
          .filter(block => block && typeof block === 'object')
          .map(block => pickFields(block, PRINTED_BLOCK_FIELDS[block.type] || ['type', 'text']))
      }));
  }
  if (Array.isArray(bundle.evidenceCards)) {
    out.evidenceCards = bundle.evidenceCards
      .filter(entry => entry && typeof entry === 'object')
      .map(entry => pickFields(entry, ['tokenId', 'headline', 'summary', 'significance']));
  }
  if (tracker) out.financialTracker = tracker;
  return out;
}

/**
 * The writer's financial tracker as the page prints it: each entry's description and
 * amount, and the total. The page prints it only when TemplateAssembler's own rule
 * (overrideFinancialTracker) passes it through, which it does when no ledger account
 * has a positive total, and only when it has an entry (hasFinancialTracker). Otherwise
 * the page prints the ledger's tracker, or none, and this returns null.
 *
 * @param {Object|undefined} tracker - the bundle's financialTracker
 * @param {Array|null} shellAccounts - state.shellAccounts
 * @returns {{entries: Object[], totalExposed?: string}|null}
 */
function printedWriterTracker(tracker, shellAccounts) {
  if (!tracker || typeof tracker !== 'object') return null;
  if (TemplateAssembler.prototype.overrideFinancialTracker(tracker, shellAccounts || []) !== tracker) return null;
  const entries = (Array.isArray(tracker.entries) ? tracker.entries : [])
    .filter(entry => entry && typeof entry === 'object')
    .map(entry => pickFields(entry, ['description', 'amount']));
  if (entries.length === 0) return null;
  return { entries, ...pickFields(tracker, ['totalExposed']) };
}

/** The outline judge's momentum questions as the detective judge reads them (parked, spec D13). */
const DETECTIVE_MOMENTUM_EVALUATION = `═══════════════════════════════════════════════════════════════════════════
MOMENTUM EVALUATION (Commit 8.24 - Compulsive Readability)
═══════════════════════════════════════════════════════════════════════════

Check for narrative momentum:

1. LOOP ARCHITECTURE: Does each arc section open cognitive gaps (questions) and close them?
   - Are there unanswered questions that pull readers forward?
   - Do answers open NEW questions before fully closing?

2. ARC INTERWEAVING: Are arcs connected through callbacks, not just sequential chapters?
   - Do later sections reference and recontextualize earlier ones?
   - Are there "wait, so THAT'S why..." moments planned?
   - Does the outline use shared characters as bridges between arcs?

3. VISUAL MOMENTUM: Do evidence cards, photos, and pull quotes serve loop mechanics?
   - Is each visual component a CLOSER (proves what was hinted) or OPENER (raises new question)?
   - Are photos placed for emotional pacing (breathe before escalation)?

4. CONVERGENCE: Do arcs meet at a satisfying convergence point?
   - Where do all threads meet (the murder, the accusation)?
   - Is the convergence point given appropriate weight?`;

/**
 * The journalist outline judge's momentum questions (phase 3, 3.4): cards and photos,
 * each photo at the moment it shows, and the convergence as C16 states it.
 */
const JOURNALIST_MOMENTUM_EVALUATION = `═══════════════════════════════════════════════════════════════════════════
MOMENTUM EVALUATION (Commit 8.24 - Compulsive Readability)
═══════════════════════════════════════════════════════════════════════════

Check for narrative momentum:

1. LOOP ARCHITECTURE: Does each arc section open cognitive gaps (questions) and close them?
   - Are there unanswered questions that pull readers forward?
   - Do answers open NEW questions before fully closing?

2. ARC INTERWEAVING: Are arcs connected through callbacks, not just sequential chapters?
   - Do later sections reference and recontextualize earlier ones?
   - Are there "wait, so THAT'S why..." moments planned?
   - Does the outline use shared characters as bridges between arcs?

3. VISUAL MOMENTUM: Do the evidence cards and photos serve loop mechanics?
   - Is each card or photo a CLOSER (proves what was hinted) or OPENER (raises new question)?
   - Is each photo placed where the story reaches the moment it shows?

4. CONVERGENCE: Do the threads converge at a culmination near the end, where the thesis lands (C16)?
   - Is the convergence given its weight, and kept for the end rather than spent early in THE STORY?`;

/**
 * Build user prompt with content to evaluate
 *
 * Phase 3 (3.4), journalist only: each judge's craft reference follows the material it
 * judges; the arc judge reads the record view's morning timeline in place of a buried
 * list of its own; the article judge reads only the bundle's printed fields, and its
 * mode line points at the mode block its system prompt carries. The detective's user
 * prompts are unchanged.
 *
 * @param {string} phase - Phase name
 * @param {Object} state - Current state with content
 * @param {Object} [options]
 * @param {Object|null} [options.factCheck] - article only: the fact check's result
 *   for the bundle under review, as createEvaluator computed it this pass. The
 *   state's `_articleFactCheck` is not read: before this evaluation writes it, it
 *   belongs to the previous bundle.
 * @returns {string} User prompt
 */
function buildEvaluationUserPrompt(phase, state, options = {}) {
  const journalist = (state.theme || 'journalist') !== 'detective';
  switch (phase) {
    case 'arcs': {
      // Provide roster for rosterCoverage evaluation
      const roster = state.sessionConfig?.roster || [];
      // Brief 2.4: the valid ids are the arc writer's list, built by the writer's own
      // function, so each names a document the record view below shows by that id.
      const allEvidenceIds = extractEvidenceSummary(state.evidenceBundle || {}).allEvidenceIds;

      // Extract key playerFocus elements for evaluation. The accusation and the
      // director's observations are no longer in this JSON (brief 2.4, roadmap 2.4):
      // they are rendered below as the arc writer renders them, beside the director's
      // own words, so each appears once.
      const playerFocusForEval = {
        primaryInvestigation: state.playerFocus?.primaryInvestigation,
        primarySuspects: state.playerFocus?.primarySuspects || []
      };

      // Phase 3 (3.4): the journalist judge reads the whole record view, its sales on
      // the morning timeline (3.5) under the one row rule every prompt applies
      // (isBuriedTransactionRow). The detective judge keeps its own list.
      let recordSection;
      if (journalist) {
        recordSection = `${renderRecordView(state.evidenceBundle, { sessionConfig: state.sessionConfig })}

${renderJudgeCraft('arcs')}`;
      } else {
        // evidenceBundle has nested structure: { exposed: { tokens: [], paperEvidence: [] }, buried: { transactions: [], relationships: [] } }
        const buriedData = state.evidenceBundle?.buried || {};
        // Flatten buried items - INCLUDE IDs and amounts for financial verification.
        // Only rows that are transactions, by the record view's rule, as the arc writer
        // lists them (phase 2 final fix wave): an unsold memory used to show as "Unknown".
        const buriedTx = Array.isArray(buriedData.transactions) ? buriedData.transactions.filter(isBuriedTransactionRow) : [];
        const buriedRel = Array.isArray(buriedData.relationships) ? buriedData.relationships : [];
        const buriedEvidence = [...buriedTx, ...buriedRel]
          .map((e, index) => ({
            id: `buried-${index + 1}`,  // Synthetic ID — real token IDs stripped to prevent identity leak
            amount: e.amount || e.transactionAmount,
            accountName: e.shellAccount || e.accountName || 'Unknown',
            time: e.time || e.sessionTransactionTime
          }));
        recordSection = `${renderRecordView(state.evidenceBundle, { buried: false })}

BURIED TRANSACTIONS (${buriedEvidence.length} - for amount/account verification):
${JSON.stringify(buriedEvidence, null, 2)}`;
      }

      const checklist = journalist
        ? `1. ROSTER COVERAGE: Every name in SESSION ROSTER has a role in characterPlacements of at least one arc, or a question about them in QUESTIONS FOR THE DIRECTOR
2. EVIDENCE ID VALIDITY: Every keyEvidence ID should exist in ALL VALID EVIDENCE IDS list
3. ACCUSATION ARC PRESENT: At least one arc should have arcSource="accusation"
4. TRUTH RULES: Every truth criterion in your instructions, each breach written under its rule ids

═══════════════════════════════════════════════════════════════════════════
ADVISORY CHECKS (Warn but don't block)
═══════════════════════════════════════════════════════════════════════════
5. COHERENCE: Do the arcs agree on the record's facts (C3)? Arcs that pull against each other or against the room's verdict are the tension the article uses.
6. EVIDENCE CONFIDENCE BALANCE: Are there arcs with evidenceStrength="strong" or "moderate" (not all speculative)?`
        : `1. ROSTER COVERAGE: Every name in SESSION ROSTER needs a role in characterPlacements of at least one arc
2. EVIDENCE ID VALIDITY: Every keyEvidence ID should exist in ALL VALID EVIDENCE IDS list
3. ACCUSATION ARC PRESENT: At least one arc should have arcSource="accusation"

═══════════════════════════════════════════════════════════════════════════
ADVISORY CHECKS (Warn but don't block)
═══════════════════════════════════════════════════════════════════════════
4. COHERENCE: Do arcs tell a consistent story without contradictions?
5. EVIDENCE CONFIDENCE BALANCE: Are there arcs with evidenceStrength="strong" or "moderate" (not all speculative)?`;

      // Phase 3 (3.7; C7, C15): the arc writer's questions for the director, which the
      // journalist rosterCoverage criterion counts. The detective's writer raises none.
      const questionsSection = journalist
        ? `${ARC_JUDGE_QUESTIONS_LABEL}
${JSON.stringify(writerQuestionsOf(state._arcAnalysisCache?.writerQuestions), null, 2)}

`
        : '';

      return `Evaluate these narrative arcs:

ARCS:
${JSON.stringify(state.narrativeArcs || [], null, 2)}

${questionsSection}SESSION ROSTER (${roster.length} players who were PRESENT this session):
${JSON.stringify(roster, null, 2)}

CRITICAL ROSTER vs EVIDENCE DISTINCTION:
- The ROSTER above lists the ONLY characters who need arc coverage (they were played this session)
- Evidence IDs may reference characters NOT on the roster (from the broader game universe)
- Do NOT infer roster members from evidence ID prefixes (e.g., "ezr011" does NOT mean "Ezra" is on roster)
- ONLY check coverage for the ${roster.length} names listed in SESSION ROSTER above

The canonical roster below gives ${journalist ? 'names and pronouns' : 'names'} only. Check coverage against the SESSION ROSTER above, not against this list.

${renderJudgeRosterSection(state)}

THE ACCUSATION (the parsed verdict, then the director's account word for word):
${renderArcAccusation(state.playerFocus?.accusation, directorAccusationText(state), "Players' Reasoning")}

${renderJudgeDirectorNotes(state)}

PLAYER FOCUS (arcs should reflect what players investigated):
${JSON.stringify(playerFocusForEval, null, 2)}

ALL VALID EVIDENCE IDS (${allEvidenceIds.length} total - use to verify keyEvidence references):
${JSON.stringify(allEvidenceIds, null, 2)}

${recordSection}

EVALUATION CHECKLIST (Commit 8.15 - Structural vs Advisory):

═══════════════════════════════════════════════════════════════════════════
STRUCTURAL CHECKS (MUST PASS)
═══════════════════════════════════════════════════════════════════════════
${checklist}

IMPORTANT FOR NEW FIELDS (Commit 8.15):
- arcSource: Should be one of ["accusation", "whiteboard", "observation", "discovered"]
- evidenceStrength: Should be one of ["strong", "moderate", "weak", "speculative"]
- caveats: Array of complications/contradictions
- unansweredQuestions: Array of evidence gaps

Be SPECIFIC in issues:
- Name missing characters FROM THE ROSTER
- List invalid evidence IDs
- Note if accusation arc is missing

Are these arcs ready for human review?`;
    }

    case 'outline': {
      // Extract interweaving metadata from selected arcs for momentum evaluation
      // Resolve arc IDs (strings) to full arc objects from narrativeArcs
      const resolvedArcs = resolveArcs(state.selectedArcs, state.narrativeArcs);
      const selectedArcsWithInterweaving = resolvedArcs.map(arc => ({
        id: arc.id,
        title: arc.title,
        interweaving: arc.interweaving || {}
      }));
      // Brief 2.4: the plan the arc analysis produced. The section is left out when
      // there is none, as the arc reworker's is (wave-2 ruling W2).
      const interweavingPlan = interweavingPlanOf(state);
      const interweavingSection = interweavingPlan
        ? `INTERWEAVING PLAN (from arc analysis):
${JSON.stringify(interweavingPlan, null, 2)}

`
        : '';
      const momentum = journalist
        ? `${renderJudgeCraft('outline')}

${JOURNALIST_MOMENTUM_EVALUATION}`
        : DETECTIVE_MOMENTUM_EVALUATION;

      return `Evaluate this article outline:

OUTLINE:
${JSON.stringify(withoutWriterQuestions(state.outline || {}), null, 2)}

SELECTED ARCS (with interweaving metadata):
${JSON.stringify(selectedArcsWithInterweaving, null, 2)}

${interweavingSection}${renderJudgePhotos(state)}

${renderJudgeSessionContext(state)}

${renderRecordView(state.evidenceBundle, { sessionConfig: state.sessionConfig })}

${momentum}

Is this outline ready for human review?`;
    }

    case 'article': {
      // BASELINE §4 class 6: the evaluator could not score reporter mode because
      // it was never told which mode the session ran in.
      const reportingMode = state.sessionConfig?.reportingMode === 'remote' ? 'remote' : 'on-site';

      if (journalist) {
        // Phase 3 (3.4): the mode block in the system prompt states T8 for this mode
        // (exposed memories reach Nova by turn-in, the room's events by attribution),
        // and reporterMode scores it; this line names the mode, once.
        return `Evaluate this article content:

REPORTING MODE FOR THIS SESSION: ${reportingMode} (the mode block in your instructions says what Nova could witness; reporterMode scores it)

${renderJudgeSessionContext(state)}

${renderRecordView(state.evidenceBundle, { sessionConfig: state.sessionConfig })}

${renderArticleJudgePhotos(state)}

The content bundle below holds only the fields the published page prints.
CONTENT BUNDLE:
${JSON.stringify(printedBundle(state.contentBundle, state.shellAccounts), null, 2)}

OUTLINE:
${JSON.stringify(withoutWriterQuestions(state.outline || {}), null, 2)}

${renderJudgeFactCheck(options.factCheck || null)}

${renderJudgeCraft('article')}

Is this article ready for human review?`;
      }

      const modeRule = reportingMode === 'remote'
        ? 'The reporter was NOT in the room. Every exposure, observation and the verdict reached them as tips from people who were there, and must be written and attributed that way. A first-person claim to have been present is a STRUCTURAL failure. The attribution shows the absence, so the article states it at most once: stating it more than once ("I was not there.", "I was not in that room.") is a reporterMode defect, not a sign of voice.'
        : 'The reporter watched the investigation from inside the room and spoke to people there, but was NOT at the party; the party reaches them only through exposed memories.';

      // Brief 2.4: the roster, the verdict, the notes and the record, each built by the
      // function the article writer's prompt uses (renderJudgeSessionContext, shared
      // with the outline judge), and the fact check's result for this bundle.
      return `Evaluate this article content:

REPORTING MODE FOR THIS SESSION: ${reportingMode}
${modeRule}
In BOTH modes the reporter never votes and owns no exposed memory. "I voted", "my vote" and "one of them was mine" are STRUCTURAL failures either way.

${renderJudgeSessionContext(state)}

${renderRecordView(state.evidenceBundle, { sessionConfig: state.sessionConfig })}

CONTENT BUNDLE:
${JSON.stringify(withoutWriterQuestions(state.contentBundle || {}), null, 2)}

OUTLINE:
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
    case 'outline': return 'outlineRevisionCount';
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
    case 'outline': return REVISION_CAPS.OUTLINE;
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
    case 'outline': return CHECKPOINT_TYPES.OUTLINE;
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
    case 'outline': return PHASES.OUTLINE_EVALUATION;
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
 * @param {string} phase - Phase name (arcs, outline, article)
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
    const phaseConstant = getPhaseConstant(phase);
    const revisionCountField = getRevisionCountField(phase);
    const revisionCap = getRevisionCap(phase);
    // NOTE: checkpointType removed in Commit 8.26 (SRP - checkpoints moved to checkpoint-nodes.js)
    const currentRevisions = state[revisionCountField] || 0;

    // Skip logic 1: If user has already approved this phase (checkpoint approval flag set)
    // For arcs: selectedArcs means user approved arc selection
    // For outline: outlineApproved means user approved outline at checkpoint
    // For article: articleApproved means user approved article at checkpoint
    const hasUserApproved = (
      (phase === 'arcs' && state.selectedArcs && state.selectedArcs.length > 0) ||
      (phase === 'outline' && state.outlineApproved === true) ||
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

    // Skip logic 2: Check MOST RECENT evaluation for this phase
    // (not first ready=true — that persists across revisions and blocks re-evaluation)
    const existingEvals = state.evaluationHistory || [];
    const phaseEvals = existingEvals.filter(e => e.phase === phase);
    const mostRecent = phaseEvals[phaseEvals.length - 1];
    if (mostRecent?.ready === true) {
      console.log(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] Skipping - most recent ${phase} evaluation is ready=true`);
      return {
        currentPhase: phaseConstant
      };
    }

    console.log(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] Starting evaluation (revision ${currentRevisions}/${revisionCap})`);

    // Debug: Log evaluation context
    if (phase === 'arcs') {
      const pf = state.playerFocus || {};
      const roster = state.sessionConfig?.roster || [];
      const arcs = state.narrativeArcs || [];
      // Flatten evidence bundle for counting
      const exposedData = state.evidenceBundle?.exposed || {};
      const buriedData = state.evidenceBundle?.buried || {};
      const exposedCount = (Array.isArray(exposedData.tokens) ? exposedData.tokens.length : 0) +
                           (Array.isArray(exposedData.paperEvidence) ? exposedData.paperEvidence.length : 0);
      const buriedCount = (Array.isArray(buriedData.transactions) ? buriedData.transactions.length : 0) +
                          (Array.isArray(buriedData.relationships) ? buriedData.relationships.length : 0);
      console.log(`[evaluateArcs] Evaluation context check:`);
      console.log(`  - playerFocus.primaryInvestigation: "${pf.primaryInvestigation || 'MISSING'}"`);
      console.log(`  - playerFocus.primarySuspects: ${JSON.stringify(pf.primarySuspects || [])}`);
      console.log(`  - roster: ${JSON.stringify(roster)}`);
      console.log(`  - arcs count: ${arcs.length}`);
      console.log(`  - evidenceBundle: exposed=${exposedCount}, buried=${buriedCount}`);

      // Check if roster members are in arc characterPlacements
      const allPlacements = arcs.flatMap(a => Object.keys(a.characterPlacements || {}));
      const missingFromArcs = roster.filter(r => !allPlacements.some(p => p.toLowerCase().includes(r.toLowerCase())));
      if (missingFromArcs.length > 0) {
        console.log(`  - MISSING from arcs: ${JSON.stringify(missingFromArcs)}`);
      }
    }

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
            advisoryWarnings: factCheck.advisoryWarnings,
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

    try {
      // The prompt is built inside the try (final fix wave): since 2.4 the build
      // creates a PromptBuilder and a ThemeLoader and calls outlineWriterInputs /
      // reworkHeroImage, and a throw there must land in state like an SDK failure,
      // not reject the graph.
      const systemPrompt = buildEvaluationSystemPrompt(phase, criteria, theme, { sessionConfig: state.sessionConfig || null });
      // Brief 2.4: the article judge reads the fact check's result for THIS bundle
      // (computed above), never the state's _articleFactCheck from the previous one.
      const prompt = buildEvaluationUserPrompt(phase, state, { factCheck });
      const jsonSchema = EVALUATION_JSON_SCHEMA;

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
      const judgeReady = evaluation.structuralPassed !== undefined
        ? evaluation.structuralPassed
        : evaluation.ready;

      // Phase 3 (3.4, R2): a truth-rule breach goes back automatically. A truth
      // criterion the judge scored below the structural bar holds the output to
      // not-ready, whatever the judge's own structuralPassed says, and each breach
      // reaches the rework and the evaluation bar under its rule ids: the judge's own
      // sentence when it wrote one under them, else its criterion notes and fix.
      const failedTruth = failedTruthCriteria(evaluation, criteria);
      const judgeStructuralIssues = [
        ...(evaluation.structuralIssues || []),
        ...truthIssueLines(failedTruth, evaluation.structuralIssues || [])
      ];
      const isReady = failedTruth.length > 0 ? false : judgeReady;
      if (failedTruth.length > 0) {
        console.log(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] Truth criteria failed: ${failedTruth.map(f => f.key).join(', ')}`);
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
        // Commit 8.15: Separate structural issues from advisory warnings
        structuralIssues: judgeStructuralIssues,
        advisoryWarnings: evaluation.advisoryWarnings || [],
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
      // `feedback` and `revisionGuidance` carry the same text under both names:
      // buildRevisionContext reads revisionGuidance first, buildArcRevisionContext
      // (arc-specialist-nodes.js) reads only feedback.
      //
      // A proven defect outranks an opinion. At the cap the fact-check runs
      // without short-circuiting, so Opus can return structuralPassed:true over
      // card defects the fact-check demonstrated. Whenever the fact-check holds
      // structural issues the record says passed:false whatever Opus returned,
      // so no rework prompt ever reads "Ready: YES" above its own ISSUES TO
      // ADDRESS list.
      const factCheckIssues = factCheck ? factCheck.structuralIssues : [];
      const buildValidationResults = (passed) => ({
        phase,
        passed: passed && factCheckIssues.length === 0,
        structuralIssues: [
          ...judgeStructuralIssues,
          ...factCheckIssues
        ],
        advisoryWarnings: [
          ...(evaluation.advisoryWarnings || []),
          ...((factCheck && factCheck.advisoryWarnings) || [])
        ],
        issues: evaluation.issues,
        criteriaScores: evaluation.criteriaScores,
        confidence: evaluation.confidence || 'medium',
        revisionGuidance: evaluation.revisionGuidance,
        feedback: evaluation.revisionGuidance
      });

      // Debug: Log evaluation result details
      console.log(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] Evaluation result:`);
      console.log(`  - ready: ${isReady}, score: ${evaluation.overallScore}`);
      console.log(`  - structuralPassed: ${evaluation.structuralPassed}`);
      if (evaluation.criteriaScores) {
        Object.entries(evaluation.criteriaScores).forEach(([key, val]) => {
          const typeLabel = val.type === 'structural' ? '[STRUCTURAL]' : '[advisory]';
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

      // Determine next action based on evaluation result
      // Commit 8.15: Use isReady (which factors in structuralPassed for arcs)
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
 * Evaluate article outline for quality
 * Uses opus for high-quality evaluation (upgraded from haiku in Commit 8.22)
 */
const evaluateOutline = createEvaluator('outline', { model: 'opus' });

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
    stateFields: ['narrativeArcs', 'evaluationHistory']
  }),
  evaluateOutline: traceNode(evaluateOutline, 'evaluateOutline', {
    stateFields: ['outline', 'evaluationHistory']
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
    QUALITY_CRITERIA,
    EVALUATION_JSON_SCHEMA,
    getArcCriteria,
    getOutlineCriteria,
    getArticleCriteria,
    getPhaseCriteria,
    truthCriteria,
    TRUTH_MATERIAL,
    printedBundle,
    buildFactCheckArgs,
    getNpcDescriptions,
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
    if (options.systemPrompt.includes('ARCS')) {
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

    if (options.systemPrompt.includes('OUTLINE')) {
      return {
        ready: false,
        overallScore: 0.6,
        criteriaScores: {},
        issues: ['Section 3 needs more detail'],
        revisionGuidance: 'Expand section 3 with evidence references',
        confidence: 'medium'
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
    narrativeArcs: [{ title: 'Test Arc', summary: 'Test summary' }],
    playerFocus: { primaryInvestigation: 'Who is the Valet?' },
    evidenceBundle: { exposed: [{ id: 'e1' }], buried: [] },
    outline: { sections: [{ title: 'Intro' }] },
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

    console.log('\nTesting evaluateOutline...');
    return evaluateOutline(mockState, mockConfig);
  }).then(result => {
    console.log('Outline result:', {
      ready: result.evaluationHistory?.ready,
      needsRevision: result.validationResults?.passed === false,
      revisionCount: result.outlineRevisionCount
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

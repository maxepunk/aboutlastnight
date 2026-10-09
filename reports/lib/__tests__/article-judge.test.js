/**
 * Brief 4.7a: the article judge (phase 4; spec 6.2 and 11).
 *
 * The article judge fixes errors of fact before the director reads the article, and never
 * touches the director's lines. It scores the truth criteria alone, by the truth-only
 * rules the story meeting's fact check reads, and reads the world, the truth rules and the
 * mode block with no craft file. Its truth questions follow section B of the rule-text
 * read (T1, T2, T5, T9 as rewritten), and it reads the settled weave and the map as the
 * director left it, with the director's answers at the story meeting as record.
 *
 * The fact check's half of the brief (each finding with its place, the roster check
 * against the map, the director's answers among the director's words) is in
 * content-bundle-fact-check.test.js, under its 4.7a describes.
 *
 * getSdkClient returns config.configurable.sdkClient as-is, so a jest.fn is the judge.
 */
const { evaluateArticle, _testing: evalTesting } = require('../workflow/nodes/evaluator-nodes');
const {
  getPhaseCriteria, buildEvaluationSystemPrompt, buildEvaluationUserPrompt,
  TRUTH_ONLY_EVALUATION_RULES, TRUTH_ONLY_EVALUATION_JSON_SCHEMA, TRUTH_MATERIAL
} = evalTesting;
const ruleSet = require('../rule-set');
const { RULE_SET_CALLS } = ruleSet;
// Brief 4.13 (R14): a call names the theme whose rules folder it reads; these read the journalist's.
const loadRuleSet = (call) => ruleSet.loadRuleSet(call, { theme: 'journalist' });
const loadModeBlock = (mode) => ruleSet.loadModeBlock(mode, { theme: 'journalist' });
const { standingOnMap, standingAfterSendBack, DIRECTOR_EDIT_PREFIX } = require('../hand-edit-diff');
const { buildRevisionContext } = require('../workflow/nodes/node-helpers');
const { settledWeaveOf, renderDirectorAnswers } = require('../prompt-renderers/settled-weave');
const { REVISION_CAPS } = require('../workflow/state');
const { reworkFixtureState, PREVIOUS_BUNDLE, MAP } = require('./fixtures/rework-state');
const { beatCardOf } = require('../../console/outline-edit-logic');

const clone = (v) => JSON.parse(JSON.stringify(v));
const count = (text, part) => text.split(part).length - 1;

/**
 * The article's verdictTruth question (T2 as rewritten; brief 4.7f): the map's theories, read as
 * the director's edits leave the map.
 */
const VERDICT_QUESTION = "Is the verdict in the article told as the room's official story, left ungraded against any hidden answer, with every alternative theory the room debated that a beat in the map's sections carries reported, and every theory in the map's leftOut, where a beat the director struck sits, kept out of print (T2)? The director's edits come first, where THE DIRECTOR'S EDITS lists them, so the map is read as they leave it: a theory the director cut, or took out in a rewrite, is out of its sections, and a theory the director's own text reports is in them, from its leftOut too.";

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

/** The fixture's state at the article stop: the weave, the map and the writer's article. */
const articleState = (theme = 'journalist', extra = {}) => ({
  ...reworkFixtureState(theme), contentBundle: clone(PREVIOUS_BUNDLE), articleApproved: false, evaluationHistory: [], ...extra
});
/** At the cap the judge runs whatever the code fact check found. */
const atCap = (state) => ({ ...state, articleRevisionCount: REVISION_CAPS.ARTICLE });
const systemFor = (state) => buildEvaluationSystemPrompt('article', getPhaseCriteria('article', state.theme), state.theme, { sessionConfig: state.sessionConfig });
const userFor = (state) => buildEvaluationUserPrompt('article', state, { factCheck: null });
const judging = (verdict) => jest.fn(async () => clone(verdict));
const cfg = (sdk) => ({ configurable: { sdkClient: sdk, theme: 'journalist' } });
const CLEAN = { ready: true, structuralPassed: true, overallScore: 1, criteriaScores: {}, structuralIssues: [], advisoryWarnings: [], confidence: 'high' };

/** The nine truth groups the article scores, with the rules each names. */
const ARTICLE_TRUTH = {
  evidenceTruth: ['T1', 'T3', 'T4', 'T6'],
  moneyTruth: ['T5'],
  verdictTruth: ['T2'],
  stagesTruth: ['T7'],
  novaPositionTruth: ['T8'],
  playersTruth: ['T9', 'T11'],
  wordsTruth: ['T12'],
  photosTruth: ['T13'],
  fictionTruth: ['T14']
};

/**
 * The map as the director left it, with a debated theory the director struck: b7, the
 * room's theory about Morgan, moved from THE STORY into leftOut. Invented text.
 */
const THEORY = 'The room weighed whether Morgan would replace Marcus, not kill him';
/** The theory's beat, a move at the level of the story with its evidence (phase 4b, brief 1D). */
const THEORY_BEAT = {
  id: 'b7', move: THEORY, players: ['Morgan'], threads: ['t1'], kind: 'line',
  evidence: [{ sources: ['notes'], shows: 'Alex and Morgan argued at the bar.', stance: 'supports' }]
};
function struckTheoryState(extra = {}) {
  const baseline = clone(MAP);
  baseline.sections[1].beats.push(clone(THEORY_BEAT));
  const left = clone(baseline);
  const [struck] = left.sections[1].beats.splice(3, 1);
  left.leftOut.push(struck);
  return articleState('journalist', {
    outline: left, _mapBaseline: baseline, _outlineHandEdits: standingOnMap(null, baseline, left), ...extra
  });
}

/** The map the judge's user prompt prints, parsed back out of it. */
function mapIn(prompt) {
  const start = prompt.indexOf('{', prompt.indexOf(TRUTH_MATERIAL.map));
  return JSON.parse(prompt.slice(start, prompt.indexOf('\n}\n', start) + 2));
}

describe('4.7a: the article judge scores the truth criteria alone', () => {
  it('its criteria are the nine truth criteria, each structural with its rules and no weight, one set for every theme (R1)', () => {
    for (const theme of ['journalist', 'detective']) {
      const criteria = getPhaseCriteria('article', theme);
      expect(Object.keys(criteria)).toEqual(Object.keys(ARTICLE_TRUTH));
      for (const [key, criterion] of Object.entries(criteria)) {
        expect([key, criterion.truth, criterion.type, criterion.weight, criterion.rules]).toEqual([key, true, 'structural', undefined, ARTICLE_TRUTH[key]]);
      }
    }
    expect(getPhaseCriteria('article', 'detective')).toEqual(getPhaseCriteria('article', 'journalist'));
  });

  // Section B of the rule-text read: T1's second point (the answers count like the notes),
  // T2's fourth sentence (the map places the debated theories; a struck one stays out), T5's
  // last sentence (a figure raised at the meeting with no answer stays out of print), T9's
  // last sentence (the director's own words give a pronoun, else the player's name).
  // Brief 4.7c: a question that names where the director's words come from names the four
  // sources the fact check reads as the director's words (buildFactCheckArgs' directorWords).
  // Brief 4.7d: evidenceTruth's T6 clause reads an exposer from the director's words too.
  // Brief 4.7f: verdictTruth reads the map as the director's edits leave it.
  it('each truth question is worded as section B of the rule-text read gives it', () => {
    const descriptions = Object.fromEntries(Object.entries(getPhaseCriteria('article', 'journalist')).map(([key, c]) => [key, c.description]));
    expect(descriptions).toEqual({
      evidenceTruth: "Is every claim in the article written as its evidence allows, the director's words (the notes, the input-review corrections, the accusation, the answers at the story meeting and the notes at the stops) included as record (T1); with no buried memory's content or owner stated as fact (T3); with a person tied to an account as fact only where the director saw the sale or it was made openly in front of the room, and an account's name never a reason to suspect its namesake (T4); and with no exposer named that neither the evidence log nor the director's words name (T6)?",
      moneyTruth: "Does the money in the article run from the buyer to the seller's chosen account, with NeurAI and its board written as Nova's suspicion of who the buyer is and never as fact, and the ledger's money taken as the morning's payments for erasure (T5)? Each figure is as its source gives it: each sale, the first-burial bonus and each transfer as the ledger gives it; each total at the close of the morning as FINANCIAL_SUMMARY gives it; a balance the director's words (the notes, the input-review corrections, the accusation, the answers at the story meeting and the notes at the stops) record as said or shown in the room as that moment's figure (T1); and a figure raised as a question at the story meeting as the director's answer gives it, and out of print when the question has no answer (T5).",
      verdictTruth: VERDICT_QUESTION,
      stagesTruth: "In the article, is the party met only through memories, the investigation told as the reporting mode allows, Nova's day taken from the epilogue alone, and every logged time on the morning clock (T7)? What Nova says NovaNews is still chasing is Nova's own intent and needs no epilogue.",
      novaPositionTruth: "In the article, is Nova the uninterested third party, reporting on the room from outside its choices: Nova never votes, joins the room's accusation or exposes a memory, and witnesses only what this session's mode block allows (T8)?",
      playersTruth: "Does every player in the article take the pronoun the roster gives, or, where the roster gives none, the pronoun the director's own words give (the notes, the input-review corrections, the accusation, the answers at the story meeting and the notes at the stops), or else the player's name in place of a pronoun (T9), and does the judgement in the article land on the characters' choices, with no player's looks described (T11)?",
      wordsTruth: "Is every quoted line in the article word for word from the record or the director's words (the notes, the input-review corrections, the accusation, the answers at the story meeting and the notes at the stops) and in its real speaker's mouth, and does every card copy the record with no id or timestamp in its text (T12)?",
      photosTruth: "Does the article print every photo in PHOTOS and no other, the hero image as its hero, cite nothing from the whiteboard, and give each printed photo a caption that keeps the subject and action of the director's description wherever PHOTOS gives one (T13)?",
      fictionTruth: "Does every line of the article that reaches print speak the fiction's own words, with no production word in it (T14)?"
    });
  });

  // Brief 4.7c: a question that names the director's words reads all four sources. Brief 4.7f:
  // verdictTruth reads the director's edits too, under the heading its question names. Phases 14
  // and 15, brief B (R1, R2): the notes at the stops are the fifth source, so every question that
  // reads the director's words reads them, verdictTruth among them.
  it('the answers from the story meeting join the reads of evidenceTruth, moneyTruth, playersTruth and verdictTruth (T1)', () => {
    const reads = Object.fromEntries(Object.entries(getPhaseCriteria('article', 'journalist')).map(([key, c]) => [key, c.reads]));
    expect(reads).toEqual({
      evidenceTruth: ['record', 'timeline', 'notes', 'corrections', 'verdict', 'answers', 'stopNotes'],
      moneyTruth: ['timeline', 'financialSummary', 'notes', 'corrections', 'verdict', 'answers', 'stopNotes', 'weave'],
      verdictTruth: ['verdict', 'notes', 'answers', 'stopNotes', 'map', 'directorEdits'],
      stagesTruth: ['record', 'modeBlock', 'epilogue', 'timeline'],
      novaPositionTruth: ['modeBlock'],
      playersTruth: ['roster', 'notes', 'corrections', 'verdict', 'answers', 'stopNotes'],
      wordsTruth: ['record', 'notes', 'corrections', 'verdict', 'answers', 'stopNotes', 'printedCards'],
      photosTruth: ['photos', 'whiteboard', 'printedCaptions'],
      fictionTruth: ['truthRules']
    });
  });

  it('its system prompt: the identity, the mode block, the world and the truth rules, the truth criteria and the truth-only rules, and nothing on the writing', () => {
    const state = articleState();
    const system = systemFor(state);
    expect(system.split('\n')[0]).toBe('You are the ARTICLE judge for an investigative article about one session of the game: you check the article the article writer wrote, before the director reads it.');
    expect(system.startsWith(`${system.split('\n')[0]}\n\n${loadModeBlock('remote')}\n\n`)).toBe(true);
    expect(count(system, loadRuleSet('judge-article').core)).toBe(1);
    expect(system).toContain('Your task is to find each breach of the truth rules in the article.');
    for (const [key, rules] of Object.entries(ARTICLE_TRUTH)) expect(system).toContain(`- ${key} (${rules.join(', ')}; must pass): `);
    expect(system).toContain(TRUTH_ONLY_EVALUATION_RULES);
    expect(system).toContain('"notes": "the breach: the sentence at fault, its section, and the record it contradicts"');
    // The weighted criteria, the craft findings and the old frame went (spec 6.2).
    ['STRUCTURAL CRITERIA', 'ADVISORY CRITERIA', 'CRAFT FINDINGS', 'IMMUTABLE INPUTS', 'selectedArcs', 'COMPELLING GIFT',
      'weighted average', 'voiceConsistency', 'reporterMode', 'arcThreading', 'emotionalResonance', 'Human always makes final decision',
      'MUST be actionable', '"type": "structural" | "advisory"']
      .forEach((gone) => expect(`${gone}: ${system.includes(gone)}`).toBe(`${gone}: false`));
  });

  // Spec section 11: the article judge reads the world, the truth rules and the mode block.
  it('reads no craft file: RULE_SET_CALLS[\'judge-article\'] is the core alone (spec section 11)', () => {
    expect(RULE_SET_CALLS['judge-article']).toEqual([]);
    expect(loadRuleSet('judge-article').craft).toBe('');
    const state = articleState();
    expect(`${systemFor(state)}\n${userFor(state)}`).not.toMatch(/^<craft-[a-z]+>$/m);
  });

  it('createEvaluator sends it the truth-only schema, and holds its verdict to the truth-only contract', async () => {
    const verdict = {
      ...CLEAN,
      criteriaScores: {
        evidenceTruth: { score: 1, type: 'advisory' },
        // A criterion the judge was not given: a note on the writing.
        pacing: { score: 0.3, type: 'advisory', notes: 'The story starts slowly.', fix: 'Tighten the lede.' }
      },
      advisoryWarnings: ['C10: the lede runs long.']
    };
    const sdk = judging(verdict);
    const result = await evaluateArticle(atCap(articleState()), cfg(sdk));
    expect(sdk.mock.calls[0][0].jsonSchema).toBe(TRUTH_ONLY_EVALUATION_JSON_SCHEMA);
    expect(result.evaluationHistory.advisoryWarnings).toEqual([]);
    expect(result.validationResults.criteriaScores).toEqual({ evidenceTruth: { score: 1, type: 'structural' } });
    expect(result.validationResults.advisoryWarnings.filter((w) => w.startsWith('C10'))).toEqual([]);
    expect(result.evaluationHistory.ready).toBe(true);
  });

  // Brief 4.7c (4.7a's minor 3): the state carries a standing edit of the director's, and
  // the judge files a concern about it, so the test reads the concern in the escalation.
  it('at the cap, the escalation lists the breaches and the concerns about the director\'s edits, and no note on the writing', async () => {
    const DIRECTORS = 'The director wrote this whole sentence about the vote.';
    const writers = clone(PREVIOUS_BUNDLE);
    const directors = clone(PREVIOUS_BUNDLE);
    directors.sections[0].content.push({ type: 'paragraph', text: DIRECTORS });
    const concern = `${DIRECTOR_EDIT_PREFIX}E1: T1: "${DIRECTORS}" says more than the notes.`;
    const breach = 'T12: "Marcus bragged." is in no document. Quote the memory.';
    const sdk = judging({
      ...CLEAN, ready: false, structuralPassed: false, overallScore: 0.3,
      criteriaScores: { wordsTruth: { score: 0.3, notes: 'A line no document holds.', fix: 'Quote the memory.' } },
      structuralIssues: [breach], advisoryWarnings: [concern, 'C10: the lede runs long.']
    });
    const state = atCap(articleState('journalist', {
      contentBundle: directors, _articleHandEdits: standingAfterSendBack(null, writers, directors, 'bundle')
    }));
    const result = await evaluateArticle(state, cfg(sdk));
    expect(result.evaluationHistory.escalatedToHuman).toBe(true);
    expect(result.evaluationHistory.escalationReason).toContain(breach);
    expect(result.evaluationHistory.escalationReason).toContain(concern);
    expect(result.evaluationHistory.escalationReason).not.toContain('the lede runs long');
  });
});

// Brief 4.7c (4.7a's minor 1): a truth-only judge's verdict is its contract
// (TRUTH_ONLY_EVALUATION_JSON_SCHEMA, its OUTPUT FORMAT), which holds no `issues` array. A
// verdict that carries one anyway is read for its contract alone: the array reaches neither
// the rework's validationResults, nor the history entry, nor the escalation reason.
describe("4.7c: the judge's verdict carries only its contract", () => {
  const OUTSIDE = 'ISSUES-FIELD: the pacing drags in the middle.';
  const breach = 'T12: "Marcus bragged." is in no document. Quote the memory.';
  const verdict = {
    ...CLEAN, ready: false, structuralPassed: false, overallScore: 0.3,
    criteriaScores: { wordsTruth: { score: 0.3, notes: 'A line no document holds.', fix: 'Quote the memory.' } },
    structuralIssues: [breach], issues: [OUTSIDE]
  };

  it('an issues array reaches neither validationResults, nor the history entry, nor the escalation reason', async () => {
    const result = await evaluateArticle(atCap(articleState()), cfg(judging(verdict)));
    expect(result.evaluationHistory.escalatedToHuman).toBe(true);
    expect(JSON.stringify(result.validationResults)).not.toContain(OUTSIDE);
    expect(JSON.stringify(result.evaluationHistory)).not.toContain(OUTSIDE);
    expect(result.evaluationHistory.escalationReason).toContain(breach);
    expect(result.evaluationHistory.escalationReason).not.toContain(OUTSIDE);
  });

  it('the rework reads the breach as its must-fix item, never the array in its place', async () => {
    const result = await evaluateArticle(atCap(articleState()), cfg(judging(verdict)));
    const { contextSection } = buildRevisionContext({
      phase: 'article', revisionCount: 1, validationResults: result.validationResults, previousOutput: clone(PREVIOUS_BUNDLE)
    });
    expect(contextSection).toContain(`ISSUES TO ADDRESS:\n  - ${breach}`);
    expect(contextSection).not.toContain(OUTSIDE);
  });

  it('a ready verdict that carries one leaves it out of the history entry and validationResults too', async () => {
    const result = await evaluateArticle(atCap(articleState()), cfg(judging({ ...CLEAN, issues: [OUTSIDE] })));
    expect(result.evaluationHistory.ready).toBe(true);
    expect(JSON.stringify(result.evaluationHistory)).not.toContain(OUTSIDE);
    expect(JSON.stringify(result.validationResults)).not.toContain(OUTSIDE);
  });
});

describe('4.7a: what the article judge reads', () => {
  it('the settled weave and the map as the director left it, after the photos and before the article; the director\'s answers after the notes', () => {
    const state = articleState();
    state.weave.questions[0].answer = 'Sarah ran the bar all morning.';
    const prompt = userFor(state);
    const at = (s) => prompt.indexOf(s);
    const settled = settledWeaveOf(state);
    const answers = renderDirectorAnswers(state.weave.questions);
    expect(count(prompt, settled)).toBe(1);
    expect(count(prompt, answers)).toBe(1);
    expect(at(answers)).toBeGreaterThan(at('</DIRECTOR_NOTES>'));
    expect(at(answers)).toBeLessThan(at('<RECORD>'));
    expect(at(settled)).toBeGreaterThan(at('\nPHOTOS ('));
    expect(at(TRUTH_MATERIAL.map)).toBeGreaterThan(at(settled));
    expect(at('CONTENT BUNDLE:')).toBeGreaterThan(at(TRUTH_MATERIAL.map));
    expect(mapIn(prompt)).toEqual(state.outline);
    expect(prompt).toContain('\nThe map below is the one the article writer wrote from, as the director left it: the beats in its sections are what the article tells, and leftOut holds what it leaves out, each beat the director struck among them.\nMAP:\n{');
    expect(prompt.startsWith('Check this article against the record and the director\'s words:')).toBe(true);
    expect(prompt.trim().endsWith('Is the article free of truth-rule breaches?')).toBe(true);
    expect(prompt).toContain('REPORTING MODE FOR THIS SESSION: remote (the mode block in your instructions says what Nova could witness; stagesTruth and novaPositionTruth score the article against it)');
    expect(prompt).not.toContain('\nOUTLINE:');
    expect(prompt).not.toContain('THE CRAFT GUIDANCE');
  });

  it('every material a truth criterion reads is printed in the judge\'s prompts', () => {
    const state = articleState();
    state.weave.questions[0].answer = 'Sarah ran the bar all morning.';
    // Brief B (R2): a note the director sent at a stop, as the notes at the stops' block prints it.
    state.directorGateNotes = [{ gate: 'outline', kind: 'approval', round: 1, stopRound: 1, text: 'Keep the bartender in the story.' }];
    // An article that prints a captioned photo, as photosTruth reads its captions.
    state.contentBundle.sections[0].content.push({ type: 'photo', filename: 'p2.jpg', caption: 'Alex points at a line in the ledger.' });
    // Brief 4.7f: an edit of the director's, as verdictTruth reads them, sent as createEvaluator
    // sends them (judgedEdits).
    const writers = clone(state.contentBundle);
    state.contentBundle.sections[0].content.push({ type: 'paragraph', text: 'The director added this paragraph at the desk.' });
    state._articleHandEdits = standingAfterSendBack(null, writers, state.contentBundle, 'bundle');
    const prompts = `${systemFor(state)}\n${buildEvaluationUserPrompt('article', state, { factCheck: null, directorEdits: evalTesting.judgedEdits('article', state) })}`;
    const missing = Object.entries(getPhaseCriteria('article', 'journalist'))
      .flatMap(([key, c]) => c.reads.filter((m) => !prompts.includes(TRUTH_MATERIAL[m])).map((m) => `${key} reads ${m}`));
    expect(missing).toEqual([]);
  });

  // T5 (section B): a figure raised as a question at the story meeting prints as the
  // director's answer gives it, and with no answer it stays out of print.
  it('moneyTruth: an answered figure as the director\'s answer gives it, an unanswered one out of print (T5)', () => {
    const answered = {
      id: 'q2', kind: 'figure', about: 'the Melanie account',
      question: 'The room heard Melanie held "more than double" any other account; the ledger has $75,000 alone. Print it as the room\'s exaggeration?',
      changes: 'The money section\'s key line.', answer: 'Print it as what the room said, beside the ledger\'s figure.'
    };
    const unanswered = {
      id: 'q3', kind: 'figure', about: 'the 07:50 PM sale',
      question: 'The ledger logs a $75,000 sale at 07:50 PM, before the market opened. A slip in the log?',
      changes: 'Whether the sale prints.'
    };
    const state = articleState();
    state.weave.questions.push(answered, unanswered);
    const prompt = userFor(state);
    const answers = prompt.slice(prompt.indexOf('<DIRECTOR_ANSWERS>'), prompt.indexOf('</DIRECTOR_ANSWERS>'));
    const settled = prompt.slice(prompt.indexOf('<SETTLED_WEAVE>'), prompt.indexOf('</SETTLED_WEAVE>'));
    // The answered figure: the director's words in both, word for word.
    expect(answers).toContain(`The director's answer, word for word: "${answered.answer}"`);
    expect(settled).toContain(`The director's answer, word for word: "${answered.answer}"`);
    // The unanswered figure: only the settled weave, marked unanswered.
    expect(answers).not.toContain(unanswered.question);
    expect(settled).toContain(`- q3 (a figure; about: the 07:50 PM sale): ${unanswered.question} Its answer changes: ${unanswered.changes}\n  Unanswered.`);
    const { description } = getPhaseCriteria('article', 'journalist').moneyTruth;
    expect(description).toContain("a figure raised as a question at the story meeting as the director's answer gives it, and out of print when the question has no answer (T5).");
  });

  it('a breach on an unanswered figure the article printed holds the article for its rework', async () => {
    const issue = 'T5: "a $75,000 sale at 07:50 PM" prints a figure the story meeting left unanswered. Cut the figure.';
    const sdk = judging({
      ...CLEAN, ready: true, structuralPassed: true, overallScore: 0.4,
      criteriaScores: { moneyTruth: { score: 0.4, notes: 'An unanswered figure is in print.', fix: 'Cut the figure.' } },
      structuralIssues: [issue]
    });
    const result = await evaluateArticle(atCap(articleState()), cfg(sdk));
    expect(result.evaluationHistory.ready).toBe(false);
    expect(result.validationResults.structuralIssues).toContain(issue);
  });
});

// Review focus 7: a debated theory the director strikes from the map stays out of the
// article, and neither the writer nor the judge brings it back. T2 as rewritten: the
// article reports every theory the map carries; a theory the director strikes stays out.
describe('4.7a: a theory struck from the map stays out, through the judge', () => {
  it('the judge reads the struck theory in the map\'s leftOut, and its question keeps leftOut out of print', async () => {
    const sdk = judging(CLEAN);
    await evaluateArticle(atCap(struckTheoryState()), cfg(sdk));
    const { systemPrompt, prompt } = sdk.mock.calls[0][0];
    const map = mapIn(prompt);
    expect(map.sections.flatMap((s) => s.beats).map((b) => b.id)).not.toContain('b7');
    expect(map.leftOut.find((b) => b.id === 'b7')).toEqual(THEORY_BEAT);
    expect(systemPrompt).toContain(`- verdictTruth (T2; must pass): ${VERDICT_QUESTION}`);
    // The question that asked for every theory the room debated, whatever the map said, is gone.
    expect(systemPrompt).not.toContain('with the alternative theories the room debated reported');
  });

  it('a breach for a struck theory the article printed holds the article for its rework', async () => {
    const state = struckTheoryState();
    state.contentBundle.sections[0].content.push({ type: 'paragraph', text: `${THEORY}, and the vote went the other way.` });
    const issue = `T2: "${THEORY}" reports a theory the map leaves out. Cut it.`;
    const sdk = judging({
      ...CLEAN, ready: false, structuralPassed: false, overallScore: 0.3,
      criteriaScores: { verdictTruth: { score: 0.3, notes: 'A struck theory is reported.', fix: 'Cut it.' } },
      structuralIssues: [issue]
    });
    const result = await evaluateArticle(atCap(state), cfg(sdk));
    expect(result.evaluationHistory.ready).toBe(false);
    expect(result.evaluationHistory.structuralIssues).toEqual([issue]);
    expect(result.validationResults.structuralIssues).toContain(issue);
  });
});

// Brief 4.7d (ruling 2 on the follow-ups' findings, minor 2): a correction at the input review
// or an answer at the story meeting that names who turned a memory in is the director's words
// (T1), as the notes are, so the article's T6 clause reads an exposer from all four sources.
// The weave's question keeps its wording.
describe("4.7d: an exposer named in any of the director's words is record (T1, T6)", () => {
  const { ARTICLE_DIRECTOR_WORDS, directorWords, buildFactCheckArgs } = evalTesting;
  /** The fixture's question about Sarah, answered: no other text of the director's names an exposer. */
  const ANSWER = 'Sarah turned in the envelope memory to Nova at 10:40.';
  const answeredState = () => {
    const state = articleState();
    state.weave.questions[0].answer = ANSWER;
    return state;
  };

  it("an exposer named only in an answer at the story meeting is read among the director's words", () => {
    const state = answeredState();
    const { evidenceTruth } = getPhaseCriteria('article', 'journalist');
    // The T6 clause reads an exposer from the director's words, which the question names by
    // their four sources.
    expect(evidenceTruth.description.endsWith("and with no exposer named that neither the evidence log nor the director's words name (T6)?")).toBe(true);
    expect(evidenceTruth.description).toContain(`the director's words ${ARTICLE_DIRECTOR_WORDS} included as record (T1);`);
    expect(evidenceTruth.reads).toContain('answers');
    // The answer prints under its material, and it is the only text of the director's that
    // names an exposer; the fact check reads it with the rest.
    const prompt = userFor(state);
    expect(prompt.slice(prompt.indexOf(TRUTH_MATERIAL.answers), prompt.indexOf('</DIRECTOR_ANSWERS>'))).toContain(ANSWER);
    expect(directorWords(state).filter((text) => /turned in/i.test(text))).toEqual([ANSWER]);
    expect(buildFactCheckArgs(state).directorText).toContain(ANSWER);
  });

  it("the weave's T6 clause keeps its wording", () => {
    expect(getPhaseCriteria('arcs', 'journalist').evidenceTruth.description)
      .toContain("and with no exposer named that neither the evidence log nor the director's notes name (T6)?");
  });
});

// Brief 4.7d (ruling 2, minor 4): the director's words are one list. The article's truth
// questions name them (ARTICLE_DIRECTOR_WORDS), the judge reads them under their materials
// (DIRECTOR_WORDS_MATERIAL), and the fact check and the verdict guard read their texts
// (directorWords). All three are built from DIRECTOR_WORDS_SOURCES, so they name the same
// sources in one order.
describe("4.7d: the director's words are one list", () => {
  const { ARTICLE_DIRECTOR_WORDS, DIRECTOR_WORDS_MATERIAL, DIRECTOR_WORDS_SOURCES, directorWords } = evalTesting;
  /** One distinct text per source, by the material it prints under. */
  const PLANTED = {
    notes: 'PLANTED NOTES: Morgan paced the bar before the vote.',
    corrections: 'PLANTED CORRECTION: Riley kept the books, not Morgan.',
    verdict: 'PLANTED ACCUSATION: six votes for an accidental overdose.',
    answers: 'PLANTED ANSWER: Sarah ran the bar all morning.',
    stopNotes: 'PLANTED STOP NOTE: the transfer times shift nine hours to fit the timeline.'
  };
  const plantedState = () => {
    const state = articleState();
    state.directorNotes = { ...state.directorNotes, rawProse: PLANTED.notes };
    state.inputReviewCorrections = [PLANTED.corrections];
    state.sessionConfig = { ...state.sessionConfig, accusationRaw: PLANTED.verdict };
    state.weave.questions[0].answer = PLANTED.answers;
    state.directorGateNotes = [{ gate: 'outline', kind: 'rejection', round: 1, stopRound: 1, text: PLANTED.stopNotes }];
    return state;
  };

  // Phases 14 and 15, brief B (R1): the notes at the stops are the fifth source.
  it('one source per material, in one order: the notes, the corrections, the accusation, the answers, the notes at the stops', () => {
    expect(DIRECTOR_WORDS_SOURCES.map((source) => source.material)).toEqual(['notes', 'corrections', 'verdict', 'answers', 'stopNotes']);
    expect(DIRECTOR_WORDS_MATERIAL).toEqual(DIRECTOR_WORDS_SOURCES.map((source) => source.material));
  });

  it('ARTICLE_DIRECTOR_WORDS names each source by its label, in that order', () => {
    const at = DIRECTOR_WORDS_SOURCES.map((source) => ARTICLE_DIRECTOR_WORDS.indexOf(source.label));
    expect(at.filter((index) => index < 0)).toEqual([]);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(ARTICLE_DIRECTOR_WORDS).toBe('(the notes, the input-review corrections, the accusation, the answers at the story meeting and the notes at the stops)');
  });

  it('directorWords returns each planted text, in the order DIRECTOR_WORDS_MATERIAL names its source', () => {
    expect(directorWords(plantedState())).toEqual(DIRECTOR_WORDS_MATERIAL.map((material) => PLANTED[material]));
  });

  it("the article judge's prompt prints each planted text under its material", () => {
    const prompt = userFor(plantedState());
    const placed = DIRECTOR_WORDS_MATERIAL.map((material) => {
      const open = TRUTH_MATERIAL[material];
      const inner = prompt.slice(prompt.indexOf(open), prompt.indexOf(open.replace('<', '</')));
      return `${material}: ${inner.includes(PLANTED[material])}`;
    });
    expect(placed).toEqual(DIRECTOR_WORDS_MATERIAL.map((material) => `${material}: true`));
  });
});

// Brief 4.7f (ruling 2 on 4.5f's and 4.7e's findings): the judge reads the map as the director's
// desk edits leave it. The map keeps the beat of a card the director deleted at the desk, so a
// question that asked for every theory a beat in the map's sections carries read a theory whose
// card the director cut as unreported: a finding that quoted neither the cut text nor the edit's
// id stayed structural, and an automatic rework was sent to bring the cut back. A theory the
// director printed from leftOut in their own words read as a breach the same way.
describe("4.7f: the judge reads the map as the director's edits leave it", () => {
  const { judgedEdits } = evalTesting;
  /** A theory the room debated, carried in THE STORY by beat b3, the mor001 card. Invented text. */
  const CARD_THEORY = 'The room weighed whether Morgan paid Riley to keep the books quiet';

  /** The writer's article prints b3's card in THE STORY, and the director cut it at the desk. */
  function cutTheoryCardState() {
    const map = clone(MAP);
    map.sections[1].beats[1].move = CARD_THEORY;
    const writers = clone(PREVIOUS_BUNDLE);
    writers.sections[0].content.splice(2, 0, {
      type: 'evidence-card', tokenId: 'mor001', headline: 'The envelope', content: 'Morgan hands Riley an envelope by the bar.', owner: 'Morgan Reed', significance: 'supporting'
    });
    const directors = clone(writers);
    directors.sections[0].content.splice(2, 1);
    return articleState('journalist', { outline: map, contentBundle: directors, _articleHandEdits: standingAfterSendBack(null, writers, directors, 'bundle') });
  }

  it("the question reads the director's edits first, under the heading the judge's prompt prints them", () => {
    const { verdictTruth } = getPhaseCriteria('article', 'journalist');
    expect(verdictTruth.description).toBe(VERDICT_QUESTION);
    expect(verdictTruth.reads).toContain('directorEdits');
    expect(VERDICT_QUESTION).toContain(`where ${TRUTH_MATERIAL.directorEdits.replace(/ \($/, '')} lists them`);
    const state = cutTheoryCardState();
    const prompt = buildEvaluationUserPrompt('article', state, { factCheck: null, directorEdits: judgedEdits('article', state) });
    expect(prompt).toContain(`\n${TRUTH_MATERIAL.directorEdits}record: the director's own text`);
  });

  it("a theory whose card the director cut: the map still carries its beat, the judge reads the cut among the director's edits, and the question takes the theory out of the map's sections", async () => {
    const sdk = judging(CLEAN);
    await evaluateArticle(atCap(cutTheoryCardState()), cfg(sdk));
    const { systemPrompt, prompt } = sdk.mock.calls[0][0];
    // Phase 4b (brief 1D; R4): a beat's card is its flagged piece, read through beatCardOf.
    expect(mapIn(prompt).sections[1].beats.filter((beat) => beatCardOf(beat) === 'mor001').map((beat) => beat.move)).toEqual([CARD_THEORY]);
    const edits = prompt.indexOf(TRUTH_MATERIAL.directorEdits);
    expect(edits).toBeGreaterThan(prompt.indexOf('CONTENT BUNDLE:'));
    expect(prompt.slice(edits)).toContain('E1 (section "the-story", evidence-card mor001, cut)');
    expect(systemPrompt).toContain(`- verdictTruth (T2; must pass): ${VERDICT_QUESTION}`);
  });

  it("a theory the director printed from leftOut in their own words: the judge reads their paragraph among the director's edits, and the question puts the theory in the map's sections", async () => {
    const state = struckTheoryState();
    const writers = clone(state.contentBundle);
    const DIRECTORS = `${THEORY}, and the director printed it at the desk.`;
    state.contentBundle.sections[0].content.push({ type: 'paragraph', text: DIRECTORS });
    state._articleHandEdits = standingAfterSendBack(null, writers, state.contentBundle, 'bundle');
    const sdk = judging(CLEAN);
    await evaluateArticle(atCap(state), cfg(sdk));
    const { systemPrompt, prompt } = sdk.mock.calls[0][0];
    expect(mapIn(prompt).leftOut.filter((beat) => beat.id === 'b7').map((beat) => beat.move)).toEqual([THEORY]);
    expect(prompt.slice(prompt.indexOf(TRUTH_MATERIAL.directorEdits))).toContain(`E1 (section "the-story", paragraph): "${DIRECTORS}"`);
    expect(systemPrompt).toContain(`- verdictTruth (T2; must pass): ${VERDICT_QUESTION}`);
  });
});

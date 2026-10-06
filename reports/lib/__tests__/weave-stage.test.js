/**
 * The weave stage (phase 4, brief 4.4; spec 2026-10-02 sections 4.1, 4.2, 4.5 and 10).
 *
 * The arc writer writes one weave in one call, from what it reads today; code checks
 * it; one fact check scores the truth criteria and marks the weave it judged; one
 * automatic fix runs on a breach, and the stop opens without a second judge call. The
 * interweaving call is gone. Every model call here is a recording stand-in.
 */

const arcNodes = require('../workflow/nodes/arc-specialist-nodes');
const { analyzeArcsPlayerFocusGuided, reviseArcs, validateArcStructure } = arcNodes;
const { weaveSystemPrompt, buildWeavePrompt, buildWeaveSections, buildArcRevisionPrompt, getArcRevisionSystemPrompt } = arcNodes._testing;
const { evaluateArcs, evaluateArticle, _testing: evalTesting } = require('../workflow/nodes/evaluator-nodes');
const { buildEvaluationSystemPrompt, buildEvaluationUserPrompt, getPhaseCriteria, TRUTH_ONLY_EVALUATION_RULES } = evalTesting;
const { DIRECTOR_EDIT_PREFIX } = require('../hand-edit-diff');
const { _testing: graphTesting } = require('../workflow/graph');
const { routeArcValidation, routeArcEvaluation, incrementArcRevision } = graphTesting;
const { buildRevisionContext, STRUCTURAL_PASS_SCORE } = require('../workflow/nodes/node-helpers');
const { WEAVE_SCHEMA, WEAVE_SYSTEM_PROMPT } = require('../sdk-client/subagents');
const subagents = require('../sdk-client/subagents');
const ruleSet = require('../rule-set');
const { RULE_SET_CALLS } = ruleSet;
// Brief 4.13 (R14): a call names the theme whose rules folder it reads; these read the journalist's.
const loadRuleSet = (call) => ruleSet.loadRuleSet(call, { theme: 'journalist' });
const loadModeBlock = (mode) => ruleSet.loadModeBlock(mode, { theme: 'journalist' });
const { identityLineOf } = require('../theme-config');
const { REVISION_CAPS, getDefaultState, PHASES } = require('../workflow/state');
const { weaveKey, withFactCheckMark, WEAVE_CHECKS_SOURCE, MEETING_WORD_BOUND } = require('../weave');
const { reworkFixtureState } = require('./fixtures/rework-state');
const { instructionText, findRemovedPhrases } = require('./fixtures/removed-phrases');

const clone = (v) => JSON.parse(JSON.stringify(v));
const count = (haystack, needle) => haystack.split(needle).length - 1;

/** A model stand-in that records each call and answers with `answer(options)`. */
function recordingSdk(answer) {
  const calls = [];
  const sdk = async (options) => { calls.push(options); return clone(typeof answer === 'function' ? answer(options) : answer); };
  sdk.calls = calls;
  return sdk;
}

/**
 * The fixture state, which carries a weave whose evidence names its record's documents,
 * at the arc stage: the meeting not yet approved (the fixture's arc selection is the
 * later stages').
 */
function weaveState(overrides = {}) {
  // Brief 4.6: the fixture is past the meeting; the weave stage runs before its approval.
  return { ...reworkFixtureState('journalist'), meetingApproved: false, ...overrides };
}

/** A fact-check verdict with one breach in thread t2. */
const BREACH = {
  ready: false, structuralPassed: false, overallScore: 0.4,
  criteriaScores: { evidenceTruth: { score: 0.4, type: 'structural', notes: 'Thread t2 states a buried memory.', fix: 'Report the sale.' } },
  structuralIssues: ['T3: "Morgan sold the BizAI memory" in thread t2 states what a buried memory held; the record holds only its sale. Report the sale.'],
  advisoryWarnings: [],
  confidence: 'high'
};
const CLEAN = { ready: true, structuralPassed: true, overallScore: 1, criteriaScores: {}, structuralIssues: [], advisoryWarnings: [], confidence: 'high' };

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

describe('the arc writer writes one weave in one call', () => {
  it('sends one call with the weave\'s schema, and stores the weave; the old arc channels are not written', async () => {
    const state = weaveState({ weave: null });
    const sdk = recordingSdk(reworkFixtureState('journalist').weave);
    const update = await analyzeArcsPlayerFocusGuided(state, { configurable: { sdkClient: sdk, theme: 'journalist' } });
    expect(sdk.calls).toHaveLength(1);
    expect(sdk.calls[0].jsonSchema).toBe(WEAVE_SCHEMA);
    expect(sdk.calls[0].model).toBe('opus');
    expect(sdk.calls[0].disableTools).toBe(true);
    expect(update.weave.threads.map((t) => t.id)).toEqual(reworkFixtureState('journalist').weave.threads.map((t) => t.id));
    ['narrativeArcs', '_arcAnalysisCache', 'specialistAnalyses'].forEach((channel) => expect(update).not.toHaveProperty(channel));
  });

  it('keeps only well-formed questions on the weave it stores', async () => {
    const weave = { ...reworkFixtureState('journalist').weave, questions: [{ id: 'q1', kind: 'player', about: 'Riley', question: 'What did Riley do?', changes: 'Where Riley appears.' }, { kind: 'ledger', about: 'x', question: 'y' }] };
    const update = await analyzeArcsPlayerFocusGuided(weaveState({ weave: null }), { configurable: { sdkClient: recordingSdk(weave) } });
    expect(update.weave.questions).toEqual([weave.questions[0]]);
  });

  it('skips when the thread already holds a weave (a replay)', async () => {
    const sdk = recordingSdk({});
    const update = await analyzeArcsPlayerFocusGuided(weaveState(), { configurable: { sdkClient: sdk } });
    expect(sdk.calls).toHaveLength(0);
    expect(update).not.toHaveProperty('weave');
  });

  it('throws when the writer returns no threads, so the graph retries or the director sees the failure', async () => {
    const sdk = recordingSdk({ story: 'x', threads: [] });
    await expect(analyzeArcsPlayerFocusGuided(weaveState({ weave: null }), { configurable: { sdkClient: sdk } }))
      .rejects.toThrow(/no threads/);
  });

  it('the system prompt: the identity line, the mode block, the world and the truth rules, then the role, and no every-player line', () => {
    const state = weaveState();
    const system = weaveSystemPrompt(state.sessionConfig, 'journalist');
    // Brief 4.13: the identity line is the theme's, and the prompt's own text follows the rules.
    expect(system.split('\n')[0]).toBe(identityLineOf('journalist', 'arc'));
    expect(system.split('\n')[0]).toMatch(/you write the weave/);
    expect(system.endsWith(`\n\n${WEAVE_SYSTEM_PROMPT}`)).toBe(true);
    expect(system.indexOf(loadModeBlock('remote'))).toBeLessThan(system.indexOf('<world>'));
    expect(count(system, loadRuleSet('arc').core)).toBe(1);
    expect(system).not.toContain('<craft-');
    // The prompt's own text: the rule files state their own rules.
    expect(WEAVE_SYSTEM_PROMPT).not.toMatch(/roster member|placement|every player|each player|narrative arcs/i);
  });

  it("the user prompt's output format and task describe the weave, and the task points at C1, C15 and C16", () => {
    const prompt = buildWeaveSections(weaveState());
    expect(prompt.startsWith('# The Weave\n')).toBe(true);
    const format = prompt.slice(prompt.indexOf('## OUTPUT FORMAT'), prompt.indexOf('## SECTION 1'));
    // Phase 4b (brief 1B; R1): each thread a name and a line, and each thread and connection
    // its evidence, each piece its sources, what it shows and its stance.
    ['"story"', '"question"', '"headline"', '"fromYourNotes"', '"threads"', '"name"', '"line"', '"role"', '"reason"', '"verdict"', '"evidence"',
      '"sources"', '"shows"', '"stance"', '"connections"', '"kind"', '"joins"', '"convergence"', '"strongerMainThread"', '"questions"', '"changes"']
      .forEach((field) => expect(format).toContain(field));
    expect(format).toContain('"main-thread" | "grounds-it" | "complicates-it" | "mirrors-it" | "carries-it-forward" | "left-out"');
    expect(format).toContain('"person" | "moment" | "document" | "line"');
    expect(format).toContain('"supports" | "cuts-against"');
    expect(format).toContain('"player" | "pronoun" | "figure"');
    const task = prompt.slice(prompt.indexOf('## SECTION 3'), prompt.indexOf('## SECTION 4'));
    ['C1', 'C15', 'C16'].forEach((item) => expect(task).toMatch(new RegExp(`\\b${item}\\b`)));
    expect(task).toContain(`comes to at most ${MEETING_WORD_BOUND} words`);
    // The old shape's words went: a claim, a receipt, a connection named exactly.
    expect(`${format}${task}`).not.toMatch(/\bclaim|\breceipt|named exactly|"detail"/i);
    // The prompt's own text: the craft files state their own rules.
    const own = prompt.replace(loadRuleSet('arc').craft, '');
    ['narrativeArcs', 'analysisNotes', 'characterPlacements', 'arcSource', 'evidenceStrength', 'caveats', 'emotionalHook', 'interweav', 'synthesisNotes', 'writerQuestions']
      .forEach((retired) => expect(`${retired}: ${own.includes(retired)}`).toBe(`${retired}: false`));
  });

  it('the every-player lines are gone from the ROSTER PCs line', () => {
    const prompt = buildWeaveSections(weaveState());
    const rosterLine = prompt.split('\n').find((line) => line.startsWith('**ROSTER PCs**'));
    expect(rosterLine).toBeDefined();
    expect(rosterLine).not.toMatch(/placement|writerQuestions|question|MUST|each has/);
  });

  it('still reads the record, the morning timeline, the notes and corrections, the accusation word for word, the whiteboard reading and the roster with pronouns', () => {
    const state = weaveState();
    const prompt = buildWeaveSections(state);
    expect(prompt.match(/^<RECORD>$/gm)).toHaveLength(1);
    expect(prompt.match(/^<morning-timeline>$/gm)).toHaveLength(1);
    expect(prompt).toContain(state.directorNotes.rawProse);
    expect(prompt).toContain(state.inputReviewCorrections[0]);
    expect(prompt).toContain(state.sessionConfig.accusationRaw);
    expect(prompt).toContain("### The Whiteboard (a model's reading of the photo)");
    expect(prompt).toContain('### Names and Pronouns');
    expect(prompt).toContain('Riley Torres');
  });

  it('carries its rule files as RULE_SET_CALLS[\'arc\'] gives them, after the record and before <DIRECTOR_GUIDANCE>, which stays last', () => {
    expect(RULE_SET_CALLS.arc).toEqual(['craft-story', 'craft-form', 'craft-material', 'craft-judgement', 'craft-questions']);
    const notes = [{ gate: 'arc-selection', kind: 'rejection', round: 1, text: 'Lead with the vote.', at: 't' }];
    const prompt = buildWeavePrompt(weaveState({ directorGateNotes: notes }));
    const { craft } = loadRuleSet('arc');
    expect(count(prompt, craft)).toBe(1);
    expect(prompt.indexOf(craft)).toBeGreaterThan(prompt.indexOf('</RECORD>'));
    expect(prompt.indexOf(craft)).toBeLessThan(prompt.indexOf('<DIRECTOR_GUIDANCE>'));
    expect(prompt.trimEnd().endsWith('</DIRECTOR_GUIDANCE>')).toBe(true);
  });

  it('no removed phrase is in its instruction text', () => {
    const state = weaveState();
    const render = `${weaveSystemPrompt(state.sessionConfig, 'journalist')}\n=====\n${buildWeavePrompt(state)}`;
    expect(findRemovedPhrases(instructionText(render)).map(String)).toEqual([]);
    expect(instructionText(render)).not.toMatch(/[–—]/);
  });
});

describe('the weave checks (the check node)', () => {
  const pass = () => weaveState();
  /** The fixture with a piece of t2's evidence naming a document the record lacks (phase 4b, brief 1B). */
  const failing = () => {
    const state = weaveState();
    state.weave = {
      ...clone(state.weave),
      threads: state.weave.threads.map((t) => (t.id === 't2' ? { ...t, evidence: [{ sources: ['zzz999'], shows: 'A document no record holds.', stance: 'supports' }] } : t))
    };
    return state;
  };

  it('writes validationResults on a pass, stamped for the weave it checked', () => {
    const state = pass();
    const update = validateArcStructure(state, {});
    expect(update.validationResults).toMatchObject({ phase: 'arcs', source: WEAVE_CHECKS_SOURCE, weaveKey: weaveKey(state.weave), passed: true, structuralIssues: [] });
    expect(update._arcValidation).toMatchObject({ weaveKey: weaveKey(state.weave), passed: true, failures: [] });
  });

  it('writes the failing lines on a failure, each the defect and its fix', () => {
    const state = failing();
    const update = validateArcStructure(state, {});
    expect(update.validationResults.passed).toBe(false);
    expect(update.validationResults.weaveKey).toBe(weaveKey(state.weave));
    expect(update.validationResults.structuralIssues).toHaveLength(1);
    expect(update.validationResults.structuralIssues[0]).toMatch(/^The thread "The sale": piece 1 names "zzz999"/);
    expect(update._arcValidation.failures.map((f) => [f.type, f.place])).toEqual([['evidence-not-in-record', 'threads[#t2]']]);
    expect(update).not.toHaveProperty('weave');
  });

  it("reads the director's notes and corrections for \"from your notes\"", () => {
    const state = weaveState();
    state.weave = { ...clone(state.weave), fromYourNotes: state.inputReviewCorrections[0] };
    expect(validateArcStructure(state, {})._arcValidation.passed).toBe(true);
    state.weave.fromYourNotes = 'words no one wrote';
    expect(validateArcStructure(state, {})._arcValidation.failures.map((f) => f.type)).toEqual(['from-your-notes-not-verbatim']);
  });

  it('counts no roster coverage at this stage: a weave that names one player passes', () => {
    const state = weaveState();
    state.weave = { ...clone(state.weave), threads: [state.weave.threads[0]], connections: [] };
    expect(validateArcStructure(state, {})._arcValidation.passed).toBe(true);
  });

  it('skips once the meeting is approved, leaving every channel as it was', () => {
    expect(validateArcStructure(weaveState({ meetingApproved: true }), {})).toEqual({});
  });

  // Phase 4b (brief 1B; R5; Review focus 3): the node counts the meeting's page as it first
  // opens, by lib/stop-pages.js wordsShown, on the writer's share of the weave alone, and fails
  // the writer's page past MEETING_WORD_BOUND. The director's version is never held to it.
  describe("the meeting's page, counted as it first opens", () => {
    const { wordsShown } = require('../stop-pages');
    const { meetingCheckpointData } = require('../meeting');
    const { standingAtMeeting } = require('../hand-edit-diff');
    const firstLook = (state) => wordsShown('arc-selection', meetingCheckpointData({ weave: state.weave, sessionConfig: state.sessionConfig }, { evidenceIndex: {}, maxRevisions: 0 }));
    /** The fixture's weave, its story run long. */
    const longStory = (weave) => ({ ...clone(weave), story: `${weave.story} ${'The room kept arguing about the money. '.repeat(30).trim()}` });

    it('records the words the page shows when it first opens, the folded evidence left out', () => {
      const state = pass();
      expect(validateArcStructure(state, {})._arcValidation.words).toBe(firstLook(state));
      expect(firstLook(state)).toBeLessThan(MEETING_WORD_BOUND);
    });

    it("fails the writer's page past the bound, in one line with no place, so it sits at the top of the meeting", () => {
      const state = pass();
      state.weave = longStory(state.weave);
      const { _arcValidation } = validateArcStructure(state, {});
      expect(_arcValidation.words).toBeGreaterThan(MEETING_WORD_BOUND);
      expect(_arcValidation.failures).toEqual([{ type: 'over-length', message: expect.stringContaining(`past its bound of ${MEETING_WORD_BOUND}`) }]);
    });

    it("never fails a page the director lengthened: their lines are not the writer's to count", () => {
      const state = pass();
      const left = longStory(state.weave);
      const directors = { ...state, weave: left, _weaveHandEdits: standingAtMeeting(null, clone(state.weave), left) };
      const { _arcValidation } = validateArcStructure(directors, {});
      expect(firstLook(directors)).toBeGreaterThan(MEETING_WORD_BOUND);
      expect(_arcValidation.failures).toEqual([]);
      expect(_arcValidation.words).toBeLessThan(MEETING_WORD_BOUND);
    });

    // Fix round 1, finding 2 (R11): a connection's line the director wrote, rewritten or on a
    // connection they added, is theirs. The checks never file a time or a quotation in it as
    // the writer's, so it spends no rework, and the page counts none of its words as the writer's.
    it("never fails a connection's line the director wrote, and counts none of its words as the writer's", () => {
      const state = pass();
      const left = clone(state.weave);
      left.connections[0] = { ...left.connections[0], line: 'Morgan steered the deadlock at 9:58.' };
      left.connections.push({ id: 'c3', joins: ['t1', 't2'], line: 'The 9:58 sale, "the rest", came at the bar.', kind: 'moment' });
      const directors = { ...state, weave: left, _weaveHandEdits: standingAtMeeting(null, clone(state.weave), left) };
      const { _arcValidation, validationResults } = validateArcStructure(directors, {});
      expect(_arcValidation.failures).toEqual([]);
      expect(validationResults).toMatchObject({ passed: true, structuralIssues: [] });
      const writersPage = { ...state, weave: { ...clone(state.weave), connections: state.weave.connections.map((c, i) => (i === 0 ? { ...c, line: '' } : c)) } };
      expect(_arcValidation.words).toBe(firstLook(writersPage));
    });
  });
});

describe('the fact check scores the truth criteria only, for the weave', () => {
  it('its criteria are the truth groups the weave can breach, each structural', () => {
    for (const theme of ['journalist', 'detective']) {
      const criteria = getPhaseCriteria('arcs', theme);
      expect(Object.keys(criteria)).toEqual(['evidenceTruth', 'moneyTruth', 'verdictTruth', 'stagesTruth', 'novaPositionTruth', 'playersTruth', 'wordsTruth']);
      Object.values(criteria).forEach((c) => expect(c).toMatchObject({ type: 'structural', truth: true }));
    }
  });

  // Brief 4.5 (T1): the evidence, the money and the pronouns read the director's answers
  // at the story meeting, as record.
  it('each truth question is worded for the weave, pinned', () => {
    const descriptions = Object.fromEntries(Object.entries(getPhaseCriteria('arcs', 'journalist')).map(([key, c]) => [key, c.description]));
    expect(descriptions).toEqual({
      evidenceTruth: "Is every claim in the weave written as its evidence allows, the director's answers at the story meeting included as record, as the notes are (T1), with no buried memory's content or owner stated as fact (T3); with a person tied to an account as fact only where the director saw the sale or it was made openly in front of the room, and an account's name never a reason to suspect its namesake (T4); and with no exposer named that neither the evidence log nor the director's notes name (T6)?",
      moneyTruth: "Does the money in the weave run from the buyer to the seller's chosen account, with NeurAI and its board written as Nova's suspicion of who the buyer is and never as fact, and the ledger's money taken as the morning's payments for erasure (T5)? Each figure is as its source gives it: each sale, the first-burial bonus and each transfer as the ledger gives it; a balance the director's notes record as said or shown in the room as that moment's figure; and a ledger line the director's answer at the story meeting explains as that answer gives it (T1).",
      verdictTruth: "Is the verdict in the weave told as the room's official story, ungraded against any hidden answer (T2)? The theories the room debated are the map's to place, so the weave keeps T2 whether it names them or not.",
      stagesTruth: "In the weave, is the party met only through memories, the investigation told as the reporting mode allows, Nova's day taken from the epilogue alone, and every logged time on the morning clock (T7)? What Nova says NovaNews is still chasing is Nova's own intent and needs no epilogue.",
      novaPositionTruth: "In the weave, is Nova the uninterested third party, reporting on the room from outside its choices: Nova never votes, joins the room's accusation or exposes a memory, and witnesses only what this session's mode block allows (T8)?",
      playersTruth: "Does every player in the weave take the pronoun the roster gives, or, where the roster gives none, the pronoun the director's answer at the story meeting gives (T9), and does the judgement in the weave land on the characters' choices, with no player's looks described (T11)?",
      wordsTruth: "Is every quoted line in the weave word for word from the record or the director's notes, and in its real speaker's mouth (T12)?"
    });
  });

  it('its system prompt: the identity, the mode block, the world and the truth rules, the truth criteria and the truth-only scoring rules; no weighted criteria, no craft findings', () => {
    const state = weaveState();
    const system = buildEvaluationSystemPrompt('arcs', getPhaseCriteria('arcs', 'journalist'), 'journalist', { sessionConfig: state.sessionConfig });
    expect(system.split('\n')[0]).toMatch(/WEAVE fact check/);
    expect(system).toContain(loadModeBlock('remote'));
    expect(count(system, loadRuleSet('judge-arc').core)).toBe(1);
    expect(system).toContain('TRUTH RULES (MUST PASS');
    expect(system).toContain(TRUTH_ONLY_EVALUATION_RULES);
    expect(TRUTH_ONLY_EVALUATION_RULES).toMatch(/overallScore is the lowest/);
    expect(TRUTH_ONLY_EVALUATION_RULES).not.toMatch(/weighted average/);
    ['STRUCTURAL CRITERIA', 'ADVISORY CRITERIA', 'CRAFT FINDINGS', 'rosterCoverage', 'characterPlacements', 'KNOWN NPCs', 'arcSource', 'evidenceIdValidity']
      .forEach((gone) => expect(`${gone}: ${system.includes(gone)}`).toBe(`${gone}: false`));
    // Phase 4b (brief 1B; spec 6.2): a breach names the line it is in and the piece of evidence at fault.
    expect(system).toMatch(/names the thread or connection it is in/);
    expect(system).toMatch(/where a piece of evidence is at fault, the piece by its sources/);
  });

  it('reads no craft file: RULE_SET_CALLS[\'judge-arc\'] is the core alone', () => {
    expect(RULE_SET_CALLS['judge-arc']).toEqual([]);
    expect(loadRuleSet('judge-arc').craft).toBe('');
    const prompt = buildEvaluationUserPrompt('arcs', weaveState());
    expect(prompt).not.toContain('<craft-');
  });

  it('its user prompt prints the weave without the mark, then the verdict, the roster, the notes and the record', () => {
    const state = weaveState();
    state.weave = withFactCheckMark(state.weave, { at: 't', ready: true, fixes: 0 });
    const prompt = buildEvaluationUserPrompt('arcs', state);
    expect(prompt).toContain(JSON.stringify(reworkFixtureState('journalist').weave, null, 2));
    expect(prompt).not.toContain('_factCheck');
    expect(prompt).toContain('<DIRECTOR_ACCUSATION>');
    expect(prompt).toContain('CANONICAL CHARACTER ROSTER:');
    expect(prompt).toContain('<DIRECTOR_NOTES>');
    expect(prompt).toContain(arcNodes.ARC_NOTES_LABEL);
    expect(prompt.match(/^<RECORD>$/gm)).toHaveLength(1);
    expect(prompt).not.toContain('ALL VALID EVIDENCE IDS');
  });

  // Phase 4b (brief 1B; spec 6.2): the fact check reads each line against its evidence, and each
  // piece against the record; the weave it prints carries the evidence under each line.
  it('its user prompt opens by naming the evidence under each line, and prints it with the weave', () => {
    const prompt = buildEvaluationUserPrompt('arcs', weaveState());
    expect(prompt.split('\n')[0]).toBe("Check this weave against the record and the director's words. Each thread and each connection carries its evidence: the pieces of the record it rests on, each with its sources, what it shows, and whether it supports the line or cuts against it. Read each line against its evidence, and each piece against the record.");
    const weave = prompt.slice(prompt.indexOf('WEAVE:'), prompt.indexOf('THE ACCUSATION'));
    expect(weave).toContain('"evidence": [');
    expect(weave).toContain('"shows": "Marcus on the sale: \\"Worth it. Finally worth it.\\""');
  });

  it('judges an unjudged weave once and marks it', async () => {
    const state = weaveState();
    const sdk = recordingSdk(BREACH);
    const update = await evaluateArcs(state, { configurable: { sdkClient: sdk } });
    expect(sdk.calls).toHaveLength(1);
    expect(update.weave._factCheck).toMatchObject({ ready: false, fixes: 0 });
    expect(typeof update.weave._factCheck.at).toBe('string');
    expect(update.evaluationHistory).toMatchObject({ phase: 'arcs', ready: false });
    expect(update.validationResults).toMatchObject({ phase: 'arcs', passed: false, weaveKey: weaveKey(state.weave) });
    expect(update.validationResults.structuralIssues[0]).toMatch(/thread t2/);
  });

  it('skips a marked weave: no call, no history entry', async () => {
    const state = weaveState();
    state.weave = withFactCheckMark(state.weave, { at: 't', ready: false, fixes: 1 });
    const sdk = recordingSdk(CLEAN);
    const update = await evaluateArcs(state, { configurable: { sdkClient: sdk } });
    expect(sdk.calls).toHaveLength(0);
    expect(update.evaluationHistory).toBeUndefined();
    expect(update.currentPhase).toBe(PHASES.ARC_EVALUATION);
  });

  it('a clean weave is marked ready', async () => {
    const update = await evaluateArcs(weaveState(), { configurable: { sdkClient: recordingSdk(CLEAN) } });
    expect(update.weave._factCheck).toMatchObject({ ready: true, fixes: 0 });
    expect(update.evaluationHistory.ready).toBe(true);
  });
});

// Fix round 1: the fact check's truth criteria are the whole evaluation, and no notes on
// the writing reach the meeting (spec 4.5). So its output contract offers no criterion
// type and no suggestions: advisoryWarnings holds only a concern about one of the
// director's edits, the channel the fact check after a director's round needs (4.5). Code
// holds the verdict to that contract, so a judge that writes outside it changes neither
// what the meeting shows nor what the fix reads.
//
// Brief 4.7c: both judges are truth-only since 4.7a, so the truth-only contract is the
// judges' one contract. The weighted schema, the weighted OUTPUT FORMAT and the isTruthOnly
// seam that chose between them went, with the tests that compared the two contracts.
describe('the fact check writes to the truth-only contract (fix round 1)', () => {
  const { truthOnlyOutputFormat, TRUTH_ONLY_ADVISORY_WARNINGS, TRUTH_ONLY_EVALUATION_JSON_SCHEMA } = evalTesting;
  const NOTES = 'the breach: the text at fault, the thread or connection it is in, the piece of evidence where one is at fault, and the record it contradicts';
  const systemFor = (phase, theme = 'journalist') => buildEvaluationSystemPrompt(
    phase, getPhaseCriteria(phase, theme), theme, { sessionConfig: weaveState().sessionConfig }
  );
  const formatOf = (system) => system.slice(system.indexOf('OUTPUT FORMAT (JSON):'));

  it("its OUTPUT FORMAT offers no criterion type, and keeps advisoryWarnings for a concern about one of the director's edits", () => {
    const format = formatOf(systemFor('arcs'));
    expect(format).toBe(truthOnlyOutputFormat(NOTES));
    expect(TRUTH_ONLY_ADVISORY_WARNINGS).toBe("only a concern about one of the director's edits; empty when there is none");
    expect(format).toContain(`  "advisoryWarnings": [ "${TRUTH_ONLY_ADVISORY_WARNINGS}" ],`);
    expect(format).not.toContain('"type"');
    expect(format).not.toMatch(/suggestion|blocker/i);
  });

  it('both judges score the truth criteria alone; the journalist judges carry the truth-only OUTPUT FORMAT, and the parked detective has no judge prompt', () => {
    // Phase 4 (brief 4.6): the outline judge left the graph. Brief 4.13 (R14; R1): a judge's
    // prompt is its theme's, so only a theme with its own rules has one; the parked
    // detective names none.
    for (const theme of ['journalist', 'detective']) {
      for (const phase of ['arcs', 'article']) {
        expect([theme, phase, Object.values(getPhaseCriteria(phase, theme)).every((criterion) => criterion.truth === true)]).toEqual([theme, phase, true]);
        if (theme === 'detective') {
          expect(() => systemFor(phase, theme)).toThrow(/"detective" names no rules folder/);
          continue;
        }
        const format = formatOf(systemFor(phase, theme));
        expect([theme, phase, format.includes(TRUTH_ONLY_ADVISORY_WARNINGS), format.includes('"type"')]).toEqual([theme, phase, true, false]);
      }
    }
  });

  // Brief 4.7c: the weighted contract went (the schema with a criterion type, the OUTPUT
  // FORMAT with a type line and "suggestions, not blockers", and isTruthOnly).
  it('the weighted contract went: no weighted schema, no weighted OUTPUT FORMAT, no seam to choose between them', () => {
    ['EVALUATION_JSON_SCHEMA', 'outputFormat', 'isTruthOnly'].forEach((name) => expect(`${name}: ${name in evalTesting}`).toBe(`${name}: false`));
    for (const phase of ['arcs', 'article']) {
      const system = systemFor(phase);
      expect([phase, /structural or advisory|suggestions, not blockers|"structural" \| "advisory"/.test(system)]).toEqual([phase, false]);
    }
  });

  // Phase 4 (brief 4.6): the article judge, since the outline judge left the graph. Brief
  // 4.7a: the article judge is truth-only too, and is sent the same schema. Brief 4.7c: the
  // schema is pinned whole, as 4.4's fix round built it.
  it('the fact check and the article judge are sent the truth-only schema, pinned whole', async () => {
    const sdk = recordingSdk(CLEAN);
    await evaluateArcs(weaveState(), { configurable: { sdkClient: sdk } });
    const schema = sdk.calls[0].jsonSchema;
    expect(schema).toBe(TRUTH_ONLY_EVALUATION_JSON_SCHEMA);
    expect(schema).toEqual({
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
        structuralIssues: { type: 'array', items: { type: 'string' }, description: 'Issues that MUST be fixed, one self-contained sentence each' },
        advisoryWarnings: { type: 'array', items: { type: 'string' }, description: TRUTH_ONLY_ADVISORY_WARNINGS },
        revisionGuidance: { type: 'string', description: 'One step per structural issue, each the fix for that issue; empty when there is none' },
        confidence: { type: 'string' }
      },
      required: ['ready', 'overallScore', 'structuralPassed']
    });

    const article = recordingSdk({ ...CLEAN, overallScore: 0.9 });
    // At the cap the article judge runs whatever the fact check found.
    await evaluateArticle(weaveState({ contentBundle: {}, articleApproved: false, evaluationHistory: [], articleRevisionCount: REVISION_CAPS.ARTICLE }), { configurable: { sdkClient: article } });
    expect(article.calls[0].jsonSchema).toBe(TRUTH_ONLY_EVALUATION_JSON_SCHEMA);
  });

  it("a note on the writing reaches neither the meeting nor the fix, and a breach's fix stays a fix", async () => {
    const verdict = {
      ...clone(BREACH),
      criteriaScores: {
        ...clone(BREACH.criteriaScores),
        // A truth criterion the judge typed as advisory, and a criterion it was not given.
        wordsTruth: { score: 0.5, type: 'advisory', notes: 'Thread t1 quotes words the notes do not hold.', fix: 'Quote the notes word for word.' },
        pacing: { score: 0.3, type: 'advisory', notes: 'The story starts slowly.', fix: 'Tighten the story.' }
      },
      advisoryWarnings: ['C10: the working headline could be sharper.']
    };
    const state = weaveState();
    const update = await evaluateArcs(state, { configurable: { sdkClient: recordingSdk(verdict) } });
    expect(update.evaluationHistory.advisoryWarnings).toEqual([]);
    expect(update.validationResults.advisoryWarnings).toEqual([]);
    expect(update.validationResults.criteriaScores).toEqual({
      evidenceTruth: BREACH.criteriaScores.evidenceTruth,
      wordsTruth: { ...verdict.criteriaScores.wordsTruth, type: 'structural' }
    });

    // The fix reads the breaches and the fixes alone.
    const sdk = recordingSdk(reworkFixtureState('journalist').weave);
    await reviseArcs({ ...state, weave: update.weave, validationResults: update.validationResults, arcRevisionCount: 1 }, { configurable: { sdkClient: sdk } });
    const { prompt } = sdk.calls[0];
    expect(prompt).toContain('  - wordsTruth: 0.50 [structural]\n      notes: Thread t1 quotes words the notes do not hold.\n      fix: Quote the notes word for word.');
    expect(prompt).toContain('This rework fixes the must-fix items: the ISSUES TO ADDRESS and the fixes in CRITERIA SCORES. Everything else in the previous weave stays word for word.');
    expect(prompt).not.toContain('SHOULD CONSIDER');
    expect(prompt).not.toMatch(/^ {6}suggestion:/m);
    ['pacing', 'Tighten the story.', 'the working headline could be sharper'].forEach((note) => expect(prompt).not.toContain(note));
  });

  it("a concern about one of the director's edits is kept for the meeting and never reaches the fix", async () => {
    // The channel the fact check after a director's round writes to (4.5), under the
    // prefix the guard and the stop read.
    const concern = `${DIRECTOR_EDIT_PREFIX}E1: T1: the story's first sentence says more than the ledger shows.`;
    const update = await evaluateArcs(weaveState(), {
      configurable: { sdkClient: recordingSdk({ ...CLEAN, advisoryWarnings: [concern, 'C4: the convergence could land later.'] }) }
    });
    expect(update.evaluationHistory.advisoryWarnings).toEqual([concern]);
    expect(update.validationResults.advisoryWarnings).toEqual([]);
  });
});

describe('the automatic passes run through reviseArcs with the weave\'s schema', () => {
  const failingCheck = (state) => validateArcStructure({
    ...state,
    weave: {
      ...clone(state.weave),
      threads: state.weave.threads.map((t) => (t.id === 't2' ? { ...t, evidence: [{ sources: ['zzz999'], shows: 'A document no record holds.', stance: 'supports' }] } : t))
    }
  }, {}).validationResults;

  it("a check rework reads the check's lines under their own label, and keeps everything its findings do not name word for word (R23)", async () => {
    const state = weaveState({ arcRevisionCount: 1 });
    state.validationResults = failingCheck(state);
    const sdk = recordingSdk(state.weave);
    await reviseArcs(state, { configurable: { sdkClient: sdk } });
    const { prompt, systemPrompt, jsonSchema, label } = sdk.calls[0];
    expect(jsonSchema).toBe(WEAVE_SCHEMA);
    expect(label).toBe('Arc revision 1');
    expect(prompt.startsWith(buildWeaveSections(state))).toBe(true);
    expect(prompt).toMatch(/WEAVE CHECK FAILURES:\n {2}- [^\n]*"zzz999"/);
    expect(prompt).not.toContain('ISSUES TO ADDRESS:');
    expect(prompt).toContain('This rework fixes the must-fix items: the WEAVE CHECK FAILURES.');
    expect(prompt).toContain('Everything else in the previous weave stays word for word.');
    expect(prompt).toContain('PREVIOUS WEAVE OUTPUT (the version this rework starts from):');
    // The rework's own text: the craft files state their own rules.
    expect(prompt.replace(loadRuleSet('arc').craft, '')).not.toMatch(/interweav|WHAT THIS REWORK RETURNS|narrativeArcs/i);
    expect(systemPrompt).toBe(getArcRevisionSystemPrompt(null, state.sessionConfig, 'journalist'));
    expect(systemPrompt).toMatch(/reworking the weave you wrote after an automatic check or fact check/);
  });

  it('an automatic pass keeps the untouched text: a question the rework dropped comes back, in its place', async () => {
    const state = weaveState({ arcRevisionCount: 1 });
    state.validationResults = failingCheck(state);
    const fixed = clone(state.weave);
    fixed.questions = [];
    const update = await reviseArcs(state, { configurable: { sdkClient: recordingSdk(fixed) } });
    expect(update.weave.questions).toEqual(state.weave.questions);
    expect(update.weave).not.toHaveProperty('_factCheck');
    expect(update._arcFeedback).toBeNull();
  });

  it('the fact check\'s fix keeps the mark, counting the fix', async () => {
    const state = weaveState({ arcRevisionCount: 1 });
    state.weave = withFactCheckMark(state.weave, { at: 't', ready: false, fixes: 0 });
    state.validationResults = { phase: 'arcs', passed: false, structuralIssues: BREACH.structuralIssues, criteriaScores: BREACH.criteriaScores };
    const sdk = recordingSdk(reworkFixtureState('journalist').weave);
    const update = await reviseArcs(state, { configurable: { sdkClient: sdk } });
    expect(update.weave._factCheck).toEqual({ at: 't', ready: false, fixes: 1 });
    expect(sdk.calls[0].prompt).not.toContain('_factCheck');
    expect(sdk.calls[0].prompt).toMatch(/ISSUES TO ADDRESS:\n {2}- T3:/);
  });

  it("a director's send back clears the mark: the reworked weave is checked and judged again", async () => {
    const state = weaveState({ _meetingRound: 'send-back', _arcFeedback: 'Make the money thread the main thread.', humanArcRevisionCount: 1 });
    state.weave = withFactCheckMark(state.weave, { at: 't', ready: true, fixes: 0 });
    const update = await reviseArcs(state, { configurable: { sdkClient: recordingSdk(reworkFixtureState('journalist').weave) } });
    expect(update.weave).not.toHaveProperty('_factCheck');
  });

  it('a rework that returns no threads keeps the previous weave (it writes none) and ends in an error', async () => {
    const state = weaveState({ arcRevisionCount: 1 });
    const update = await reviseArcs(state, { configurable: { sdkClient: recordingSdk({ story: 'x' }) } });
    expect(update.currentPhase).toBe(PHASES.ERROR);
    expect(update).not.toHaveProperty('weave');
    expect(update.errors[0].message).toMatch(/no threads/);
  });
});

describe('the timeout bookkeeping has a channel of its own', () => {
  const timeout = () => { throw new Error('SDK timeout after 900.0s idle (limit: 900s) - Arc revision 1'); };

  // Brief 4.5 (ruling 5): the free retry lowers only the counter its pass raised.
  it('an automatic pass that times out keeps the previous weave, records the timeout in _arcReworkTimeout, and gives back its own count', async () => {
    const state = weaveState({ arcRevisionCount: 1, humanArcRevisionCount: 1 });
    const update = await reviseArcs(state, { configurable: { sdkClient: recordingSdk(timeout) } });
    expect(update).not.toHaveProperty('weave');
    expect(update._arcReworkTimeout).toMatchObject({ consecutive: 1, attempt: 1 });
    expect(update._arcReworkTimeout).not.toHaveProperty('round');
    expect(update.arcRevisionCount).toBe(0);
    expect(update).not.toHaveProperty('humanArcRevisionCount');
    expect(update).not.toHaveProperty('_arcAnalysisCache');
    expect(update.currentPhase).not.toBe(PHASES.ERROR);
  });

  it('counts consecutive timeouts, and the third is an error', async () => {
    const second = await reviseArcs(weaveState({ arcRevisionCount: 1, _arcReworkTimeout: { consecutive: 1, attempt: 1 } }), { configurable: { sdkClient: recordingSdk(timeout) } });
    expect(second._arcReworkTimeout.consecutive).toBe(2);
    const third = await reviseArcs(weaveState({ arcRevisionCount: 1, _arcReworkTimeout: { consecutive: 2, attempt: 1 } }), { configurable: { sdkClient: recordingSdk(timeout) } });
    expect(third.currentPhase).toBe(PHASES.ERROR);
    expect(third._arcReworkTimeout).toBeNull();
  });

  it('a rework that completes clears it', async () => {
    const state = weaveState({ arcRevisionCount: 1, _arcReworkTimeout: { consecutive: 1, attempt: 1 } });
    const update = await reviseArcs(state, { configurable: { sdkClient: recordingSdk(state.weave) } });
    expect(update._arcReworkTimeout).toBeNull();
  });

  it('the state carries the channel, defaulting to null, and the weave beside it', () => {
    const defaults = getDefaultState();
    expect(defaults._arcReworkTimeout).toBeNull();
    expect(defaults.weave).toBeNull();
    expect(defaults).not.toHaveProperty('specialistAnalyses');
  });
});

describe('the routing: one check rework and one fact-check fix per round, counted apart (R6)', () => {
  const failed = (state) => ({ ...state, _arcValidation: { weaveKey: weaveKey(state.weave), passed: false, failures: [{ type: 'x', message: 'y' }] } });
  const judged = (state, mark) => ({ ...state, weave: withFactCheckMark(state.weave, mark) });

  it('the budget is one per round', () => {
    expect(REVISION_CAPS.ARCS).toBe(1);
  });

  it('a failed check on an unjudged weave goes back once; the second failure goes on to the fact check', () => {
    const state = weaveState();
    expect(routeArcValidation(failed({ ...state, arcRevisionCount: 0 }))).toBe('revise');
    expect(routeArcValidation(failed({ ...state, arcRevisionCount: 1 }))).toBe('evaluate');
  });

  it('a passing check, a judged weave and an approved meeting go on to the fact check node', () => {
    const state = weaveState();
    expect(routeArcValidation({ ...state, _arcValidation: { weaveKey: weaveKey(state.weave), passed: true, failures: [] } })).toBe('evaluate');
    expect(routeArcValidation(judged(failed(state), { at: 't', ready: false, fixes: 1 }))).toBe('evaluate');
    expect(routeArcValidation(failed({ ...state, meetingApproved: true }))).toBe('evaluate');
  });

  it('a check result stamped for another weave sends nothing back', () => {
    const state = weaveState();
    expect(routeArcValidation({ ...state, _arcValidation: { weaveKey: 'other', passed: false, failures: [] } })).toBe('evaluate');
  });

  it('a failed rework ends the run in an error', () => {
    expect(routeArcValidation({ ...failed(weaveState()), currentPhase: PHASES.ERROR })).toBe('error');
  });

  it('a breach the fact check found gets its one fix; after it, the stop opens', () => {
    const state = weaveState();
    expect(routeArcEvaluation(judged(state, { at: 't', ready: false, fixes: 0 }))).toBe('revise');
    expect(routeArcEvaluation(judged(state, { at: 't', ready: false, fixes: 1 }))).toBe('checkpoint');
    expect(routeArcEvaluation(judged(state, { at: 't', ready: true, fixes: 0 }))).toBe('checkpoint');
    expect(routeArcEvaluation({ ...state, meetingApproved: true, evaluationHistory: [{ phase: 'arcs', ready: true }] })).toBe('checkpoint');
    expect(routeArcEvaluation({ ...state, currentPhase: PHASES.ERROR })).toBe('error');
  });

  it('an automatic pass counts toward the round; a send back opens a new round; neither writes a history stub', async () => {
    const automatic = await incrementArcRevision({ ...weaveState(), arcRevisionCount: 0 });
    expect(automatic).toMatchObject({ arcRevisionCount: 1, humanArcRevisionCount: 0 });
    const round = await incrementArcRevision({ ...weaveState(), arcRevisionCount: 1, humanArcRevisionCount: 0, _meetingRound: 'send-back', _arcFeedback: 'x' });
    expect(round).toMatchObject({ arcRevisionCount: 0, humanArcRevisionCount: 1 });
    [automatic, round].forEach((update) => {
      expect(update).not.toHaveProperty('evaluationHistory');
      expect(update).not.toHaveProperty('narrativeArcs');
      expect(update).not.toHaveProperty('_previousArcs');
    });
  });
});

describe('the interweaving call is gone', () => {
  it('no INTERWEAVING_* constant, no old arc schema and no detective arc copy is exported', () => {
    Object.keys(subagents).forEach((name) => expect(name).not.toMatch(/INTERWEAVING|CORE_ARC|PLAYER_FOCUS|DETECTIVE/));
  });

  it('the arc nodes build no interweaving prompt and make no interweaving call', () => {
    ['enrichWithInterweaving', 'mergeArcsWithInterweaving', 'buildInterweavingPrompt', 'interweavingSystemPrompt', 'createDefaultInterweaving', 'createDefaultInterweavingPlan']
      .forEach((name) => expect(`${name}: ${typeof arcNodes._testing[name]}`).toBe(`${name}: undefined`));
  });

  it('the rule set has no interweaving call', () => {
    expect(Object.keys(RULE_SET_CALLS)).not.toContain('interweaving');
    expect(() => loadRuleSet('interweaving')).toThrow(/Unknown call/);
  });

  // Phase 4 (brief 4.6): it went with the outline judge, its last reader.
  it('hasInterweavingPlan went with the outline judge', () => {
    expect(arcNodes.hasInterweavingPlan).toBeUndefined();
  });
});

describe('the arc rework\'s prompt', () => {
  it('opens on its writer\'s sections and ends with its task, then the standing notes', () => {
    const state = weaveState({ directorGateNotes: [{ gate: 'arc-selection', kind: 'rejection', round: 1, text: 'Lead with the vote.', at: 't' }] });
    const { contextSection, previousOutputSection } = buildRevisionContext({
      phase: 'arcs', outputName: 'weave', revisionCount: 1, validationResults: null, previousOutput: state.weave, humanFeedback: null
    });
    const prompt = buildArcRevisionPrompt(state, contextSection, previousOutputSection);
    expect(prompt.startsWith(buildWeaveSections(state))).toBe(true);
    const task = prompt.slice(prompt.indexOf('## YOUR TASK'), prompt.indexOf('<DIRECTOR_GUIDANCE>'));
    expect(task).toMatch(/Rework the PREVIOUS WEAVE OUTPUT as the revision context above directs/);
    expect(prompt.trimEnd().endsWith('</DIRECTOR_GUIDANCE>')).toBe(true);
    expect(STRUCTURAL_PASS_SCORE).toBe(0.8);
  });

  it('the bound reaches the rework through the writer\'s task', () => {
    const state = weaveState();
    const prompt = buildArcRevisionPrompt(state, '', '');
    // Phase 4b (brief 1B; R5): the meeting's page, at most 300 words.
    expect(prompt).toContain(`comes to at most ${MEETING_WORD_BOUND} words`);
    expect(MEETING_WORD_BOUND).toBe(300);
  });
});

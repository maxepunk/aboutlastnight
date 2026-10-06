/**
 * The story meeting at the arc stage's nodes (phase 4, brief 4.5; spec 4.4, 4.5 and
 * section 7; R11; the integrator's rulings 1, 2, 5, 6 and 8).
 *
 * - The director's round, marked explicitly: a reweave fits the director's changes in and
 *   keeps every line they did not touch, and code holds it to their edits as it holds an
 *   automatic pass (a line put back, a struck connection struck again); a send-back
 *   rethinks the weave as the note asks, and may change an edit, saying why. Neither reads
 *   a finding from before the round, and both open a round the fact check judges again.
 * - The answers stay with their questions through every rework.
 * - The checks read only the writer's text; the fact check after a round reads the
 *   director's edits and their answers, and a finding in the director's text is a concern.
 * - A round that times out keeps the director's version, and the free retry gives back
 *   only the count its pass raised.
 * - A truth-only judge's readiness is no structural issue left and no truth criterion
 *   holding, whatever its own structuralPassed (ruling 8).
 *
 * Every model call is a recording stand-in. Invented text: the repo is public.
 */

const arcNodes = require('../workflow/nodes/arc-specialist-nodes');
const { analyzeArcsPlayerFocusGuided, reviseArcs, validateArcStructure } = arcNodes;
const { getArcRevisionSystemPrompt, arcRevisionRules } = arcNodes._testing;
const { evaluateArcs, _testing: evalTesting } = require('../workflow/nodes/evaluator-nodes');
const { truthOnlyVerdict, guardDirectorEdits, getPhaseCriteria, buildEvaluationUserPrompt, judgedEdits, TRUTH_MATERIAL } = evalTesting;
const { _testing: graphTesting } = require('../workflow/graph');
const { incrementArcRevision, routeArcEvaluation } = graphTesting;
const { WEAVE_SCHEMA } = require('../sdk-client/subagents');
const { WEAVE: FIXTURE_WEAVE, reworkFixtureState } = require('./fixtures/rework-state');
const { weaveForPrompt, withFactCheckMark } = require('../weave');
const { DIRECTOR_EDIT_PREFIX, CHANGED_EDITS_KEY, carriedEdits, weaveDirectorsShare } = require('../hand-edit-diff');
const { meetingResume } = require('../meeting');
const { settledWeaveOf } = require('../prompt-renderers/settled-weave');

const clone = (v) => JSON.parse(JSON.stringify(v));

/** A model stand-in that records each call and answers with `answer(options)`. */
function recordingSdk(answer) {
  const calls = [];
  const sdk = async (options) => { calls.push(options); return clone(typeof answer === 'function' ? answer(options) : answer); };
  sdk.calls = calls;
  return sdk;
}
const cfg = (sdk) => ({ configurable: { sdkClient: sdk, theme: 'journalist' } });

const STORY = "Riley kept the books, and the room never asked who paid for the silence.";
const ANSWER = 'Sarah ran the bar all morning.';
const STALE = 'T3: "a stale finding from before the round" breaks a rule.';

/** The meeting's stop: the writer's weave, judged, with a stale finding in the channel. */
function atMeeting(overrides = {}) {
  return {
    ...reworkFixtureState('journalist'),
    meetingApproved: false,  // brief 4.6: the fixture is past the meeting; this is the meeting
    weave: withFactCheckMark(clone(FIXTURE_WEAVE), { at: 't0', ready: true, fixes: 0 }),
    _weaveBaseline: clone(FIXTURE_WEAVE),
    validationResults: { phase: 'arcs', passed: false, structuralIssues: [STALE], criteriaScores: { evidenceTruth: { score: 0.4, notes: 'stale', fix: 'stale' } } },
    humanArcRevisionCount: 0,
    arcRevisionCount: 1,
    ...overrides
  };
}

/** The director's version: the story rewritten, t3 re-roled, a thread added with no evidence (phase 4b, brief 1B), c2 struck, q1 answered. */
function leftByDirector() {
  const weave = clone(FIXTURE_WEAVE);
  weave.story = STORY;
  weave.threads = weave.threads.map((t) => (t.id === 't3' ? { ...t, role: 'mirrors-it' } : t));
  weave.threads.push({ id: 't6', name: 'The second ledger', line: 'Riley kept a second ledger.', role: 'grounds-it' });
  weave.connections = weave.connections.map((c) => (c.id === 'c2' ? { ...c, struck: true } : c));
  weave.questions = weave.questions.map((q) => ({ ...q, answer: ANSWER }));
  return weave;
}

/** The state a director's round reaches the rework with: the payload's update, then the increment. */
async function roundState(round, note = null, left = leftByDirector()) {
  const approvals = { meeting: round, weave: left, ...(note && { note }) };
  const { stateUpdates, error } = meetingResume(approvals, atMeeting());
  expect(error).toBeNull();
  const state = { ...atMeeting(), ...stateUpdates, _meetingRound: round };
  return { ...state, ...(await incrementArcRevision(state)) };
}

/** What a rework returns: the director's version as the rework saw it (no struck connection), changed by `change`. */
function reworkOf(change) {
  const weave = weaveForPrompt(leftByDirector());
  weave.connections = weave.connections.filter((c) => c.id !== 'c2');
  change(weave);
  return weave;
}

const previousOf = (prompt) => prompt.slice(prompt.indexOf('PREVIOUS WEAVE OUTPUT'), prompt.indexOf('END PREVIOUS OUTPUT'));

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

describe('the arc writer keeps its weave as the baseline', () => {
  it("writes the writer's weave beside the weave, as the meeting's diffs start from it", async () => {
    const update = await analyzeArcsPlayerFocusGuided({ ...atMeeting(), weave: null }, cfg(recordingSdk(FIXTURE_WEAVE)));
    expect(update._weaveBaseline).toEqual(update.weave);
  });
});

describe('a reweave (brief 4.5)', () => {
  it("with no note: the reweave's own rules and scope, the director's changes listed, no finding from before the round", async () => {
    const state = await roundState('reweave');
    const sdk = recordingSdk(reworkOf(() => {}));
    await reviseArcs(state, cfg(sdk));
    const { prompt, systemPrompt, jsonSchema } = sdk.calls[0];
    expect(systemPrompt).toBe(getArcRevisionSystemPrompt('reweave', state.sessionConfig, 'journalist'));
    expect(systemPrompt.endsWith(arcRevisionRules('reweave', 'journalist'))).toBe(true);
    expect(jsonSchema).toBe(WEAVE_SCHEMA);
    expect(prompt).toContain("REVISION CONTEXT: WEAVE (round 2: the director's reweave)");
    expect(prompt).toContain("This rework fits the director's changes into the weave: each change in <HAND_EDITS>.");
    expect(prompt).toContain('E2 (thread "t3", role): "mirrors-it"');
    expect(prompt).not.toContain('a stale finding');
    expect(prompt).not.toContain('HUMAN FEEDBACK');
    // The rework reads the weave without the struck connection, the answers in it.
    expect(previousOf(prompt)).not.toContain('"c2"');
    expect(previousOf(prompt)).toContain(ANSWER);
  });

  it("keeps the director's lines: a paraphrased line is put back, the answers stay, and the writer's own change stands", async () => {
    const state = await roundState('reweave');
    const rework = reworkOf((weave) => {
      weave.story = 'A paraphrase of the story the director wrote.';
      weave.headline = 'A headline the reweave wrote.';
      weave.questions = [];
    });
    const update = await reviseArcs(state, cfg(recordingSdk(rework)));
    expect(update.weave.story).toBe(STORY);
    expect(update.weave.headline).toBe('A headline the reweave wrote.');
    expect(update.weave.questions).toEqual(leftByDirector().questions);
    expect(update.weave.connections).toEqual(leftByDirector().connections);
    expect(update._weaveHandEditReport.changed.map((c) => [c.id, c.restored, c.automatic, c.pass])).toEqual([['E1', true, false, 'reweave']]);
  });

  it('strikes again, by id, a connection the reweave brought back, and records it', async () => {
    const state = await roundState('reweave');
    const rework = reworkOf((weave) => { weave.connections.push({ ...clone(FIXTURE_WEAVE.connections[1]) }); });
    const update = await reviseArcs(state, cfg(recordingSdk(rework)));
    expect(update.weave.connections.find((c) => c.id === 'c2')).toEqual(leftByDirector().connections[1]);
    expect(update._weaveHandEditReport.changed).toEqual([expect.objectContaining({ id: 'E4', struck: true, restored: true, where: 'connection "c2", struck' })]);
  });

  it("opens a new round: the weave goes to the fact check again, the baseline is the writer's last weave, and the marks are read from the director's version", async () => {
    const state = await roundState('reweave');
    const update = await reviseArcs(state, cfg(recordingSdk(reworkOf((weave) => { weave.headline = 'A new headline.'; }))));
    expect(update.weave).not.toHaveProperty('_factCheck');
    expect(update._weaveBaseline).toEqual(weaveForPrompt(update.weave));
    expect(update._weaveMarks).toMatchObject({ round: 'reweave', from: weaveForPrompt(leftByDirector()) });
    expect(update).toMatchObject({ _meetingRound: null, _arcFeedback: null, _arcReworkTimeout: null });
  });

  it("a note on a reweave is part of what it fits in, and the standing notes leave it out of their list", async () => {
    const state = await roundState('reweave', 'Join the ledger thread to the vote.');
    state.directorGateNotes = [{ gate: 'arc-selection', kind: 'rejection', round: 1, text: 'Join the ledger thread to the vote.', at: 't' }];
    const sdk = recordingSdk(reworkOf(() => {}));
    await reviseArcs(state, cfg(sdk));
    expect(sdk.calls[0].prompt).toContain('HUMAN FEEDBACK (HIGHEST PRIORITY):\nJoin the ledger thread to the vote.');
    expect(sdk.calls[0].prompt).toContain('each change the note above asks for');
    expect(sdk.calls[0].prompt).not.toContain('<DIRECTOR_GUIDANCE>');
  });
});

// Fix round 1, finding 1: the natural flow "add a thread, reweave to see it fitted, adjust
// it". After the first reweave the baseline holds the director's thread, so their change to
// part of it stays part of the one edit that holds the whole thread: a second reweave is
// held to all of it, and the checks still read it as the director's.
describe('a thread the director added, changed after a reweave kept it (fix round 1)', () => {
  /** What a rework sees and returns: the version the director left, without the connections they struck. */
  const asSeen = (left) => ({ ...weaveForPrompt(clone(left)), connections: left.connections.filter((c) => !c.struck) });

  /** A reweave through the meeting's payload, the increment and the rework, then judged clean by the fact check. */
  async function reweaveRound(state, left, rework) {
    const { stateUpdates, error } = meetingResume({ meeting: 'reweave', weave: left }, state);
    expect(error).toBeNull();
    const marked = { ...state, ...stateUpdates };
    const round = { ...marked, ...(await incrementArcRevision(marked)) };
    const after = { ...round, ...(await reviseArcs(round, cfg(recordingSdk(rework(left))))) };
    return { ...after, weave: withFactCheckMark(after.weave, { at: 't', ready: true, fixes: 0 }) };
  }

  it.each([
    ['its role', (t) => ({ ...t, role: 'mirrors-it' })],
    ['its line', (t) => ({ ...t, line: 'Riley kept a second ledger, and hid it.' })]
  ])('add, reweave, change %s, reweave with a paraphrase: the thread is put back whole, still marked added, and no check fails on it', async (_name, change) => {
    const first = await reweaveRound(atMeeting(), leftByDirector(), asSeen);
    expect(first.weave.threads.find((t) => t.id === 't6')).toEqual(leftByDirector().threads.find((t) => t.id === 't6'));

    const left = weaveForPrompt(clone(first.weave));
    left.threads = left.threads.map((t) => (t.id === 't6' ? change(t) : t));
    const paraphrase = (seen) => {
      const weave = asSeen(seen);
      weave.threads = weave.threads.map((t) => (t.id === 't6' ? { ...t, line: 'Riley may have kept another ledger.' } : t));
      return weave;
    };
    const second = await reweaveRound(first, left, paraphrase);

    expect(second.weave.threads.find((t) => t.id === 't6')).toEqual(left.threads.find((t) => t.id === 't6'));
    expect(second._weaveHandEditReport.changed).toEqual([expect.objectContaining({ where: 'thread "t6", added', restored: true, pass: 'reweave' })]);
    const share = weaveDirectorsShare(carriedEdits(second._weaveHandEdits, weaveForPrompt(second.weave)));
    expect(Object.keys(share.addedThreads)).toEqual(['t6']);
    expect(validateArcStructure(second, {})._arcValidation.failures).toEqual([]);
    // Brief 4.14a: the settled weave names a meeting change in the meeting's own form, M and its number.
    expect(settledWeaveOf(second)).toMatch(/- t6 \([^)]*\) The second ledger: .*\[the director's change M\d+: a thread they added\]/);
  });
});

describe('a send-back (brief 4.5; TH7)', () => {
  it('rethinks the weave as the note asks: its rules, its scope, and the schema that asks which edits it changed', async () => {
    const state = await roundState('send-back', 'Rethink the money thread.');
    const sdk = recordingSdk({ ...reworkOf(() => {}), [CHANGED_EDITS_KEY]: [] });
    await reviseArcs(state, cfg(sdk));
    const { prompt, systemPrompt, jsonSchema } = sdk.calls[0];
    expect(systemPrompt).toBe(getArcRevisionSystemPrompt('send-back', state.sessionConfig, 'journalist'));
    expect(prompt).toContain("REVISION CONTEXT: WEAVE (round 2: the director's send back)");
    expect(prompt).toContain("The director's note above is the task");
    expect(prompt).not.toContain('a stale finding');
    expect(jsonSchema.properties).toHaveProperty(CHANGED_EDITS_KEY);
    expect(jsonSchema.required).toContain(CHANGED_EDITS_KEY);
  });

  it("may change one of the director's edits, with its reason, which the report keeps; the list is not stored", async () => {
    const state = await roundState('send-back', 'Rethink the money thread.');
    const rework = { ...reworkOf((weave) => { weave.story = 'A new story the note asked for.'; }), [CHANGED_EDITS_KEY]: [{ id: 'E1', reason: 'The note asked for a story about the money.' }] };
    const update = await reviseArcs(state, cfg(recordingSdk(rework)));
    expect(update.weave.story).toBe('A new story the note asked for.');
    expect(update.weave).not.toHaveProperty(CHANGED_EDITS_KEY);
    expect(update._weaveHandEditReport.changed.find((c) => c.id === 'E1')).toMatchObject({ reason: 'The note asked for a story about the money.', restored: false, automatic: false, pass: 'send-back' });
    expect(update._weaveMarks).toMatchObject({ round: 'send-back' });
  });

  it("keeps every answered question whole when the rework returns no questions at all", async () => {
    const state = await roundState('send-back', 'Rethink it.');
    const rework = reworkOf((weave) => { delete weave.questions; });
    const update = await reviseArcs(state, cfg(recordingSdk(rework)));
    expect(update.weave.questions).toEqual(leftByDirector().questions);
  });
});

describe('an automatic pass after a round is held to the edits (R11)', () => {
  it("puts back the director's line the fix changed, and reports it as automatic", async () => {
    const state = await roundState('reweave');
    const after = (await reviseArcs(state, cfg(recordingSdk(reworkOf(() => {}))))).weave;
    const fixState = {
      ...state, weave: withFactCheckMark(after, { at: 't1', ready: false, fixes: 0 }), _meetingRound: null, _arcFeedback: null,
      validationResults: { phase: 'arcs', passed: false, structuralIssues: ['T3: "Riley kept a second ledger" states a buried memory.'] }
    };
    const pass = { ...fixState, ...(await incrementArcRevision(fixState)) };
    const fix = reworkOf((weave) => { weave.story = 'The fix rewrote the director\'s story.'; });
    const update = await reviseArcs(pass, cfg(recordingSdk(fix)));
    expect(update.weave.story).toBe(STORY);
    expect(update.weave._factCheck).toMatchObject({ fixes: 1 });
    expect(update._weaveHandEditReport.changed.map((c) => [c.id, c.automatic, c.restored])).toEqual([['E1', true, true]]);
    expect(update).not.toHaveProperty('_weaveMarks');
  });
});

describe('a round that times out (rulings 5 and 6)', () => {
  const timeout = () => { throw new Error('SDK timeout after 900.0s idle (limit: 900s) - Arc revision 0'); };

  it("keeps the director's version, says the round did not run, and gives back only the round's count", async () => {
    const state = await roundState('reweave');
    expect(state.humanArcRevisionCount).toBe(1);
    const update = await reviseArcs(state, cfg(recordingSdk(timeout)));
    expect(update).not.toHaveProperty('weave');
    expect(update._arcReworkTimeout).toMatchObject({ consecutive: 1, round: 'reweave' });
    expect(update.humanArcRevisionCount).toBe(0);
    expect(update).not.toHaveProperty('arcRevisionCount');
    expect(update).toMatchObject({ _meetingRound: null, _arcFeedback: null });
    expect(update.currentPhase).not.toBe('error');
  });

  it("an automatic pass that times out after a director's round gives back only its own count", async () => {
    const state = { ...atMeeting({ humanArcRevisionCount: 1, arcRevisionCount: 1 }), weave: withFactCheckMark(leftByDirector(), { at: 't', ready: false, fixes: 0 }) };
    const update = await reviseArcs(state, cfg(recordingSdk(timeout)));
    expect(update.arcRevisionCount).toBe(0);
    expect(update).not.toHaveProperty('humanArcRevisionCount');
    expect(update._arcReworkTimeout).not.toHaveProperty('round');
  });
});

describe("the checks read only the writer's text (R11, ruling 2)", () => {
  // Phase 4b (brief 1B; Review focus 1): a thread the director adds carries no evidence, and
  // the map writer finds it; a fault their change causes is a concern beside it.
  it('a thread the director added with no evidence is no failure, and the verdict thread they left out is a concern', async () => {
    const left = leftByDirector();
    left.threads = left.threads.map((t) => (t.id === 't1' ? { ...t, role: 'left-out' } : t));
    const { stateUpdates } = meetingResume({ meeting: 'approve', weave: left }, atMeeting());
    const update = validateArcStructure({ ...atMeeting(), ...stateUpdates }, {});
    expect(update._arcValidation.passed).toBe(true);
    expect(update.validationResults.structuralIssues).toEqual([]);
    expect(update._arcValidation.concerns).toEqual([
      `${DIRECTOR_EDIT_PREFIX}E2: The thread "The overdose vote" carries the room's verdict and is left out.`
    ]);
    expect(update.validationResults).not.toHaveProperty('concerns');
  });
});

describe("the fact check after a director's round (brief 4.5; T1)", () => {
  async function judgedRound() {
    const state = await roundState('reweave');
    const update = await reviseArcs(state, cfg(recordingSdk(reworkOf(() => {}))));
    return { ...state, ...update };
  }

  it("reads the weave with no struck connection and no answer, the director's edits right after it, and the answers as the director's words after the notes", async () => {
    const state = await judgedRound();
    const prompt = buildEvaluationUserPrompt('arcs', state, { directorEdits: judgedEdits('arcs', state) });
    const weaveJson = prompt.slice(prompt.indexOf('WEAVE:'), prompt.indexOf("THE DIRECTOR'S EDITS"));
    expect(weaveJson).not.toContain('"c2"');
    expect(weaveJson).not.toContain(ANSWER);
    expect(prompt.indexOf("THE DIRECTOR'S EDITS")).toBeLessThan(prompt.indexOf('THE ACCUSATION'));
    expect(prompt).toContain('E2 (thread "t3", role): "mirrors-it"');
    expect(prompt).toContain(`${TRUTH_MATERIAL.answers}\n`);
    expect(prompt.indexOf('<DIRECTOR_ANSWERS>')).toBeGreaterThan(prompt.indexOf('</DIRECTOR_NOTES>'));
    expect(prompt).toContain(`The director's answer, word for word: "${ANSWER}"`);
  });

  it('its truth questions read the answers where an answer can settle the line: the evidence, the money and the pronouns', () => {
    const criteria = getPhaseCriteria('arcs', 'journalist');
    expect(TRUTH_MATERIAL.answers).toBe('<DIRECTOR_ANSWERS>');
    ['evidenceTruth', 'moneyTruth', 'playersTruth'].forEach((key) => expect([key, criteria[key].reads.includes('answers')]).toEqual([key, true]));
    expect(criteria.moneyTruth.description).toMatch(/the director's answer at the story meeting/);
    expect(criteria.playersTruth.description).toMatch(/the director's answer at the story meeting/);
  });

  it("a finding located in the director's text is a concern on the mark, never the fix's work", async () => {
    const state = await judgedRound();
    const issue = `T1: "${STORY}" states as fact what the record only suggests.`;
    const update = await evaluateArcs(state, cfg(recordingSdk({
      ready: false, structuralPassed: false, overallScore: 0.4,
      criteriaScores: { evidenceTruth: { score: 0.4, notes: `The story "${STORY}" outruns the record.`, fix: 'Soften it.' } },
      structuralIssues: [issue], advisoryWarnings: [], confidence: 'high'
    })));
    expect(update.validationResults.structuralIssues).toEqual([]);
    expect(update.weave._factCheck).toMatchObject({ ready: true, fixes: 0, concerns: [`${DIRECTOR_EDIT_PREFIX}E1: ${issue}`] });
    expect(routeArcEvaluation({ ...state, weave: update.weave })).toBe('checkpoint');
  });
});

// Ruling 8 (4.4 re-review, probes A and D): "when it finds a breach, one automatic fix runs"
// (spec 4.5). A truth-only judge's verdict is ready when no structural issue remains and no
// truth criterion holds the output, whatever the judge's own structuralPassed, on the path
// with no edits and on the edits path alike.
describe("a truth-only judge's readiness (ruling 8)", () => {
  const criteria = getPhaseCriteria('arcs', 'journalist');
  const passing = Object.fromEntries(Object.keys(criteria).map((key) => [key, { score: 1 }]));

  it('probe A: a criterion outside the contract holds nothing, so no fix runs on a weave with nothing to fix', async () => {
    const evaluation = { ready: false, structuralPassed: false, overallScore: 0.3, criteriaScores: { ...passing, pacing: { score: 0.3, type: 'structural', notes: 'slow', fix: 'faster' } }, structuralIssues: [], advisoryWarnings: [] };
    expect(truthOnlyVerdict(guardDirectorEdits({ evaluation, criteria, edits: [], output: FIXTURE_WEAVE }), criteria).ready).toBe(true);
    const update = await evaluateArcs(atMeeting({ weave: clone(FIXTURE_WEAVE) }), cfg(recordingSdk(evaluation)));
    expect(update.weave._factCheck.ready).toBe(true);
    expect(routeArcEvaluation({ ...atMeeting(), weave: update.weave })).toBe('checkpoint');
  });

  it('probe D: a breach the judge listed holds the weave for its fix, though the judge called it passed', async () => {
    const issue = 'T3: "Morgan paid Riley at the bar, out of sight" states what a buried memory held.';
    const evaluation = { ready: true, structuralPassed: true, overallScore: 0.9, criteriaScores: passing, structuralIssues: [issue], advisoryWarnings: [] };
    expect(truthOnlyVerdict(guardDirectorEdits({ evaluation, criteria, edits: [], output: FIXTURE_WEAVE }), criteria).ready).toBe(false);
    const update = await evaluateArcs(atMeeting({ weave: clone(FIXTURE_WEAVE) }), cfg(recordingSdk(evaluation)));
    expect(update.weave._factCheck.ready).toBe(false);
    expect(routeArcEvaluation({ ...atMeeting(), weave: update.weave })).toBe('revise');
  });

  it('holds on the edits path alike', async () => {
    const state = await roundState('reweave');
    const update = await reviseArcs(state, cfg(recordingSdk(reworkOf(() => {}))));
    const judged = { ...state, ...update };
    const edits = judgedEdits('arcs', judged);
    expect(edits.length).toBeGreaterThan(0);
    const issue = 'T3: "Morgan paid Riley at the bar, out of sight" states what a buried memory held.';
    const probeD = { ready: true, structuralPassed: true, criteriaScores: passing, structuralIssues: [issue], advisoryWarnings: [] };
    const probeA = { ready: false, structuralPassed: false, criteriaScores: { ...passing, pacing: { score: 0.3, type: 'structural' } }, structuralIssues: [], advisoryWarnings: [] };
    expect(truthOnlyVerdict(guardDirectorEdits({ evaluation: probeD, criteria, edits, output: judged.weave }), criteria).ready).toBe(false);
    expect(truthOnlyVerdict(guardDirectorEdits({ evaluation: probeA, criteria, edits, output: judged.weave }), criteria).ready).toBe(true);
  });
});

// scripts/render-prompts.js renders the arc rework through arcReworkCall, the one place
// reviseArcs builds its call, so a render is what the node sends.
describe('the arc rework renders as it is sent (brief 4.5)', () => {
  const { arcReworkCall } = arcNodes._testing;

  it.each(['reweave', 'send-back', null])("%s: reviseArcs sends arcReworkCall's prompt, system prompt, schema and label", async (round) => {
    const state = round
      ? await roundState(round, round === 'send-back' ? 'Rethink the money thread.' : null)
      : { ...atMeeting(), arcRevisionCount: 1, validationResults: { phase: 'arcs', source: 'weave-checks', passed: false, structuralIssues: ['The thread "The sale" is in the story with no piece of evidence that supports it.'] } };
    const sdk = recordingSdk({ ...reworkOf(() => {}), ...(round === 'send-back' && { [CHANGED_EDITS_KEY]: [] }) });
    await reviseArcs(state, cfg(sdk));
    const call = arcReworkCall(state);
    const sent = sdk.calls[0];
    expect([sent.prompt, sent.systemPrompt, sent.jsonSchema, sent.label]).toEqual([call.prompt, call.systemPrompt, call.jsonSchema, call.label]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.5b: the meeting's plumbing, follow-ups
// ═══════════════════════════════════════════════════════════════════════════

// R12: an answer on a question and a strike on a connection are the director's keys,
// written only at the meeting. WEAVE_SCHEMA leaves extra keys open, so a model could write
// them: a model-written answer would show as answered and print in the settled weave as the
// director's words, and a model-written strike would take a connection out of the story
// with no one the wiser.
describe("4.5b: the director's keys stay the director's (R12)", () => {
  const MODEL_ANSWER = 'An answer the model wrote.';
  const NEW_QUESTION = { id: 'q9', kind: 'pronoun', about: 'Riley', question: 'Which pronoun for Riley?', changes: "Riley's pronoun in print." };

  it("the writer's path: the weave it stores carries no answer and no strike the writer wrote", async () => {
    const written = clone(FIXTURE_WEAVE);
    written.questions = written.questions.map((q) => ({ ...q, answer: MODEL_ANSWER }));
    written.connections = written.connections.map((c) => ({ ...c, struck: true }));
    const update = await analyzeArcsPlayerFocusGuided({ ...atMeeting(), weave: null }, cfg(recordingSdk(written)));
    expect(update.weave.questions).toEqual(FIXTURE_WEAVE.questions);
    expect(update.weave.connections).toEqual(FIXTURE_WEAVE.connections);
    expect(update._weaveBaseline).toEqual(update.weave);
  });

  it.each([
    ['an automatic pass', async () => atMeeting({ arcRevisionCount: 1, validationResults: { phase: 'arcs', source: 'weave-checks', passed: false, structuralIssues: ['The thread "The sale" is in the story with no piece of evidence that supports it.'] } })],
    ['a reweave', async () => roundState('reweave')]
  ])("the rework's path, %s: no answer and no strike the rework wrote; the director's stay", async (_name, stateOf) => {
    const state = await stateOf();
    const before = weaveForPrompt(state.weave);
    const rework = weaveForPrompt(clone(state.weave));
    rework.connections = rework.connections.filter((c) => !c.struck).map((c) => ({ ...c, struck: true }));
    rework.questions = [...rework.questions.map((q) => ({ ...q, answer: MODEL_ANSWER })), { ...NEW_QUESTION, answer: MODEL_ANSWER }];
    const update = await reviseArcs(state, cfg(recordingSdk(rework)));
    // The connections the rework struck are live; the director's strike, if any, stands.
    expect(update.weave.connections).toEqual(before.connections);
    // The director's answers stand; the rework's new question is asked, with no answer.
    expect(update.weave.questions).toEqual([...before.questions, NEW_QUESTION]);
    expect(JSON.stringify(update.weave)).not.toContain(MODEL_ANSWER);
  });
});

// R11 exempts the thread the director added, not the writer's duplicate of its id: the
// duplicate is the writer's failure, a check rework fixes it, and the meeting opens with no
// repeat to refuse the director's next change on (4.5 review, minor 6 and re-review minor a).
describe("4.5b: a writer's repeat under the id of a thread the director added", () => {
  const { routeArcValidation } = graphTesting;
  const WRITERS_T6 = { id: 't6', name: 'The burials', line: 'Riley kept the receipts for every burial.', role: 'grounds-it', evidence: [{ sources: ['ledger'], shows: 'Each burial on the ledger.', stance: 'supports' }] };

  it("is a failure, a check rework fixes it, and the repeat is gone with the director's thread intact", async () => {
    // The director adds t6 and reweaves; the reweave puts a thread of its own under t6. The
    // meeting is open, so the checks run whatever the shared fixture holds.
    const state = { ...(await roundState('reweave')), meetingApproved: null };
    const directorsT6 = leftByDirector().threads.find((t) => t.id === 't6');
    const rework = reworkOf((weave) => { weave.threads.push(clone(WRITERS_T6)); });
    const rewoven = { ...state, ...(await reviseArcs(state, cfg(recordingSdk(rework)))) };
    expect(rewoven.weave.threads.filter((t) => t.id === 't6')).toEqual([directorsT6, WRITERS_T6]);

    const checked = { ...rewoven, ...validateArcStructure(rewoven, {}) };
    expect(checked._arcValidation.failures.map((f) => f.type)).toEqual(['duplicate-id']);
    // Phase 4b (brief 1B): the line names the threads by their names, never the id, which the meeting shows none of.
    expect(checked._arcValidation.failures[0].message).toMatch(/^Two threads share one id: "The second ledger" and "The burials", and one of them is the thread the director added\. Keep the id on the director's thread/);
    expect(checked._arcValidation.failures[0].place).toBe('threads[#t6]');
    expect(checked._arcValidation.concerns).toEqual([]);
    expect(routeArcValidation(checked)).toBe('revise');

    // The check rework reads the failure and the director's thread, and renames its own.
    const pass = { ...checked, ...(await incrementArcRevision(checked)) };
    const sdk = recordingSdk(() => {
      const weave = weaveForPrompt(clone(pass.weave));
      weave.connections = weave.connections.filter((c) => !c.struck);
      weave.threads = weave.threads.map((t) => (t.line === WRITERS_T6.line ? { ...t, id: 't7' } : t));
      return weave;
    });
    const fixed = { ...pass, ...(await reviseArcs(pass, cfg(sdk))) };
    expect(sdk.calls[0].prompt).toContain(`WEAVE CHECK FAILURES:\n  - ${checked._arcValidation.failures[0].message}`);
    expect(sdk.calls[0].prompt).toMatch(/E3 \(thread "t6", added\)/);

    const rechecked = validateArcStructure(fixed, {});
    expect(rechecked._arcValidation.failures).toEqual([]);
    expect(fixed.weave.threads.filter((t) => t.id === 't6')).toEqual([directorsT6]);
    expect(fixed.weave.threads.find((t) => t.id === 't7')).toEqual({ ...WRITERS_T6, id: 't7' });
  });
});

// The removed-phrase scan (lib/__tests__/fixtures/removed-phrases.js) reads the arc rework's
// three renders as scripts/render-prompts.js writes them, through arcReworkCall: it finds
// where the director's note ends by the note block's end line, which the meeting's renders
// lost in 4.5 (gate 2).
describe("4.5b: the removed-phrase scan reads the arc rework's three renders", () => {
  const { arcReworkCall } = arcNodes._testing;
  const { instructionText, findRemovedPhrases } = require('./fixtures/removed-phrases');
  const { standingAtMeeting } = require('../hand-edit-diff');

  /** An automatic pass after the director's changes: a check's line to fix, the director's edits standing. */
  const automatic = async () => {
    const left = leftByDirector();
    return atMeeting({
      weave: left, _weaveHandEdits: standingAtMeeting(null, clone(FIXTURE_WEAVE), left), arcRevisionCount: 1,
      validationResults: { phase: 'arcs', source: 'weave-checks', passed: false, structuralIssues: ['The thread "The sale": piece 1 names "zzz", which is no document in the record.'] }
    });
  };

  it.each([
    ['the automatic pass', automatic],
    ['the reweave', () => roundState('reweave', 'Join the ledger thread to the vote.')],
    ['the send-back', () => roundState('send-back', 'Rethink the money thread.')]
  ])('%s: the scan reads it, and finds no retired wording and no em-dash', async (_name, stateOf) => {
    const call = arcReworkCall(await stateOf());
    const render = `${call.systemPrompt}\n=====\n${call.prompt}`;
    expect(render).toContain('<HAND_EDITS>');
    const text = instructionText(render);
    expect(findRemovedPhrases(text).map(String)).toEqual([]);
    expect(text).not.toMatch(/[–—]/);
  });
});

// The integrator's ruling 2 on run 4's follow-ups (progress.md, 2026-10-03): a connection the
// director struck and brought back is theirs by its place in the weave, and its words are the
// writer's, as a block moved at the desk is. Through the meeting's nodes: a reweave may reword
// it and keeps it, a send-back's rework may take it out only as it may change any edit, saying
// why, and a fact-check finding that quotes it is the writer's must-fix, which the one
// automatic fix takes up. Invented text.
describe('4.5d: a connection the director brought back, through the meeting\'s nodes', () => {
  const { standingAtMeeting } = require('../hand-edit-diff');
  const C2 = FIXTURE_WEAVE.connections[1];
  const REWORDED = 'The result came back on the night Marcus made the sale.';
  const MARK = { at: 't0', ready: true, fixes: 0 };

  /**
   * The meeting after a round that kept the director's strike of c2 (E1), where the director
   * brings c2 back and starts a round: the payload's update, then the increment.
   */
  async function broughtBack(round, note = null) {
    const struck = clone(FIXTURE_WEAVE);
    struck.connections[1].struck = true;
    const kept = atMeeting({
      weave: withFactCheckMark(struck, MARK), _weaveBaseline: weaveForPrompt(clone(struck)),
      _weaveHandEdits: standingAtMeeting(null, clone(FIXTURE_WEAVE), struck)
    });
    const { stateUpdates, error } = meetingResume({ meeting: round, weave: clone(FIXTURE_WEAVE), ...(note && { note }) }, kept);
    expect(error).toBeNull();
    expect(carriedEdits(stateUpdates._weaveHandEdits, clone(FIXTURE_WEAVE)).map((e) => [e.id, e.unstruck === true])).toEqual([['E2', true]]);
    const state = { ...kept, ...stateUpdates, _meetingRound: round };
    return { ...state, ...(await incrementArcRevision(state)) };
  }
  /** The weave a rework returns: the writer's, its connections as `connections` gives them. */
  const reworkWith = (connections) => ({ ...weaveForPrompt(clone(FIXTURE_WEAVE)), connections: connections.map(clone) });

  it("a reweave reads it by its place, and its rewording stands: the connection and the reweave's words are kept, and no edit of the director's changed", async () => {
    const state = await broughtBack('reweave');
    const sdk = recordingSdk(reworkWith([FIXTURE_WEAVE.connections[0], { ...C2, line: REWORDED }]));
    const update = await reviseArcs(state, cfg(sdk));
    const block = sdk.calls[0].prompt.slice(sdk.calls[0].prompt.indexOf('<HAND_EDITS>'), sdk.calls[0].prompt.indexOf('</HAND_EDITS>'));
    expect(block).toContain('E2 (connection "c2", brought back)');
    expect(block).not.toContain(C2.line);
    expect(update.weave.connections).toEqual([FIXTURE_WEAVE.connections[0], { ...C2, line: REWORDED }]);
    expect(update._weaveHandEditReport.changed).toEqual([]);
  });

  it("a send-back's rework takes it out, saying why: it stays out, and the report keeps the reason", async () => {
    const state = await broughtBack('send-back', 'Tell the money thread alone.');
    const reason = 'The note asks for the money thread alone, and c2 ties the heir to it.';
    const sdk = recordingSdk({ ...reworkWith([FIXTURE_WEAVE.connections[0]]), [CHANGED_EDITS_KEY]: [{ id: 'E2', reason }] });
    const update = await reviseArcs(state, cfg(sdk));
    expect(sdk.calls[0].jsonSchema.required).toContain(CHANGED_EDITS_KEY);
    expect(sdk.calls[0].prompt).toContain('each thread they added and each connection they brought back stay in the weave');
    expect(update.weave.connections.map((c) => c.id)).toEqual(['c1']);
    expect(update._weaveHandEditReport.changed).toEqual([expect.objectContaining({
      id: 'E2', where: 'connection "c2", brought back', reason, restored: false, pass: 'send-back'
    })]);
  });

  it("a fact-check finding that quotes it is the writer's must-fix, and the one automatic fix runs on it", async () => {
    const state = await broughtBack('reweave');
    const round = { ...state, ...(await reviseArcs(state, cfg(recordingSdk(reworkWith(FIXTURE_WEAVE.connections))))) };
    const issue = `T1: "${C2.line}" states a cause the record does not show.`;
    const update = await evaluateArcs(round, cfg(recordingSdk({
      ready: false, structuralPassed: false, overallScore: 0.4,
      criteriaScores: { evidenceTruth: { score: 0.4, notes: `The connection "${C2.line}" outruns the record.`, fix: 'Name only what the record shows.' } },
      structuralIssues: [issue], advisoryWarnings: [], confidence: 'high'
    })));
    expect(update.validationResults.structuralIssues).toEqual([issue]);
    expect(update.weave._factCheck).toMatchObject({ ready: false, fixes: 0 });
    expect(update.weave._factCheck.concerns || []).toEqual([]);
    expect(routeArcEvaluation({ ...round, weave: update.weave })).toBe('revise');
  });
});

// The integrator's ruling 4 on run 5's follow-ups (progress.md, 2026-10-04; scratch
// 4.5d-review/guard-probe.js): the fact check may file a finding under the prefix and the id
// of a connection the director brought back, quoting the connection's words, which are the
// writer's (task 4.5d). The guard moved such a finding to the concerns as it was, so the
// weave read ready and no fix ran. An un-strike owns no text, so the guard reads a finding
// filed under such edits alone by its quotes, and a quote of the writer's words is the
// writer's must-fix, however the judge filed it. Invented text.
describe("4.5e: a finding filed under a brought-back connection's id is read by its quotes", () => {
  const { standingAtMeeting } = require('../hand-edit-diff');
  const C2 = FIXTURE_WEAVE.connections[1];
  const FINDING = `T1: "${C2.line}" states a cause the record does not show.`;

  /**
   * After a round that kept the director's strike of c2 (E1), the director brings c2 back (E2)
   * and reweaves, and the reweave keeps it: the weave the fact check judges.
   */
  async function rewoven() {
    const struck = clone(FIXTURE_WEAVE);
    struck.connections[1].struck = true;
    const kept = atMeeting({
      weave: withFactCheckMark(struck, { at: 't0', ready: true, fixes: 0 }), _weaveBaseline: weaveForPrompt(clone(struck)),
      _weaveHandEdits: standingAtMeeting(null, clone(FIXTURE_WEAVE), struck)
    });
    const { stateUpdates, error } = meetingResume({ meeting: 'reweave', weave: clone(FIXTURE_WEAVE) }, kept);
    expect(error).toBeNull();
    const round = { ...kept, ...stateUpdates, _meetingRound: 'reweave' };
    const state = { ...round, ...(await incrementArcRevision(round)) };
    return { ...state, ...(await reviseArcs(state, cfg(recordingSdk(weaveForPrompt(clone(FIXTURE_WEAVE)))))) };
  }

  it.each([
    ['a structural issue', (finding) => ({ structuralIssues: [finding] })],
    ['an advisory', (finding) => ({ advisoryWarnings: [finding] })]
  ])("filed as %s, quoting the connection's words, it is the writer's must-fix, and the one automatic fix runs on it", async (_name, filed) => {
    const round = await rewoven();
    expect(carriedEdits(round._weaveHandEdits, weaveForPrompt(round.weave)).map((e) => [e.id, e.unstruck === true])).toEqual([['E2', true]]);
    const update = await evaluateArcs(round, cfg(recordingSdk({
      ready: true, structuralPassed: true, overallScore: 0.9, criteriaScores: {}, structuralIssues: [], advisoryWarnings: [], confidence: 'high',
      ...filed(`${DIRECTOR_EDIT_PREFIX}E2: ${FINDING}`)
    })));
    expect(update.validationResults.structuralIssues).toEqual([FINDING]);
    expect(update.weave._factCheck).toMatchObject({ ready: false, fixes: 0 });
    expect(update.weave._factCheck.concerns || []).toEqual([]);
    expect(routeArcEvaluation({ ...round, weave: update.weave })).toBe('revise');
  });
});

// Task 4.5f (the integrator's ruling 2 on 4.5e's findings, progress.md 2026-10-04; scratch
// 4.5e-review/guard-noquote.js): a finding the fact check files under the prefix and the id of
// a connection the director brought back, quoting nothing, is how it disagrees with the
// director's choice to bring the connection back, which no fix may change. It stays a concern
// beside the connection, as the fact check filed it, and the one automatic fix does not run on
// it. Only a quote of the connection's words, which are the writer's, makes such a finding the
// fix's work. A finding filed under the connection and a text-owning edit together stays a
// concern as filed, whatever it quotes. Invented text.
describe("4.5f: a finding filed under a brought-back connection's id is the fix's work only when it quotes the writer's words", () => {
  const { standingAtMeeting } = require('../hand-edit-diff');
  const C2 = FIXTURE_WEAVE.connections[1];
  const HEADLINE = 'The Room Voted Overdose. The Sale Kept Its Night.';
  const PLACE_FINDING = 'T1: bringing this connection back joins two threads the record keeps apart.';
  const WORDS_FINDING = `T1: "${C2.line}" states a cause the record does not show.`;
  const LISTS = [
    ['a structural issue', (finding) => ({ structuralIssues: [finding] })],
    ['an advisory', (finding) => ({ advisoryWarnings: [finding] })]
  ];

  /**
   * After a round that kept the director's strike of c2, the director brings c2 back and, with
   * `headline`, rewrites the headline at the same look, then reweaves; the reweave keeps both.
   * The weave the fact check judges.
   */
  async function rewoven({ headline = null } = {}) {
    const struck = clone(FIXTURE_WEAVE);
    struck.connections[1].struck = true;
    const kept = atMeeting({
      weave: withFactCheckMark(struck, { at: 't0', ready: true, fixes: 0 }), _weaveBaseline: weaveForPrompt(clone(struck)),
      _weaveHandEdits: standingAtMeeting(null, clone(FIXTURE_WEAVE), struck)
    });
    const left = { ...clone(FIXTURE_WEAVE), ...(headline && { headline }) };
    const { stateUpdates, error } = meetingResume({ meeting: 'reweave', weave: left }, kept);
    expect(error).toBeNull();
    const round = { ...kept, ...stateUpdates, _meetingRound: 'reweave' };
    const state = { ...round, ...(await incrementArcRevision(round)) };
    return { ...state, ...(await reviseArcs(state, cfg(recordingSdk(weaveForPrompt(clone(left)))))) };
  }
  const judge = (round, filed) => evaluateArcs(round, cfg(recordingSdk({
    ready: true, structuralPassed: true, overallScore: 0.9, criteriaScores: {}, structuralIssues: [], advisoryWarnings: [], confidence: 'high',
    ...filed
  })));
  const editsOf = (round) => carriedEdits(round._weaveHandEdits, weaveForPrompt(round.weave)).map((e) => [e.id, e.path, e.unstruck === true]);

  it.each(LISTS)('filed as %s under the connection alone, quoting nothing: a concern beside it, as filed, and no fix runs', async (_name, filed) => {
    const round = await rewoven();
    expect(editsOf(round)).toEqual([['E2', 'connections[#c2]', true]]);
    const finding = `${DIRECTOR_EDIT_PREFIX}E2: ${PLACE_FINDING}`;
    const update = await judge(round, filed(finding));
    expect(update.validationResults.structuralIssues).toEqual([]);
    expect(update.weave._factCheck).toMatchObject({ ready: true, fixes: 0, concerns: [finding] });
    expect(routeArcEvaluation({ ...round, weave: update.weave })).toBe('checkpoint');
  });

  it.each(LISTS)("filed as %s under the connection alone, quoting its words: the fix's work", async (_name, filed) => {
    const round = await rewoven();
    const update = await judge(round, filed(`${DIRECTOR_EDIT_PREFIX}E2: ${WORDS_FINDING}`));
    expect(update.validationResults.structuralIssues).toEqual([WORDS_FINDING]);
    expect(update.weave._factCheck).toMatchObject({ ready: false, fixes: 0 });
    expect(update.weave._factCheck.concerns || []).toEqual([]);
    expect(routeArcEvaluation({ ...round, weave: update.weave })).toBe('revise');
  });

  it.each(LISTS)('filed as %s under the connection and the headline together, quoting its words: a concern as filed, and no fix runs', async (_name, filed) => {
    const round = await rewoven({ headline: HEADLINE });
    expect(editsOf(round)).toEqual([['E2', 'headline', false], ['E3', 'connections[#c2]', true]]);
    const finding = `${DIRECTOR_EDIT_PREFIX}E2, E3: ${WORDS_FINDING}`;
    const update = await judge(round, filed(finding));
    expect(update.validationResults.structuralIssues).toEqual([]);
    expect(update.weave._factCheck).toMatchObject({ ready: true, fixes: 0, concerns: [finding] });
    expect(routeArcEvaluation({ ...round, weave: update.weave })).toBe('checkpoint');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.14a: a rework never takes a struck connection's id (the final review, ruling 1)
// ═══════════════════════════════════════════════════════════════════════════
//
// Meeting 1: the rework reads the weave without the connections the director struck, so a
// connection it added for the director's thread took the struck one's id, and code wrote the
// struck connection over it (a reweave, the fact check's fix), or kept it and told the director
// their strike was undone (a send-back). The rework's task says a struck connection keeps its
// id. Code strikes again only the struck connection itself: any other connection under a struck
// id keeps its words and joins under an id of its own, numbered after every connection id the
// round has used, and the meeting marks it as new this round.
describe("4.14a: a rework never takes a struck connection's id", () => {
  const { meetingMarksOf } = require('../meeting');
  const { standingAtMeeting } = require('../hand-edit-diff');
  const { ARC_REWORK_STRUCK_IDS } = arcNodes._testing;
  /** The connection a rework adds for the director's thread t6, under the struck c2's id. */
  const NEW = { id: 'c2', joins: ['t6', 't3'], line: 'Riley kept the second ledger and took the envelope at the bar.', kind: 'person', evidence: [{ sources: ['notes'], shows: 'Riley at the bar.', stance: 'supports' }] };
  const connectionsOf = (weave) => weave.connections.map((c) => [c.id, c.struck === true]);
  const taskOf = (prompt) => prompt.slice(prompt.indexOf('## YOUR TASK'));

  it('tells the rework, in its task, that each struck connection keeps its id, only when <HAND_EDITS> lists a strike', async () => {
    expect(ARC_REWORK_STRUCK_IDS).toMatch(/<HAND_EDITS> marks struck keeps its id/);
    const struck = recordingSdk(reworkOf(() => {}));
    await reviseArcs(await roundState('reweave'), cfg(struck));
    expect(taskOf(struck.calls[0].prompt)).toContain(ARC_REWORK_STRUCK_IDS);
    const noStrike = leftByDirector();
    noStrike.connections = noStrike.connections.map(({ struck: _struck, ...connection }) => connection);
    const plain = recordingSdk(weaveForPrompt(clone(noStrike)));
    await reviseArcs(await roundState('reweave', null, noStrike), cfg(plain));
    expect(plain.calls[0].prompt).not.toContain(ARC_REWORK_STRUCK_IDS);
  });

  it.each([['reweave', null], ['send-back', 'Rethink the money thread.']])(
    "a %s whose rework gives a new connection a struck one's id: the new one keeps its words and joins under an id of its own, the strike stands, and the meeting marks the new one new",
    async (round, note) => {
      const state = await roundState(round, note);
      const rework = reworkOf((weave) => { weave.connections.push(clone(NEW)); });
      const update = await reviseArcs(state, cfg(recordingSdk(note ? { ...rework, [CHANGED_EDITS_KEY]: [] } : rework)));
      expect(connectionsOf(update.weave)).toEqual([['c1', false], ['c2', true], ['c3', false]]);
      expect(update.weave.connections[1]).toEqual(leftByDirector().connections[1]);
      expect(update.weave.connections[2]).toEqual({ ...NEW, id: 'c3' });
      expect(update._weaveHandEditReport.changed).toEqual([]);
      const { marks } = meetingMarksOf({ ...state, ...update });
      expect(marks.map((m) => [m.path, m.before])).toEqual([['connections[#c3]', '']]);
    }
  );

  it("the fact check's fix that gives a new connection a struck one's id: the same, numbered after every connection id the round has used", async () => {
    const left = leftByDirector();
    // The weave the round started from held a writer's c3 that the reweave took out.
    const roundStart = weaveForPrompt(clone(left));
    roundStart.connections.push({ id: 'c3', joins: ['t1', 't4'], line: 'The verdict and the heir share a line.', kind: 'line', evidence: [] });
    const fixState = {
      ...atMeeting(),
      weave: withFactCheckMark(clone(left), { at: 't1', ready: false, fixes: 0 }),
      _weaveHandEdits: standingAtMeeting(null, FIXTURE_WEAVE, left),
      _weaveMarks: { round: 'reweave', from: roundStart, at: 't' },
      validationResults: { phase: 'arcs', passed: false, structuralIssues: ['T3: "Morgan paid Riley at the bar, out of sight" states what a buried memory held.'] }
    };
    const pass = { ...fixState, ...(await incrementArcRevision(fixState)) };
    const update = await reviseArcs(pass, cfg(recordingSdk(reworkOf((weave) => { weave.connections.push(clone(NEW)); }))));
    expect(connectionsOf(update.weave)).toEqual([['c1', false], ['c2', true], ['c4', false]]);
    expect(update.weave.connections[2]).toEqual({ ...NEW, id: 'c4' });
    expect(update._weaveHandEditReport.changed).toEqual([]);
  });
});

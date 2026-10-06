/**
 * The Reweave on the open angle (phase 4b, piece 3, brief 3C; spec 2026-10-06 section 7; R1, R3;
 * survey Q6; Review focus 2).
 *
 * - The rework is told the open angle in words, since the weave it reads carries no pick, and its
 *   scope says it fits the director's changes into that angle and keeps every other angle as
 *   written.
 * - After a Reweave's rework, code puts back by id, from the version the rework started from,
 *   every other angle, every thread outside the open angle and every connection that does not join
 *   two of its threads, and records each put-back in the round's report (`held`). A thread the
 *   open angle shares with another angle may be reworded, and the new words show in both.
 * - The round's check rework and fact-check fix are automatic passes, which the hold leaves alone
 *   (R3), and a send-back rethinks every angle; after it the pick stays while its angle survives
 *   by id (R1).
 *
 * Every model call is a recording stand-in. Invented text: the repo is public.
 */

const { reviseArcs } = require('../workflow/nodes/arc-specialist-nodes');
const { arcRevisionRules } = require('../workflow/nodes/arc-specialist-nodes')._testing;
const { buildRevisionContext } = require('../workflow/nodes/node-helpers');
const { _testing: graphTesting } = require('../workflow/graph');
const { incrementArcRevision } = graphTesting;
const { WEAVE: FIXTURE_WEAVE, reworkFixtureState } = require('./fixtures/rework-state');
const { weaveForPrompt, withFactCheckMark, holdOutsideOpenAngle, PICKED_KEY } = require('../weave');
const { reportAfterPass } = require('../hand-edit-diff');
const { meetingResume } = require('../meeting');

const clone = (v) => JSON.parse(JSON.stringify(v));

function recordingSdk(answer) {
  const calls = [];
  const sdk = async (options) => { calls.push(options); return clone(typeof answer === 'function' ? answer(options) : answer); };
  sdk.calls = calls;
  return sdk;
}
const cfg = (sdk) => ({ configurable: { sdkClient: sdk, theme: 'journalist' } });

/** The meeting's stop: the writer's weave, judged. */
function atMeeting() {
  return {
    ...reworkFixtureState('journalist'),
    meetingApproved: false,
    weave: withFactCheckMark(clone(FIXTURE_WEAVE), { at: 't0', ready: true, fixes: 0 }),
    _weaveBaseline: clone(FIXTURE_WEAVE),
    validationResults: null,
    humanArcRevisionCount: 0,
    arcRevisionCount: 0
  };
}

const A2_STORY = 'Morgan held one side of the deadlock and paid Riley at the bar, and the letter came the same week.';

/**
 * The director's version: angle 2 picked, its story rewritten, and "The letter" (t5, in no angle)
 * brought into it. Angle 2 tells t3, t1 and t5; angles 1 and 3 stay as the meeting showed them.
 */
function leftByDirector() {
  const weave = clone(FIXTURE_WEAVE);
  weave[PICKED_KEY] = 'a2';
  weave.angles[1].story = A2_STORY;
  weave.angles[1].threads.push('t5');
  return weave;
}

/** The state a director's round reaches the rework with: the payload's update, then the increment. */
async function roundState(round, note = null, left = leftByDirector()) {
  const { stateUpdates, error } = meetingResume({ meeting: round, weave: left, ...(note && { note }) }, atMeeting());
  expect(error).toBeNull();
  const state = { ...atMeeting(), ...stateUpdates, _meetingRound: round };
  return { ...state, ...(await incrementArcRevision(state)) };
}

/** What a rework returns: the director's version as the rework read it (no pick), changed by `change`. */
function reworkOf(change, left = leftByDirector()) {
  const { [PICKED_KEY]: _pick, ...weave } = weaveForPrompt(left);
  const out = clone(weave);
  change(out);
  return out;
}

const T1_LINE = 'The room settled on an accidental overdose after Alex and Morgan deadlocked for an hour.';
const A1_STORY = 'A rewrite of angle 1 the reweave had no business writing.';
const A2_ENDS = 'The vote went Morgan\'s way, and the letter and the envelope stayed out of the statement.';
const C1_LINE = 'Morgan argues for the overdose and pays at the bar in the same hour.';

/** Review focus 2: a Reweave that reaches outside the open angle. */
function wideRework(weave) {
  // Inside the open angle: the shared verdict thread reworded, the angle's ending, a connection
  // between two of its threads, and a paraphrase of the director's story.
  weave.threads.find((t) => t.id === 't1').line = T1_LINE;
  weave.angles[1].ends = A2_ENDS;
  weave.angles[1].story = 'A paraphrase of the story the director wrote.';
  weave.connections.find((c) => c.id === 'c1').line = C1_LINE;
  // Outside it: another angle's pitch, a thread only other angles name dropped, a connection
  // outside the angle rewritten and another added, a thread of its own outside any angle, and an
  // angle of its own.
  weave.angles[0].story = A1_STORY;
  weave.threads = weave.threads.filter((t) => t.id !== 't4');
  weave.threads.push({ id: 't9', name: 'A thread the reweave made up', line: 'Nobody asked for this thread.', evidence: [] });
  weave.connections.find((c) => c.id === 'c2').line = 'The reweave rewrote a connection outside the open angle.';
  weave.connections.push({ id: 'c3', joins: ['t2', 't4'], line: 'A connection outside the open angle.', kind: 'moment', evidence: [] });
  weave.angles.push({ ...weave.angles[2], id: 'a4', headline: 'An angle the reweave pitched' });
}

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

describe("the Reweave's rework is told the open angle (R3)", () => {
  it("its scope names the angle the director has open, by its id and headline, and says every other angle and what lies outside the open angle stay as written", () => {
    const { contextSection } = buildRevisionContext({
      phase: 'arcs', outputName: 'weave', revisionCount: 0, round: 2,
      previousOutput: leftByDirector(), handEdits: null, humanFeedback: 'Bring the letter into the ending.', meetingRound: 'reweave'
    });
    expect(contextSection).toContain('a2 ("Morgan Paid Riley at the Bar While the Room Argued")');
    expect(contextSection).toContain('Every other angle, every thread outside the open angle and every connection that does not join two of its threads stay as written');
    expect(contextSection).toContain('A thread the open angle shares with another angle may be reworded');
    expect(contextSection).not.toContain('into the weave');
  });

  it('its clause says the reweave works on the angle the director has open', () => {
    expect(arcRevisionRules('reweave', 'journalist')).toContain('the angle they have open');
  });

  it("the rework's prompt reads it in words, with no pick in the weave it reads", async () => {
    const state = await roundState('reweave');
    const sdk = recordingSdk(reworkOf(() => {}));
    await reviseArcs(state, cfg(sdk));
    const { prompt } = sdk.calls[0];
    expect(prompt).toContain('a2 ("Morgan Paid Riley at the Bar While the Room Argued")');
    expect(prompt).not.toMatch(/"picked"/);
  });
});

describe('after a Reweave, code puts back everything outside the open angle (R3; Review focus 2)', () => {
  let update;
  beforeAll(async () => {
    const state = await roundState('reweave');
    update = await reviseArcs(state, cfg(recordingSdk(reworkOf(wideRework))));
  });

  it("keeps the rework's changes inside the open angle: the shared thread reworded, which every angle reads, its ending and its connection", () => {
    expect(update.weave.threads.find((t) => t.id === 't1').line).toBe(T1_LINE);
    expect(update.weave.angles[1].ends).toBe(A2_ENDS);
    expect(update.weave.connections.find((c) => c.id === 'c1').line).toBe(C1_LINE);
  });

  it("puts back the director's line in the open angle, as for any pass", () => {
    expect(update.weave.angles[1].story).toBe(A2_STORY);
    expect(update._weaveHandEditReport.changed).toEqual([expect.objectContaining({ restored: true, pass: 'reweave' })]);
  });

  it('puts back every other angle, a thread other angles name, and each connection outside the open angle, and takes out what the rework added outside it', () => {
    const left = leftByDirector();
    expect(update.weave.angles.map((a) => a.id)).toEqual(['a1', 'a2', 'a3']);
    expect(update.weave.angles[0]).toEqual(left.angles[0]);
    expect(update.weave.angles[2]).toEqual(left.angles[2]);
    expect(update.weave.threads.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4', 't5']);
    expect(update.weave.threads.find((t) => t.id === 't4')).toEqual(left.threads.find((t) => t.id === 't4'));
    expect(update.weave.connections).toEqual([
      { ...left.connections[0], line: C1_LINE },
      left.connections[1]
    ]);
    expect(update.weave[PICKED_KEY]).toBe('a2');
  });

  it("records each put-back in the round's report, by what the rework did", () => {
    expect(update._weaveHandEditReport.held.map((h) => [h.scope, h.id, h.change])).toEqual([
      ['angles', 'a1', 'rewritten'],
      ['angles', 'a4', 'added'],
      ['threads', 't9', 'added'],
      ['threads', 't4', 'dropped'],
      ['connections', 'c2', 'rewritten'],
      ['connections', 'c3', 'added']
    ]);
    const a1 = update._weaveHandEditReport.held[0];
    expect(a1.became.story).toBe(A1_STORY);
    expect(update._weaveHandEditReport.held.find((h) => h.id === 't4').became).toBeNull();
  });

  it("the round's later passes keep the put-backs in the report", () => {
    const report = reportAfterPass(update._weaveHandEditReport, { edits: [], before: update.weave, after: update.weave, pass: 1 });
    expect(report.held).toEqual(update._weaveHandEditReport.held);
    const withEdits = reportAfterPass(update._weaveHandEditReport, {
      edits: [{ id: 'E1', scope: 'angles', path: 'angles[#a2].story', at: [{ key: 'angles' }, { index: 1, match: { id: 'a2' } }, { key: 'story' }], before: 'x', after: A2_STORY }],
      before: update.weave, after: update.weave, pass: 1
    });
    expect(withEdits.held).toEqual(update._weaveHandEditReport.held);
  });

  it('a Reweave that changes nothing outside the open angle records no put-back', async () => {
    const state = await roundState('reweave');
    const quiet = await reviseArcs(state, cfg(recordingSdk(reworkOf((w) => { w.angles[1].ends = A2_ENDS; }))));
    expect(quiet._weaveHandEditReport).not.toHaveProperty('held');
  });
});

describe('the hold is the Reweave\'s alone (R1, R3)', () => {
  it("an automatic pass after the round may change any angle: the hold does not run", async () => {
    const state = { ...(await roundState('reweave')), _meetingRound: null, arcRevisionCount: 1 };
    const update = await reviseArcs(state, cfg(recordingSdk(reworkOf((w) => { w.angles[0].story = A1_STORY; }))));
    expect(update.weave.angles[0].story).toBe(A1_STORY);
    expect(update._weaveHandEditReport || {}).not.toHaveProperty('held');
  });

  it('a send-back may rewrite any angle, and the pick stays while its angle survives by id', async () => {
    const state = await roundState('send-back', 'Lead with the money.');
    const update = await reviseArcs(state, cfg(recordingSdk(reworkOf((w) => { w.angles[0].story = A1_STORY; }))));
    expect(update.weave.angles[0].story).toBe(A1_STORY);
    expect(update.weave[PICKED_KEY]).toBe('a2');
  });

  it('after a send-back that drops the picked angle, the first angle is open', async () => {
    const state = await roundState('send-back', 'None of these: pitch me three about the letter.');
    const update = await reviseArcs(state, cfg(recordingSdk(reworkOf((w) => {
      w.angles = w.angles.filter((a) => a.id !== 'a2');
    }))));
    expect(update.weave).not.toHaveProperty(PICKED_KEY);
    expect(update.weave.angles.map((a) => a.id)).toEqual(['a1', 'a3']);
  });
});

describe('holdOutsideOpenAngle', () => {
  const before = () => clone(leftByDirector());

  it('puts back the open angle when the rework dropped it, and keeps the angles in the order the director saw', () => {
    const rework = clone(before());
    rework.angles = [rework.angles[2], rework.angles[0]];
    const { weave, held } = holdOutsideOpenAngle(rework, before());
    expect(weave.angles.map((a) => a.id)).toEqual(['a1', 'a2', 'a3']);
    expect(held).toEqual([{ scope: 'angles', id: 'a2', change: 'dropped', became: null }]);
  });

  it("leaves the open angle's threads the rework's: one it brought in, as it reworded it, and one it dropped that no other angle names", () => {
    const rework = clone(before());
    rework.angles[1].threads = ['t3', 't1', 't2'];
    rework.threads = rework.threads.filter((t) => t.id !== 't5');
    rework.threads.find((t) => t.id === 't2').line = 'The sale, as the open angle now tells it.';
    const { weave, held } = holdOutsideOpenAngle(rework, before());
    expect(weave.threads.find((t) => t.id === 't2').line).toBe('The sale, as the open angle now tells it.');
    expect(weave.threads.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4']);
    expect(held).toEqual([]);
  });

  it('puts a thread it put back where it sat among the threads', () => {
    const rework = clone(before());
    rework.threads = rework.threads.filter((t) => t.id !== 't2');
    const { weave } = holdOutsideOpenAngle(rework, before());
    expect(weave.threads.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4', 't5']);
  });

  it('returns a rework that is no weave, or holds no threads, as it came, for the rework to fail on', () => {
    expect(holdOutsideOpenAngle({ threads: [] }, before())).toEqual({ weave: { threads: [] }, held: [] });
    expect(holdOutsideOpenAngle(null, before())).toEqual({ weave: null, held: [] });
  });
});

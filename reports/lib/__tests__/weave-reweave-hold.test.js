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

  // Fix round 1, finding 4: the open angle is read as the director's standing flips leave it, since
  // code puts each flip back after the hold, so a thread they left out of it stays outside it.
  it('a thread the director left out of the open angle that the rework brought back and reworded keeps its words, and so does a connection that joins it', async () => {
    const left = clone(FIXTURE_WEAVE);
    left[PICKED_KEY] = 'a2';
    left.angles[1].threads = ['t1'];
    const state = await roundState('reweave', null, left);
    const update = await reviseArcs(state, cfg(recordingSdk(reworkOf((w) => {
      w.angles[1].threads = ['t1', 't3'];
      w.threads.find((t) => t.id === 't3').line = 'The envelope, as the reweave put it back into the angle.';
      w.connections.find((c) => c.id === 'c1').line = 'The reweave joined the envelope to the vote again.';
    }, left))));
    expect(update.weave.angles[1].threads).toEqual(['t1']);
    expect(update.weave.threads.find((t) => t.id === 't3')).toEqual(left.threads.find((t) => t.id === 't3'));
    expect(update.weave.connections.find((c) => c.id === 'c1')).toEqual(left.connections.find((c) => c.id === 'c1'));
    expect(update._weaveHandEditReport.held.map((h) => [h.scope, h.id, h.change])).toEqual([
      ['threads', 't3', 'rewritten'],
      ['connections', 'c1', 'rewritten']
    ]);
    expect(update._weaveHandEditReport.changed).toEqual([expect.objectContaining({ flip: 'out', restored: true })]);
  });
});

describe('the hold is the Reweave\'s alone (R1, R3)', () => {
  it("an automatic pass after the round may change any angle: the hold does not run", async () => {
    const state = { ...(await roundState('reweave')), _meetingRound: null, arcRevisionCount: 1 };
    const update = await reviseArcs(state, cfg(recordingSdk(reworkOf((w) => { w.angles[0].story = A1_STORY; }))));
    expect(update.weave.angles[0].story).toBe(A1_STORY);
    expect(update._weaveHandEditReport || {}).not.toHaveProperty('held');
  });

  // Fix round 1, finding 5: an automatic pass that drops the angle the director picked has it put
  // back by their edits on it, whichever kind, and the pick stays on it.
  it('an automatic pass that drops the picked angle has it put back by the edit on it, a flip or a line of its pitch, and the pick stays', async () => {
    const onlyFlip = clone(FIXTURE_WEAVE);
    onlyFlip[PICKED_KEY] = 'a2';
    onlyFlip.angles[1].threads.push('t5');
    const onlyPitch = clone(FIXTURE_WEAVE);
    onlyPitch[PICKED_KEY] = 'a2';
    onlyPitch.angles[1].story = A2_STORY;
    for (const left of [onlyFlip, onlyPitch]) {
      const state = { ...(await roundState('reweave', null, left)), _meetingRound: null, arcRevisionCount: 1 };
      const update = await reviseArcs(state, cfg(recordingSdk(reworkOf((w) => { w.angles.splice(1, 1); }, left))));
      expect(update.weave.angles).toEqual(left.angles);
      expect(update.weave[PICKED_KEY]).toBe('a2');
      expect(update._weaveHandEditReport.changed).toEqual([expect.objectContaining({ id: 'E1', restored: true })]);
    }
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

  // Fix round 1, finding 3: the hold pairs each element by its occurrence under its id, as the diff
  // does, so an element under an id the writer repeated outside the open angle is never lost.
  it("puts back the writer's second thread under a repeated id outside the open angle, which the rework gave an id of its own", () => {
    const b = before();
    b.threads.push({ id: 't2', name: 'A second sale', line: 'Someone else sold a memory that morning.', evidence: [] });
    const rework = clone(b);
    rework.threads[5].id = 't6';
    const { weave, held } = holdOutsideOpenAngle(rework, b);
    expect(weave.threads).toEqual(b.threads);
    expect(held.map((h) => [h.scope, h.id, h.change])).toEqual([['threads', 't6', 'added'], ['threads', 't2', 'dropped']]);
  });

  it('reads the open angle as the first under its id, as the pick does: another angle under an id the writer repeated keeps its own words', () => {
    const b = before();
    b.angles[2].id = 'a2';
    const rework = clone(b);
    rework.angles[1].ends = A2_ENDS;
    rework.angles[2].story = 'The reweave rewrote the other angle under a2.';
    const { weave, held } = holdOutsideOpenAngle(rework, b);
    expect(weave.angles[1].ends).toBe(A2_ENDS);
    expect(weave.angles[2]).toEqual(b.angles[2]);
    expect(held).toEqual([{ scope: 'angles', id: 'a2', change: 'rewritten', became: rework.angles[2] }]);
    // Dropped by the rework, the second angle under the id comes back too.
    const dropping = clone(b);
    dropping.angles.splice(2, 1);
    const dropped = holdOutsideOpenAngle(dropping, b);
    expect(dropped.weave.angles).toEqual(b.angles);
    expect(dropped.held).toEqual([{ scope: 'angles', id: 'a2', change: 'dropped', became: null }]);
  });

  it("reads the open angle as the director's standing places leave it: a thread they left out of it is outside it, though the rework brought it in", () => {
    const b = before();
    b.angles[1].threads = ['t1', 't5'];
    const rework = clone(b);
    rework.angles[1].threads = ['t1', 't5', 't3'];
    rework.threads.find((t) => t.id === 't3').line = 'The envelope, reworded by the reweave.';
    const places = [{ angleId: 'a2', threadId: 't3', flip: 'out' }, { angleId: 'a1', threadId: 't4', flip: 'out' }];
    const { weave, held } = holdOutsideOpenAngle(rework, b, { places });
    expect(weave.threads.find((t) => t.id === 't3')).toEqual(b.threads.find((t) => t.id === 't3'));
    expect(held).toEqual([{ scope: 'threads', id: 't3', change: 'rewritten', became: rework.threads.find((t) => t.id === 't3') }]);
    // With no place of the director's on it, a thread the rework brought into the open angle is inside it.
    expect(holdOutsideOpenAngle(rework, b).weave.threads.find((t) => t.id === 't3').line).toBe('The envelope, reworded by the reweave.');
  });

  // 3 fix A: "from your notes" travels with the first angle (R11), so a Reweave on any other angle
  // leaves it as the director left it, and code puts it back like any other line outside the angle.
  describe('"from your notes", which travels with the first angle (R11)', () => {
    const REWORDED = 'Riley kept an eye on the ledger.';

    it('when the open angle is not the first, puts back the words the rework rewrote, dropped or added, each in held', () => {
      const rewritten = clone(before());
      rewritten.fromYourNotes = REWORDED;
      const r = holdOutsideOpenAngle(rewritten, before());
      expect(r.weave.fromYourNotes).toBe(before().fromYourNotes);
      expect(r.held).toEqual([{ scope: 'fromYourNotes', id: null, change: 'rewritten', became: REWORDED }]);

      const dropped = clone(before());
      delete dropped.fromYourNotes;
      const d = holdOutsideOpenAngle(dropped, before());
      expect(d.weave.fromYourNotes).toBe(before().fromYourNotes);
      expect(d.held).toEqual([{ scope: 'fromYourNotes', id: null, change: 'dropped', became: null }]);

      const none = before();
      delete none.fromYourNotes;
      const added = clone(none);
      added.fromYourNotes = REWORDED;
      const a = holdOutsideOpenAngle(added, none);
      expect(a.weave).not.toHaveProperty('fromYourNotes');
      expect(a.held).toEqual([{ scope: 'fromYourNotes', id: null, change: 'added', became: REWORDED }]);
    });

    it('when the open angle is the first, leaves the words as the rework wrote them', () => {
      const b = before();
      b[PICKED_KEY] = 'a1';
      const rework = clone(b);
      rework.fromYourNotes = REWORDED;
      const { weave, held } = holdOutsideOpenAngle(rework, b);
      expect(weave.fromYourNotes).toBe(REWORDED);
      expect(held).toEqual([]);
    });

    it("a Reweave on angle 2 keeps them through the rework, recorded in the round's report", async () => {
      const state = await roundState('reweave');
      const update = await reviseArcs(state, cfg(recordingSdk(reworkOf((w) => { w.fromYourNotes = REWORDED; }))));
      expect(update.weave.fromYourNotes).toBe(leftByDirector().fromYourNotes);
      expect(update._weaveHandEditReport.held).toEqual([{ scope: 'fromYourNotes', id: null, change: 'rewritten', became: REWORDED }]);
    });
  });

  it('returns a rework that is no weave, or holds no threads, as it came, for the rework to fail on', () => {
    expect(holdOutsideOpenAngle({ threads: [] }, before())).toEqual({ weave: { threads: [] }, held: [] });
    expect(holdOutsideOpenAngle(null, before())).toEqual({ weave: null, held: [] });
  });
});

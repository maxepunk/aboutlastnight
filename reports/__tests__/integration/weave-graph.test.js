process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
/**
 * The weave through the REAL compiled graph (phase 4, brief 4.4; spec 4.5, R6).
 *
 * Each run seeds a thread as if the arc writer had just written its weave
 * (`updateState(..., 'analyzeArcs')`), invokes the real graph, and lets the real check,
 * fact check, increment, rework and router run until the story meeting's stop
 * interrupts. The model calls go to a scripted stand-in: a rework by its label, the
 * fact check by its system prompt. The checkpointer is a SqliteSaver on a temp file.
 *
 * The routing: a failed check sends the weave back once; the fact check runs once; a
 * breach gets one fix; then the stop opens with no second judge call. A replay through
 * the arc stage pays for nothing on a weave already judged, and a director's round runs
 * the checks and the fact check again.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Command } = require('@langchain/langgraph');
const { SqliteSaver } = require('@langchain/langgraph-checkpoint-sqlite');

const { createReportGraphWithCheckpointer, RECURSION_LIMIT } = require('../../lib/workflow/graph');
const { mocks } = require('../../lib/workflow/nodes');
const { buildResumePayload } = require('../../server.js');
const { reworkFixtureState } = require('../../lib/__tests__/fixtures/rework-state');

const clone = (v) => JSON.parse(JSON.stringify(v));

const BREACH = {
  ready: false, structuralPassed: false, overallScore: 0.4,
  criteriaScores: { evidenceTruth: { score: 0.4, type: 'structural', notes: 'Thread t3 states a buried memory.', fix: 'Report the sale.' } },
  structuralIssues: ['T3: "Morgan sold the memory" in thread t3 states what a buried memory held. Report the sale.'],
  advisoryWarnings: [], confidence: 'high'
};
const CLEAN = { ready: true, structuralPassed: true, overallScore: 1, criteriaScores: {}, structuralIssues: [], advisoryWarnings: [], confidence: 'high' };

/**
 * A scripted SDK: each rework returns the next of its scripted weaves (then repeats the
 * last), or throws it when it is an Error; the fact check returns the next of its
 * scripted verdicts.
 */
function scriptedSdk({ reworks = [], verdicts = [] }) {
  const calls = [];
  let reworkIndex = 0;
  let verdictIndex = 0;
  const sdk = async (options) => {
    const label = options.label || '';
    if (/^Arc revision/.test(label)) {
      calls.push(label);
      const answer = reworks[Math.min(reworkIndex, reworks.length - 1)];
      reworkIndex += 1;
      if (answer instanceof Error) throw answer;
      return clone(answer);
    }
    if (/WEAVE fact check/.test(options.systemPrompt || '')) {
      calls.push('fact check');
      const answer = verdicts[Math.min(verdictIndex, verdicts.length - 1)];
      verdictIndex += 1;
      return clone(answer);
    }
    throw new Error(`scriptedSdk: unexpected call ${label || (options.systemPrompt || '').slice(0, 60)}`);
  };
  sdk.calls = calls;
  return sdk;
}

/** The fixture's weave with one receipt that names no document: the check fails. */
function weaveWithBadReceipt() {
  const weave = clone(reworkFixtureState('journalist').weave);
  weave.threads = weave.threads.map((t) => (t.id === 't3' ? { ...t, receipt: 'zzz999' } : t));
  return weave;
}

describe('the weave through the real graph (phase 4, brief 4.4)', () => {
  let dir;
  let saver;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-weave-'));
    saver = SqliteSaver.fromConnString(path.join(dir, 'checkpoints.sqlite'));
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    saver.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  async function runToStop({ sdk, weave }) {
    const graph = createReportGraphWithCheckpointer(saver);
    const thread = {
      configurable: {
        thread_id: 'weave-test', sessionId: 'weave-test', theme: 'journalist',
        sdkClient: sdk, promptBuilder: mocks.createMockPromptBuilder(), dataDir: dir
      }
    };
    // Brief 4.6: the fixture is past the meeting; the weave stage runs before its approval.
    const { meetingApproved: _approval, ...state } = reworkFixtureState('journalist');
    await graph.updateState(thread, { ...state, weave, evaluationHistory: [] }, 'analyzeArcs');
    await graph.invoke(null, { ...thread, recursionLimit: RECURSION_LIMIT, durability: 'sync' });
    return { graph, thread, snapshot: await graph.getState(thread) };
  }

  /** The arc stage again, on the thread's state, as a replay from START reaches it. */
  async function replayArcStage(graph, thread) {
    await graph.updateState(thread, {}, 'surfaceContradictions');
    await graph.invoke(null, { ...thread, recursionLimit: RECURSION_LIMIT, durability: 'sync' });
    return graph.getState(thread);
  }

  it('one check rework, one fact check, one fix, then the stop, with no second judge call', async () => {
    const passing = clone(reworkFixtureState('journalist').weave);
    const fixed = { ...clone(passing), threads: passing.threads.map((t) => (t.id === 't3' ? { ...t, claim: 'Morgan paid Riley at the bar.' } : t)) };
    const sdk = scriptedSdk({ reworks: [passing, fixed], verdicts: [BREACH, CLEAN] });

    const { snapshot } = await runToStop({ sdk, weave: weaveWithBadReceipt() });

    expect(snapshot.next).toEqual(['checkpointArcSelection']);
    expect(sdk.calls).toEqual(['Arc revision 1', 'fact check', 'Arc revision 2']);
    expect(snapshot.values.weave.threads.find((t) => t.id === 't3').claim).toBe('Morgan paid Riley at the bar.');
    expect(snapshot.values.weave._factCheck).toMatchObject({ ready: false, fixes: 1 });
    expect(snapshot.values._arcValidation.passed).toBe(true);
    expect(snapshot.values.evaluationHistory.filter((e) => e.phase === 'arcs')).toHaveLength(1);
  });

  it('a check still failing after its one rework is kept for the meeting, and the fact check still runs once', async () => {
    const sdk = scriptedSdk({ reworks: [weaveWithBadReceipt()], verdicts: [CLEAN] });

    const { snapshot } = await runToStop({ sdk, weave: weaveWithBadReceipt() });

    expect(snapshot.next).toEqual(['checkpointArcSelection']);
    expect(sdk.calls).toEqual(['Arc revision 1', 'fact check']);
    expect(snapshot.values._arcValidation.passed).toBe(false);
    expect(snapshot.values._arcValidation.failures.map((f) => f.type)).toEqual(['receipt-not-in-record']);
    expect(snapshot.values._arcValidation.weaveKey).toBeDefined();
  });

  it('a fix that leaves a check failing opens the stop without a check rework or a second judge call', async () => {
    const sdk = scriptedSdk({ reworks: [weaveWithBadReceipt()], verdicts: [BREACH] });

    const { snapshot } = await runToStop({ sdk, weave: clone(reworkFixtureState('journalist').weave) });

    expect(snapshot.next).toEqual(['checkpointArcSelection']);
    expect(sdk.calls).toEqual(['fact check', 'Arc revision 1']);
    expect(snapshot.values._arcValidation.passed).toBe(false);
  });

  it('a fix that times out is retried for free through its own channel, with no second judge call', async () => {
    const timeout = new Error('SDK timeout after 900.0s idle (limit: 900s) - Arc revision 1');
    const sdk = scriptedSdk({ reworks: [timeout, clone(reworkFixtureState('journalist').weave)], verdicts: [BREACH] });

    const { snapshot } = await runToStop({ sdk, weave: clone(reworkFixtureState('journalist').weave) });

    expect(snapshot.next).toEqual(['checkpointArcSelection']);
    expect(sdk.calls).toEqual(['fact check', 'Arc revision 1', 'Arc revision 1']);
    expect(snapshot.values.weave._factCheck).toMatchObject({ ready: false, fixes: 1 });
    expect(snapshot.values._arcReworkTimeout).toBeNull();
    expect(snapshot.values.arcRevisionCount).toBe(1);
  });

  it('a replay through the arc stage makes no model call on a weave already judged', async () => {
    const sdk = scriptedSdk({ reworks: [clone(reworkFixtureState('journalist').weave)], verdicts: [BREACH, CLEAN] });
    const { graph, thread } = await runToStop({ sdk, weave: clone(reworkFixtureState('journalist').weave) });
    expect(sdk.calls).toEqual(['fact check', 'Arc revision 1']);

    const replayed = await replayArcStage(graph, thread);

    expect(replayed.next).toEqual(['checkpointArcSelection']);
    expect(sdk.calls).toEqual(['fact check', 'Arc revision 1']);
  });

  it("a director's send back opens a new round: the rework, then the fact check again", async () => {
    const sdk = scriptedSdk({ reworks: [clone(reworkFixtureState('journalist').weave)], verdicts: [CLEAN, CLEAN] });
    const { graph, thread, snapshot } = await runToStop({ sdk, weave: clone(reworkFixtureState('journalist').weave) });
    expect(sdk.calls).toEqual(['fact check']);

    // Brief 4.5: the story meeting's send-back, a note and no edit.
    const { resume, stateUpdates, error } = buildResumePayload({ meeting: 'send-back', note: 'Make the sale the main thread.' }, snapshot.values);
    expect(error).toBeNull();
    await graph.invoke(new Command({ resume, update: stateUpdates }), { ...thread, recursionLimit: RECURSION_LIMIT, durability: 'sync' });
    const next = await graph.getState(thread);

    expect(next.next).toEqual(['checkpointArcSelection']);
    expect(sdk.calls).toEqual(['fact check', 'Arc revision 0', 'fact check']);
    expect(next.values.humanArcRevisionCount).toBe(1);
    expect(next.values.weave._factCheck).toMatchObject({ ready: true, fixes: 0 });
  });
});

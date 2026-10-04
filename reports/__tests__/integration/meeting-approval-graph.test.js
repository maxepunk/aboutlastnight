process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
/**
 * The story meeting's approval through the REAL compiled graph (phase 4, brief 4.5b; spec
 * 4.4; R9).
 *
 * - The meeting approves only on its own action. Another stop's approval posted while the
 *   thread is paused at the meeting is refused, and nothing runs: the thread stays at the
 *   meeting, and no approved weave is written for the readout to take as the director's
 *   settled story.
 * - A replay passes an approved meeting. A rollback to `photos` replays from START, and the
 *   arc stage's nodes all skip on the approval: no model call, and no stop at the meeting.
 *
 * Each run seeds a thread as if the arc writer had just written its weave
 * (`updateState(..., 'analyzeArcs')`), with every stop before the meeting already answered,
 * so a replay from START passes them without a call. The director acts through the
 * server's own buildResumePayload, as the approve endpoint does: a refusal returns before
 * any invoke. The model calls go to a scripted stand-in; the checkpointer is a SqliteSaver
 * on a temp file, as the server runs on.
 *
 * Invented text throughout: the repo is public.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Command } = require('@langchain/langgraph');
const { SqliteSaver } = require('@langchain/langgraph-checkpoint-sqlite');

const { createReportGraphWithCheckpointer, RECURSION_LIMIT } = require('../../lib/workflow/graph');
const { mocks } = require('../../lib/workflow/nodes');
const { buildResumePayload } = require('../../server.js');
const { CHECKPOINT_TYPES } = require('../../lib/workflow/checkpoint-helpers');
const { buildRollbackState, rollbackNotesUpdate } = require('../../lib/api-helpers');
const { weaveForPrompt } = require('../../lib/weave');
const { reworkFixtureState } = require('../../lib/__tests__/fixtures/rework-state');

const clone = (v) => JSON.parse(JSON.stringify(v));

const CLEAN = { ready: true, structuralPassed: true, overallScore: 1, criteriaScores: {}, structuralIssues: [], advisoryWarnings: [], confidence: 'high' };

/**
 * The stops before the meeting, each already answered, so a replay from START passes
 * every one of them without a call (each skips on its own channel).
 */
const ANSWERED_BEFORE_THE_MEETING = {
  memoryTokens: [],
  paperEvidence: [],
  selectedPaperEvidence: [{ notionId: 'p-dna' }],
  roster: ['Alex', 'Morgan', 'Sarah', 'Riley'],
  accusation: 'Six votes for an accidental overdose, after a deadlock between Alex and Morgan.',
  sessionReport: 'The session report.',
  directorNotesRaw: 'Alex and Morgan argued at the bar. Riley watched the ledger all morning.',
  inputReviewApproved: true,
  preprocessedEvidence: { items: [] },
  preCurationApproved: true,
  _evidenceApproved: true
};

/** A scripted SDK: the fact check by its system prompt; any other call fails the test. */
function scriptedSdk() {
  const calls = [];
  const sdk = async (options) => {
    if (/WEAVE fact check/.test(options.systemPrompt || '')) {
      calls.push('fact check');
      return clone(CLEAN);
    }
    calls.push(options.label || 'unexpected');
    throw new Error(`scriptedSdk: unexpected call ${options.label || (options.systemPrompt || '').slice(0, 60)}`);
  };
  sdk.calls = calls;
  return sdk;
}

describe('4.5b: the story meeting approves only on its own action, and a replay passes it once approved', () => {
  let dir;
  let saver;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-meeting-approval-'));
    saver = SqliteSaver.fromConnString(path.join(dir, 'checkpoints.sqlite'));
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    saver.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  const run = (graph, thread, input) => graph.invoke(input, { ...thread, recursionLimit: RECURSION_LIMIT, durability: 'sync' });
  const approvedWeavePath = () => path.join(dir, '100326', 'analysis', 'weave.approved.json');

  /** The thread as the arc writer leaves it, every earlier stop answered, run to the meeting's stop. */
  async function toMeeting(sdk) {
    const graph = createReportGraphWithCheckpointer(saver);
    const thread = {
      configurable: {
        thread_id: 'meeting-approval-test', sessionId: '100326', theme: 'journalist',
        sdkClient: sdk, promptBuilder: mocks.createMockPromptBuilder(), dataDir: dir
      }
    };
    const { selectedArcs: _old, ...state } = reworkFixtureState('journalist');
    const weave = clone(state.weave);
    await graph.updateState(thread, {
      ...state, ...ANSWERED_BEFORE_THE_MEETING, sessionId: '100326', meetingApproved: null,
      weave, _weaveBaseline: weave, evaluationHistory: []
    }, 'analyzeArcs');
    await run(graph, thread, null);
    return { graph, thread };
  }

  /** The stop the thread is paused at. */
  async function stopOf(graph, thread) {
    const snapshot = await graph.getState(thread);
    return { type: snapshot.tasks[0].interrupts[0].value.type, values: snapshot.values, next: snapshot.next };
  }

  /** A request to the approve endpoint: the payload for the stop the thread is at, and the invoke only when it is taken. */
  async function post(graph, thread, approvals) {
    const { type, values } = await stopOf(graph, thread);
    const { resume, stateUpdates, error } = buildResumePayload(approvals, values, 'journalist', type);
    if (error) return error;
    await run(graph, thread, new Command({ resume, update: stateUpdates }));
    return null;
  }

  it.each([
    ['{outline: true}', { outline: true }],
    ['{article: true}', { article: true }],
    ['{inputReview: true}', { inputReview: true }]
  ])("%s at the meeting is refused, and nothing runs: the thread stays at the meeting, unapproved, with no approved weave written", async (_name, approvals) => {
    const sdk = scriptedSdk();
    const { graph, thread } = await toMeeting(sdk);
    expect((await stopOf(graph, thread)).type).toBe(CHECKPOINT_TYPES.ARC_SELECTION);
    const calls = [...sdk.calls];

    const error = await post(graph, thread, approvals);

    expect(error).toMatch(/^The thread is paused at the story meeting \(arc-selection\)/);
    const after = await stopOf(graph, thread);
    expect(after.type).toBe(CHECKPOINT_TYPES.ARC_SELECTION);
    expect(after.values.meetingApproved).not.toBe(true);
    expect(fs.existsSync(approvedWeavePath())).toBe(false);
    expect(sdk.calls).toEqual(calls);
  });

  it('a rollback to photos replays from START past the approved meeting: no model call, and no stop at the meeting', async () => {
    const sdk = scriptedSdk();
    const { graph, thread } = await toMeeting(sdk);
    expect(await post(graph, thread, { meeting: 'approve', weave: weaveForPrompt((await stopOf(graph, thread)).values.weave) })).toBeNull();
    const approved = await stopOf(graph, thread);
    expect(approved.type).toBe(CHECKPOINT_TYPES.PHOTOS);
    expect(approved.values.meetingApproved).toBe(true);
    const calls = [...sdk.calls];

    // The rollback as the server's handler sends it: a new input, so the graph replays from START.
    await run(graph, thread, { ...buildRollbackState('photos'), ...rollbackNotesUpdate('photos', approved.values.directorGateNotes) });

    const after = await stopOf(graph, thread);
    expect(after.type).toBe(CHECKPOINT_TYPES.PHOTOS);
    expect(sdk.calls).toEqual(calls);
    expect(after.values.meetingApproved).toBe(true);
    expect(after.values.weave).toEqual(approved.values.weave);
    // The replay ran from START and through every node of the arc stage, the meeting's stop
    // among them, without pausing there.
    const steps = [];
    for await (const snapshot of graph.getStateHistory(thread)) steps.unshift(snapshot);
    const replay = steps.slice(steps.findIndex((s) => s.metadata && s.metadata.source === 'input')).map((s) => s.next[0]);
    expect(replay[0]).toBe('__start__');
    expect(replay.slice(replay.indexOf('analyzeArcs'))).toEqual(['analyzeArcs', 'validateArcs', 'evaluateArcs', 'checkpointArcSelection', 'checkpointPhotos']);
  });
});

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
/**
 * The story meeting through the REAL compiled graph (phase 4, brief 4.5; spec 4.3, 4.4
 * and 4.5; R9, R11).
 *
 * Each run seeds a thread as if the arc writer had just written its weave
 * (`updateState(..., 'analyzeArcs')`), and the real checks, fact check, stop, payload
 * builder, increment, rework and routers run. The director acts through the server's own
 * functions, as the console's request would: getCheckpointData shows the stop, and
 * buildResumePayload turns the director's action into the resume and the update. The
 * model calls go to a scripted stand-in: the writer and the reworks by their labels, the
 * fact check by its system prompt. The checkpointer is a SqliteSaver on a temp file, as
 * the server runs on, so a channel the meeting writes and no Annotation declares would be
 * dropped here.
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
const { evaluateArticle } = require('../../lib/workflow/nodes/evaluator-nodes');
const { getCheckpointData, buildResumePayload } = require('../../server.js');
const { CHECKPOINT_TYPES } = require('../../lib/workflow/checkpoint-helpers');
const { buildRollbackState, rollbackNotesUpdate } = require('../../lib/api-helpers');
const { weaveForPrompt } = require('../../lib/weave');
const { settledWeaveOf } = require('../../lib/prompt-renderers/settled-weave');
const { reworkFixtureState, PREVIOUS_BUNDLE } = require('../../lib/__tests__/fixtures/rework-state');

const clone = (v) => JSON.parse(JSON.stringify(v));

const CLEAN = { ready: true, structuralPassed: true, overallScore: 1, criteriaScores: {}, structuralIssues: [], advisoryWarnings: [], confidence: 'high' };
const BREACH = {
  ready: false, structuralPassed: false, overallScore: 0.4,
  criteriaScores: { evidenceTruth: { score: 0.4, notes: 'Thread t3 states a buried memory.', fix: 'Report the sale.' } },
  structuralIssues: ['T3: "Morgan paid Riley at the bar, out of sight" in thread t3 states what a buried memory held. Report the sale.'],
  advisoryWarnings: [], confidence: 'high'
};
const TIMEOUT = () => new Error('SDK timeout after 900.0s idle (limit: 900s) - Arc revision');
const ANSWER = 'Sarah ran the bar all morning.';
const ADDED = { id: 't6', claim: 'Riley kept a second ledger in the back room.', role: 'grounds-it' };

/** The writer's weave: the fixture's. */
const writersWeave = () => clone(reworkFixtureState('journalist').weave);

/**
 * A scripted SDK: the writer by its label, each rework by its label (the next scripted
 * weave, or the error), the fact check by its system prompt (the next verdict).
 */
function scriptedSdk({ writer = writersWeave(), reworks = [], verdicts = [CLEAN] } = {}) {
  const calls = [];
  const prompts = [];
  let reworkIndex = 0;
  let verdictIndex = 0;
  const sdk = async (options) => {
    const label = options.label || '';
    if (label === 'The weave') {
      calls.push('weave writer');
      return clone(writer);
    }
    if (/^Arc revision/.test(label)) {
      calls.push(label);
      prompts.push(options.prompt);
      const answer = reworks[Math.min(reworkIndex, reworks.length - 1)];
      reworkIndex += 1;
      if (typeof answer === 'function') throw answer();
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
  sdk.prompts = prompts;
  return sdk;
}

/** The director's changes at the meeting: a role, a thread with no receipt, a strike, an answer. */
function leftBy(weave) {
  const left = weaveForPrompt(clone(weave));
  left.threads = left.threads.map((t) => (t.id === 't3' ? { ...t, role: 'mirrors-it' } : t));
  left.threads.push(clone(ADDED));
  left.connections = left.connections.map((c) => (c.id === 'c2' ? { ...c, struck: true } : c));
  left.questions = left.questions.map((q) => (q.id === 'q1' ? { ...q, answer: ANSWER } : q));
  return left;
}

describe('the story meeting through the real graph (phase 4, brief 4.5)', () => {
  let dir;
  let saver;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-meeting-'));
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

  function threadFor(sdk) {
    const graph = createReportGraphWithCheckpointer(saver);
    const thread = {
      configurable: {
        thread_id: 'meeting-test', sessionId: '100326', theme: 'journalist',
        sdkClient: sdk, promptBuilder: mocks.createMockPromptBuilder(), dataDir: dir
      }
    };
    return { graph, thread };
  }

  /** The thread as the arc writer leaves it, run to the story meeting's stop. */
  async function toMeeting(sdk, values = {}) {
    const { graph, thread } = threadFor(sdk);
    // Brief 4.6: the fixture is past the meeting; the meeting opens without its approval.
    const { meetingApproved: _approved, ...state } = reworkFixtureState('journalist');
    const weave = writersWeave();
    await graph.updateState(thread, { ...state, sessionId: '100326', weave, _weaveBaseline: weave, evaluationHistory: [], ...values }, 'analyzeArcs');
    await run(graph, thread, null);
    return { graph, thread, snapshot: await graph.getState(thread) };
  }

  /** The director's action at the stop the thread is paused at, through the server's payload builder. */
  async function act(graph, thread, approvals) {
    const snapshot = await graph.getState(thread);
    const type = snapshot.tasks[0].interrupts[0].value.type;
    const { resume, stateUpdates, error } = buildResumePayload(approvals, snapshot.values, 'journalist', type);
    expect(error).toBeNull();
    await run(graph, thread, new Command({ resume, update: stateUpdates }));
    return graph.getState(thread);
  }

  /** The stop the thread is paused at, and what it shows. */
  async function stopOf(graph, thread) {
    const snapshot = await graph.getState(thread);
    const type = snapshot.tasks[0].interrupts[0].value.type;
    return { type, data: await getCheckpointData(type, snapshot.values), values: snapshot.values };
  }

  it("the brief's verification: a reweave with no note reopens the meeting with the changes marked, the answers kept and the director's lines intact; approve settles it", async () => {
    // The reweave fits the changes in: it rewrites the convergence for t3's new role, and
    // it also paraphrases the thread the director added, brings back the struck connection
    // and returns no answer. Code puts back the director's lines, strikes c2 again and keeps
    // the answer.
    const rewoven = (shown) => {
      const weave = weaveForPrompt(clone(shown));
      weave.convergence = 'The verdict closes the night; the sale and the second ledger keep it open.';
      weave.threads = [...weave.threads.filter((t) => t.id !== 't6'), { ...ADDED, claim: 'Riley may have kept another ledger.' }];
      weave.connections = writersWeave().connections;
      weave.questions = writersWeave().questions;
      return weave;
    };
    const sdk = scriptedSdk({ verdicts: [CLEAN] });
    const { graph, thread, snapshot } = await toMeeting(sdk);
    expect(snapshot.next).toEqual(['checkpointArcSelection']);
    expect(sdk.calls).toEqual(['fact check']);

    // At the meeting: a role, a thread with no receipt, a strike and an answer; a reweave with no note.
    const left = leftBy(snapshot.values.weave);
    const scripted = scriptedSdk({ reworks: [rewoven(left)], verdicts: [CLEAN] });
    thread.configurable.sdkClient = scripted;
    await act(graph, thread, { meeting: 'reweave', weave: left });

    const reopened = await stopOf(graph, thread);
    expect(reopened.type).toBe(CHECKPOINT_TYPES.ARC_SELECTION);
    expect(scripted.calls).toEqual(['Arc revision 0', 'fact check']);
    // The rework read the director's changes and no finding from before the round.
    expect(scripted.prompts[0]).toContain("REVISION CONTEXT: WEAVE (round 2: the director's reweave)");
    expect(scripted.prompts[0]).toContain('(thread "t6", added)');

    const { weave } = reopened.data;
    expect(weave.threads.find((t) => t.id === 't3').role).toBe('mirrors-it');
    expect(weave.threads.find((t) => t.id === 't6')).toEqual(ADDED);
    expect(weave.connections.find((c) => c.id === 'c2').struck).toBe(true);
    expect(reopened.data.questions.find((q) => q.id === 'q1').answer).toBe(ANSWER);
    expect(weave._factCheck).toMatchObject({ ready: true, fixes: 0 });
    // The marks: what the writer changed, from the director's version.
    expect(reopened.data.marks).toEqual({
      round: 'reweave',
      marks: [{ path: 'convergence', where: 'convergence', before: left.convergence, after: 'The verdict closes the night; the sale and the second ledger keep it open.' }]
    });
    // The restores, reported for the reweave.
    const restored = reopened.data.handEditReport.changed.map((c) => [c.where, c.restored, c.pass]);
    expect(restored).toEqual(expect.arrayContaining([['thread "t6", added', true, 'reweave'], ['connection "c2", struck', true, 'reweave']]));
    // The checks read only the writer's text: the thread with no receipt is no failure.
    expect(reopened.data.checkFailures).toEqual([]);
    expect(reopened.data).toMatchObject({ humanRevisionCount: 1, revisionCount: 0, roundDidNotRun: null });

    // Approve as left: the photos stop opens, the approved weave is written, and the
    // settled weave carries every change.
    await act(graph, thread, { meeting: 'approve', weave: weaveForPrompt(weave), note: 'Lead with the ledger.' });
    const photos = await stopOf(graph, thread);
    expect(photos.type).toBe(CHECKPOINT_TYPES.PHOTOS);
    expect(photos.values.meetingApproved).toBe(true);
    expect(photos.values.directorGateNotes).toEqual([expect.objectContaining({ gate: 'arc-selection', kind: 'approval', text: 'Lead with the ledger.' })]);
    expect(photos.values._outlineGuidance == null).toBe(true);
    const saved = JSON.parse(fs.readFileSync(path.join(dir, '100326', 'analysis', 'weave.approved.json'), 'utf8'));
    expect(saved.threads.find((t) => t.id === 't6')).toEqual(ADDED);

    const settled = settledWeaveOf(photos.values);
    expect(settled).toMatch(/- t3 \(mirrors it\): .*\[the director's change E\d+: the role\]/);
    expect(settled).toMatch(/- t6 \(grounds it\): Riley kept a second ledger in the back room\. \[the director's change E\d+: a thread they added\]/);
    expect(settled).not.toContain('The night of the sale is the night the result came back.');
    expect(settled).toContain(`The director's answer, word for word: "${ANSWER}"`);
    expect(settled).toContain('The verdict closes the night; the sale and the second ledger keep it open.');
  });

  it('going back to the meeting (R9): no call; the weave, its answers, the edits and the meeting\'s notes kept; the next article is fact-checked', async () => {
    const sdk = scriptedSdk({ reworks: [], verdicts: [CLEAN] });
    const { graph, thread, snapshot } = await toMeeting(sdk);
    const left = leftBy(snapshot.values.weave);
    await act(graph, thread, { meeting: 'approve', weave: left, note: 'Lead with the ledger.' });
    const approved = (await graph.getState(thread)).values;
    expect(approved.meetingApproved).toBe(true);
    const calls = [...sdk.calls];

    // Later notes at the map and the desk, then the rollback, as the server's handler builds it.
    const notes = [
      ...approved.directorGateNotes,
      { gate: 'outline', kind: 'rejection', round: 1, text: 'Tighten the map.', at: 't3' },
      { gate: 'article', kind: 'rejection', round: 1, text: 'Cut the sidebar.', at: 't4' }
    ];
    await graph.updateState(thread, { directorGateNotes: notes, outline: { lede: { hook: 'h' } }, evaluationHistory: [{ phase: 'article', ready: true }] }, 'checkpointArcSelection');
    await graph.updateState(thread, { ...buildRollbackState('arc-selection'), ...rollbackNotesUpdate('arc-selection', notes) }, 'surfaceContradictions');
    await run(graph, thread, null);

    const back = await stopOf(graph, thread);
    expect(back.type).toBe(CHECKPOINT_TYPES.ARC_SELECTION);
    expect(sdk.calls).toEqual(calls);
    expect(weaveForPrompt(back.values.weave)).toEqual(weaveForPrompt(approved.weave));
    expect(back.values.weave._factCheck).toEqual(approved.weave._factCheck);
    expect(back.data.questions.find((q) => q.id === 'q1').answer).toBe(ANSWER);
    expect(back.values._weaveHandEdits).toEqual(approved._weaveHandEdits);
    expect(back.values._weaveBaseline).toEqual(approved._weaveBaseline);
    expect(back.values.meetingApproved).not.toBe(true);
    expect(back.values.outline).toBeNull();
    expect(back.values.evaluationHistory).toEqual([]);
    expect(back.values.directorGateNotes.map((n) => n.text)).toEqual(['Lead with the ledger.']);

    // The article written after it is fact-checked: the history holds nothing to skip on.
    const judge = jest.fn(async () => clone(CLEAN));
    const article = await evaluateArticle(
      { ...back.values, contentBundle: clone(PREVIOUS_BUNDLE), articleApproved: null },
      { configurable: { sdkClient: judge, theme: 'journalist' } }
    );
    expect(article.evaluationHistory).toMatchObject({ phase: 'article' });
    expect(article.evaluationHistory.skippedReason).toBeUndefined();
  });

  it('an old-shape thread at the character-IDs stop is told to go back to the meeting; going back writes a fresh weave and its fact check', async () => {
    const sdk = scriptedSdk({ verdicts: [CLEAN] });
    const { graph, thread } = threadFor(sdk);
    // A thread from before the story meeting: arcs selected, no weave, paused before the
    // character-IDs stop.
    // Brief 4.6: nor its approval, which came with the meeting.
    const { weave: _none, meetingApproved: _approved, ...old } = reworkFixtureState('journalist');
    await graph.updateState(thread, { ...old, sessionId: '100326', evaluationHistory: [{ phase: 'arcs', ready: true }], characterIdMappings: null }, 'detectWhiteboard');
    await expect(run(graph, thread, null)).rejects.toThrow(/Reached with no weave: this thread was started before the story meeting existed\. Roll back to the story meeting \(arc-selection\)/);
    expect(sdk.calls).toEqual([]);

    await graph.updateState(thread, { ...buildRollbackState('arc-selection'), ...rollbackNotesUpdate('arc-selection', []) }, 'surfaceContradictions');
    await run(graph, thread, null);
    const meeting = await stopOf(graph, thread);
    expect(meeting.type).toBe(CHECKPOINT_TYPES.ARC_SELECTION);
    expect(sdk.calls).toEqual(['weave writer', 'fact check']);
    expect(weaveForPrompt(meeting.values.weave)).toEqual(meeting.values._weaveBaseline);
    expect(meeting.values.weave._factCheck).toMatchObject({ ready: true, fixes: 0 });
  });

  it('a reweave that times out does not run: the meeting reopens with the director\'s version, and says so', async () => {
    const sdk = scriptedSdk({ reworks: [TIMEOUT], verdicts: [CLEAN] });
    const { graph, thread, snapshot } = await toMeeting(sdk);
    const left = leftBy(snapshot.values.weave);
    await act(graph, thread, { meeting: 'reweave', weave: left, note: 'Join the ledger thread to the vote.' });

    const reopened = await stopOf(graph, thread);
    expect(reopened.type).toBe(CHECKPOINT_TYPES.ARC_SELECTION);
    expect(sdk.calls).toEqual(['fact check', 'Arc revision 0']);
    expect(weaveForPrompt(reopened.values.weave)).toEqual(left);
    expect(reopened.data.roundDidNotRun).toMatchObject({ round: 'reweave', note: 'Join the ledger thread to the vote.' });
    expect(reopened.data.humanRevisionCount).toBe(0);
    expect(reopened.data.marks).toBeNull();
  });

  // Fix round 1, finding 2: the fact check's fix adds a thread under a taken id; no check
  // rework follows a fix, so the meeting opens with the check failing. Every action still
  // works: a send-back that carries only a note goes through, and its rework fixes it.
  it("a repeated id the fact check's fix made leaves the meeting's actions working: a send-back with only a note goes through, and its rework fixes it", async () => {
    const doubled = (weave) => ({
      ...weaveForPrompt(clone(weave)),
      threads: [...weave.threads, { id: 't2', claim: 'A second money thread the fix put under a taken id.', role: 'grounds-it', receipt: 'ledger' }]
    });
    const { graph, thread } = await toMeeting(scriptedSdk({ reworks: [doubled(writersWeave())], verdicts: [BREACH] }));
    const meeting = await stopOf(graph, thread);
    expect(meeting.type).toBe(CHECKPOINT_TYPES.ARC_SELECTION);
    expect(meeting.data.checkFailures.map((f) => f.type)).toEqual(['duplicate-id']);
    expect(meeting.data.weave.threads.filter((t) => t.id === 't2')).toHaveLength(2);

    const scripted = scriptedSdk({ reworks: [writersWeave()], verdicts: [CLEAN] });
    thread.configurable.sdkClient = scripted;
    await act(graph, thread, { meeting: 'send-back', note: 'Give the second money thread an id of its own.' });
    const reopened = await stopOf(graph, thread);
    expect(reopened.type).toBe(CHECKPOINT_TYPES.ARC_SELECTION);
    expect(scripted.calls).toEqual(['Arc revision 0', 'fact check']);
    expect(reopened.data.checkFailures).toEqual([]);
    expect(reopened.data.weave.threads.filter((t) => t.id === 't2')).toHaveLength(1);
  });

  it("an automatic pass that times out after a director's round is retried free, and the round's count stays (ruling 5)", async () => {
    const fixed = (weave) => ({ ...weaveForPrompt(clone(weave)), threads: weave.threads.map((t) => (t.id === 't3' ? { ...t, claim: 'Morgan paid Riley at the bar.' } : t)) });
    const { graph, thread, snapshot } = await toMeeting(scriptedSdk({ verdicts: [CLEAN] }));
    const sent = weaveForPrompt(clone(snapshot.values.weave));
    const scripted = scriptedSdk({ reworks: [sent, TIMEOUT, fixed(sent)], verdicts: [BREACH] });
    thread.configurable.sdkClient = scripted;
    await act(graph, thread, { meeting: 'send-back', note: 'Rethink the money thread.' });

    const reopened = await stopOf(graph, thread);
    expect(reopened.type).toBe(CHECKPOINT_TYPES.ARC_SELECTION);
    expect(scripted.calls).toEqual(['Arc revision 0', 'fact check', 'Arc revision 1', 'Arc revision 1']);
    expect(reopened.values).toMatchObject({ humanArcRevisionCount: 1, arcRevisionCount: 1 });
    expect(reopened.values.weave._factCheck).toMatchObject({ ready: false, fixes: 1 });
    expect(reopened.values._arcReworkTimeout).toBeNull();
    expect(reopened.data.roundDidNotRun).toBeNull();
  });
});

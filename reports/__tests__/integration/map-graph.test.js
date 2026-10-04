process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
/**
 * The story map through the REAL compiled graph (phase 4, brief 4.6; spec 5.2 to 5.4; R6,
 * R7, R9).
 *
 * Each run seeds a thread past the story meeting and the photo branch
 * (`updateState(..., 'finalizePhotoAnalyses')`), and the real map writer, checks, routing,
 * stop, payload builder, increment and rework run. The director acts through the server's
 * own functions, as the console's request would: getCheckpointData shows the stop, and
 * buildResumePayload turns the director's action into the resume and the update. The model
 * calls go to a scripted stand-in: the map writer by its schema, its reworks by their
 * labels, the article writer and its reworks by theirs, the article judge last. The
 * checkpointer is a SqliteSaver on a temp file, as the server runs on, so a channel the map
 * writes and no Annotation declares would be dropped here.
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
const { getCheckpointData, buildResumePayload } = require('../../server.js');
const { CHECKPOINT_TYPES } = require('../../lib/workflow/checkpoint-helpers');
const { buildRollbackState, rollbackNotesUpdate } = require('../../lib/api-helpers');
const { mapKey } = require('../../lib/map');
const { reworkFixtureState, MAP, PREVIOUS_BUNDLE } = require('../../lib/__tests__/fixtures/rework-state');

const clone = (v) => JSON.parse(JSON.stringify(v));

const CLEAN = { ready: true, structuralPassed: true, overallScore: 1, criteriaScores: {}, structuralIssues: [], advisoryWarnings: [], confidence: 'high' };
const RILEYS_LINE = 'Riley: "I kept the books, and the second ledger"';

/** The fixture's map with Riley in no beat: the check fails on the writer's text. */
function withoutRiley() {
  const map = clone(MAP);
  map.sections[1].beats[1].players = ['Morgan'];
  map.sections[3].beats[0].players = [];
  return map;
}

/**
 * A scripted SDK: the map writer by its schema, each of the map's reworks by its label (the
 * next scripted map), the article writer and its reworks by the bundle's schema, and every
 * other call (the article judge) a clean verdict.
 */
function scriptedSdk({ writer = clone(MAP), reworks = [] } = {}) {
  const calls = [];
  const prompts = [];
  let reworkIndex = 0;
  const sdk = async (options) => {
    const label = options.label || '';
    const schemaId = options.jsonSchema && options.jsonSchema.$id;
    if (/^Map revision/.test(label)) {
      calls.push(label);
      prompts.push(options.prompt);
      const answer = reworks[Math.min(reworkIndex, reworks.length - 1)];
      reworkIndex += 1;
      return clone(typeof answer === 'function' ? answer(options) : answer);
    }
    if (schemaId === 'outline') {
      calls.push('map writer');
      prompts.push(options.prompt);
      return clone(writer);
    }
    if (schemaId === 'content-bundle') {
      calls.push(label || 'article writer');
      return clone(PREVIOUS_BUNDLE);
    }
    calls.push('article judge');
    return clone(CLEAN);
  };
  sdk.calls = calls;
  sdk.prompts = prompts;
  return sdk;
}

describe('the story map through the real graph (phase 4, brief 4.6)', () => {
  let dir;
  let saver;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-map-'));
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
        thread_id: 'map-test', sessionId: '100326', theme: 'journalist',
        sdkClient: sdk, promptBuilder: mocks.createMockPromptBuilder(), dataDir: dir
      }
    };
    return { graph, thread };
  }

  /** The thread past the meeting and the photo branch, run to the map's stop. */
  async function toMap(sdk) {
    const { graph, thread } = threadFor(sdk);
    const { outline: _o, _mapBaseline: _b, ...state } = reworkFixtureState('journalist');
    await graph.updateState(thread, { ...state, sessionId: '100326', evaluationHistory: [] }, 'finalizePhotoAnalyses');
    await run(graph, thread, null);
    return { graph, thread };
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

  /** Going back to the map (R9), as the server's rollback handler builds the update. */
  async function backToMap(graph, thread) {
    const { values } = await graph.getState(thread);
    await graph.updateState(thread, { ...buildRollbackState('outline'), ...rollbackNotesUpdate('outline', values.directorGateNotes) }, 'finalizePhotoAnalyses');
    await run(graph, thread, null);
    return stopOf(graph, thread);
  }

  it("the writer's map passes its checks: the stop opens with the map, and the hero is its top photo", async () => {
    const sdk = scriptedSdk();
    const { graph, thread } = await toMap(sdk);
    const stop = await stopOf(graph, thread);
    expect(stop.type).toBe(CHECKPOINT_TYPES.OUTLINE);
    expect(sdk.calls).toEqual(['map writer']);
    expect(sdk.prompts[0]).toContain('Lay out the map from the settled weave');

    expect(stop.values.outline).toEqual(MAP);
    expect(stop.values._mapBaseline).toEqual(MAP);
    expect(stop.values.heroImage).toBe('hero.jpg');
    expect(stop.values._mapCheck).toMatchObject({ mapKey: mapKey(MAP), passed: true, failures: [], concerns: [] });
    expect(stop.values.validationResults).toMatchObject({ phase: 'outline', source: 'map-checks', passed: true });
    expect(stop.data.checkFailures).toEqual([]);
    expect(stop.data.tally).toMatchObject({ unplaced: [], cards: 3, photos: { placed: 2, of: 2 } });
    expect(stop.data.trace).toEqual([]);
    expect(stop.values.evaluationHistory).toEqual([]);
  });

  it("a failed check sends the map back once, under the check's lines; the trace marks the pass as the check's", async () => {
    const sdk = scriptedSdk({ writer: withoutRiley(), reworks: [clone(MAP)] });
    const { graph, thread } = await toMap(sdk);
    const stop = await stopOf(graph, thread);
    expect(stop.type).toBe(CHECKPOINT_TYPES.OUTLINE);
    expect(sdk.calls).toEqual(['map writer', 'Map revision 1']);
    expect(sdk.prompts[1]).toContain('REVISION CONTEXT: MAP (automated pass 1)');
    expect(sdk.prompts[1]).toContain("MAP CHECK FAILURES:\n  - Players in no beat: Riley. Place each in a section's beat, or name them among gapNote's players");

    expect(stop.values.outline).toEqual(MAP);
    expect(stop.values._mapCheck).toMatchObject({ mapKey: mapKey(MAP), passed: true });
    expect(stop.data.checkFailures).toEqual([]);
    expect(stop.data).toMatchObject({ revisionCount: 1, humanRevisionCount: 0, maxRevisions: 1 });
    expect(stop.data.trace).toEqual([expect.objectContaining({ pass: 1, trigger: 'check' })]);
    expect(stop.data.trace[0].findings.structuralIssues).toEqual([expect.stringContaining('Players in no beat: Riley.')]);
  });

  it('a check still failing after its rework opens the stop with its line, and a replay runs no rework again', async () => {
    const sdk = scriptedSdk({ writer: withoutRiley(), reworks: [withoutRiley()] });
    const { graph, thread } = await toMap(sdk);
    const stop = await stopOf(graph, thread);
    expect(stop.type).toBe(CHECKPOINT_TYPES.OUTLINE);
    expect(sdk.calls).toEqual(['map writer', 'Map revision 1']);
    expect(stop.data.checkFailures).toEqual([expect.objectContaining({ type: 'player-not-placed', message: expect.stringContaining('Players in no beat: Riley.') })]);
    expect(stop.data.tally.unplaced).toEqual(['Riley']);

    // A replay passes the map's nodes again: the writer skips on the map, the checks on
    // their mark, and the route sends the marked map to the stop.
    await graph.updateState(thread, {}, 'finalizePhotoAnalyses');
    await run(graph, thread, null);
    const again = await stopOf(graph, thread);
    expect(again.type).toBe(CHECKPOINT_TYPES.OUTLINE);
    expect(sdk.calls).toEqual(['map writer', 'Map revision 1']);
    expect(again.data.checkFailures).toEqual(stop.data.checkFailures);
  });

  it("an automatic pass after the director's send-back puts back their line and strikes their beat again, each recorded", async () => {
    const sdk = scriptedSdk();
    const { graph, thread } = await toMap(sdk);

    // The director rewrites Riley's line, strikes the paternity beat, and sends the map back.
    const left = clone(MAP);
    left.sections[3].beats[0].material = RILEYS_LINE;
    left.leftOut.push(left.sections[1].beats.splice(2, 1)[0]);
    // The send-back's rework keeps the director's edits and drops the lede's connection; the
    // check's rework lands it again, and also puts back the old line and the struck beat.
    const sentBack = clone(left);
    delete sentBack.sections[0].beats[0].connection;
    const checkRework = clone(MAP);
    sdk.calls.length = 0;
    sdk.prompts.length = 0;
    thread.configurable.sdkClient = scriptedSdk({ reworks: [sentBack, checkRework] });
    await act(graph, thread, { outline: 'send-back', map: left, note: 'Lead with the vote, and keep my strike.' });

    const reopened = await stopOf(graph, thread);
    const scripted = thread.configurable.sdkClient;
    expect(reopened.type).toBe(CHECKPOINT_TYPES.OUTLINE);
    expect(scripted.calls).toEqual(['Map revision 0', 'Map revision 1']);
    expect(scripted.prompts[0]).toContain("REVISION CONTEXT: MAP (round 2: the director's send back)");
    expect(scripted.prompts[1]).toContain('MAP CHECK FAILURES:');
    expect(scripted.prompts[1]).toContain('This automatic pass fixes the writer\'s lines.');

    const { outline } = reopened.values;
    expect(outline.sections[3].beats[0].material).toBe(RILEYS_LINE);
    expect(outline.sections[1].beats.map((b) => b.id)).toEqual(['b2', 'b3']);
    expect(outline.leftOut.map((b) => b.id)).toEqual(['b9', 'b4']);
    expect(outline.sections[0].beats[0].connection).toBe('c1');

    // The report records each restore, from the automatic pass.
    const restored = reopened.data.handEditReport.changed.filter((c) => c.restored);
    expect(restored.map((c) => [c.where, c.automatic, c.pass])).toEqual(expect.arrayContaining([
      ['section "closing", beat "b6", material', true, 1],
      [expect.stringContaining('beat "b4"'), true, 1]
    ]));
    // The strike drops Sarah and a card: concerns on the director's edit, never a rework.
    expect(reopened.data.checkFailures).toEqual([]);
    expect(reopened.data.concerns.length).toBeGreaterThan(0);
    reopened.data.concerns.forEach((concern) => expect(concern.text).toMatch(/^Director's edit E\d+/));
    expect(reopened.data).toMatchObject({ humanRevisionCount: 1, revisionCount: 1 });
  });

  it('an automatic pass that copies the struck beat back into the story, leaving it in leftOut, has it struck again: the stop opens with the beat once and no failure (fix round 1)', async () => {
    const sdk = scriptedSdk();
    const { graph, thread } = await toMap(sdk);

    // The director strikes the paternity beat and sends the map back. The send-back's
    // rework drops the lede's connection, so the check fails on the writer's text; the
    // check's rework, the round's last, lands it again and copies the struck beat back into
    // the story while leaving it in leftOut.
    const left = clone(MAP);
    left.leftOut.push(left.sections[1].beats.splice(2, 1)[0]);
    const sentBack = clone(left);
    delete sentBack.sections[0].beats[0].connection;
    const checkRework = clone(left);
    checkRework.sections[1].beats.push(clone(MAP.sections[1].beats[2]));
    thread.configurable.sdkClient = scriptedSdk({ reworks: [sentBack, checkRework] });
    await act(graph, thread, { outline: 'send-back', map: left, note: 'Keep my strike.' });

    const reopened = await stopOf(graph, thread);
    expect(reopened.type).toBe(CHECKPOINT_TYPES.OUTLINE);
    expect(thread.configurable.sdkClient.calls).toEqual(['Map revision 0', 'Map revision 1']);
    const { outline } = reopened.values;
    expect(outline.sections[1].beats.map((b) => b.id)).toEqual(['b2', 'b3']);
    expect(outline.leftOut.map((b) => b.id)).toEqual(['b9', 'b4']);
    expect(reopened.data.checkFailures).toEqual([]);
    expect(reopened.data.handEditReport.changed).toEqual([expect.objectContaining({
      id: 'E1', where: 'left out, beat "b4", struck from section "theStory"', struck: true,
      automatic: true, pass: 1, restored: true, became: 'section "theStory"'
    })]);
    // The strike's own effects (Sarah in no beat, two cards) are concerns on it, never a rework.
    expect(reopened.data.concerns.length).toBeGreaterThan(0);
    reopened.data.concerns.forEach((concern) => expect(concern.editIds).toEqual(['E1']));
  });

  it("going back to the map (R9): no call; the map as the director left it, its edits, their baseline, its hero and its check's mark kept", async () => {
    const sdk = scriptedSdk();
    const { graph, thread } = await toMap(sdk);

    // The director strikes a beat, moves the top photo and approves: the article is written.
    const left = clone(MAP);
    left.leftOut.push(left.sections[1].beats.splice(2, 1)[0]);
    left.topPhoto = 'p2.jpg';
    left.sections[1].photos = [{ filename: 'hero.jpg' }];
    await act(graph, thread, { outline: 'approve', map: left, note: 'Keep the strike.' });
    const approved = (await graph.getState(thread)).values;
    expect(approved.outlineApproved).toBe(true);
    expect(approved.heroImage).toBe('p2.jpg');
    expect(approved._outlineHandEdits.edits.length).toBeGreaterThan(0);
    expect(JSON.parse(fs.readFileSync(path.join(dir, '100326', 'analysis', 'map.approved.json'), 'utf8'))).toEqual(left);
    expect(sdk.calls).toContain('article writer');
    const calls = [...sdk.calls];

    const back = await backToMap(graph, thread);
    expect(back.type).toBe(CHECKPOINT_TYPES.OUTLINE);
    expect(sdk.calls).toEqual(calls);
    expect(back.values.outline).toEqual(left);
    expect(back.values._outlineHandEdits).toEqual(approved._outlineHandEdits);
    expect(back.values._mapBaseline).toEqual(approved._mapBaseline);
    expect(back.values._mapCheck).toEqual(approved._mapCheck);
    expect(back.values.heroImage).toBe('p2.jpg');
    expect(back.values.outlineApproved).not.toBe(true);
    expect(back.values.contentBundle).toBeNull();
    expect(back.values.directorGateNotes).toEqual([expect.objectContaining({ gate: 'outline', kind: 'approval', text: 'Keep the strike.' })]);
    // The check ran on the writer's map; the director's map is not checked, so nothing fails.
    expect(back.data.checkFailures).toEqual([]);
    expect(back.data.outline).toEqual(left);
  });

  it('going back to a map whose check still failed when it first opened shows the failure again, with no call', async () => {
    const sdk = scriptedSdk({ writer: withoutRiley(), reworks: [withoutRiley()] });
    const { graph, thread } = await toMap(sdk);
    const first = await stopOf(graph, thread);
    expect(first.data.checkFailures).toHaveLength(1);

    await act(graph, thread, { outline: 'approve', map: clone(first.values.outline) });
    expect((await graph.getState(thread)).values.outlineApproved).toBe(true);
    const calls = [...sdk.calls];

    const back = await backToMap(graph, thread);
    expect(back.type).toBe(CHECKPOINT_TYPES.OUTLINE);
    expect(sdk.calls).toEqual(calls);
    expect(back.data.checkFailures).toEqual(first.data.checkFailures);
    expect(back.values.outlineRevisionCount).toBe(1);
  });
});

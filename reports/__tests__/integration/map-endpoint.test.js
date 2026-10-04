process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
process.env.ACCESS_PASSWORD = 'test-password';
/**
 * The map reads as available at its stop (phase 4, brief 4.6b): GET /api/session/:id/outline
 * answers `available: true` while the map's stop is open, on every path to it: the first time
 * it opens, after a replay that reaches it, and after going back to it (R9).
 *
 * The route compares the thread's phase with its entry's (server.js RESOURCE_ENDPOINTS), so
 * the phase the map writer, its rework and the map checks stamp has to reach it on each path.
 * On a replay the writer skips on the map it wrote and the checks on the map they marked, so
 * each skip stamps its phase too.
 *
 * The real graph runs on a SqliteSaver over the server's own checkpoint file
 * (CHECKPOINT_DB_PATH, a temp file the Jest setup gives every suite), and the real route reads
 * the thread back, logged in. The model calls go to a scripted stand-in: the map writer by its
 * schema, the article writer by the bundle's, the article judge last. Invented text: the repo
 * is public.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { Command } = require('@langchain/langgraph');
const { SqliteSaver } = require('@langchain/langgraph-checkpoint-sqlite');

const { createReportGraphWithCheckpointer, RECURSION_LIMIT } = require('../../lib/workflow/graph');
const { mocks } = require('../../lib/workflow/nodes');
const { app, buildResumePayload, CHECKPOINT_DB_PATH } = require('../../server.js');
const { CHECKPOINT_TYPES } = require('../../lib/workflow/checkpoint-helpers');
const { buildRollbackState, rollbackNotesUpdate } = require('../../lib/api-helpers');
const { PHASES } = require('../../lib/workflow/state');
const { reworkFixtureState, MAP, PREVIOUS_BUNDLE } = require('../../lib/__tests__/fixtures/rework-state');

const clone = (v) => JSON.parse(JSON.stringify(v));
const CLEAN = { ready: true, structuralPassed: true, overallScore: 1, criteriaScores: {}, structuralIssues: [], advisoryWarnings: [], confidence: 'high' };

/** A scripted SDK: the map writer by its schema, the article writer by the bundle's, the judge last. */
function scriptedSdk() {
  const calls = [];
  const sdk = async (options) => {
    const schemaId = options.jsonSchema && options.jsonSchema.$id;
    if (schemaId === 'outline') { calls.push('map writer'); return clone(MAP); }
    if (schemaId === 'content-bundle') { calls.push('article writer'); return clone(PREVIOUS_BUNDLE); }
    calls.push('article judge');
    return clone(CLEAN);
  };
  sdk.calls = calls;
  return sdk;
}

let server;
let cookie;
let saver;
let dataDir;

function send(method, urlPath, body) {
  const payload = body === undefined ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const headers = {};
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    if (cookie) headers.Cookie = cookie;
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: urlPath, method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch { parsed = data; }
        resolve({ status: res.statusCode, body: parsed, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

beforeAll(async () => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  saver = SqliteSaver.fromConnString(CHECKPOINT_DB_PATH);
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-map-endpoint-'));
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const login = await send('POST', '/api/auth/login', { password: 'test-password' });
  expect(login.status).toBe(200);
  cookie = login.headers['set-cookie'][0].split(';')[0];
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  saver.db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
  jest.restoreAllMocks();
});

describe('4.6b: the map reads as available at its stop', () => {
  const run = (graph, thread, input) => graph.invoke(input, { ...thread, recursionLimit: RECURSION_LIMIT, durability: 'sync' });

  /** A thread past the meeting and the photo branch, run to the map's stop; its id is the session's. */
  async function toMap(sessionId) {
    const sdk = scriptedSdk();
    const graph = createReportGraphWithCheckpointer(saver);
    const thread = {
      configurable: {
        thread_id: sessionId, sessionId, theme: 'journalist',
        sdkClient: sdk, promptBuilder: mocks.createMockPromptBuilder(), dataDir
      }
    };
    const { outline: _o, _mapBaseline: _b, ...state } = reworkFixtureState('journalist');
    await graph.updateState(thread, { ...state, sessionId, evaluationHistory: [] }, 'finalizePhotoAnalyses');
    await run(graph, thread, null);
    return { graph, thread, sdk };
  }

  /** The stop the thread is paused at, and what the route answers for the map. */
  async function atStop(graph, thread) {
    const snapshot = await graph.getState(thread);
    const res = await send('GET', `/api/session/${thread.configurable.thread_id}/outline`);
    expect(res.status).toBe(200);
    return { type: snapshot.tasks[0].interrupts[0].value.type, phase: snapshot.values.currentPhase, res };
  }

  it('the first time the stop opens: available, with the map', async () => {
    const { graph, thread, sdk } = await toMap('1003261');
    const stop = await atStop(graph, thread);
    expect(stop.type).toBe(CHECKPOINT_TYPES.OUTLINE);
    expect(sdk.calls).toEqual(['map writer']);
    expect(stop.phase).toBe(PHASES.MAP_CHECKS);
    expect(stop.res.body).toEqual({ sessionId: '1003261', available: true, outline: MAP });
  });

  it('a replay that reaches the stop: available, with no call', async () => {
    const { graph, thread, sdk } = await toMap('1003262');
    await graph.updateState(thread, {}, 'finalizePhotoAnalyses');
    await run(graph, thread, null);
    const stop = await atStop(graph, thread);
    expect(stop.type).toBe(CHECKPOINT_TYPES.OUTLINE);
    expect(sdk.calls).toEqual(['map writer']);
    expect(stop.res.body).toMatchObject({ available: true, outline: MAP });
    expect(stop.phase).toBe(PHASES.MAP_CHECKS);
  });

  it("going back to the map (R9): available, with the map as the director left it, and no call", async () => {
    const { graph, thread, sdk } = await toMap('1003263');
    const left = clone(MAP);
    left.leftOut.push(left.sections[1].beats.splice(2, 1)[0]);
    const snapshot = await graph.getState(thread);
    const { resume, stateUpdates, error } = buildResumePayload({ outline: 'approve', map: left }, snapshot.values, 'journalist', CHECKPOINT_TYPES.OUTLINE);
    expect(error).toBeNull();
    await run(graph, thread, new Command({ resume, update: stateUpdates }));
    expect(sdk.calls).toContain('article writer');
    const calls = [...sdk.calls];

    const { values } = await graph.getState(thread);
    await graph.updateState(thread, { ...buildRollbackState('outline'), ...rollbackNotesUpdate('outline', values.directorGateNotes) }, 'finalizePhotoAnalyses');
    await run(graph, thread, null);
    const stop = await atStop(graph, thread);
    expect(stop.type).toBe(CHECKPOINT_TYPES.OUTLINE);
    expect(sdk.calls).toEqual(calls);
    expect(stop.res.body).toMatchObject({ available: true, outline: left });
    expect(stop.phase).toBe(PHASES.MAP_CHECKS);
  });
});

describe("4.6b: the phase each of the map's nodes stamps, which the map's endpoint reads", () => {
  const { RESOURCE_ENDPOINTS } = require('../../server.js');
  const { generateOutline, reviseOutline } = require('../../lib/workflow/nodes/ai-nodes');
  const { _testing: { checkMap } } = require('../../lib/workflow/nodes/map-nodes');
  const outlineEndpoint = RESOURCE_ENDPOINTS.find((endpoint) => endpoint.path === 'outline');
  const config = (sdk) => ({ configurable: { sdkClient: sdk, theme: 'journalist' } });
  const noCall = async () => { throw new Error('no model call on a replay'); };

  it("the endpoint asks for the map writer's phase", () => {
    expect(outlineEndpoint.minPhase).toBe(parseFloat(PHASES.OUTLINE_GENERATION));
  });

  it("the map writer and its rework stamp the map writer's phase, on a replay too", async () => {
    const state = reworkFixtureState('journalist');
    expect((await generateOutline({ ...state, outline: null }, config(async () => clone(MAP)))).currentPhase).toBe(PHASES.OUTLINE_GENERATION);
    expect(await generateOutline(state, config(noCall))).toEqual({ currentPhase: PHASES.OUTLINE_GENERATION });
    const rework = await reviseOutline({ ...state, outline: null, _previousOutline: clone(MAP), outlineRevisionCount: 1 }, config(async () => clone(MAP)));
    expect(rework.currentPhase).toBe(PHASES.OUTLINE_GENERATION);
  });

  it('the checks stamp their phase, running and skipping the map they marked; an approved map or an error stamps nothing', () => {
    const state = reworkFixtureState('journalist');
    const checked = checkMap({ ...state, _mapCheck: null });
    expect(checked.currentPhase).toBe(PHASES.MAP_CHECKS);
    expect(checkMap({ ...state, _mapCheck: checked._mapCheck })).toEqual({ currentPhase: PHASES.MAP_CHECKS });
    expect(checkMap({ ...state, _mapCheck: checked._mapCheck, outlineApproved: true })).toEqual({});
    expect(checkMap({ ...state, currentPhase: PHASES.ERROR })).toEqual({});
    [PHASES.OUTLINE_GENERATION, PHASES.MAP_CHECKS].forEach((phase) => expect(parseFloat(phase)).toBeGreaterThanOrEqual(outlineEndpoint.minPhase));
  });
});

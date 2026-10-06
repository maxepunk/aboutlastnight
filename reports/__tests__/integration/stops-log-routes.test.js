/**
 * 4.12a: the server writes the stops log (phase 4, brief 4.12a; R8; spec section 13).
 *
 * Each time a run pauses at a new stop, or at a new round of one, `data/<id>/stops.jsonl` gets a
 * line with the stop, the round and the words the stop shows; each action the director takes
 * gets a line with its stop and round. /start writes its first pause, the background runner
 * writes the pause a run of /approve, /resume or /rollback ends at, and /approve writes the
 * action before its run starts. A replay or a reopening that arrives where the director already
 * is writes nothing, and neither does a refused request or a read.
 *
 * Boots the actual `app` exported by server.js, as old-thread-guard.test.js does, with the
 * LangGraph module mocked: each graph is a list of the states its runs end at. The stops log's
 * root is a temp folder. lib/__tests__/stops-log.test.js holds the log's rules, and
 * stops-log-graph.test.js runs the real graph through the meeting, the map and the desk.
 */
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
process.env.ACCESS_PASSWORD = 'test-password';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

let mockGraph = null;

jest.mock('../../lib/workflow/graph', () => ({
  createReportGraphWithCheckpointer: () => mockGraph,
  RECURSION_LIMIT: 100
}));

const { app } = require('../../server.js');
const { _resetLocks } = require('../../lib/session-locks');
const { _resetOutcomeStore } = require('../../lib/session-outcome');
const stopsLog = require('../../lib/stops-log');
const { wordsShown } = require('../../lib/stop-pages');
const View = require('../../console/checkpoint-view-logic');
const { reworkFixtureState } = require('../../lib/__tests__/fixtures/rework-state');

const SESSION = '100326';

let server;
let cookie;
let dir;

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

/** Let the runner's setImmediate background task run to completion. */
function flushBackground() {
  return new Promise((resolve) => setImmediate(() => setImmediate(() => setImmediate(resolve))));
}

/** A graph state paused at `stop`, holding `values`, its interrupt carrying `payload`. */
const pausedAt = (stop, values, payload = {}) => ({
  values: { currentPhase: stop, ...values },
  config: { configurable: { checkpoint_id: 'ckpt' } },
  createdAt: 'now',
  tasks: [{ id: 't1', interrupts: [{ value: { type: stop, ...payload } }] }]
});

/**
 * A graph whose thread stands at `states[0]`, and each run (invoke) moves it to the next state.
 * An empty first state is a thread that does not exist yet.
 */
function graphOf(states) {
  let at = 0;
  return {
    getState: jest.fn(async () => states[at]),
    invoke: jest.fn(async () => {
      at = Math.min(at + 1, states.length - 1);
      return states[at].values;
    })
  };
}

const meetingValues = (extra = {}) => ({ ...reworkFixtureState('journalist'), sessionId: SESSION, meetingApproved: null, ...extra });
const atMeeting = (extra) => pausedAt('arc-selection', meetingValues(extra), { weave: meetingValues(extra).weave });
const atPhotos = () => pausedAt('photos', { ...meetingValues(), meetingApproved: true }, { defaultDir: 'data/100326/photos', found: 0 });
const atMap = (extra = {}) => pausedAt('outline', { ...reworkFixtureState('journalist'), sessionId: SESSION, ...extra }, { outline: reworkFixtureState('journalist').outline });

const linesOf = () => {
  const file = path.join(dir, SESSION, 'stops.jsonl');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)) : [];
};
const summary = () => linesOf().map((line) => (line.kind === 'pause' ? ['pause', line.stop, line.round] : ['action', line.stop, line.round, line.action]));

/** What GET /checkpoint delivers for the thread as it stands: the stop's payload, as the harness reads it. */
async function checkpointPayload() {
  const res = await send('GET', `/api/session/${SESSION}/checkpoint`);
  expect(res.status).toBe(200);
  return res.body.checkpoint;
}

beforeAll(async () => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const login = await send('POST', '/api/auth/login', { password: 'test-password' });
  expect(login.status).toBe(200);
  cookie = login.headers['set-cookie'][0].split(';')[0];
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  jest.restoreAllMocks();
});

beforeEach(() => {
  _resetLocks();
  _resetOutcomeStore();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-stops-routes-'));
  stopsLog.setStopsLogRoot(dir);
  mockGraph = null;
});

afterEach(() => {
  stopsLog._resetForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('4.12a: /start writes the run\'s first pause', () => {
  it('writes a pause line for the stop the fresh run reaches', async () => {
    mockGraph = graphOf([{ values: {}, tasks: [] }, pausedAt('paper-evidence-selection', { sessionId: SESSION }, {})]);
    const res = await send('POST', `/api/session/${SESSION}/start`, { theme: 'journalist', rawSessionInput: {} });
    expect(res.status).toBe(200);
    expect(summary()).toEqual([['pause', 'paper-evidence-selection', 1]]);
    expect(linesOf()[0].words).toBeNull();
  });

  it('writes it even when the log\'s last line is that same pause, from the run the start replaced', async () => {
    mockGraph = graphOf([{ values: {}, tasks: [] }, pausedAt('paper-evidence-selection', { sessionId: SESSION }, {})]);
    await send('POST', `/api/session/${SESSION}/start`, { theme: 'journalist', rawSessionInput: {} });
    mockGraph = graphOf([{ values: { currentPhase: 'paper-evidence-selection' }, tasks: [] }, pausedAt('paper-evidence-selection', { sessionId: SESSION }, {})]);
    await send('POST', `/api/session/${SESSION}/start`, { theme: 'journalist', rawSessionInput: {}, force: true });
    expect(summary()).toEqual([['pause', 'paper-evidence-selection', 1], ['pause', 'paper-evidence-selection', 1]]);
  });
});

describe('4.12a: /approve writes the director\'s action, then the pause its run ends at', () => {
  it('approving the story meeting writes the action in its round, then the next stop\'s pause', async () => {
    mockGraph = graphOf([atMeeting(), atPhotos()]);
    const data = await checkpointPayload();
    const res = await send('POST', `/api/session/${SESSION}/approve`, View.meetingPayload('approve', data, View.meetingDraftOf(data), ''));
    expect(res.status).toBe(200);
    await flushBackground();
    expect(summary()).toEqual([['action', 'arc-selection', 1, 'approve'], ['pause', 'photos', 1]]);
  });

  it('a reweave is an action, and the meeting it reopens in a new round is a new pause, with the words it shows', async () => {
    const round2 = atMeeting({ humanArcRevisionCount: 1 });
    mockGraph = graphOf([atMeeting(), round2]);
    const data = await checkpointPayload();
    await send('POST', `/api/session/${SESSION}/approve`, View.meetingPayload('reweave', data, View.meetingDraftOf(data), 'Lead with the money.'));
    await flushBackground();
    expect(summary()).toEqual([['action', 'arc-selection', 1, 'reweave'], ['pause', 'arc-selection', 2]]);
    const reopened = await checkpointPayload();
    expect(linesOf()[1].words).toBe(wordsShown('arc-selection', reopened));
    expect(linesOf()[1].words).toBeGreaterThan(0);
  });

  it('a send-back at the map is an action in its round', async () => {
    mockGraph = graphOf([atMap(), atMap({ humanOutlineRevisionCount: 1 })]);
    const data = await checkpointPayload();
    await send('POST', `/api/session/${SESSION}/approve`, View.mapPayload('send-back', View.mapDraftOf(data), 'Move the vote earlier.'));
    await flushBackground();
    expect(summary()).toEqual([['action', 'outline', 1, 'send-back'], ['pause', 'outline', 2]]);
  });

  it('a refused request writes nothing, and nothing runs', async () => {
    mockGraph = graphOf([atMeeting(), atPhotos()]);
    const res = await send('POST', `/api/session/${SESSION}/approve`, { outline: true });
    expect(res.status).toBe(400);
    await flushBackground();
    expect(mockGraph.invoke).not.toHaveBeenCalled();
    expect(summary()).toEqual([]);
  });
});

describe('4.12a: a run that arrives where the director already is writes nothing', () => {
  it('/resume replaying to the stop of the log\'s last pause writes no line; to a new stop it writes one', async () => {
    mockGraph = graphOf([atMeeting(), atMeeting()]);
    await send('POST', `/api/session/${SESSION}/resume`, {});
    await flushBackground();
    expect(summary()).toEqual([['pause', 'arc-selection', 1]]);
    mockGraph = graphOf([atMeeting(), atMeeting()]);
    await send('POST', `/api/session/${SESSION}/resume`, {});
    await flushBackground();
    expect(summary()).toEqual([['pause', 'arc-selection', 1]]);
  });

  it('a rollback that reopens the stop the director is at writes no line, and one that reaches another stop writes its pause', async () => {
    mockGraph = graphOf([atMap(), atMap()]);
    await send('POST', `/api/session/${SESSION}/resume`, {});
    await flushBackground();
    mockGraph = graphOf([atMap(), atMap()]);
    await send('POST', `/api/session/${SESSION}/rollback`, { rollbackTo: 'outline' });
    await flushBackground();
    expect(summary()).toEqual([['pause', 'outline', 1]]);
    mockGraph = graphOf([atMap(), atMeeting()]);
    await send('POST', `/api/session/${SESSION}/rollback`, { rollbackTo: 'arc-selection' });
    await flushBackground();
    expect(summary()).toEqual([['pause', 'outline', 1], ['pause', 'arc-selection', 1]]);
  });

  it('reading a stop writes nothing', async () => {
    mockGraph = graphOf([atMeeting()]);
    await checkpointPayload();
    await send('GET', `/api/session/${SESSION}/state`);
    expect(summary()).toEqual([]);
  });
});

// Task 4.12c (ruling 4 on 4.12a's minors): the readout tells a fresh start from a rollback to
// the first stop, and counts the article a rollback writes again as a return.
describe('4.12c: a fresh start\'s first pause is marked, and a stop a rollback rewrote is a new return', () => {
  const { _inFlight } = require('../../server.js');
  const { PREVIOUS_BUNDLE } = require('../../lib/__tests__/fixtures/rework-state');
  /** Every background run the server started, waited for to its end (the desk's payload renders its preview). */
  const settle = () => Promise.all([..._inFlight]);
  const atDesk = () => pausedAt('article', {
    ...reworkFixtureState('journalist'), sessionId: SESSION, contentBundle: JSON.parse(JSON.stringify(PREVIOUS_BUNDLE)), humanArticleRevisionCount: 0
  });

  it('/start writes its first pause with fresh: true, on a first start and on a forced one', async () => {
    mockGraph = graphOf([{ values: {}, tasks: [] }, pausedAt('paper-evidence-selection', { sessionId: SESSION }, {})]);
    await send('POST', `/api/session/${SESSION}/start`, { theme: 'journalist', rawSessionInput: {} });
    mockGraph = graphOf([{ values: { currentPhase: 'paper-evidence-selection' }, tasks: [] }, pausedAt('paper-evidence-selection', { sessionId: SESSION }, {})]);
    await send('POST', `/api/session/${SESSION}/start`, { theme: 'journalist', rawSessionInput: {}, force: true });
    expect(linesOf().map((line) => [line.stop, line.fresh])).toEqual([['paper-evidence-selection', true], ['paper-evidence-selection', true]]);
  });

  it('a rollback to the article at the desk in round 1 writes the new article\'s pause, in round 1 again', async () => {
    mockGraph = graphOf([atDesk(), atDesk()]);
    await send('POST', `/api/session/${SESSION}/resume`, {});
    await settle();
    mockGraph = graphOf([atDesk(), atDesk()]);
    const res = await send('POST', `/api/session/${SESSION}/rollback`, { rollbackTo: 'article' });
    expect(res.status).toBe(200);
    await settle();
    expect(summary()).toEqual([['pause', 'article', 1], ['pause', 'article', 1]]);
    expect(linesOf()[1].words).toBe(wordsShown('article', await checkpointPayload()));
    expect(linesOf().every((line) => !Object.prototype.hasOwnProperty.call(line, 'fresh'))).toBe(true);
  });

  // Fix round 3: the rollback's seed, not the point's list, says what it cleared. An old-shape
  // thread paused at the meeting in round 1 is rolled back to the meeting, whose seed writes the
  // weave fresh beyond the point's list (lib/old-thread.js oldThreadRollbackState). The fresh
  // meeting, in round 1 too, is a new return with its words, and the SSE names the weave's
  // channels among what the rollback cleared.
  it("an old-shape thread at the meeting in round 1, rolled back to the meeting: the fresh meeting's pause is a new line, and fieldsCleared names the weave", async () => {
    const { progressEmitter } = require('../../lib/observability');
    const { ROLLBACK_CLEARS } = require('../../lib/workflow/state');
    const { OLD_SHAPES_WEAVE_CHANNELS } = require('../../lib/old-thread');
    const { oldShapeMeetingChannels } = require('../../lib/__tests__/fixtures/old-shapes');
    const emitted = jest.spyOn(progressEmitter, 'emitComplete');
    // The log's last line: the meeting in round 1, paused there before the story level landed.
    fs.mkdirSync(path.join(dir, SESSION), { recursive: true });
    fs.writeFileSync(path.join(dir, SESSION, 'stops.jsonl'), `${JSON.stringify({ at: 'then', kind: 'pause', stop: 'arc-selection', round: 1, words: 280 })}\n`);
    const old = pausedAt('arc-selection', { sessionId: SESSION, theme: 'journalist', ...oldShapeMeetingChannels(), humanArcRevisionCount: 0 }, { weave: oldShapeMeetingChannels().weave });
    mockGraph = graphOf([old, atMeeting()]);
    const res = await send('POST', `/api/session/${SESSION}/rollback`, { rollbackTo: 'arc-selection' });
    expect(res.status).toBe(200);
    await settle();
    // The seed cleared the weave, so the meeting the run reached is new.
    expect(mockGraph.invoke.mock.calls[0][0]).toMatchObject({ weave: null });
    expect(summary()).toEqual([['pause', 'arc-selection', 1], ['pause', 'arc-selection', 1]]);
    expect(linesOf()[1].words).toBe(wordsShown('arc-selection', await checkpointPayload()));
    const [, payload] = emitted.mock.calls.find(([id]) => id === SESSION);
    expect(payload.rolledBackTo).toBe('arc-selection');
    expect([...payload.fieldsCleared].sort()).toEqual([...ROLLBACK_CLEARS['arc-selection'], ...OLD_SHAPES_WEAVE_CHANNELS].sort());
    emitted.mockRestore();
  });
});

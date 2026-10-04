/**
 * Threads from before the story meeting, refused on the real Express app (phase 4,
 * task 4.11; R2).
 *
 * A thread started before phase 4 holds no weave. Paused at the story meeting's stop or
 * any stop after it (the photos, the character IDs, the map, the article), complete, or at
 * no stop holding an outline or an article (fix round 1), it is refused on /approve,
 * /resume and every /rollback past the meeting, with one message, and GET /checkpoint
 * flags it, so the console shows the message and the rollback before any stop renders. A
 * rollback to the meeting, or to a point before it, proceeds. A thread with a weave, a
 * thread paused before the meeting, and one at no stop that holds neither are not touched.
 *
 * Boots the actual `app` exported by server.js, as session-id-and-resume-guard does, with
 * the LangGraph module mocked: a refusal returns before any invoke, so `invoke` not being
 * called is the proof nothing ran. lib/__tests__/old-thread.test.js holds the rule;
 * old-thread-graph.test.js runs a refused thread and its rollback through the real graph.
 */
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
process.env.ACCESS_PASSWORD = 'test-password';

const http = require('http');

let mockGraph = null;

jest.mock('../../lib/workflow/graph', () => ({
  createReportGraphWithCheckpointer: () => mockGraph,
  RECURSION_LIMIT: 100
}));

const { app } = require('../../server.js');
const { _resetLocks } = require('../../lib/session-locks');
const { _resetOutcomeStore } = require('../../lib/session-outcome');
const { reworkFixtureState } = require('../../lib/__tests__/fixtures/rework-state');

const MESSAGE = 'This session was started before the story meeting. Roll back to the story meeting to continue.';
const FLAG = {
  message: MESSAGE,
  rollbackTo: 'arc-selection',
  rollbackPoints: ['paper-evidence-selection', 'await-roster', 'await-full-context', 'input-review', 'pre-curation', 'evidence-and-photos', 'arc-selection']
};
const WEAVE = reworkFixtureState('journalist').weave;
/** The stops a thread from before the meeting can be paused at, and be refused. */
const OLD_STOPS = ['arc-selection', 'photos', 'character-ids', 'outline', 'article'];
/** The rollback points past the meeting, refused to an old thread. */
const PAST_THE_MEETING = ['photos', 'character-ids', 'outline', 'article'];
/** An old outline, in the shape the outline writer wrote before phase 4. */
const OLD_OUTLINE = { lede: { hook: 'An old hook.' }, theStory: { arcs: [] }, closing: { theme: 'An old close.' } };

let server;
let cookie;

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
  return new Promise((resolve) => setImmediate(() => setImmediate(resolve)));
}

/** A graph whose thread is paused at `stop`, holding `values`. */
function pausedAt(stop, values) {
  const state = { values, config: { configurable: { checkpoint_id: 'ckpt-1' } }, createdAt: 'now', tasks: [{ id: 't1', interrupts: [{ value: { type: stop } }] }] };
  return { getState: jest.fn().mockResolvedValue(state), invoke: jest.fn().mockResolvedValue(values) };
}

/** A graph whose thread is complete, holding `values`. */
function complete(values) {
  const state = { values: { ...values, currentPhase: 'complete' }, config: { configurable: { checkpoint_id: 'ckpt-1' } }, createdAt: 'now', tasks: [] };
  return { getState: jest.fn().mockResolvedValue(state), invoke: jest.fn().mockResolvedValue(state.values) };
}

/**
 * A graph whose thread sits at no stop, holding `values`: stopped on an error (no task left),
 * or killed mid-run (`pending`, a task with no interrupt).
 */
function atNoStop(values, pending = null) {
  const tasks = pending ? [{ id: 't1', name: pending, interrupts: [] }] : [];
  const state = { values, config: { configurable: { checkpoint_id: 'ckpt-1' } }, createdAt: 'now', tasks };
  return { getState: jest.fn().mockResolvedValue(state), invoke: jest.fn().mockResolvedValue(values) };
}

/** A thread from before phase 4: no weave, and the old outline once it is past the map. */
const oldValues = (extra = {}) => ({ currentPhase: '2.36', theme: 'journalist', outline: OLD_OUTLINE, arcRevisionCount: 2, humanArcRevisionCount: 1, ...extra });

const expectRefused = (res) => {
  expect(res.status).toBe(409);
  expect(res.body).toEqual({ sessionId: '092626', error: MESSAGE, oldThread: FLAG });
};

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
  mockGraph = null;
});

describe('4.11: an old thread paused at the meeting or after it is refused', () => {
  describe.each(OLD_STOPS)('paused at %s', (stop) => {
    it('/approve answers 409 with the message, and nothing runs', async () => {
      mockGraph = pausedAt(stop, oldValues());
      expectRefused(await send('POST', '/api/session/092626/approve', { photosPath: 'D:/shoots/0926' }));
      expect(mockGraph.invoke).not.toHaveBeenCalled();
    });

    it('/resume answers 409, with force too', async () => {
      mockGraph = pausedAt(stop, oldValues());
      expectRefused(await send('POST', '/api/session/092626/resume', {}));
      expectRefused(await send('POST', '/api/session/092626/resume', { force: true }));
      expect(mockGraph.invoke).not.toHaveBeenCalled();
    });

    it.each(PAST_THE_MEETING)('/rollback to %s answers 409', async (target) => {
      mockGraph = pausedAt(stop, oldValues());
      expectRefused(await send('POST', '/api/session/092626/rollback', { rollbackTo: target }));
      expect(mockGraph.invoke).not.toHaveBeenCalled();
    });

    it('/rollback to the story meeting proceeds, and the weave is written fresh with the arc counters started over', async () => {
      mockGraph = pausedAt(stop, oldValues());
      const res = await send('POST', '/api/session/092626/rollback', { rollbackTo: 'arc-selection' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('processing');
      await flushBackground();
      const seeded = mockGraph.invoke.mock.calls[0][0];
      expect(seeded.outline).toBeNull();
      expect(seeded.meetingApproved).toBeNull();
      expect(seeded.arcRevisionCount).toBe(0);
      expect(seeded.humanArcRevisionCount).toBe(0);
    });

    it('/rollback to a point before the meeting proceeds', async () => {
      mockGraph = pausedAt(stop, oldValues());
      const res = await send('POST', '/api/session/092626/rollback', { rollbackTo: 'evidence-and-photos' });
      expect(res.status).toBe(200);
      await flushBackground();
      expect(mockGraph.invoke).toHaveBeenCalledTimes(1);
    });

    it('GET /checkpoint flags it, and sends the stop as its type and the flag, not the old shapes', async () => {
      mockGraph = pausedAt(stop, oldValues());
      const res = await send('GET', '/api/session/092626/checkpoint');
      expect(res.status).toBe(200);
      expect(res.body.interrupted).toBe(true);
      expect(res.body.checkpointType).toBe(stop);
      expect(res.body.oldThread).toEqual(FLAG);
      expect(res.body.checkpoint).toEqual({ type: stop, oldThread: FLAG });
    });
  });
});

describe('4.11: an old thread that is complete is refused', () => {
  it('/approve, /resume (with force too) and /rollback past the meeting answer 409; nothing runs', async () => {
    mockGraph = complete(oldValues());
    expectRefused(await send('POST', '/api/session/092626/approve', { article: true }));
    expectRefused(await send('POST', '/api/session/092626/resume', {}));
    expectRefused(await send('POST', '/api/session/092626/resume', { force: true }));
    for (const target of PAST_THE_MEETING) {
      expectRefused(await send('POST', '/api/session/092626/rollback', { rollbackTo: target }));
    }
    expect(mockGraph.invoke).not.toHaveBeenCalled();
  });

  it('/rollback to the story meeting proceeds', async () => {
    mockGraph = complete(oldValues());
    const res = await send('POST', '/api/session/092626/rollback', { rollbackTo: 'arc-selection' });
    expect(res.status).toBe(200);
    await flushBackground();
    expect(mockGraph.invoke.mock.calls[0][0]).toMatchObject({ arcRevisionCount: 0, humanArcRevisionCount: 0, contentBundle: null });
  });

  it('GET /checkpoint flags it, with no checkpoint', async () => {
    mockGraph = complete(oldValues());
    const res = await send('GET', '/api/session/092626/checkpoint');
    expect(res.body.currentPhase).toBe('complete');
    expect(res.body.checkpoint).toBeNull();
    expect(res.body.oldThread).toEqual(FLAG);
  });
});

// Fix round 1, finding 1: a thread from before phase 4 that stopped on an error, or whose run
// was killed, after the old stages wrote its outline or article sits at no stop. Its resume
// replayed it onto the old outline after a fresh meeting, and /approve's error recovery sent
// it to a rollback to the article. Both are refused now, before either branch.
describe('4.11 fix round 1: an old thread at no stop that holds an outline or an article is refused', () => {
  /** Stopped on an error after its article was approved: the case /approve's recovery branch answers. */
  const errored = () => oldValues({ currentPhase: 'error', contentBundle: { headline: { main: 'An old headline' }, sections: [] }, articleApproved: true });

  it("/approve answers 409 with the message, not the recovery that pointed at a rollback to the article; nothing runs", async () => {
    mockGraph = atNoStop(errored());
    expectRefused(await send('POST', '/api/session/092626/approve', { article: true }));
    expect(mockGraph.invoke).not.toHaveBeenCalled();
  });

  it('/resume answers 409, with force too: stopped on an error, or killed mid-run', async () => {
    mockGraph = atNoStop(errored());
    expectRefused(await send('POST', '/api/session/092626/resume', {}));
    expectRefused(await send('POST', '/api/session/092626/resume', { force: true }));
    mockGraph = atNoStop(oldValues({ currentPhase: '4.1', outlineApproved: true }), 'generateContentBundle');
    expectRefused(await send('POST', '/api/session/092626/resume', {}));
    expect(mockGraph.invoke).not.toHaveBeenCalled();
  });

  it.each(PAST_THE_MEETING)('/rollback to %s answers 409', async (target) => {
    mockGraph = atNoStop(errored());
    expectRefused(await send('POST', '/api/session/092626/rollback', { rollbackTo: target }));
    expect(mockGraph.invoke).not.toHaveBeenCalled();
  });

  it('/rollback to the story meeting proceeds: the old outline and article are cleared, and the arc counters start over', async () => {
    mockGraph = atNoStop(errored());
    const res = await send('POST', '/api/session/092626/rollback', { rollbackTo: 'arc-selection' });
    expect(res.status).toBe(200);
    await flushBackground();
    expect(mockGraph.invoke.mock.calls[0][0]).toMatchObject({
      outline: null, contentBundle: null, articleApproved: null, arcRevisionCount: 0, humanArcRevisionCount: 0
    });
  });

  it('GET /checkpoint flags it, with no checkpoint', async () => {
    mockGraph = atNoStop(errored());
    const res = await send('GET', '/api/session/092626/checkpoint');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ interrupted: false, checkpointType: null, checkpoint: null, currentPhase: 'error' });
    expect(res.body.oldThread).toEqual(FLAG);
  });

  it('a thread at no stop that holds neither is resumed: its replay writes the weave and the map fresh', async () => {
    mockGraph = atNoStop(oldValues({ currentPhase: 'error', outline: null }));
    expect((await send('GET', '/api/session/092626/checkpoint')).body.oldThread).toBeNull();
    const res = await send('POST', '/api/session/092626/resume', {});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('processing');
    await flushBackground();
    expect(mockGraph.invoke).toHaveBeenCalledTimes(1);
  });
});

describe('4.11: the guard leaves every other thread alone', () => {
  it('a thread with a weave, paused at the photos stop: approve reaches the payload builder, and GET /checkpoint flags nothing', async () => {
    mockGraph = pausedAt('photos', oldValues({ weave: WEAVE, outline: null }));
    const approve = await send('POST', '/api/session/092626/approve', {});
    expect(approve.status).toBe(400);
    expect(approve.body.oldThread).toBeUndefined();
    const res = await send('GET', '/api/session/092626/checkpoint');
    expect(res.body.oldThread).toBeNull();
    expect(res.body.checkpoint.type).toBe('photos');
    expect(res.body.checkpoint).not.toHaveProperty('oldThread');
  });

  it('a thread with a weave: the rollback to the meeting keeps the arc counters (R9)', async () => {
    mockGraph = pausedAt('photos', oldValues({ weave: WEAVE, outline: null }));
    const res = await send('POST', '/api/session/092626/rollback', { rollbackTo: 'arc-selection' });
    expect(res.status).toBe(200);
    await flushBackground();
    const seeded = mockGraph.invoke.mock.calls[0][0];
    expect(seeded).not.toHaveProperty('arcRevisionCount');
    expect(seeded).not.toHaveProperty('humanArcRevisionCount');
  });

  it('a thread with a weave, rolled back past the meeting, proceeds', async () => {
    mockGraph = pausedAt('article', oldValues({ weave: WEAVE }));
    const res = await send('POST', '/api/session/092626/rollback', { rollbackTo: 'outline' });
    expect(res.status).toBe(200);
    await flushBackground();
    expect(mockGraph.invoke).toHaveBeenCalledTimes(1);
  });

  it('a thread with no weave paused before the meeting: approve proceeds to the arc stage', async () => {
    mockGraph = pausedAt('evidence-and-photos', { currentPhase: '1.8', theme: 'journalist' });
    const res = await send('POST', '/api/session/092626/approve', { evidenceBundle: true });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('processing');
    await flushBackground();
    expect(mockGraph.invoke).toHaveBeenCalledTimes(1);
    expect((await send('GET', '/api/session/092626/checkpoint')).body.oldThread).toBeNull();
  });
});

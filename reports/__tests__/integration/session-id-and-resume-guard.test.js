/**
 * Session-identity and lifecycle guards on the real Express app (B9, B1, H1/H2/H8).
 *
 * Boots the actual `app` exported by server.js (its listen() is behind
 * `require.main === module`, so requiring it starts nothing), authenticates with
 * the test password, and drives the routes over HTTP. The LangGraph module is
 * mocked so no graph is compiled and no paid call is made — server.js and
 * lib/api-helpers.js both resolve to lib/workflow/graph, so one mock covers
 * getSessionState(), createGraphAndConfig(), and the /checkpoint handler.
 */
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
process.env.ACCESS_PASSWORD = 'test-password';

const http = require('http');

// Assigned per test; the factory only closes over it (name starts with "mock",
// so jest allows the out-of-scope reference).
let mockGraph = null;

jest.mock('../../lib/workflow/graph', () => ({
  createReportGraphWithCheckpointer: () => mockGraph,
  RECURSION_LIMIT: 100
}));

const { app } = require('../../server.js');
const { _resetLocks, acquireSessionLock } = require('../../lib/session-locks');
const { _resetOutcomeStore } = require('../../lib/session-outcome');

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
    const req = http.request(
      { host: '127.0.0.1', port: server.address().port, path: urlPath, method, headers },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let parsed = null;
          try { parsed = data ? JSON.parse(data) : null; } catch { parsed = data; }
          resolve({ status: res.statusCode, body: parsed, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Let the runner's setImmediate background task run to completion. */
function flushBackground() {
  return new Promise((resolve) => setImmediate(() => setImmediate(resolve)));
}

/** A graph whose getState reports a non-interrupted thread at `currentPhase`. */
function graphAtPhase(values, { invokeResult } = {}) {
  const state = { values, config: { configurable: { checkpoint_id: 'ckpt-1' } }, createdAt: 'now', tasks: [] };
  return {
    getState: jest.fn().mockResolvedValue(state),
    invoke: jest.fn().mockResolvedValue(invokeResult || values)
  };
}

/** A graph whose getState reports a pending interrupt carrying `interruptValue`. */
function graphInterruptedAt(values, interruptValue) {
  const state = {
    values,
    config: { configurable: { checkpoint_id: 'ckpt-1' } },
    createdAt: 'now',
    tasks: [{ id: 't1', interrupts: [{ value: interruptValue }] }]
  };
  return {
    getState: jest.fn().mockResolvedValue(state),
    invoke: jest.fn().mockResolvedValue(values)
  };
}

beforeAll(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const login = await send('POST', '/api/auth/login', { password: 'test-password' });
  expect(login.status).toBe(200);
  cookie = login.headers['set-cookie'][0].split(';')[0];
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  _resetLocks();
  _resetOutcomeStore();
  mockGraph = null;
});

// ─────────────────────────────────────────────────────────────────────────────
// 1.1 — B9: resuming a complete thread re-runs the whole paid pipeline
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /resume on a complete session (B9)', () => {
  it('409s with currentPhase:complete instead of re-running the pipeline', async () => {
    mockGraph = graphAtPhase({ currentPhase: 'complete', theme: 'journalist' });

    const res = await send('POST', '/api/session/071826/resume', {});

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/complete/i);
    expect(res.body.currentPhase).toBe('complete');
    expect(mockGraph.invoke).not.toHaveBeenCalled();
  });

  it('re-runs deliberately when the body carries force:true', async () => {
    mockGraph = graphAtPhase({ currentPhase: 'complete', theme: 'journalist' });

    const res = await send('POST', '/api/session/071826/resume', { force: true });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('processing');
    await flushBackground();
    expect(mockGraph.invoke).toHaveBeenCalled();
  });

  it('still resumes a thread paused mid-pipeline (guard is complete-only)', async () => {
    mockGraph = graphInterruptedAt({ currentPhase: 2.35, theme: 'journalist' }, { type: 'arc-selection' });

    const res = await send('POST', '/api/session/071826/resume', {});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('processing');
    await flushBackground();
  });
});

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
const fs = require('fs');
const os = require('os');
const path = require('path');

// Assigned per test; the factory only closes over it (name starts with "mock",
// so jest allows the out-of-scope reference).
let mockGraph = null;

jest.mock('../../lib/workflow/graph', () => ({
  createReportGraphWithCheckpointer: () => mockGraph,
  RECURSION_LIMIT: 100
}));

const { app, isAllowedSessionId } = require('../../server.js');
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

/**
 * A graph with NO thread yet, which then interrupts at `interruptValue` — the real
 * shape of a fresh `/start`.
 *
 * LangGraph returns a snapshot with `values: {}` for a thread that has never run
 * (getSessionState treats exactly that as "no session"), and `/start` reads state
 * TWICE now: once to refuse a second start on an existing thread (C1), then again
 * after invoke to build the interrupt response.
 */
function graphFreshStartTo(values, interruptValue) {
  const before = { values: {}, config: { configurable: {} }, tasks: [] };
  const after = {
    values,
    config: { configurable: { checkpoint_id: 'ckpt-1' } },
    createdAt: 'now',
    tasks: [{ id: 't1', interrupts: [{ value: interruptValue }] }]
  };
  return {
    getState: jest.fn().mockResolvedValueOnce(before).mockResolvedValue(after),
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

// ─────────────────────────────────────────────────────────────────────────────
// 1.2 — B1 companion: the session ID is the emailer's report-link contract
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /start session-ID contract (B1 companion)', () => {
  // No photosPath: every rawSessionInput field is optional now (photo late-join),
  // and a path that is not on disk is refused, so the id contract is exercised on
  // the minimal body a director can actually post.
  const START_BODY = { theme: 'journalist', rawSessionInput: {} };

  afterEach(() => {
    delete process.env.ALLOW_NONSTANDARD_SESSION_ID;
  });

  it('rejects a non-date session ID with a 400 naming the MMDDYY format', async () => {
    mockGraph = graphFreshStartTo({ currentPhase: 1.35 }, { type: 'paper-evidence-selection' });

    const res = await send('POST', '/api/session/march-15/start', START_BODY);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/MMDDYY/);
    expect(mockGraph.invoke).not.toHaveBeenCalled();
  });

  it('accepts MMDDYY plus one session digit (second session the same day)', async () => {
    mockGraph = graphFreshStartTo({ currentPhase: 1.35 }, { type: 'paper-evidence-selection' });

    const res = await send('POST', '/api/session/0918262/start', START_BODY);

    expect(res.status).toBe(200);
    expect(res.body.interrupted).toBe(true);
  });

  it('accepts a plain MMDDYY session ID', async () => {
    mockGraph = graphFreshStartTo({ currentPhase: 1.35 }, { type: 'paper-evidence-selection' });

    const res = await send('POST', '/api/session/091826/start', START_BODY);

    expect(res.status).toBe(200);
  });

  it('accepts any ID when ALLOW_NONSTANDARD_SESSION_ID is set (e2e harness escape hatch)', async () => {
    process.env.ALLOW_NONSTANDARD_SESSION_ID = 'true';
    mockGraph = graphFreshStartTo({ currentPhase: 1.35 }, { type: 'paper-evidence-selection' });

    const res = await send('POST', '/api/session/march-15/start', START_BODY);

    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1.2b — C1: a second /start on an existing thread, and what a forced one seeds
//
// `/start` seeded its state from buildRollbackState('input-review'), which
// preserves everything upstream of the parse (by design, for a rollback) plus
// sessionPhotos (ROLLBACK_CLEARS_EXEMPT). So the most likely director action after
// a mistake — Start Fresh on the same session id — silently kept the old photos,
// the old roster and the old parse, paused once at input-review showing them, and
// never read the new photosPath.
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /start on an existing thread (C1)', () => {
  // A real directory: /start now refuses a photosPath that is not on disk (v2 C1),
  // so the body cannot carry a made-up literal any more.
  let photosDir;
  beforeAll(() => { photosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-start-')); });
  const START_BODY = () => ({ theme: 'journalist', rawSessionInput: { photosPath: photosDir } });

  it('409s with the phase instead of silently reusing the old state', async () => {
    mockGraph = graphAtPhase({ currentPhase: 2.35, theme: 'journalist' });

    const res = await send('POST', '/api/session/091826/start', START_BODY());

    expect(res.status).toBe(409);
    expect(res.body.currentPhase).toBe(2.35);
    expect(res.body.error).toMatch(/already exists/i);
    expect(res.body.error).toMatch(/Resume/);
    expect(res.body.error).toMatch(/force/);
    expect(mockGraph.invoke).not.toHaveBeenCalled();
  });

  it('starts over when the body carries force:true', async () => {
    mockGraph = graphInterruptedAt({ currentPhase: 1.35, theme: 'journalist' }, { type: 'paper-evidence-selection' });

    const res = await send('POST', '/api/session/091826/start', { ...START_BODY(), force: true });

    expect(res.status).toBe(200);
    expect(mockGraph.invoke).toHaveBeenCalled();
  });

  it('seeds a forced start with the photo, roster, raw-context and parse channels null', async () => {
    mockGraph = graphInterruptedAt({ currentPhase: 1.35, theme: 'journalist' }, { type: 'paper-evidence-selection' });

    await send('POST', '/api/session/091826/start', { ...START_BODY(), force: true });

    const seeded = mockGraph.invoke.mock.calls[0][0];
    expect(seeded.sessionPhotos).toBeNull();
    expect(seeded.preprocessStats).toBeNull();
    expect(seeded.photoAnalyses).toBeNull();
    expect(seeded.roster).toBeNull();
    expect(seeded.rosterPronouns).toBeNull();
    expect(seeded.accusation).toBeNull();
    expect(seeded.sessionReport).toBeNull();
    expect(seeded.directorNotesRaw).toBeNull();
    expect(seeded.sessionConfig).toBeNull();
    expect(seeded.selectedPaperEvidence).toBeNull();
    expect(seeded.characterIdMappings).toBeNull();
    expect(seeded.memoryTokens).toBeNull();
    // ...while the three channels a fresh start is defined by are the caller's.
    expect(seeded.theme).toBe('journalist');
    expect(seeded.rawSessionInput.photosPath).toBe(photosDir);
  });

  it('seeds the same nulls on a first start (no thread yet)', async () => {
    mockGraph = graphFreshStartTo({ currentPhase: 1.35 }, { type: 'paper-evidence-selection' });

    const res = await send('POST', '/api/session/091826/start', START_BODY());

    expect(res.status).toBe(200);
    const seeded = mockGraph.invoke.mock.calls[0][0];
    expect(seeded.sessionPhotos).toBeNull();
    expect(seeded.photoAnalyses).toBeNull();
    expect(seeded.evaluationHistory).toEqual([]);
  });

  it('seeds state.photosPath from the body, after the fresh-start spread (I2)', async () => {
    mockGraph = graphInterruptedAt({ currentPhase: 1.35, theme: 'journalist' }, { type: 'paper-evidence-selection' });

    await send('POST', '/api/session/091826/start', { ...START_BODY(), force: true });

    const seeded = mockGraph.invoke.mock.calls[0][0];
    // FRESH_START_CLEARS is derived from every channel, so a seed written BEFORE
    // the spread would be nulled and the gate would ask the director for the
    // folder they just typed.
    expect(seeded.photosPath).toBe(photosDir);
  });

  it('leaves photosPath unset when the body carries none (photo late-join)', async () => {
    mockGraph = graphInterruptedAt({ currentPhase: 1.35, theme: 'journalist' }, { type: 'paper-evidence-selection' });

    await send('POST', '/api/session/091826/start', { theme: 'journalist', rawSessionInput: {}, force: true });

    const seeded = mockGraph.invoke.mock.calls[0][0];
    expect(seeded.rawSessionInput.photosPath).toBeUndefined();
    expect(seeded.photosPath).toBeNull();
  });

  it('400s on a photosPath that does not exist, naming the path (v2 C1)', async () => {
    // Without this, a typo is discovered by fetchSessionPhotos AFTER arc analysis —
    // an hour and three paid phases later — and the console's failure card then
    // offers a rollback to the last GATE seen (arc-selection), which re-pays the
    // Opus arc analysis and throws again because photosPath still holds the typo.
    // `photos` is not clickable in that state (F26).
    mockGraph = graphInterruptedAt({ currentPhase: 1.35, theme: 'journalist' }, { type: 'paper-evidence-selection' });
    const missing = path.join(photosDir, 'does-not-exist');

    const res = await send('POST', '/api/session/091826/start', {
      theme: 'journalist', rawSessionInput: { photosPath: missing }, force: true
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain(missing);
    expect(res.body.error).toMatch(/Photos directory not found/);
    expect(res.body.error).toMatch(/blank/);   // names the alternative
    expect(mockGraph.invoke).not.toHaveBeenCalled();
  });

  it('strips quotes from a pasted path on both copies', async () => {
    mockGraph = graphInterruptedAt({ currentPhase: 1.35, theme: 'journalist' }, { type: 'paper-evidence-selection' });

    await send('POST', '/api/session/091826/start', {
      theme: 'journalist',
      rawSessionInput: { photosPath: `  "${photosDir}"  ` },
      force: true
    });

    const seeded = mockGraph.invoke.mock.calls[0][0];
    expect(seeded.photosPath).toBe(photosDir);
    expect(seeded.rawSessionInput.photosPath).toBe(photosDir);
  });
});

describe('POST /rollback stashes the outgoing photos path (v2 M1)', () => {
  it('stashes photosPath as _previousPhotosPath when the list clears it', async () => {
    // rawSessionInput is rollback-EXEMPT, so without the stash a rollback to
    // `photos` re-offers the ORIGINAL start-time path — the bad one the director
    // already corrected at the gate.
    mockGraph = graphAtPhase({
      currentPhase: '2.36', theme: 'journalist',
      photosPath: 'D:/shoots/091926-CORRECTED',
      rawSessionInput: { photosPath: 'D:/shoots/091926-typo' }
    });

    const res = await send('POST', '/api/session/091826/rollback', { rollbackTo: 'photos' });
    expect(res.status).toBe(200);
    await flushBackground();

    const seeded = mockGraph.invoke.mock.calls[0][0];
    expect(seeded.photosPath).toBeNull();                                  // cleared
    expect(seeded._previousPhotosPath).toBe('D:/shoots/091926-CORRECTED'); // stashed
  });

  it('does not stash for a rollback point that keeps photosPath', async () => {
    mockGraph = graphAtPhase({
      currentPhase: '2.35', theme: 'journalist', photosPath: 'D:/shoots/091926-clean'
    });

    await send('POST', '/api/session/091826/rollback', { rollbackTo: 'arc-selection' });
    await flushBackground();

    const seeded = mockGraph.invoke.mock.calls[0][0];
    expect('_previousPhotosPath' in seeded).toBe(false);
    expect('photosPath' in seeded).toBe(false);   // arc-selection clears no photo field
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1.3 — H1/H2/H8: /checkpoint must ship the same payload the SSE path delivers
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /checkpoint payload completeness (H1, H2, H8)', () => {
  const CHARACTER_IDS_INTERRUPT = {
    type: 'character-ids',
    photoAnalyses: [{ filename: 'a.jpg', characterDescriptions: ['tall, grey suit'] }],
    roster: ['Vic']
  };
  const STATE = {
    currentPhase: 1.66,
    theme: 'detective',
    sessionPhotos: ['a.jpg'],
    sessionConfig: { roster: ['Vic'] }
  };

  it('merges the state-based checkpoint data into the interrupt payload', async () => {
    mockGraph = graphInterruptedAt(STATE, CHARACTER_IDS_INTERRUPT);

    const res = await send('GET', '/api/session/091826/checkpoint');

    expect(res.status).toBe(200);
    expect(res.body.checkpointType).toBe('character-ids');
    expect(res.body.checkpoint.type).toBe('character-ids');
    // sessionPhotos comes from STATE, not from the interrupt payload: without the
    // merge the CharacterIds view renders photo cards with no photos.
    expect(res.body.checkpoint.sessionPhotos).toEqual(['a.jpg']);
    expect(res.body.checkpoint.roster).toEqual(['Vic']);
  });

  it('reports the session theme so a resumed run is not rendered with the wrong one', async () => {
    mockGraph = graphInterruptedAt(STATE, CHARACTER_IDS_INTERRUPT);

    const res = await send('GET', '/api/session/091826/checkpoint');

    expect(res.body.theme).toBe('detective');
  });

  it('defaults theme to journalist when the thread has none', async () => {
    mockGraph = graphInterruptedAt({ currentPhase: 1.66 }, CHARACTER_IDS_INTERRUPT);

    const res = await send('GET', '/api/session/091826/checkpoint');

    expect(res.body.theme).toBe('journalist');
  });

  it('reports inProgress:false and a lastOutcome key when the session is idle', async () => {
    mockGraph = graphInterruptedAt(STATE, CHARACTER_IDS_INTERRUPT);

    const res = await send('GET', '/api/session/091826/checkpoint');

    expect(res.body.inProgress).toBe(false);
    expect(res.body).toHaveProperty('lastOutcome');
    expect(res.body.lastOutcome).toBeNull();
  });

  it('reports inProgress:true while a background run holds the session lock', async () => {
    mockGraph = graphInterruptedAt(STATE, CHARACTER_IDS_INTERRUPT);
    acquireSessionLock('091826');

    const res = await send('GET', '/api/session/091826/checkpoint');

    expect(res.body.inProgress).toBe(true);
  });

  it('returns checkpoint:null when the thread is not interrupted', async () => {
    mockGraph = graphAtPhase({ currentPhase: 'complete', theme: 'journalist' });

    const res = await send('GET', '/api/session/091826/checkpoint');

    expect(res.body.interrupted).toBe(false);
    expect(res.body.checkpoint).toBeNull();
    expect(res.body.checkpointType).toBeNull();
  });
});

// The predicate itself, at the boundaries the HTTP cases above do not reach.
describe('isAllowedSessionId', () => {
  afterEach(() => { delete process.env.ALLOW_NONSTANDARD_SESSION_ID; });

  it('accepts six digits (MMDDYY) and seven (plus a session number)', () => {
    expect(isAllowedSessionId('091826')).toBe(true);
    expect(isAllowedSessionId('0918262')).toBe(true);
  });

  it('rejects the legacy MMDD form that split session 071126', () => {
    expect(isAllowedSessionId('0711')).toBe(false);
  });

  it('rejects too-short, too-long, empty and non-numeric ids', () => {
    expect(isAllowedSessionId('09182')).toBe(false);
    expect(isAllowedSessionId('09182622')).toBe(false);
    expect(isAllowedSessionId('')).toBe(false);
    expect(isAllowedSessionId('march-15')).toBe(false);
    expect(isAllowedSessionId('20251221')).toBe(false);
  });

  it('accepts anything once ALLOW_NONSTANDARD_SESSION_ID is set', () => {
    process.env.ALLOW_NONSTANDARD_SESSION_ID = 'true';
    expect(isAllowedSessionId('1225')).toBe(true);
  });

  it('is not enabled by any other value of the env var', () => {
    process.env.ALLOW_NONSTANDARD_SESSION_ID = '1';
    expect(isAllowedSessionId('1225')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/config — the console enforces the session-ID contract client-side, so
// the opt-out has to reach it or the two sides disagree about what /start accepts.
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/config allowNonstandardSessionId', () => {
  afterEach(() => { delete process.env.ALLOW_NONSTANDARD_SESSION_ID; });

  it('is false by default, so the console holds the MMDDYY contract', async () => {
    const res = await send('GET', '/api/config');
    expect(res.status).toBe(200);
    expect(res.body.allowNonstandardSessionId).toBe(false);
  });

  it('is true exactly when the env var says true (read per request, not at boot)', async () => {
    process.env.ALLOW_NONSTANDARD_SESSION_ID = 'true';
    expect((await send('GET', '/api/config')).body.allowNonstandardSessionId).toBe(true);
    process.env.ALLOW_NONSTANDARD_SESSION_ID = '1';
    expect((await send('GET', '/api/config')).body.allowNonstandardSessionId).toBe(false);
  });

  it('still does not leak the Notion token', async () => {
    const res = await send('GET', '/api/config');
    expect(Object.keys(res.body).sort()).toEqual(['allowNonstandardSessionId', 'notionConfigured']);
  });
});

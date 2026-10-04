/**
 * A thread from before the story meeting, through the REAL compiled graph and the real
 * Express app (phase 4, task 4.11; R2). The brief's verification: an old-shape thread
 * paused at the photos stop is refused on approve, and a rollback to the meeting proceeds.
 *
 * The thread is seeded as a thread from before phase 4 reaches the photos stop: the parse,
 * the curation and the photos' earlier stops answered, no weave, and the old arc stage's
 * counters. The seed routes past the meeting's stop with `meetingApproved`, which a thread
 * started before 4.5 does not hold; the guard reads the weave alone (ruling 1), and the
 * rollback to the meeting clears the approval. The graph runs on a SqliteSaver over the
 * server's own checkpoint file (CHECKPOINT_DB_PATH, a temp file the Jest setup gives every
 * suite), so the routes read and run the very thread the test seeded. Their runs have no
 * sdkClient, so lib/llm's sdkQuery is the scripted stand-in: the weave writer by its
 * label, the meeting's fact check by its system prompt. Invented text: the repo is public.
 */
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
process.env.ACCESS_PASSWORD = 'test-password';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { SqliteSaver } = require('@langchain/langgraph-checkpoint-sqlite');

// Every model call the routes' runs make goes here.
let mockSdk = null;
jest.mock('../../lib/llm', () => {
  const actual = jest.requireActual('../../lib/llm');
  return { ...actual, sdkQuery: (options) => mockSdk(options) };
});

const { createReportGraphWithCheckpointer, RECURSION_LIMIT } = require('../../lib/workflow/graph');
const { app, CHECKPOINT_DB_PATH, getSessionOutcome, _inFlight } = require('../../server.js');
const { CHECKPOINT_TYPES } = require('../../lib/workflow/checkpoint-helpers');
const { isWeave } = require('../../lib/weave');
const { reworkFixtureState } = require('../../lib/__tests__/fixtures/rework-state');

const clone = (v) => JSON.parse(JSON.stringify(v));
const SESSION = '1004111';
const MESSAGE = 'This session was started before the story meeting. Roll back to the story meeting to continue.';
const CLEAN = { ready: true, structuralPassed: true, overallScore: 1, criteriaScores: {}, structuralIssues: [], advisoryWarnings: [], confidence: 'high' };

/** The stops before the meeting, each answered, so a replay from START passes them without a call. */
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

/** A scripted SDK: the weave writer by its label, the fact check by its system prompt. */
function scriptedSdk() {
  const calls = [];
  const sdk = async (options) => {
    if (options.label === 'The weave') {
      calls.push('weave writer');
      return clone(reworkFixtureState('journalist').weave);
    }
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
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-old-thread-'));
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

describe("4.11, the brief's verification: an old thread paused at the photos stop", () => {
  const thread = { configurable: { thread_id: SESSION, sessionId: SESSION, theme: 'journalist', dataDir: null } };
  const graph = () => createReportGraphWithCheckpointer(saver);

  /** The thread as a thread from before phase 4 reaches the photos stop: no weave, the old arc counters. */
  async function seedAtPhotos() {
    const { weave: _weave, ...state } = reworkFixtureState('journalist');
    thread.configurable.dataDir = dataDir;
    await graph().updateState(thread, {
      ...state, ...ANSWERED_BEFORE_THE_MEETING, sessionId: SESSION,
      weave: null, _weaveBaseline: null, meetingApproved: true,
      outline: null, _mapBaseline: null, heroImage: null, contentBundle: null, photosPath: null,
      arcRevisionCount: 2, humanArcRevisionCount: 1, evaluationHistory: [{ phase: 'arcs', ready: true }]
    }, 'checkpointArcSelection');
    await graph().invoke(null, { ...thread, recursionLimit: RECURSION_LIMIT, durability: 'sync' });
  }

  const stopOf = async () => {
    const snapshot = await graph().getState(thread);
    return { type: snapshot.tasks[0] && snapshot.tasks[0].interrupts[0] && snapshot.tasks[0].interrupts[0].value.type, values: snapshot.values, id: snapshot.config.configurable.checkpoint_id };
  };

  it('is refused on approve, and a rollback to the meeting writes the weave fresh and opens the meeting', async () => {
    mockSdk = scriptedSdk();
    await seedAtPhotos();
    const paused = await stopOf();
    expect(paused.type).toBe(CHECKPOINT_TYPES.PHOTOS);
    expect(isWeave(paused.values.weave)).toBe(false);

    // GET /checkpoint flags it: the console shows the message and the rollback, not the stop.
    const checkpoint = await send('GET', `/api/session/${SESSION}/checkpoint`);
    expect(checkpoint.body).toMatchObject({ interrupted: true, checkpointType: 'photos', oldThread: { message: MESSAGE, rollbackTo: 'arc-selection' } });
    expect(checkpoint.body.checkpoint).toEqual({ type: 'photos', oldThread: checkpoint.body.oldThread });

    // Approve is refused, and nothing ran: the thread is where it was.
    const photos = fs.mkdtempSync(path.join(dataDir, 'photos-'));
    const approve = await send('POST', `/api/session/${SESSION}/approve`, { photosPath: photos });
    expect(approve.status).toBe(409);
    expect(approve.body.error).toBe(MESSAGE);
    expect(await stopOf()).toMatchObject({ type: CHECKPOINT_TYPES.PHOTOS, id: paused.id });
    expect(mockSdk.calls).toEqual([]);

    // The rollback to the meeting proceeds: a replay from START passes every answered stop,
    // the weave writer and the fact check run once each, and the meeting opens on the weave.
    const rollback = await send('POST', `/api/session/${SESSION}/rollback`, { rollbackTo: 'arc-selection' });
    expect(rollback.status).toBe(200);
    expect(rollback.body.status).toBe('processing');
    await Promise.allSettled([..._inFlight]);
    expect(getSessionOutcome(SESSION)).toMatchObject({ outcome: 'interrupted', checkpointType: 'arc-selection' });

    const meeting = await stopOf();
    expect(meeting.type).toBe(CHECKPOINT_TYPES.ARC_SELECTION);
    expect(mockSdk.calls).toEqual(['weave writer', 'fact check']);
    expect(isWeave(meeting.values.weave)).toBe(true);
    expect(meeting.values.meetingApproved).not.toBe(true);
    expect(meeting.values.arcRevisionCount).toBe(0);
    expect(meeting.values.humanArcRevisionCount).toBe(0);

    // The thread holds a weave now: GET /checkpoint flags nothing and sends the meeting's payload.
    const after = await send('GET', `/api/session/${SESSION}/checkpoint`);
    expect(after.body.oldThread).toBeNull();
    expect(after.body.checkpointType).toBe('arc-selection');
    expect(isWeave(after.body.checkpoint.weave)).toBe(true);
  });
});

/**
 * A thread from before the story meeting, through the REAL compiled graph and the real
 * Express app (phase 4, task 4.11; R2). The brief's verification: an old-shape thread
 * paused at the photos stop is refused on approve, and a rollback to the meeting proceeds.
 * Fix round 1 adds one that stopped on an error after its article was approved, at no stop,
 * and fix round 2 one that stopped on an error in the old outline rework, which held no
 * outline, beside a thread of the new code whose weave writer failed, which is resumed.
 * Phase 4b (brief 1G) adds threads on phase 4's shapes, at the meeting, at the map and
 * complete, each refused and rolled back to the meeting, where the weave is written fresh in
 * the story level's shape, beside a thread on the new shapes, which is left alone.
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
const { isWeave, weaveForPrompt, weaveKey, withFactCheckMark } = require('../../lib/weave');
const { isOldShapeWeave } = require('../../lib/old-thread');
const { reworkFixtureState, MAP, PREVIOUS_BUNDLE } = require('../../lib/__tests__/fixtures/rework-state');
const { oldShapeWeave, oldShapeMeetingChannels, oldShapeMapChannels } = require('../../lib/__tests__/fixtures/old-shapes');

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

/**
 * A scripted SDK: the weave writer by its label, the fact check by its system prompt. The
 * weave writer's first `weaveFailures` calls fail, each with an error no retry takes.
 */
function scriptedSdk({ weaveFailures = 0 } = {}) {
  const calls = [];
  let failuresLeft = weaveFailures;
  const sdk = async (options) => {
    if (options.label === 'The weave') {
      calls.push('weave writer');
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        throw new Error('scriptedSdk: the weave writer failed');
      }
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

// Fix round 1, finding 1: a thread from before phase 4 that stopped on an error after its
// article was approved sits at no stop, with its old outline and article. A resume replayed
// it from START: a fresh weave and meeting, then the map writer skipped on the old outline
// and the map's stop opened on it, and /approve's recovery offered a rollback to the article.
describe('4.11 fix round 1: an old thread that stopped on an error after its article was approved', () => {
  const STOPPED = '1004112';
  const thread = { configurable: { thread_id: STOPPED, sessionId: STOPPED, theme: 'journalist', dataDir: null } };
  const graph = () => createReportGraphWithCheckpointer(saver);
  /** The outline and the article in the shapes the old stages wrote. Invented text. */
  const OLD_OUTLINE = { lede: { hook: 'An old hook.' }, theStory: { arcs: [] }, closing: { theme: 'An old close.' }, writerQuestions: [] };
  const OLD_BUNDLE = { headline: { main: 'An old headline' }, sections: [], writerQuestions: [] };

  /** The thread as one from before phase 4 stops when its publish fails: no weave, no meeting, at no stop. */
  async function seedStoppedOnError() {
    const { weave: _weave, meetingApproved: _approved, ...state } = reworkFixtureState('journalist');
    thread.configurable.dataDir = dataDir;
    await graph().updateState(thread, {
      ...state, ...ANSWERED_BEFORE_THE_MEETING, sessionId: STOPPED,
      weave: null, _weaveBaseline: null,
      outline: OLD_OUTLINE, _mapBaseline: null, outlineApproved: true, heroImage: null,
      contentBundle: OLD_BUNDLE, articleApproved: true, photosPath: null,
      currentPhase: 'error',
      arcRevisionCount: 2, humanArcRevisionCount: 1,
      evaluationHistory: [{ phase: 'arcs', ready: true }, { phase: 'article', ready: true }]
    }, 'assembleHtml');
  }

  const stopOf = async () => {
    const snapshot = await graph().getState(thread);
    const task = snapshot.tasks[0];
    return { type: task && task.interrupts[0] ? task.interrupts[0].value.type : null, values: snapshot.values, id: snapshot.config.configurable.checkpoint_id };
  };

  it('is flagged, refused on resume, approve and a rollback to the article, and a rollback to the meeting clears the old outline and article', async () => {
    mockSdk = scriptedSdk();
    await seedStoppedOnError();
    const stopped = await stopOf();
    expect(stopped.type).toBeNull();
    expect(stopped.values.currentPhase).toBe('error');
    expect(isWeave(stopped.values.weave)).toBe(false);

    // GET /checkpoint flags it: the Session screen shows the message and the rollback instead of resuming.
    const checkpoint = await send('GET', `/api/session/${STOPPED}/checkpoint`);
    expect(checkpoint.body).toMatchObject({ interrupted: false, checkpoint: null, oldThread: { message: MESSAGE, rollbackTo: 'arc-selection' } });

    // Resume, approve and the rollback the recovery offered are refused, and nothing ran.
    for (const [route, body] of [['resume', {}], ['resume', { force: true }], ['approve', { article: true }], ['rollback', { rollbackTo: 'article' }]]) {
      const res = await send('POST', `/api/session/${STOPPED}/${route}`, body);
      expect(`${route} ${res.status} ${res.body.error}`).toBe(`${route} 409 ${MESSAGE}`);
    }
    expect((await stopOf()).id).toBe(stopped.id);
    expect(mockSdk.calls).toEqual([]);

    // The rollback to the meeting proceeds: the old outline and article go, the weave is
    // written fresh with its fact check, and the arc counters start over.
    const rollback = await send('POST', `/api/session/${STOPPED}/rollback`, { rollbackTo: 'arc-selection' });
    expect(rollback.status).toBe(200);
    await Promise.allSettled([..._inFlight]);
    expect(getSessionOutcome(STOPPED)).toMatchObject({ outcome: 'interrupted', checkpointType: 'arc-selection' });

    const meeting = await stopOf();
    expect(meeting.type).toBe(CHECKPOINT_TYPES.ARC_SELECTION);
    expect(mockSdk.calls).toEqual(['weave writer', 'fact check']);
    expect(isWeave(meeting.values.weave)).toBe(true);
    expect(meeting.values).toMatchObject({ outline: null, contentBundle: null, arcRevisionCount: 0, humanArcRevisionCount: 0 });
    expect(meeting.values.articleApproved).not.toBe(true);
    expect((await send('GET', `/api/session/${STOPPED}/checkpoint`)).body.oldThread).toBeNull();
  });
});

/** A thread's stop, its values and its checkpoint id, read through the real graph. */
async function stopOfThread(thread) {
  const snapshot = await createReportGraphWithCheckpointer(saver).getState(thread);
  const task = snapshot.tasks[0];
  return { type: task && task.interrupts[0] ? task.interrupts[0].value.type : null, values: snapshot.values, id: snapshot.config.configurable.checkpoint_id };
}

// Fix round 2, finding 1: the old outline rework emptied the outline before it ran, and its
// catch left it empty, so a thread that stopped on an error there held no outline and no
// article and was resumed: past a fresh meeting, the map's stop opened with the old stage's
// note, edits, report, trace and counts. It holds the old stages' evaluations and counts.
describe('4.11 fix round 2: an old thread that stopped on an error in the old outline rework', () => {
  const STOPPED = '1004113';
  const thread = { configurable: { thread_id: STOPPED, sessionId: STOPPED, theme: 'journalist', dataDir: null } };
  /** The outline the old stages wrote, kept only in the old stage's trace. Invented text. */
  const OLD_OUTLINE = { lede: { hook: 'An old hook.' }, theStory: { arcs: [] }, closing: { theme: 'An old close.' } };

  /** The thread as the old outline rework's catch left it: the outline and its copy empty, at no stop. */
  async function seedErroredInOutlineRework() {
    const { weave: _weave, meetingApproved: _approved, ...state } = reworkFixtureState('journalist');
    thread.configurable.dataDir = dataDir;
    await createReportGraphWithCheckpointer(saver).updateState(thread, {
      ...state, ...ANSWERED_BEFORE_THE_MEETING, sessionId: STOPPED,
      weave: null, _weaveBaseline: null,
      outline: null, _previousOutline: null, _outlineFeedback: null, _mapBaseline: null, heroImage: null,
      contentBundle: null, photosPath: null,
      outlineRevisionCount: 1, humanOutlineRevisionCount: 1,
      _outlineTrace: [{ pass: 1, round: 2, trigger: 'evaluation', findings: { structuralIssues: ['T8: an old outline issue'] }, before: OLD_OUTLINE, at: 'then' }],
      _outlineHandEdits: { kind: 'outline', issued: 1, edits: [{ id: 'E1', path: 'closing.theme', before: 'An older close.', after: "The director's close." }] },
      _outlineHandEditReport: { checked: ['E1'], changed: [] },
      directorGateNotes: [{ gate: 'outline', kind: 'rejection', round: 1, text: 'Cut the second arc from the old outline.', at: 'then' }],
      currentPhase: 'error',
      arcRevisionCount: 2, humanArcRevisionCount: 1,
      evaluationHistory: [{ phase: 'arcs', ready: true }, { phase: 'outline', ready: false }]
    }, 'reviseOutline');
  }

  it('is flagged, refused on resume, approve and a rollback past the meeting, and a rollback to the meeting clears what the old outline stage left', async () => {
    mockSdk = scriptedSdk();
    await seedErroredInOutlineRework();
    const stopped = await stopOfThread(thread);
    expect(stopped.type).toBeNull();
    expect(stopped.values).toMatchObject({ currentPhase: 'error', outline: null, contentBundle: null });
    expect(isWeave(stopped.values.weave)).toBe(false);

    // GET /checkpoint flags it: the Session screen shows the message and the rollback instead of resuming.
    const checkpoint = await send('GET', `/api/session/${STOPPED}/checkpoint`);
    expect(checkpoint.body).toMatchObject({ interrupted: false, checkpoint: null, oldThread: { message: MESSAGE, rollbackTo: 'arc-selection' } });

    // Resume, approve and every rollback past the meeting are refused, and nothing ran.
    for (const [route, body] of [['resume', {}], ['resume', { force: true }], ['approve', { outline: true }], ['rollback', { rollbackTo: 'outline' }], ['rollback', { rollbackTo: 'photos' }]]) {
      const res = await send('POST', `/api/session/${STOPPED}/${route}`, body);
      expect(`${route} ${res.status} ${res.body.error}`).toBe(`${route} 409 ${MESSAGE}`);
    }
    expect((await stopOfThread(thread)).id).toBe(stopped.id);
    expect(mockSdk.calls).toEqual([]);

    // The rollback to the meeting proceeds: the weave is written fresh with its fact check,
    // and nothing the old outline stage left reaches it.
    const rollback = await send('POST', `/api/session/${STOPPED}/rollback`, { rollbackTo: 'arc-selection' });
    expect(rollback.status).toBe(200);
    await Promise.allSettled([..._inFlight]);
    expect(getSessionOutcome(STOPPED)).toMatchObject({ outcome: 'interrupted', checkpointType: 'arc-selection' });

    const meeting = await stopOfThread(thread);
    expect(meeting.type).toBe(CHECKPOINT_TYPES.ARC_SELECTION);
    expect(mockSdk.calls).toEqual(['weave writer', 'fact check']);
    expect(isWeave(meeting.values.weave)).toBe(true);
    expect(meeting.values).toMatchObject({
      _outlineFeedback: null, _outlineHandEdits: null, _outlineHandEditReport: null, _outlineTrace: null,
      outlineRevisionCount: 0, humanOutlineRevisionCount: 0, arcRevisionCount: 0, humanArcRevisionCount: 0,
      directorGateNotes: []
    });
    expect(meeting.values.evaluationHistory.map((entry) => entry.phase)).toEqual(['arcs']);
    expect((await send('GET', `/api/session/${STOPPED}/checkpoint`)).body.oldThread).toBeNull();
  });
});

// The rule's other side, through the real graph: a thread of the new code holds nothing past
// the arc writer until its weave is written, so one whose weave writer failed is no old
// thread. GET /checkpoint flags nothing, and the director's resume writes the weave.
describe('4.11 fix round 2: a thread of the new code whose weave writer failed is resumed', () => {
  const NEW_THREAD = '1004114';
  const thread = { configurable: { thread_id: NEW_THREAD, sessionId: NEW_THREAD, theme: 'journalist', dataDir: null } };

  /** The thread as the new code leaves it before the weave writer: every stop before the meeting answered. */
  async function seedBeforeTheWeave() {
    const { weave: _weave, meetingApproved: _approved, outline: _outline, _mapBaseline: _baseline, ...state } = reworkFixtureState('journalist');
    thread.configurable.dataDir = dataDir;
    await createReportGraphWithCheckpointer(saver).updateState(thread, {
      ...state, ...ANSWERED_BEFORE_THE_MEETING, sessionId: NEW_THREAD, currentPhase: '2.1'
    }, 'surfaceContradictions');
  }

  it('is not flagged when the weave writer fails, and its resume writes the weave and opens the meeting', async () => {
    mockSdk = scriptedSdk({ weaveFailures: 1 });
    await seedBeforeTheWeave();
    expect((await send('GET', `/api/session/${NEW_THREAD}/checkpoint`)).body.oldThread).toBeNull();

    // The weave writer fails: the run ends in an error, and the thread is still no old thread.
    const first = await send('POST', `/api/session/${NEW_THREAD}/resume`, {});
    expect(first.status).toBe(200);
    await Promise.allSettled([..._inFlight]);
    expect(getSessionOutcome(NEW_THREAD)).toMatchObject({ outcome: 'failed' });
    expect(mockSdk.calls).toEqual(['weave writer']);
    const failed = await stopOfThread(thread);
    expect(failed.type).toBeNull();
    expect(isWeave(failed.values.weave)).toBe(false);
    const flag = await send('GET', `/api/session/${NEW_THREAD}/checkpoint`);
    expect(flag.body).toMatchObject({ interrupted: false, checkpoint: null, oldThread: null });

    // The director resumes it: the weave writer runs again, and the meeting opens on its weave.
    const second = await send('POST', `/api/session/${NEW_THREAD}/resume`, {});
    expect(second.status).toBe(200);
    await Promise.allSettled([..._inFlight]);
    expect(getSessionOutcome(NEW_THREAD)).toMatchObject({ outcome: 'interrupted', checkpointType: 'arc-selection' });
    expect(mockSdk.calls).toEqual(['weave writer', 'weave writer', 'fact check']);
    expect(isWeave((await stopOfThread(thread)).values.weave)).toBe(true);
  });
});

// Phase 4b, brief 1G (spec 2026-10-05 section 10; R9; Review focus 4): a session paused at
// the meeting or a later stop when the story level lands holds a weave and a map in phase 4's
// shapes. Through the real graph it is refused at the meeting, at the map and complete, then
// rolled back to the meeting, where the weave writer writes the weave fresh in the new shape
// and the fact check judges it. Nothing replays on mixed shapes. A thread on the new shapes is
// untouched: its rollback to the meeting reopens it as the director left it, with no call.
describe('1G: a thread on the old shapes, through the real graph', () => {
  const SHAPES_MESSAGE = "This session's story meeting was written before the story level. Roll back to the story meeting to write it again.";
  const graph = () => createReportGraphWithCheckpointer(saver);
  const threadOf = (id) => ({ configurable: { thread_id: id, sessionId: id, theme: 'journalist', dataDir } });
  /** The thread as one on the new code reaches the meeting, past every answered stop, with nothing written after the meeting. */
  const base = (id) => {
    const { weave: _weave, _weaveBaseline: _baseline, meetingApproved: _approved, outline: _outline, _mapBaseline: _mapBase, ...state } = reworkFixtureState('journalist');
    return {
      ...state, ...ANSWERED_BEFORE_THE_MEETING, sessionId: id,
      arcRevisionCount: 1, humanArcRevisionCount: 1, evaluationHistory: [{ phase: 'arcs', ready: true }]
    };
  };

  /** Each case: where the thread sits and how it got there, written as the node before it. */
  const CASES = [
    ['paused at the meeting', '1004121', 'arc-selection', (id) => ({ ...base(id), ...oldShapeMeetingChannels() }), 'evaluateArcs'],
    ['paused at the map', '1004122', 'outline', (id) => ({ ...base(id), ...oldShapeMapChannels(), photosPath: null }), 'checkMap'],
    ['complete', '1004123', null, (id) => ({
      ...base(id), ...oldShapeMapChannels(), outlineApproved: true, photosPath: null,
      contentBundle: clone(PREVIOUS_BUNDLE), articleApproved: true, currentPhase: 'complete'
    }), 'assembleHtml']
  ];

  it.each(CASES)('%s: refused, then rolled back to the meeting, where the weave is written fresh in the new shape', async (_case, id, stop, seed, asNode) => {
    mockSdk = scriptedSdk();
    const thread = threadOf(id);
    await graph().updateState(thread, seed(id), asNode);
    if (stop) await graph().invoke(null, { ...thread, recursionLimit: RECURSION_LIMIT, durability: 'sync' });
    const held = await stopOfThread(thread);
    expect(held.type).toBe(stop);
    expect(isOldShapeWeave(held.values.weave)).toBe(true);
    expect(mockSdk.calls).toEqual([]);

    // GET /checkpoint flags it, with the old-shape message: the console shows it and the rollback.
    const checkpoint = await send('GET', `/api/session/${id}/checkpoint`);
    expect(checkpoint.body.oldThread).toMatchObject({ message: SHAPES_MESSAGE, rollbackTo: 'arc-selection' });
    expect(checkpoint.body.checkpoint).toEqual(stop ? { type: stop, oldThread: checkpoint.body.oldThread } : null);

    // Approve, resume and every rollback past the meeting are refused, and nothing ran.
    for (const [route, body] of [['approve', { meeting: 'approve', weave: oldShapeWeave() }], ['resume', {}], ['resume', { force: true }],
      ['rollback', { rollbackTo: 'outline' }], ['rollback', { rollbackTo: 'photos' }]]) {
      const res = await send('POST', `/api/session/${id}/${route}`, body);
      expect(`${route} ${res.status} ${res.body.error}`).toBe(`${route} 409 ${SHAPES_MESSAGE}`);
    }
    expect((await stopOfThread(thread)).id).toBe(held.id);
    expect(mockSdk.calls).toEqual([]);

    // The rollback to the meeting: the weave writer and the fact check run once each, and the
    // meeting opens on a weave in the new shape, with nothing of the old shapes beside it.
    const rollback = await send('POST', `/api/session/${id}/rollback`, { rollbackTo: 'arc-selection' });
    expect(rollback.status).toBe(200);
    await Promise.allSettled([..._inFlight]);
    expect(getSessionOutcome(id)).toMatchObject({ outcome: 'interrupted', checkpointType: 'arc-selection' });
    const meeting = await stopOfThread(thread);
    expect(meeting.type).toBe(CHECKPOINT_TYPES.ARC_SELECTION);
    expect(mockSdk.calls).toEqual(['weave writer', 'fact check']);
    const { weave, _weaveBaseline: baseline } = meeting.values;
    expect(isOldShapeWeave(weave)).toBe(false);
    expect(isOldShapeWeave(baseline)).toBe(false);
    weave.threads.forEach((t) => expect(`${t.id}: ${typeof t.line} ${Array.isArray(t.evidence)}`).toBe(`${t.id}: string true`));
    expect(weaveForPrompt(baseline)).toEqual(weaveForPrompt(weave));
    expect(meeting.values._arcValidation.weaveKey).toBe(weaveKey(weave));
    expect(meeting.values).toMatchObject({
      _weaveHandEdits: null, _weaveMarks: null, _weaveHandEditReport: null,
      outline: null, _mapBaseline: null, _outlineHandEdits: null, _mapCheck: null, heroImage: null,
      contentBundle: null, arcRevisionCount: 0, humanArcRevisionCount: 0
    });
    expect(meeting.values.meetingApproved).not.toBe(true);

    // The thread is on the new shapes now: GET /checkpoint flags nothing and sends the meeting's payload.
    const after = await send('GET', `/api/session/${id}/checkpoint`);
    expect(after.body.oldThread).toBeNull();
    expect(isOldShapeWeave(after.body.checkpoint.weave)).toBe(false);
  });

  it('a thread on the new shapes at the map is untouched: no flag, and its rollback to the meeting reopens it with no call', async () => {
    mockSdk = scriptedSdk();
    const id = '1004124';
    const thread = threadOf(id);
    const shown = withFactCheckMark(clone(reworkFixtureState('journalist').weave), { at: '2026-10-05T00:00:00.000Z', ready: true, fixes: 0 });
    await graph().updateState(thread, {
      ...base(id), weave: shown, _weaveBaseline: clone(reworkFixtureState('journalist').weave), meetingApproved: true,
      outline: clone(MAP), _mapBaseline: clone(MAP), photosPath: null
    }, 'checkMap');
    await graph().invoke(null, { ...thread, recursionLimit: RECURSION_LIMIT, durability: 'sync' });
    expect((await stopOfThread(thread)).type).toBe(CHECKPOINT_TYPES.OUTLINE);
    expect((await send('GET', `/api/session/${id}/checkpoint`)).body.oldThread).toBeNull();

    const rollback = await send('POST', `/api/session/${id}/rollback`, { rollbackTo: 'arc-selection' });
    expect(rollback.status).toBe(200);
    await Promise.allSettled([..._inFlight]);
    const meeting = await stopOfThread(thread);
    expect(meeting.type).toBe(CHECKPOINT_TYPES.ARC_SELECTION);
    expect(mockSdk.calls).toEqual([]);
    expect(weaveForPrompt(meeting.values.weave)).toEqual(weaveForPrompt(shown));
    expect(meeting.values).toMatchObject({ arcRevisionCount: 1, humanArcRevisionCount: 1 });
  });
});

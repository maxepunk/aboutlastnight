/**
 * 4.12a: the stops log through the REAL graph and the real server (phase 4, brief 4.12a; R8;
 * spec section 13). The brief's verification, with no model call.
 *
 * A thread seeded as the arc writer leaves it, every stop before the meeting answered, runs
 * through the story meeting, the map and the desk on the actual `app` exported by server.js
 * and its real graph, checkpointed in the server's own database (Jest points it at a temp
 * file). The director acts with the e2e harness's own payloads (scripts/lib/stop-payloads.js,
 * the console's builders): a reweave and an approve at the meeting, an approve on the map, and
 * a send-back at the desk. `data/<id>/stops.jsonl` gets one line per pause and one per
 * action, each pause with the words its stop shows, and the harness's step mode prints each
 * stop from the payload the server sent (scripts/lib/stop-print.js).
 *
 * The model calls go to a scripted stand-in, injected through the graph's config
 * (createGraphAndConfig); the session's folder and the stops log are temp folders, and the
 * article is never approved, so nothing is published. Invented text throughout.
 */
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
process.env.ACCESS_PASSWORD = 'test-password';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

/** What the server's graph config carries for this run: the scripted model and the temp folder. */
let mockConfigurable = {};

jest.mock('../../lib/api-helpers', () => {
  const actual = jest.requireActual('../../lib/api-helpers');
  return {
    ...actual,
    createGraphAndConfig: (sessionId, theme, options) => {
      const out = actual.createGraphAndConfig(sessionId, theme, options);
      Object.assign(out.config.configurable, mockConfigurable);
      return out;
    }
  };
});

const { SqliteSaver } = require('@langchain/langgraph-checkpoint-sqlite');
const { app, CHECKPOINT_DB_PATH, _inFlight } = require('../../server.js');
const { createReportGraphWithCheckpointer } = require('../../lib/workflow/graph');
const { _resetLocks } = require('../../lib/session-locks');
const { _resetOutcomeStore } = require('../../lib/session-outcome');
const stopsLog = require('../../lib/stops-log');
const { wordsShown } = require('../../lib/stop-pages');
const { stopApproval } = require('../../scripts/lib/stop-payloads');
const { stopPrint } = require('../../scripts/lib/stop-print');
const View = require('../../console/checkpoint-view-logic');
const { reworkFixtureState, DOCUMENT_TEXT, MAP } = require('../../lib/__tests__/fixtures/rework-state');

const SESSION = '100426';
const clone = (v) => JSON.parse(JSON.stringify(v));
const paragraph = (text) => ({ type: 'paragraph', text });

const CLEAN = { ready: true, structuralPassed: true, overallScore: 1, criteriaScores: {}, structuralIssues: [], advisoryWarnings: [], confidence: 'high' };

/** Every stop before the meeting, already answered, so the replay from START passes each without a call. */
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

/** The photo branch, already run, so each of its nodes passes without a call or a stop. */
const PHOTOS_DONE = { photosPath: 'photos', preprocessStats: { processed: 2 }, characterIdMappings: {} };

/** The article writer's first draft: every roster player named, its card copied from the record, both kept photos placed. */
function writersDraft() {
  return {
    metadata: { sessionId: SESSION, theme: 'journalist', generatedAt: '2026-10-04T10:00:00.000Z' },
    headline: { main: 'The Room Voted Overdose. The Ledger Kept Talking.', kicker: 'NovaNews', deck: MAP.deck },
    heroImage: { filename: 'hero.jpg', caption: 'Alex, Morgan and Sarah at the table.' },
    sections: [
      { id: 'lede', type: 'narrative', content: [paragraph('Alex and Morgan deadlocked, and six votes named an accidental overdose.')] },
      {
        id: 'theStory', type: 'narrative', heading: 'The Story',
        content: [
          paragraph('Marcus bragged about the sale the night he died.'),
          { type: 'evidence-card', tokenId: 'ale003', headline: 'The brag', content: DOCUMENT_TEXT.ale003, owner: 'Alex Reeves', significance: 'critical' },
          { type: 'photo', filename: 'p2.jpg', caption: 'Alex leans over the ledger and points at a line.' },
          paragraph('Morgan handed Riley an envelope by the bar, and a paternity result named Sarah as the heir.')
        ]
      },
      { id: 'closing', type: 'conclusion', content: [paragraph('Riley says they only kept the books.')] }
    ]
  };
}

/**
 * A scripted SDK: the meeting's fact check by its system prompt, the reweave by its label (the
 * weave it was given, where its first angle ends reworded), the map writer and the article writer by their
 * schemas, the article's rework by its label (the article it was given), and every other call
 * (the article's judge) a clean verdict.
 */
function scriptedSdk() {
  const calls = [];
  const sdk = async (options) => {
    const label = options.label || '';
    const schemaId = options.jsonSchema && options.jsonSchema.$id;
    if (/WEAVE fact check/.test(options.systemPrompt || '')) {
      calls.push('fact check');
      return clone(CLEAN);
    }
    if (/^Arc revision/.test(label)) {
      calls.push('reweave');
      const weave = clone(reworkFixtureState('journalist').weave);
      weave.angles[0].ends = 'The verdict closes the night; the ledger keeps it open.';
      return weave;
    }
    if (schemaId === 'outline') {
      calls.push('map writer');
      return clone(MAP);
    }
    // The article's rework writes to the bundle's schema too, so it is found by its label first.
    if (/^Article revision/.test(label)) {
      calls.push('article rework');
      return writersDraft();
    }
    if (schemaId === 'content-bundle') {
      calls.push('article writer');
      return writersDraft();
    }
    calls.push('judge');
    return clone(CLEAN);
  };
  sdk.calls = calls;
  return sdk;
}

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

/** A POST the runner takes in the background, waited for to the end of its run. */
async function postAndWait(route, body) {
  const res = await send('POST', `/api/session/${SESSION}/${route}`, body);
  expect([route, res.status, res.body && res.body.error]).toEqual([route, 200, undefined]);
  await Promise.all([..._inFlight]);
}

/** The stop the thread is paused at, as GET /checkpoint delivers it to the harness. */
async function stopNow() {
  const res = await send('GET', `/api/session/${SESSION}/checkpoint`);
  expect(res.status).toBe(200);
  expect(res.body.interrupted).toBe(true);
  return res.body.checkpoint;
}

/** The director's action at the stop, with the harness's own payload. */
async function act(stop, options) {
  const data = await stopNow();
  expect(data.type).toBe(stop);
  const built = stopApproval(stop, data, options);
  expect(built.refusal).toBeUndefined();
  await postAndWait('approve', built.payload);
}

const linesOf = () => fs.readFileSync(path.join(dir, SESSION, 'stops.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));

beforeAll(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  jest.spyOn(console, 'log').mockImplementation(() => {});
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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-stops-graph-'));
  stopsLog.setStopsLogRoot(dir);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  stopsLog._resetForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('4.12a: a run through the story meeting, the map and the desk writes the stops log', () => {
  it('writes one line per pause and one per action, each pause with the words its stop shows, and step mode prints each stop', async () => {
    const sdk = scriptedSdk();
    mockConfigurable = { sdkClient: sdk, dataDir: dir };

    // The thread as the arc writer leaves it, in the server's own database.
    const saver = SqliteSaver.fromConnString(CHECKPOINT_DB_PATH);
    const seeding = createReportGraphWithCheckpointer(saver);
    const { meetingApproved: _approved, outline: _outline, _mapBaseline: _baseline, ...state } = reworkFixtureState('journalist');
    await seeding.updateState({ configurable: { thread_id: SESSION } }, {
      ...state, ...ANSWERED_BEFORE_THE_MEETING, ...PHOTOS_DONE,
      sessionId: SESSION, weave: clone(state.weave), _weaveBaseline: clone(state.weave), evaluationHistory: []
    }, 'analyzeArcs');
    saver.db.close();

    // The run reaches the story meeting, and the director asks for a reweave, then approves.
    const shown = {};
    await postAndWait('resume', {});
    shown.meeting1 = await stopNow();
    await act('arc-selection', { action: 'reweave', note: 'Bring the ledger into where the story ends up.' });
    shown.meeting2 = await stopNow();
    await act('arc-selection', { action: 'approve' });
    // The map, approved as it stands.
    shown.map = await stopNow();
    await act('outline', { action: 'approve' });
    // The desk, sent back once.
    shown.desk1 = await stopNow();
    await act('article', { action: 'send-back', note: 'Tighten the story.' });
    shown.desk2 = await stopNow();

    expect(sdk.calls).toEqual(['fact check', 'reweave', 'fact check', 'map writer', 'article writer', 'judge', 'article rework', 'judge']);

    const lines = linesOf();
    expect(lines.map((line) => (line.kind === 'pause' ? ['pause', line.stop, line.round] : ['action', line.stop, line.round, line.action]))).toEqual([
      ['pause', 'arc-selection', 1],
      ['action', 'arc-selection', 1, 'reweave'],
      ['pause', 'arc-selection', 2],
      ['action', 'arc-selection', 2, 'approve'],
      ['pause', 'outline', 1],
      ['action', 'outline', 1, 'approve'],
      ['pause', 'article', 1],
      ['action', 'article', 1, 'send-back'],
      ['pause', 'article', 2]
    ]);

    // Each pause carries the words its stop showed, counted over the payload the server sent.
    const pauses = lines.filter((line) => line.kind === 'pause');
    const payloads = [shown.meeting1, shown.meeting2, shown.map, shown.desk1, shown.desk2];
    pauses.forEach((line, i) => {
      expect([line.stop, line.words]).toEqual([line.stop, wordsShown(line.stop, payloads[i])]);
      expect(line.words).toBeGreaterThan(0);
    });
    // The times only order the lines.
    const times = lines.map((line) => Date.parse(line.at));
    expect(times).toEqual([...times].sort((a, b) => a - b));

    // Step mode prints each stop from the same payload: the meeting's weave, the map's sections,
    // the desk's article, from the console's view models.
    const text = (stop, data) => stopPrint(stop, data).map((line) => line.text).join('\n');
    expect(text('arc-selection', shown.meeting2)).toContain('The verdict closes the night; the ledger keeps it open.');
    View.mapView(shown.map, View.mapDraftOf(shown.map)).sections.forEach((section) => {
      expect(text('outline', shown.map)).toContain(`Job: ${section.job}`);
    });
    expect(text('article', shown.desk2)).toContain('Marcus bragged about the sale the night he died.');
    expect(text('article', shown.desk2)).toContain(shown.desk2.settledStory.story);
  });
});

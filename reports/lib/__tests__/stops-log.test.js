process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
/**
 * 4.12a: the stops log (phase 4, brief 4.12a; R8; spec section 13).
 *
 * `data/<id>/stops.jsonl` gets a line each time a run pauses at a new stop, or at a new round
 * of one, with the stop, the round and the words the stop shows (lib/stop-pages.js), and a line
 * for each action the director takes (approve, reweave or send back), with its stop and round.
 * The time on each line orders the lines and joins the call log, and nothing else. The next
 * session's readout counts from it how many times the pipeline called the director back and
 * how much they read at each return.
 *
 * Like the call log (lib/observability/llm-call-log.js), the log writes nothing under Jest until
 * a test sets its root, and it never throws into a run. Invented text throughout.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const stopsLog = require('../stops-log');
const { wordsShown } = require('../stop-pages');
const { meetingCheckpointData } = require('../meeting');
const { mapCheckpointData } = require('../map');
const { reworkFixtureState } = require('./fixtures/rework-state');
const { buildResumePayload } = require('../../server.js');
const View = require('../../console/checkpoint-view-logic');

const SESSION = '100326';

const meetingState = () => ({ ...reworkFixtureState('journalist'), meetingApproved: null });
const meetingData = (state = meetingState()) => ({ type: 'arc-selection', ...meetingCheckpointData(state, { evidenceIndex: {}, maxRevisions: 1 }) });
const mapData = (state = reworkFixtureState('journalist')) => ({
  type: 'outline', ...mapCheckpointData(state, { keptPhotos: ['hero.jpg', 'p2.jpg'], evidenceIndex: {}, maxRevisions: 1 }), trace: []
});

let dir;
const linesOf = (sessionId = SESSION) => {
  const file = path.join(dir, sessionId, 'stops.jsonl');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)) : [];
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-stops-log-'));
  stopsLog.setStopsLogRoot(dir);
});

afterEach(() => {
  stopsLog._resetForTests();
  fs.rmSync(dir, { recursive: true, force: true });
  jest.restoreAllMocks();
});

describe('4.12a: where the stops log is written', () => {
  it('is data/<id>/stops.jsonl under its root', () => {
    expect(stopsLog.stopsLogPath(SESSION)).toBe(path.join(dir, SESSION, 'stops.jsonl'));
  });

  it('writes nothing under Jest until a test sets its root, as the call log does', () => {
    stopsLog._resetForTests();
    const append = jest.spyOn(fs, 'appendFileSync');
    const write = jest.spyOn(fs, 'writeFileSync');
    stopsLog.recordPause(SESSION, { stop: 'arc-selection', state: meetingState(), data: meetingData() });
    stopsLog.recordAction(SESSION, { stop: 'arc-selection', state: meetingState(), resume: { approved: true } });
    expect(append).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
});

describe('4.12a: a line for each pause at a new stop or a new round of one', () => {
  it('writes the stop, its round, the words its page shows, and the time', () => {
    const data = meetingData();
    stopsLog.recordPause(SESSION, { stop: 'arc-selection', state: meetingState(), data });
    const [line] = linesOf();
    expect(Object.keys(line)).toEqual(['at', 'kind', 'stop', 'round', 'words']);
    expect(line).toMatchObject({ kind: 'pause', stop: 'arc-selection', round: 1, words: wordsShown('arc-selection', data) });
    expect(line.words).toBeGreaterThan(0);
    expect(new Date(line.at).toISOString()).toBe(line.at);
  });

  it('counts the words at the story meeting, the map and the desk, and records none at a stop with no page', () => {
    const map = mapData();
    stopsLog.recordPause(SESSION, { stop: 'outline', state: reworkFixtureState('journalist'), data: map });
    stopsLog.recordPause(SESSION, { stop: 'photos', state: {}, data: { type: 'photos', defaultDir: 'd', found: 3 } });
    stopsLog.recordPause(SESSION, { stop: 'input-review', state: {}, data: { type: 'input-review' } });
    expect(linesOf().map((line) => [line.stop, line.words])).toEqual([
      ['outline', wordsShown('outline', map)],
      ['photos', null],
      ['input-review', null]
    ]);
  });

  it('writes new pauses only: the same stop and round again is no new line, as a /resume replay or a reload reaches it', () => {
    const state = meetingState();
    const data = meetingData(state);
    stopsLog.recordPause(SESSION, { stop: 'arc-selection', state, data });
    stopsLog.recordPause(SESSION, { stop: 'arc-selection', state, data });
    expect(linesOf()).toHaveLength(1);

    // A new round of the stop is a new pause.
    const round2 = { ...state, humanArcRevisionCount: 1 };
    stopsLog.recordPause(SESSION, { stop: 'arc-selection', state: round2, data: meetingData(round2) });
    // A new stop is a new pause.
    stopsLog.recordPause(SESSION, { stop: 'photos', state: round2, data: { type: 'photos' } });
    // Back at the stop before, after the director acted elsewhere: a new pause, a return.
    stopsLog.recordAction(SESSION, { stop: 'photos', state: round2, resume: { photosPath: 'p' } });
    stopsLog.recordPause(SESSION, { stop: 'photos', state: round2, data: { type: 'photos' } });
    expect(linesOf().map((line) => [line.kind, line.stop, line.round])).toEqual([
      ['pause', 'arc-selection', 1],
      ['pause', 'arc-selection', 2],
      ['pause', 'photos', 1],
      ['action', 'photos', 1],
      ['pause', 'photos', 1]
    ]);
  });

  it('writes the first pause of a fresh start, whatever the last line was', () => {
    const state = meetingState();
    stopsLog.recordPause(SESSION, { stop: 'paper-evidence-selection', state, data: { type: 'paper-evidence-selection' } });
    stopsLog.recordPause(SESSION, { stop: 'paper-evidence-selection', state, data: { type: 'paper-evidence-selection' }, fresh: true });
    expect(linesOf()).toHaveLength(2);
  });

  it('numbers the round: the director\'s rounds at the meeting, the map and the article, the corrections at the input review, one elsewhere', () => {
    expect(stopsLog.stopRound('arc-selection', { humanArcRevisionCount: 2 })).toBe(3);
    expect(stopsLog.stopRound('outline', { humanOutlineRevisionCount: 1 })).toBe(2);
    expect(stopsLog.stopRound('article', { humanArticleRevisionCount: 0 })).toBe(1);
    expect(stopsLog.stopRound('article', {})).toBe(1);
    expect(stopsLog.stopRound('input-review', { inputReviewCorrections: ['The room accused no one.'] })).toBe(2);
    expect(stopsLog.stopRound('input-review', { inputReviewCorrections: null })).toBe(1);
    ['photos', 'character-ids', 'await-roster', 'evidence-and-photos'].forEach((stop) => {
      expect([stop, stopsLog.stopRound(stop, { humanArcRevisionCount: 4 })]).toEqual([stop, 1]);
    });
  });
});

describe('4.12a: one line for each action the director takes', () => {
  /** The resume the server builds for a payload at a stop, as the approve endpoint does. */
  function resumeFor(approvals, state, stop) {
    const { resume, error } = buildResumePayload(approvals, state, 'journalist', stop);
    expect(error).toBeNull();
    return resume;
  }

  it('names the action from the resume: approve, reweave or send-back', () => {
    const state = meetingState();
    const data = meetingData(state);
    const weave = View.meetingDraftOf(data);
    const actions = [
      resumeFor(View.meetingPayload('approve', data, weave, ''), state, 'arc-selection'),
      resumeFor(View.meetingPayload('reweave', data, weave, 'Make the ledger the main thread.'), state, 'arc-selection'),
      resumeFor(View.meetingPayload('send-back', data, weave, 'Rethink the weave around the heir.'), state, 'arc-selection')
    ].map((resume) => stopsLog.actionOf(resume));
    expect(actions).toEqual(['approve', 'reweave', 'send-back']);

    const mapState = reworkFixtureState('journalist');
    const map = View.mapDraftOf(mapData(mapState));
    expect(stopsLog.actionOf(resumeFor(View.mapPayload('approve', map, ''), mapState, 'outline'))).toBe('approve');
    expect(stopsLog.actionOf(resumeFor(View.mapPayload('send-back', map, 'Move the vote earlier.'), mapState, 'outline'))).toBe('send-back');
    expect(stopsLog.actionOf(resumeFor({ inputReview: false, inputFeedback: 'The room accused no one.' }, {}, 'input-review'))).toBe('send-back');
    expect(stopsLog.actionOf(resumeFor({ selectedPaperEvidence: [] }, {}, 'paper-evidence-selection'))).toBe('approve');
  });

  it('writes the stop, the round the action was taken in, the action and the time, one line each', () => {
    const state = { ...meetingState(), humanArcRevisionCount: 1 };
    stopsLog.recordAction(SESSION, { stop: 'arc-selection', state, resume: { approved: false, round: 'reweave' } });
    stopsLog.recordAction(SESSION, { stop: 'arc-selection', state, resume: { approved: true } });
    const lines = linesOf();
    expect(lines.map((line) => Object.keys(line))).toEqual([['at', 'kind', 'stop', 'round', 'action'], ['at', 'kind', 'stop', 'round', 'action']]);
    expect(lines.map(({ kind, stop, round, action }) => ({ kind, stop, round, action }))).toEqual([
      { kind: 'action', stop: 'arc-selection', round: 2, action: 'reweave' },
      { kind: 'action', stop: 'arc-selection', round: 2, action: 'approve' }
    ]);
  });
});

describe('4.12a: the stops log never throws into a run', () => {
  it('a log it cannot write warns once, and the run goes on', () => {
    const blocker = path.join(dir, 'a-file');
    fs.writeFileSync(blocker, 'not a folder');
    stopsLog.setStopsLogRoot(blocker);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => {
      stopsLog.recordPause(SESSION, { stop: 'photos', state: {}, data: { type: 'photos' } });
      stopsLog.recordAction(SESSION, { stop: 'photos', state: {}, resume: {} });
    }).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('a page it cannot build is recorded with no words, and the reason is said', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    stopsLog.recordPause(SESSION, { stop: 'arc-selection', state: {}, data: { type: 'arc-selection' } });
    expect(linesOf().map((line) => [line.stop, line.words])).toEqual([['arc-selection', null]]);
    expect(warn.mock.calls.map((call) => call.join(' ')).join('\n')).toMatch(/story meeting.*weave/);
  });
});

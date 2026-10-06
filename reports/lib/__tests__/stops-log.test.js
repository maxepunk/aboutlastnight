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
const { stopRoundOf } = require('../workflow/state');
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

  // Task 4.12c: the input review has a page now (4.12c's describe below counts it), so the
  // stops with no page here are the photos stop and the pre-curation stop.
  it('counts the words at the story meeting, the map and the desk, and records none at a stop with no page', () => {
    const map = mapData();
    stopsLog.recordPause(SESSION, { stop: 'outline', state: reworkFixtureState('journalist'), data: map });
    stopsLog.recordPause(SESSION, { stop: 'photos', state: {}, data: { type: 'photos', defaultDir: 'd', found: 3 } });
    stopsLog.recordPause(SESSION, { stop: 'pre-curation', state: {}, data: { type: 'pre-curation' } });
    expect(linesOf().map((line) => [line.stop, line.words])).toEqual([
      ['outline', wordsShown('outline', map)],
      ['photos', null],
      ['pre-curation', null]
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
    expect(stopRoundOf('arc-selection', { humanArcRevisionCount: 2 })).toBe(3);
    expect(stopRoundOf('outline', { humanOutlineRevisionCount: 1 })).toBe(2);
    expect(stopRoundOf('article', { humanArticleRevisionCount: 0 })).toBe(1);
    expect(stopRoundOf('article', {})).toBe(1);
    expect(stopRoundOf('input-review', { inputReviewCorrections: ['The room accused no one.'] })).toBe(2);
    expect(stopRoundOf('input-review', { inputReviewCorrections: null })).toBe(1);
    ['photos', 'character-ids', 'await-roster', 'evidence-and-photos'].forEach((stop) => {
      expect([stop, stopRoundOf(stop, { humanArcRevisionCount: 4 })]).toEqual([stop, 1]);
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
      resumeFor(View.meetingPayload('reweave', data, weave, 'Lead with the money.'), state, 'arc-selection'),
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

// The review of 4.12a, finding 1: the log, the director's notes (each note's `stopRound`,
// server.js appendGateNote) and the meeting's lookup of a round's note (lib/meeting.js
// unrunRoundNoteIndex) each counted a stop's round in a copy of their own, and the readout
// joins the log's lines to the notes on that round. The log reads the one rule where the
// thread state keeps it; the notes and the lookup are held to it here.
describe('4.12a fix round 1: a stop\'s round is one rule, stopRoundOf (lib/workflow/state.js)', () => {
  const { DIRECTOR_ROUND_COUNTERS } = require('../workflow/state');
  const { CHECKPOINT_TYPES } = require('../workflow/checkpoint-helpers');
  const { unrunRoundNoteIndex } = require('../meeting');
  const { PREVIOUS_BUNDLE } = require('./fixtures/rework-state');
  const NOTE = 'Lead with the money.';

  it('the log writes stopRoundOf\'s round on every line and keeps no copy of the rule', () => {
    expect(DIRECTOR_ROUND_COUNTERS).toEqual({
      [CHECKPOINT_TYPES.ARC_SELECTION]: 'humanArcRevisionCount',
      [CHECKPOINT_TYPES.OUTLINE]: 'humanOutlineRevisionCount',
      [CHECKPOINT_TYPES.ARTICLE]: 'humanArticleRevisionCount'
    });
    expect(Object.isFrozen(DIRECTOR_ROUND_COUNTERS)).toBe(true);
    expect(stopsLog).not.toHaveProperty('stopRound');
    expect(fs.readFileSync(require.resolve('../stops-log'), 'utf8')).not.toMatch(/human(Arc|Outline|Article)RevisionCount|inputReviewCorrections/);

    const state = { ...meetingState(), humanArcRevisionCount: 2, humanOutlineRevisionCount: 1, humanArticleRevisionCount: 3 };
    stopsLog.recordPause(SESSION, { stop: 'arc-selection', state, data: meetingData(state) });
    stopsLog.recordPause(SESSION, { stop: 'input-review', state, data: { type: 'input-review' } });
    ['arc-selection', 'outline', 'article', 'input-review', 'photos'].forEach((stop) => {
      stopsLog.recordAction(SESSION, { stop, state, resume: { approved: true } });
    });
    expect(linesOf().map((line) => [line.kind, line.stop, line.round])).toEqual([
      ['pause', 'arc-selection', 3],
      ['pause', 'input-review', 2],
      ['action', 'arc-selection', 3],
      ['action', 'outline', 2],
      ['action', 'article', 4],
      ['action', 'input-review', 2],
      ['action', 'photos', 1]
    ]);
    expect(linesOf().every((line) => line.round === stopRoundOf(line.stop, state))).toBe(true);
  });

  it('each director\'s note records the same round (server.js appendGateNote), and the meeting finds a round\'s note by it (lib/meeting.js unrunRoundNoteIndex)', () => {
    /** The note the server files with an action at a stop: the last of the standing notes it writes. */
    const noteFiled = (stop, state, payload) => {
      const { stateUpdates, error } = buildResumePayload(payload, state, 'journalist', stop);
      expect(error).toBeNull();
      return stateUpdates.directorGateNotes[stateUpdates.directorGateNotes.length - 1];
    };
    [0, 2].forEach((rounds) => {
      const meeting = { ...meetingState(), humanArcRevisionCount: rounds };
      const data = meetingData(meeting);
      const map = { ...reworkFixtureState('journalist'), humanOutlineRevisionCount: rounds };
      const desk = { ...reworkFixtureState('journalist'), contentBundle: PREVIOUS_BUNDLE, humanArticleRevisionCount: rounds };
      expect([
        noteFiled('arc-selection', meeting, View.meetingPayload('reweave', data, View.meetingDraftOf(data), NOTE)).stopRound,
        noteFiled('outline', map, View.mapPayload('send-back', View.mapDraftOf(mapData(map)), NOTE)).stopRound,
        noteFiled('article', desk, View.articleReviewPayload(null, NOTE, 'send-back')).stopRound
      ]).toEqual([stopRoundOf('arc-selection', meeting), stopRoundOf('outline', map), stopRoundOf('article', desk)]);

      // A round that did not run: the meeting takes its note back only from the round stopRoundOf gives.
      const round = stopRoundOf('arc-selection', meeting);
      const lookup = (filedIn) => unrunRoundNoteIndex({
        humanArcRevisionCount: rounds,
        _arcReworkTimeout: { round: 'reweave', note: NOTE },
        directorGateNotes: [{ gate: 'arc-selection', kind: 'rejection', round: 1, stopRound: filedIn, text: NOTE, at: 't0' }]
      });
      expect([lookup(round - 1), lookup(round), lookup(round + 1)]).toEqual([-1, 0, -1]);
    });
  });
});

// Task 4.12c (ruling 4 on 4.12a's minors): the readout counts the words at every return, and the
// input review's and the character-IDs stop's pauses counted none.
describe('4.12c: the words at the input review and the character-IDs stop', () => {
  it('counts each over its page, as at the three decision stops', () => {
    const review = {
      type: 'input-review',
      sessionConfig: { accusation: { accused: ['Alex'], charge: 'Sold the company out from under Marcus', verdictKind: 'culprit' } },
      directorNotes: { whiteboard: { ambiguities: ['A name under the coffee stain'] } },
      ledger: { clock: { decided: true, evening: false, firstTime: '09:10 AM' }, adjustmentsParsed: true, accounts: [{ name: 'Melanie', total: 75000, tokenCount: 1 }], adjustments: [], mismatches: [], unclassified: [] }
    };
    const photos = {
      type: 'character-ids',
      photoAnalyses: { analyses: [{ filename: 'hero.jpg', visualContent: 'Alex and Morgan at the bar.', characterDescriptions: [] }] },
      sessionPhotos: ['/p/hero.jpg'],
      leftOutPhotos: []
    };
    stopsLog.recordPause(SESSION, { stop: 'input-review', state: {}, data: review });
    stopsLog.recordPause(SESSION, { stop: 'character-ids', state: {}, data: photos });
    expect(linesOf().map((line) => [line.stop, line.words])).toEqual([
      ['input-review', wordsShown('input-review', review)],
      ['character-ids', wordsShown('character-ids', photos)]
    ]);
    linesOf().forEach((line) => expect([line.stop, line.words > 0]).toEqual([line.stop, true]));
  });
});

// Task 4.12c (ruling 4 on 4.12a's minors): a forced /start appended to the old run's log with no
// mark, so the readout could not tell where the run it measures begins.
describe('4.12c: a fresh start\'s first pause is marked', () => {
  it('carries fresh: true, so the readout sees where the run it measures begins', () => {
    const state = meetingState();
    stopsLog.recordPause(SESSION, { stop: 'paper-evidence-selection', state, data: { type: 'paper-evidence-selection' } });
    stopsLog.recordPause(SESSION, { stop: 'paper-evidence-selection', state, data: { type: 'paper-evidence-selection' }, fresh: true });
    const [before, fresh] = linesOf();
    expect(Object.keys(fresh)).toEqual(['at', 'kind', 'stop', 'round', 'words', 'fresh']);
    expect(fresh).toMatchObject({ kind: 'pause', stop: 'paper-evidence-selection', round: 1, fresh: true });
    // Every other line carries no mark.
    expect(before).not.toHaveProperty('fresh');
    stopsLog.recordAction(SESSION, { stop: 'paper-evidence-selection', state, resume: { approved: true } });
    expect(linesOf()[2]).not.toHaveProperty('fresh');
  });
});

// Task 4.12c (ruling 4 on 4.12a's minors): a rollback to the article writes it again from the map
// and starts its rounds over (R9), so the director's new article in round 1 got no line.
describe('4.12c: a pause after a rollback that rewrote its stop is a new return', () => {
  const { ROLLBACK_CLEARS, VALID_ROLLBACK_POINTS } = require('../workflow/state');
  const { buildRollbackState, rollbackSeedClears } = require('../api-helpers');
  /** What a point's seed clears, for a thread on the new shapes: its list in the rollback table. */
  const clearsOf = (point) => rollbackSeedClears(buildRollbackState(point));
  const deskState = (extra = {}) => ({ ...reworkFixtureState('journalist'), humanArticleRevisionCount: 0, ...extra });
  const deskData = () => ({ type: 'article', contentBundle: require('./fixtures/rework-state').PREVIOUS_BUNDLE, directorGateNotes: [], trace: [] });

  it('a rollback to the article writes the article again in round 1: its pause is a new line, though the last line is the article in round 1', () => {
    stopsLog.recordPause(SESSION, { stop: 'article', state: deskState(), data: deskData() });
    stopsLog.recordPause(SESSION, { stop: 'article', state: deskState(), data: deskData(), rollbackClears: clearsOf('article') });
    expect(linesOf().map((line) => [line.kind, line.stop, line.round])).toEqual([['pause', 'article', 1], ['pause', 'article', 1]]);
    // Its line is a pause like any other: the words the new article shows.
    expect(linesOf()[1]).toEqual({ at: linesOf()[1].at, kind: 'pause', stop: 'article', round: 1, words: wordsShown('article', deskData()) });
  });

  it('a rollback that reopens a stop as the director left it is no new line: the map, the story meeting (R9)', () => {
    const map = reworkFixtureState('journalist');
    stopsLog.recordPause(SESSION, { stop: 'outline', state: map, data: mapData(map) });
    stopsLog.recordPause(SESSION, { stop: 'outline', state: map, data: mapData(map), rollbackClears: clearsOf('outline') });
    const meeting = meetingState();
    stopsLog.recordPause(SESSION, { stop: 'arc-selection', state: meeting, data: meetingData(meeting) });
    stopsLog.recordPause(SESSION, { stop: 'arc-selection', state: meeting, data: meetingData(meeting), rollbackClears: clearsOf('arc-selection') });
    expect(linesOf().map((line) => [line.stop, line.round])).toEqual([['outline', 1], ['arc-selection', 1]]);
  });

  it('a stop is rewritten when the rollback\'s seed clears the output it shows (rewritesStop, read from rollbackSeedClears)', () => {
    const { rewritesStop, STOP_OUTPUTS } = stopsLog;
    expect(rewritesStop(clearsOf('article'), 'article')).toBe(true);
    expect(rewritesStop(clearsOf('evidence-and-photos'), 'evidence-and-photos')).toBe(true);
    ['outline', 'arc-selection', 'input-review', 'character-ids', 'paper-evidence-selection', 'pre-curation'].forEach((point) => {
      expect([point, rewritesStop(clearsOf(point), point)]).toEqual([point, false]);
    });
    expect(rewritesStop(null, 'article')).toBe(false);
    expect(rewritesStop(clearsOf('article'), 'photos')).toBe(false);
    // On a thread of the new shapes the seed clears its point's list, no more and no less.
    VALID_ROLLBACK_POINTS.forEach((point) => {
      expect([point, clearsOf(point)]).toEqual([point, ROLLBACK_CLEARS[point]]);
      Object.keys(STOP_OUTPUTS).forEach((stop) => {
        expect([point, stop, rewritesStop(clearsOf(point), stop)]).toEqual([point, stop, ROLLBACK_CLEARS[point].includes(STOP_OUTPUTS[stop])]);
      });
    });
  });

  // Fix round 3: an old-shape thread at the meeting in round 1, rolled back to the meeting,
  // has its weave written fresh (lib/old-thread.js oldThreadRollbackState), beyond the
  // meeting point's list. The fresh meeting is in round 1 too, so read from the list alone it
  // matched the log's last line and was never written, and its words never recorded.
  it("an old-shape thread's rollback to the meeting clears its weave, so the fresh meeting's pause is a new line", () => {
    const { oldThreadRollbackState } = require('../old-thread');
    const { oldShapeMeetingChannels } = require('./fixtures/old-shapes');
    const old = { currentPhase: '2.35', theme: 'journalist', ...oldShapeMeetingChannels() };
    const seed = { ...buildRollbackState('arc-selection'), ...oldThreadRollbackState('arc-selection', old) };
    const cleared = rollbackSeedClears(seed);
    expect(cleared).toEqual(expect.arrayContaining(['weave', '_weaveBaseline', '_weaveHandEdits', '_arcValidation', ...ROLLBACK_CLEARS['arc-selection']]));
    expect(cleared).toHaveLength(ROLLBACK_CLEARS['arc-selection'].length + 4);
    expect(stopsLog.rewritesStop(cleared, 'arc-selection')).toBe(true);

    stopsLog.recordPause(SESSION, { stop: 'arc-selection', state: { ...old, humanArcRevisionCount: 0 }, data: { type: 'arc-selection' } });
    const meeting = meetingState();
    stopsLog.recordPause(SESSION, { stop: 'arc-selection', state: meeting, data: meetingData(meeting), rollbackClears: cleared });
    expect(linesOf().map((line) => [line.kind, line.stop, line.round])).toEqual([['pause', 'arc-selection', 1], ['pause', 'arc-selection', 1]]);
    expect(linesOf()[1].words).toBe(wordsShown('arc-selection', meetingData(meeting)));
  });

  it("reads what a seed writes for the run as no clear: the phase it routes from, the stashes that pre-fill a stop", () => {
    const seed = { ...buildRollbackState('photos'), _previousPhotosPath: null, _previousFullContext: null };
    expect(seed.currentPhase).toBeNull();
    expect(rollbackSeedClears(seed)).toEqual(ROLLBACK_CLEARS.photos);
    // A channel the request's overrides set again is no longer cleared.
    expect(rollbackSeedClears({ ...seed, photosPath: 'D:/shoots/1004' })).toEqual(ROLLBACK_CLEARS.photos.filter((channel) => channel !== 'photosPath'));
  });
});

// The re-review of 4.12a's fix round, out of scope there: the trace's round and the reworks'
// banner round computed the rule again. Each calls stopRoundOf now.
describe('4.12c: one round rule everywhere: the trace\'s round and the reworks\' banner round call stopRoundOf', () => {
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const read = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
  /** A function's body, from its signature to its closing brace at the left margin. */
  const body = (src, signature) => {
    const block = src.slice(src.indexOf(signature));
    return block.slice(0, block.indexOf('\n}\n'));
  };
  const COPY = /human(?:Arc|Outline|Article)RevisionCount \|\| 0\) \+ 1/;

  it('the server\'s trace and the increments\' trace and log read the round from stopRoundOf, and keep no copy of the rule', () => {
    const server = read('server.js');
    expect(server).not.toMatch(COPY);
    expect(body(server, 'async function getCheckpointData(').match(/traceForStop\([^\n]*stopRoundOf\(/g)).toHaveLength(2);
    const graph = read('lib/workflow/graph.js');
    expect(graph).not.toMatch(/newHumanCount \+ 1/);
    ['async function incrementOutlineRevision(', 'async function incrementArticleRevision('].forEach((signature) => {
      expect([signature, /stopRoundOf\(/.test(body(graph, signature))]).toEqual([signature, true]);
    });
  });

  it('the arc, map and article reworks\' banner round reads stopRoundOf, and keeps no copy of the rule', () => {
    const arc = read('lib/workflow/nodes/arc-specialist-nodes.js');
    const ai = read('lib/workflow/nodes/ai-nodes.js');
    expect(arc).not.toMatch(COPY);
    expect(ai).not.toMatch(COPY);
    expect(body(arc, 'function arcReworkCall(')).toMatch(/round: stopRoundOf\(/);
    expect(body(ai, 'async function mapReworkCall(')).toMatch(/round: stopRoundOf\(/);
    expect(body(ai, 'async function reviseContentBundle(')).toMatch(/round: stopRoundOf\(/);
  });

  it('the rounds they give are the stop\'s: the trace a stop shows, the trace a pass writes, and the round a send-back\'s banner names', async () => {
    const { getCheckpointData } = require('../../server.js');
    const { _testing: graphTesting } = require('../workflow/graph');
    const { _testing: arcTesting } = require('../workflow/nodes/arc-specialist-nodes');
    const { _testing: aiTesting } = require('../workflow/nodes/ai-nodes');
    const { MAP } = require('./fixtures/rework-state');
    jest.spyOn(console, 'log').mockImplementation(() => {});

    const entry = (round) => ({ pass: 1, round, trigger: 'check', findings: null, before: clone(MAP), at: 't0' });
    const atMap = { ...reworkFixtureState('journalist'), humanOutlineRevisionCount: 2, _outlineTrace: [entry(2), entry(3)] };
    const shown = await getCheckpointData('outline', atMap);
    expect(shown.trace.map((pass) => pass.round)).toEqual([stopRoundOf('outline', atMap)]);

    const pass = await graphTesting.incrementOutlineRevision({ ...reworkFixtureState('journalist'), humanOutlineRevisionCount: 2, _outlineTrace: [] });
    expect(pass._outlineTrace.map((e) => e.round)).toEqual([stopRoundOf('outline', { humanOutlineRevisionCount: 2 })]);

    const meeting = { ...meetingState(), meetingApproved: false, _meetingRound: 'send-back', _arcFeedback: 'Rethink the money thread.', humanArcRevisionCount: 2, arcRevisionCount: 0 };
    expect(arcTesting.arcReworkCall(meeting).prompt).toContain(`(round ${stopRoundOf('arc-selection', meeting)}: the director's send back)`);

    const map = { ...reworkFixtureState('journalist'), _previousOutline: clone(MAP), outline: null, _outlineFeedback: 'Move the vote earlier.', humanOutlineRevisionCount: 2 };
    const call = await aiTesting.mapReworkCall(map, aiTesting.getPromptBuilder({}, map));
    expect(call.prompt).toContain(`(round ${stopRoundOf('outline', map)}: the director's send back)`);
  });
});

// Task 4.12d (the review of 4.12c, minor 5): STOP_OUTPUTS says which channel holds what each stop
// shows, which rewritesStop reads, and it restates what getCheckpointData sends. If a stop's
// output moved to another channel, a rewritten stop would stop counting as a return with no test
// failing, so each entry is held to the stop's payload.
describe('4.12d: STOP_OUTPUTS is held to the server: each stop\'s payload carries the channel it names', () => {
  const { getCheckpointData } = require('../../server.js');
  const { PREVIOUS_BUNDLE } = require('./fixtures/rework-state');

  /** A thread whose every output channel holds a value of its own, so a payload carrying another channel's would show it. */
  const withOutputs = () => ({
    ...reworkFixtureState('journalist'),
    paperEvidence: [{ notionId: 'p-dna', name: 'DNA test', description: 'A paternity result.' }],
    preprocessedEvidence: { items: [{ id: 'ale003', summary: 'Marcus brags about the sale.' }] },
    contentBundle: JSON.parse(JSON.stringify(PREVIOUS_BUNDLE))
  });

  it('names a channel the thread holds for every stop it lists, each a different one', () => {
    const state = withOutputs();
    const channels = Object.values(stopsLog.STOP_OUTPUTS);
    expect(new Set(channels).size).toBe(channels.length);
    channels.forEach((channel) => expect([channel, Boolean(state[channel])]).toEqual([channel, true]));
  });

  it.each(Object.entries(stopsLog.STOP_OUTPUTS))('the %s stop\'s payload carries %s from the state', async (stop, channel) => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const state = withOutputs();
    const data = await getCheckpointData(stop, state);
    expect([channel, Boolean(state[channel]), data[channel]]).toEqual([channel, true, state[channel]]);
  });
});

// The integrator, on the review of 4.12e (finding 3): one rule finds the director's notes, and
// each reader of a note's gate, kind or round reads it.
describe("4.12e, the integrator's consolidation: one rule for finding a note", () => {
  const { noteKindOf, isNoteOf, roundNoteOf } = require('../workflow/state');
  const sentBack = { gate: 'outline', kind: 'rejection', round: 1, stopRound: 1, text: 'Move the vote earlier.' };

  it('a note with no kind is a rejection, as notes filed before the kinds were', () => {
    expect(noteKindOf({ gate: 'outline', text: 'x' })).toBe('rejection');
    expect(noteKindOf({ gate: 'outline', kind: 'approval', text: 'x' })).toBe('approval');
    expect(noteKindOf(null)).toBe('rejection');
  });

  it('isNoteOf matches the gate and the kind, and the round when one is given', () => {
    expect(isNoteOf(sentBack, 'outline', 'rejection')).toBe(true);
    expect(isNoteOf(sentBack, 'outline', 'rejection', 1)).toBe(true);
    expect(isNoteOf(sentBack, 'outline', 'rejection', 2)).toBe(false);
    expect(isNoteOf(sentBack, 'article', 'rejection')).toBe(false);
    expect(isNoteOf(sentBack, 'outline', 'approval')).toBe(false);
    expect(isNoteOf({ gate: 'outline', text: 'x' }, 'outline', 'rejection', 1)).toBe(false);
    expect(isNoteOf(null, 'outline', 'rejection')).toBe(false);
  });

  it('roundNoteOf, the meeting and appendGateNote read it: their sources hold no copy of the kind default', () => {
    const fs = require('fs');
    const path = require('path');
    ['../workflow/state.js', '../meeting.js', '../../server.js', '../prompt-builder.js'].forEach((file) => {
      const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
      expect([file, /kind \|\| 'rejection'/.test(source.replace(/function noteKindOf[\s\S]*?\n\}/, ''))]).toEqual([file, false]);
    });
    expect(roundNoteOf('outline', { humanOutlineRevisionCount: 1, directorGateNotes: [sentBack] })).toBe('Move the vote earlier.');
  });
});

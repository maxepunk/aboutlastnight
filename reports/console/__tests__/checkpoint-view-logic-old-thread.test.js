/**
 * 4.11: a thread from before the story meeting, on screen (phase 4, task 4.11; R2).
 *
 * The server flags such a thread (lib/old-thread.js, on GET /checkpoint and on a refused
 * request's body), with its message and the rollback points open to it. The console shows
 * the message, with the rollback to the story meeting, before any stop renders, and above
 * a finished session's completion: app.js reads it through oldThreadView, here, and the
 * Session screen carries it into a loaded completion (completedResultFrom). The message and
 * the points are the server's; the console words only the button. Every flag here is the
 * server's own (oldThreadOf).
 */
const fs = require('fs');
const path = require('path');
const { oldThreadView } = require('../checkpoint-view-logic');
const { completedResultFrom, classifyCheckpointResponse, startFreshDecision, decideAttachFallback } = require('../session-start-logic');
const { oldThreadOf, oldThreadRefusal } = require('../../lib/old-thread');
const { oldShapeMapChannels } = require('../../lib/__tests__/fixtures/old-shapes');

const FLAG = oldThreadOf({ currentPhase: 'complete' }, null);
const LABELS = { 'arc-selection': 'Story meeting', photos: 'Photos', outline: 'Map' };

describe("4.11: oldThreadView, the server's flag as the console shows it", () => {
  it("the message and the rollback are the server's, and the button says where it goes", () => {
    expect(oldThreadView({ type: 'photos', oldThread: FLAG }, LABELS)).toEqual({
      message: 'This session was started before the story meeting. Roll back to the story meeting to continue.',
      rollbackTo: 'arc-selection',
      rollbackLabel: 'Roll back to the story meeting',
      rollbackPoints: FLAG.rollbackPoints
    });
  });

  it("reads the flag from a stop's payload, a loaded completion and a refused request's body alike", () => {
    const view = oldThreadView({ oldThread: FLAG }, LABELS);
    expect(oldThreadView(completedResultFrom({ sessionId: '092626', currentPhase: 'complete', oldThread: FLAG }), LABELS)).toEqual(view);
    expect(oldThreadView({ ...oldThreadRefusal('092626', FLAG), status: 409 }, LABELS)).toEqual(view);
  });

  it('a thread the server does not flag shows no notice', () => {
    expect(oldThreadView({ type: 'photos', photosPath: null }, LABELS)).toBeNull();
    expect(oldThreadView({ oldThread: null }, LABELS)).toBeNull();
    expect(oldThreadView(null, LABELS)).toBeNull();
    expect(oldThreadView({ oldThread: true }, LABELS)).toBeNull();
    expect(oldThreadView({ oldThread: { message: 'No rollback named.' } }, LABELS)).toBeNull();
  });

  it('a stop the labels lack is named by its type', () => {
    expect(oldThreadView({ oldThread: FLAG }, {}).rollbackLabel).toBe('Roll back to the arc-selection');
  });

  it('a flag with no list of points opens no step of the stepper', () => {
    const { rollbackPoints: _points, ...noPoints } = FLAG;
    expect(oldThreadView({ oldThread: noPoints }, LABELS).rollbackPoints).toEqual([]);
  });
});

// Phase 4b, brief 1G: a session paused on phase 4's shapes is flagged with a line of its own.
// The server decides the line once (lib/old-thread.js oldThreadOf), and the view shows the
// flag's message as it shows the other.
describe("1G: oldThreadView shows an old-shape thread's line, and a thread with no weave keeps its own", () => {
  const SHAPES_LINE = "This session's story meeting was written in an earlier form. Roll back to the story meeting to write it again.";
  const SHAPES_FLAG = oldThreadOf({ currentPhase: '3.25', ...oldShapeMapChannels() }, 'outline');

  it("an old-shape thread's notice reads the brief's line, with the rollback to the story meeting", () => {
    expect(oldThreadView({ type: 'outline', oldThread: SHAPES_FLAG }, LABELS)).toEqual({
      message: SHAPES_LINE,
      rollbackTo: 'arc-selection',
      rollbackLabel: 'Roll back to the story meeting',
      rollbackPoints: FLAG.rollbackPoints
    });
  });

  it("a thread with no weave keeps today's line", () => {
    expect(oldThreadView({ type: 'photos', oldThread: FLAG }, LABELS).message)
      .toBe('This session was started before the story meeting. Roll back to the story meeting to continue.');
  });

  it("a refused request's body and a loaded completion show the same line", () => {
    const view = oldThreadView({ oldThread: SHAPES_FLAG }, LABELS);
    expect(oldThreadView({ ...oldThreadRefusal('100526', SHAPES_FLAG), status: 409 }, LABELS)).toEqual(view);
    expect(oldThreadView(completedResultFrom({ sessionId: '100526', currentPhase: 'complete', oldThread: SHAPES_FLAG }), LABELS)).toEqual(view);
  });
});

describe('4.11: the Session screen carries the flag into a loaded completion', () => {
  it('completedResultFrom keeps the flag when GET /checkpoint sends one', () => {
    expect(completedResultFrom({ sessionId: '092626', currentPhase: 'complete', oldThread: FLAG, lastOutcome: null })).toEqual({
      oldThread: FLAG, sessionId: '092626', currentPhase: 'complete', htmlUrl: '/outputs/report-092626.html'
    });
  });

  it('and adds nothing when it sends none', () => {
    expect(completedResultFrom({ sessionId: '092626', currentPhase: 'complete', oldThread: null, lastOutcome: null })).toEqual({
      sessionId: '092626', currentPhase: 'complete', htmlUrl: '/outputs/report-092626.html'
    });
  });
});

// app.js is a thin consumer (no DOM harness; the integrator's click-through covers the
// wiring): these hold that it reads the flag through oldThreadView before it renders a stop
// or a completion, and that a refused request is not taken for the session lock's 409.
describe('4.11: app.js shows the message and the rollback before any stop renders', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const render = src.slice(src.indexOf('// ── Render ──'));

  it('imports the view on a line of its own', () => {
    expect(src).toMatch(/^const \{ oldThreadView \} = window\.Console\.checkpointViewLogic;$/m);
  });

  it("a stop's old-thread branch comes before the branch that renders the stop's component", () => {
    expect(render).toContain('const oldThreadAtStop = oldThreadView(state.checkpointData, CHECKPOINT_LABELS);');
    const branch = render.indexOf('} else if (state.checkpointType && oldThreadAtStop) {');
    expect(branch).toBeGreaterThan(-1);
    expect(branch).toBeLessThan(render.indexOf('} else if (state.checkpointType) {'));
    expect(branch).toBeLessThan(render.indexOf('CHECKPOINT_COMPONENTS[state.checkpointType]'));
  });

  it('a finished session reads the flag too, and its stepper opens only the points the server allows', () => {
    expect(render).toContain('oldThreadView(state.completedResult, CHECKPOINT_LABELS)');
    expect(render).toMatch(/completedCheckpoints: oldThread \? oldThread\.rollbackPoints : CHECKPOINT_ORDER/);
  });

  it('the notice offers the rollback through the rollback modal, as the stepper does', () => {
    expect(src).toMatch(/onClick: \(\) => onRollback\(view\.rollbackTo\)/);
  });

  it('a refused request is not taken for the session lock: no attach on its 409', () => {
    const failure = src.slice(src.indexOf('function handlePostFailure('), src.indexOf('function App('));
    expect(failure).toMatch(/response\.status === 409 && response\.currentPhase !== 'complete' && !oldThreadView\(response, CHECKPOINT_LABELS\)/);
  });
});

// Fix rounds 1 and 2, finding 1: a thread from before the story meeting that sits at no stop
// (it stopped on an error, or its run was killed, past the arc writer; lib/old-thread.js
// says which) is flagged too, and the server refuses its resume. GET /checkpoint sends it with
// no checkpoint, so the Session screen took it for a resumable thread and POSTed /resume.
// It loads the flag instead, and App shows the message and the rollback to the meeting.
describe('4.11 fix round 1: the Session screen shows an old thread at no stop its rollback instead of resuming it', () => {
  const STOPPED = oldThreadOf({ currentPhase: 'error', outline: { lede: { hook: 'An old hook.' } } }, null);
  /** GET /checkpoint's body for such a thread (server.js), and for one the server does not flag. */
  const stoppedResponse = (oldThread) => ({
    sessionId: '092626', currentPhase: 'error', interrupted: false, checkpointType: null, checkpoint: null,
    theme: 'journalist', inProgress: false, lastOutcome: null, oldThread
  });

  it('classifies it apart from a resumable thread', () => {
    expect(STOPPED).toEqual(FLAG);
    expect(classifyCheckpointResponse(stoppedResponse(STOPPED))).toBe('old-thread');
    expect(classifyCheckpointResponse(stoppedResponse(null))).toBe('resumable');
  });

  it('a stop, a finished session and a run in flight keep their own class, flag or not', () => {
    expect(classifyCheckpointResponse({ ...stoppedResponse(FLAG), interrupted: true, checkpointType: 'photos', checkpoint: { type: 'photos', oldThread: FLAG } })).toBe('at-checkpoint');
    expect(classifyCheckpointResponse({ ...stoppedResponse(FLAG), currentPhase: 'complete' })).toBe('complete');
    expect(classifyCheckpointResponse({ ...stoppedResponse(FLAG), inProgress: true })).toBe('in-progress');
  });

  it('Start Fresh asks first, as for any session with state, and an attached stream that ends there is stranded', () => {
    expect(startFreshDecision(stoppedResponse(STOPPED))).toBe('confirm');
    expect(decideAttachFallback(stoppedResponse(STOPPED))).toBe('stranded');
  });

  it("App's state holds the flag as a stop's payload does, and the view reads it the same", () => {
    expect(oldThreadView({ sessionId: '092626', checkpointType: null, oldThread: STOPPED }, LABELS)).toEqual(oldThreadView({ oldThread: FLAG }, LABELS));
  });

  // SessionStart.js, state.js and app.js are thin consumers (no DOM harness; the integrator's
  // click-through covers the wiring): these hold the hand-off from the Session screen to App.
  const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

  it("the Session screen's old-thread branch loads the flag and posts nothing", () => {
    const resume = read('components/SessionStart.js');
    const branch = resume.slice(resume.indexOf("case 'old-thread':"), resume.indexOf("case 'resumable':"));
    expect(branch).toContain('type: SESSION_ACTIONS.OLD_THREAD_LOADED, oldThread: checkpoint.oldThread');
    expect(branch).not.toMatch(/RESUME_REQUESTED|sessionApi\./);
  });

  it('the reducer keeps the flag, and every stop or completion that arrives supersedes it', () => {
    const state = read('state.js');
    expect(state).toMatch(/^ {2}OLD_THREAD_LOADED: 'OLD_THREAD_LOADED',$/m);
    const loaded = state.slice(state.indexOf('case ACTIONS.OLD_THREAD_LOADED:'), state.indexOf('case ACTIONS.CACHE_REVISION:'));
    expect(loaded).toContain('oldThread: action.oldThread');
    expect(loaded).toMatch(/checkpointType: null/);
    expect(loaded).toMatch(/processing: false/);
    ['CHECKPOINT_RECEIVED', 'WORKFLOW_COMPLETE', 'SESSION_COMPLETE_LOADED'].forEach((action) => {
      const from = state.indexOf(`case ACTIONS.${action}:`);
      const body = state.slice(from, state.indexOf('case ACTIONS.', from + 1));
      expect(`${action}: ${/oldThread: null/.test(body)}`).toBe(`${action}: true`);
    });
  });

  it("App's no-stop branch reads the flag from its state, before the stop branches, and opens only the server's points", () => {
    const render = read('app.js').slice(read('app.js').indexOf('// ── Render ──'));
    expect(render).toContain('const oldThreadNoStop = oldThreadView(state, CHECKPOINT_LABELS);');
    const branch = render.indexOf('} else if (oldThreadNoStop) {');
    expect(branch).toBeGreaterThan(render.indexOf('} else if (state.completedResult) {'));
    expect(branch).toBeLessThan(render.indexOf('} else if (state.checkpointType && oldThreadAtStop) {'));
    const body = render.slice(branch, render.indexOf('} else if (state.checkpointType && oldThreadAtStop) {'));
    expect(body).toContain('completedCheckpoints: oldThreadNoStop.rollbackPoints');
    expect(body).toContain('oldThreadNotice(oldThreadNoStop, setRollbackTarget)');
  });
});

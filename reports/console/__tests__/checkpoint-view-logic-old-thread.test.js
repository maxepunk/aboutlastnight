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
const { completedResultFrom } = require('../session-start-logic');
const { oldThreadOf, oldThreadRefusal } = require('../../lib/old-thread');

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

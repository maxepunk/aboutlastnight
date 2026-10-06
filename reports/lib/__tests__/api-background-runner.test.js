const { runGraphInBackground } = require('../api-background-runner');

function makeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
}

// Deterministic fake deps. A real lock Set so acquire/release behave like production.
function makeDeps(overrides = {}) {
  const held = new Set();
  const emitted = [];
  const recorded = [];
  return {
    held, emitted, recorded,
    deps: {
      acquireSessionLock: (id) => { if (held.has(id)) return false; held.add(id); return true; },
      releaseSessionLock: (id) => { held.delete(id); },
      buildOutcomeRecord: (r) => ({ outcome: r.currentPhase === 'error' ? 'failed' : 'complete', from: r }),
      recordSessionOutcome: (id, rec) => { recorded.push({ id, rec }); },
      emitComplete: (id, payload) => { emitted.push({ id, payload }); },
      ...overrides
    }
  };
}

describe('runGraphInBackground', () => {
  it('409s when the session lock is already held, and schedules nothing', async () => {
    const { deps, held } = makeDeps();
    held.add('s1'); // pre-hold
    const res = makeRes();
    const inFlight = new Set();
    const out = runGraphInBackground({
      sessionId: 's1',
      invoke: async () => { throw new Error('should not invoke'); },
      getState: async () => ({}),
      buildResponse: () => ({}),
      res, inFlightTasks: inFlight, deps
    });
    expect(out.scheduled).toBe(false);
    expect(out.task).toBeNull();
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/already in progress/i);
    expect(inFlight.size).toBe(0);
  });

  it('happy path: sends processing, invokes, builds + emits the response, records outcome, releases lock, untracks', async () => {
    const { deps, held, emitted, recorded } = makeDeps();
    const res = makeRes();
    const inFlight = new Set();
    const result = { currentPhase: 'complete', outputPath: '/x.html' };
    const graphState = { values: {} };
    const built = { sessionId: 's2', currentPhase: 'complete', outputPath: '/x.html' };

    const out = runGraphInBackground({
      sessionId: 's2',
      invoke: async () => result,
      getState: async () => graphState,
      buildResponse: (r, gs) => { expect(r).toBe(result); expect(gs).toBe(graphState); return built; },
      res, inFlightTasks: inFlight,
      processingExtra: { previousPhase: 'article' },
      deps
    });

    expect(out.scheduled).toBe(true);
    expect(res.body).toEqual({ sessionId: 's2', status: 'processing', previousPhase: 'article' });
    expect(inFlight.has(out.task)).toBe(true); // tracked while running

    await out.task;

    expect(emitted).toEqual([{ id: 's2', payload: built }]);
    expect(recorded).toEqual([{ id: 's2', rec: { outcome: 'complete', from: built } }]);
    expect(held.has('s2')).toBe(false);      // lock released
    expect(inFlight.size).toBe(0);           // untracked after completion
  });

  it('invoke throws: emits + records a failed outcome, still releases lock and untracks', async () => {
    const { deps, held, emitted, recorded } = makeDeps();
    const res = makeRes();
    const inFlight = new Set();
    const out = runGraphInBackground({
      sessionId: 's3',
      invoke: async () => { throw new Error('boom'); },
      getState: async () => ({}),
      buildResponse: () => ({ sessionId: 's3', currentPhase: 'ok' }),
      res, inFlightTasks: inFlight, deps
    });
    await out.task;
    expect(emitted).toHaveLength(1);
    expect(emitted[0].payload.currentPhase).toBe('error');
    expect(emitted[0].payload.error).toBe('Internal server error');
    expect(recorded[0].rec.outcome).toBe('failed');
    expect(held.has('s3')).toBe(false);
    expect(inFlight.size).toBe(0);
  });

  it('buildResponse throws: treated as a failure (emit/record/release), never leaks the lock', async () => {
    const { deps, held, emitted } = makeDeps();
    const res = makeRes();
    const inFlight = new Set();
    const out = runGraphInBackground({
      sessionId: 's4',
      invoke: async () => ({ currentPhase: 'x' }),
      getState: async () => ({}),
      buildResponse: () => { throw new Error('shape bug'); },
      res, inFlightTasks: inFlight, deps
    });
    await out.task;
    expect(emitted[0].payload.currentPhase).toBe('error');
    expect(held.has('s4')).toBe(false);
    expect(inFlight.size).toBe(0);
  });

  it('releases the lock and schedules nothing if res.json throws synchronously (pre-schedule)', () => {
    // Regression guard: the lock is otherwise released only in the background finally, which
    // never runs if res.json throws before the task is registered. A leaked sessionId-keyed
    // lock would 409 every later op on that session until restart. Mirrors old /approve's
    // lockAcquired guard.
    const { deps, held } = makeDeps();
    const res = makeRes();
    res.json = () => { throw new Error('headers already sent'); }; // simulate an Express res.json throw
    const inFlight = new Set();
    expect(() => runGraphInBackground({
      sessionId: 's5',
      invoke: async () => ({}),
      getState: async () => ({}),
      buildResponse: () => ({}),
      res, inFlightTasks: inFlight, deps
    })).toThrow('headers already sent');
    expect(held.has('s5')).toBe(false); // lock released despite the throw — session not bricked
    expect(inFlight.size).toBe(0);      // nothing scheduled/tracked
  });
});

// Task 4.12c: the review of 4.12a asked for the runner's stops-log paths under test, with a stub
// for deps.stopsLog. The action is written once the run holds the lock, and a pause only for a
// run that ends paused at a stop; a rollback's run hands the log the point it rolled back to.
describe('4.12c: the stops log\'s lines the runner writes (deps.stopsLog)', () => {
  function stubLog() {
    const actions = [];
    const pauses = [];
    return {
      actions, pauses,
      log: {
        recordAction: (id, action) => actions.push({ id, ...action }),
        recordPause: (id, pause) => pauses.push({ id, ...pause })
      }
    };
  }
  const ACTION = { stop: 'outline', state: { humanOutlineRevisionCount: 0 }, resume: { approved: true } };
  const PAUSED = { values: { humanOutlineRevisionCount: 1 } };
  const pausedAt = (stop) => () => ({ sessionId: 's', interrupted: true, checkpoint: { type: stop, map: {} } });

  it('the lock\'s 409 writes no action line, and no pause', async () => {
    const { log, actions, pauses } = stubLog();
    const { deps, held } = makeDeps({ stopsLog: log });
    held.add('s6');
    const out = runGraphInBackground({
      sessionId: 's6', action: ACTION,
      invoke: async () => ({}), getState: async () => PAUSED, buildResponse: pausedAt('outline'),
      res: makeRes(), inFlightTasks: new Set(), deps
    });
    expect(out.scheduled).toBe(false);
    expect([actions, pauses]).toEqual([[], []]);
  });

  it('a run that fails writes the director\'s action, and no pause line', async () => {
    const { log, actions, pauses } = stubLog();
    const { deps } = makeDeps({ stopsLog: log });
    const out = runGraphInBackground({
      sessionId: 's7', action: ACTION,
      invoke: async () => { throw new Error('SDK timeout'); }, getState: async () => PAUSED, buildResponse: pausedAt('outline'),
      res: makeRes(), inFlightTasks: new Set(), deps
    });
    await out.task;
    expect(actions).toEqual([{ id: 's7', ...ACTION }]);
    expect(pauses).toEqual([]);
  });

  it('a run that ends paused writes one pause line, with the stop, the state and the payload it paused with', async () => {
    const { log, actions, pauses } = stubLog();
    const { deps } = makeDeps({ stopsLog: log });
    const out = runGraphInBackground({
      sessionId: 's8', action: ACTION,
      invoke: async () => ({}), getState: async () => PAUSED, buildResponse: pausedAt('article'),
      res: makeRes(), inFlightTasks: new Set(), deps
    });
    await out.task;
    expect(actions).toHaveLength(1);
    expect(pauses).toEqual([{ id: 's8', stop: 'article', state: PAUSED.values, data: { type: 'article', map: {} }, rollbackClears: null }]);
  });

  it('a run that ends complete writes no pause line', async () => {
    const { log, pauses } = stubLog();
    const { deps } = makeDeps({ stopsLog: log });
    const out = runGraphInBackground({
      sessionId: 's9', invoke: async () => ({}), getState: async () => ({ values: {} }),
      buildResponse: () => ({ sessionId: 's9', currentPhase: 'complete' }),
      res: makeRes(), inFlightTasks: new Set(), deps
    });
    await out.task;
    expect(pauses).toEqual([]);
  });

  // Fix round 3: the runner hands the stops log what the rollback's seed cleared
  // (lib/api-helpers.js rollbackSeedClears), not the point's list.
  it('a rollback\'s run hands its pause the channels its seed cleared, and writes no action', async () => {
    const { log, actions, pauses } = stubLog();
    const { deps } = makeDeps({ stopsLog: log });
    const out = runGraphInBackground({
      sessionId: 's10', rollbackClears: ['contentBundle', 'articleApproved'],
      invoke: async () => ({}), getState: async () => PAUSED, buildResponse: pausedAt('article'),
      res: makeRes(), inFlightTasks: new Set(), deps
    });
    await out.task;
    expect(actions).toEqual([]);
    expect(pauses.map((pause) => [pause.stop, pause.rollbackClears])).toEqual([['article', ['contentBundle', 'articleApproved']]]);
  });
});

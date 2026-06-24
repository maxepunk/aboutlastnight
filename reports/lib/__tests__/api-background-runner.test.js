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

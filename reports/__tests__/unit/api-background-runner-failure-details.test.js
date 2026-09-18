/**
 * Terminal-failure detail on the background runner's SSE payload (H10).
 *
 * The director works over a tunnel and cannot read server logs. A failed run
 * reached them as "Internal server error / Background operation failed. Check
 * server logs." while the actual cause -- an expired OAuth token, a rate limit,
 * a budget overrun -- was known to the runner and thrown away.
 */
const { runGraphInBackground } = require('../../lib/api-background-runner');

function makeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
}

function makeDeps() {
  const held = new Set();
  const emitted = [];
  const recorded = [];
  const { buildOutcomeRecord } = require('../../lib/session-outcome');
  return {
    held, emitted, recorded,
    deps: {
      acquireSessionLock: (id) => { if (held.has(id)) return false; held.add(id); return true; },
      releaseSessionLock: (id) => { held.delete(id); },
      buildOutcomeRecord,   // the real shaper: proves `details` survives into the outcome
      recordSessionOutcome: (id, rec) => { recorded.push({ id, rec }); },
      emitComplete: (id, payload) => { emitted.push({ id, payload }); }
    }
  };
}

function runFailing(error, sessionId = 's1') {
  const { deps, emitted, recorded } = makeDeps();
  const out = runGraphInBackground({
    sessionId,
    invoke: async () => { throw error; },
    getState: async () => ({}),
    buildResponse: () => ({ sessionId, currentPhase: 'complete' }),
    res: makeRes(),
    inFlightTasks: new Set(),
    deps
  });
  return out.task.then(() => ({ emitted, recorded }));
}

describe('runGraphInBackground failure payload (H10)', () => {
  it('carries the real error message, name, sdkSubtype and apiErrorStatus', async () => {
    const message = 'SDK result error (authentication_failed, HTTP 401) - Arc analysis: re-authenticate with `claude /login`';
    const error = Object.assign(new Error(message), {
      sdkSubtype: 'authentication_failed',
      apiErrorStatus: 401
    });

    const { emitted } = await runFailing(error);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].payload).toEqual({
      sessionId: 's1',
      currentPhase: 'error',
      error: 'Internal server error',
      details: message,
      errorName: 'Error',
      sdkSubtype: 'authentication_failed',
      apiErrorStatus: 401
    });
  });

  it('records the same details on the persisted outcome (dropped-SSE recovery)', async () => {
    const message = 'SDK timeout after 900000ms idle - Article generation: no streamed activity';
    const { recorded } = await runFailing(Object.assign(new Error(message), { name: 'TimeoutError' }));

    expect(recorded).toHaveLength(1);
    expect(recorded[0].rec.outcome).toBe('failed');
    expect(recorded[0].rec.details).toBe(message);
  });

  it('omits sdkSubtype and apiErrorStatus when the error does not carry them', async () => {
    const { emitted } = await runFailing(new TypeError('cannot read properties of undefined'));

    expect(emitted[0].payload.details).toBe('cannot read properties of undefined');
    expect(emitted[0].payload.errorName).toBe('TypeError');
    expect(emitted[0].payload).not.toHaveProperty('sdkSubtype');
    expect(emitted[0].payload).not.toHaveProperty('apiErrorStatus');
  });

  it('omits a non-numeric apiErrorStatus rather than forwarding junk', async () => {
    const error = Object.assign(new Error('boom'), { apiErrorStatus: 'not-a-status' });

    const { emitted } = await runFailing(error);

    expect(emitted[0].payload).not.toHaveProperty('apiErrorStatus');
  });

  it('falls back to a generic detail when the thrown value has no message', async () => {
    const { emitted } = await runFailing('a bare string rejection');

    expect(emitted[0].payload.details).toBe('Background operation failed. Check server logs.');
  });
});

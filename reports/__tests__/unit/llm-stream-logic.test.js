/**
 * llm-stream-logic.js — pure reducer-transition unit tests (node-env, no DOM/React).
 * Covers SSE_LLM_DELTA accumulation, eventLog append (no .slice(-49) cap),
 * and llmActivity lifecycle (start → delta → complete/error reset).
 */
const L = require('../../console/llm-stream-logic.js');

describe('applyLlmStart', () => {
  test('initializes llmActivity with phase=preparing and zeroed liveness', () => {
    const next = L.applyLlmStart({}, { label: 'genOutline', model: 'opus', startTime: 1000 });
    expect(next.phase).toBe('preparing');
    expect(next.label).toBe('genOutline');
    expect(next.model).toBe('opus');
    expect(next.streamText).toBe('');
    expect(next.tokenCount).toBe(0);
    expect(next.ttftMs).toBe(null);
    expect(next.error).toBe(null);
    expect(next.startTime).toBe(1000);
  });
});

describe('applyLlmDelta', () => {
  test('appends streamText, advances phase/token/ttft/lastEventAt', () => {
    const a = L.applyLlmStart({}, { label: 'x', model: 'opus', startTime: 0 });
    const b = L.applyLlmDelta(a, { phase: 'thinking', deltaText: 'Hmm ', tokenCount: 3, ttftMs: 110, lastEventAt: 50 });
    expect(b.phase).toBe('thinking');
    expect(b.streamText).toBe('Hmm ');
    expect(b.tokenCount).toBe(3);
    expect(b.ttftMs).toBe(110);
    expect(b.lastEventAt).toBe(50);
    const c = L.applyLlmDelta(b, { phase: 'writing', deltaText: 'Once', tokenCount: 7, ttftMs: 110, lastEventAt: 70 });
    expect(c.phase).toBe('writing');
    expect(c.streamText).toBe('Hmm Once');  // accumulates across phases
    expect(c.tokenCount).toBe(7);
  });
  test('first non-null ttftMs sticks (later nulls do not clobber)', () => {
    const a = L.applyLlmStart({}, { label: 'x', model: 'opus', startTime: 0 });
    const b = L.applyLlmDelta(a, { phase: 'thinking', deltaText: 'a', tokenCount: 1, ttftMs: 99, lastEventAt: 10 });
    const c = L.applyLlmDelta(b, { phase: 'writing', deltaText: 'b', tokenCount: 2, ttftMs: null, lastEventAt: 20 });
    expect(c.ttftMs).toBe(99);
  });
  test('is a no-op-safe transition when there is no active llmActivity', () => {
    const b = L.applyLlmDelta(null, { phase: 'writing', deltaText: 'x', tokenCount: 1, ttftMs: 1, lastEventAt: 1 });
    expect(b.phase).toBe('writing');
    expect(b.streamText).toBe('x');
  });
});

describe('applyLlmComplete', () => {
  test('captures lastLlmActivity (with response) and clears live llmActivity', () => {
    const a = L.applyLlmDelta(L.applyLlmStart({}, { label: 'genArticle', model: 'opus', startTime: 0 }),
      { phase: 'writing', deltaText: 'body', tokenCount: 4, ttftMs: 30, lastEventAt: 8 });
    const out = L.applyLlmComplete({ llmActivity: a, lastLlmActivity: null }, { response: { ok: 1 }, elapsed: 2.2 });
    expect(out.llmActivity).toBe(null);
    expect(out.lastLlmActivity.label).toBe('genArticle');
    expect(out.lastLlmActivity.response).toEqual({ ok: 1 });
    expect(out.lastLlmActivity.phase).toBe('done');
    expect(out.lastLlmActivity.completedElapsed).toBe(2.2);
  });
});

describe('applyLlmFailure', () => {
  test('marks phase=failed and stamps error on the live activity (card stays mounted)', () => {
    const a = L.applyLlmStart({}, { label: 'genArticle', model: 'opus', startTime: 0 });
    const out = L.applyLlmFailure(a, { error: '401 authentication_error' });
    expect(out.phase).toBe('failed');
    expect(out.error).toBe('401 authentication_error');
  });
});

describe('appendEvent (eventLog, no cap)', () => {
  test('appends without the legacy 49-item slice cap', () => {
    let log = [];
    for (let i = 0; i < 120; i++) log = L.appendEvent(log, { kind: 'progress', message: 'm' + i });
    expect(log.length).toBe(120);
    expect(log[0].message).toBe('m0');
    expect(log[119].message).toBe('m119');
    expect(typeof log[0].seq).toBe('number');
    expect(log[1].seq).toBeGreaterThan(log[0].seq);
  });
});

describe('describePhase', () => {
  test('maps each phase to label + active flags', () => {
    expect(L.describePhase('preparing').label).toBe('Preparing');
    expect(L.describePhase('thinking').label).toBe('Thinking');
    expect(L.describePhase('writing').label).toBe('Writing');
    expect(L.describePhase('done').label).toBe('Done');
    expect(L.describePhase('failed').label).toBe('Failed');
    expect(L.describePhase('failed').isError).toBe(true);
    expect(L.describePhase('writing').isError).toBe(false);
  });
  test('ordered phase list for the ribbon, failed excluded from the happy path', () => {
    expect(L.phaseOrder()).toEqual(['preparing', 'thinking', 'writing', 'done']);
  });
  test('isPhaseReached: writing reaches preparing+thinking but not done', () => {
    expect(L.isPhaseReached('writing', 'preparing')).toBe(true);
    expect(L.isPhaseReached('writing', 'thinking')).toBe(true);
    expect(L.isPhaseReached('writing', 'writing')).toBe(true);
    expect(L.isPhaseReached('writing', 'done')).toBe(false);
  });
});

/**
 * H10: terminal failures reached the director as "Internal server error, check
 * server logs" (unreadable over the tunnel), and every llm_error was labelled
 * "Extraction failed … channel=text_fallback" regardless of what actually
 * happened — an expired OAuth token read as a schema problem. Both messages are
 * derived here so the derivation is pinned rather than inlined in app.js.
 */
describe('formatLlmErrorMessage', () => {
  test('labels a genuine extraction failure by errorName', () => {
    expect(L.formatLlmErrorMessage({
      errorName: 'StructuredOutputExtractionError',
      error: 'result did not match schema'
    })).toBe('Extraction failed: result did not match schema');
  });

  test('does NOT call a terminal API failure an extraction failure', () => {
    const msg = L.formatLlmErrorMessage({
      errorName: 'Error',
      error: 'SDK result error (authentication_failed, HTTP 401) - Arc analysis: ... re-authenticate with `claude /login`'
    });
    expect(msg).toContain('Model call failed:');
    expect(msg).not.toContain('Extraction failed');
    expect(msg).toContain('claude /login');
  });

  test('appends the output channel when the payload carries one', () => {
    expect(L.formatLlmErrorMessage({
      errorName: 'StructuredOutputExtractionError',
      error: 'invalid',
      diagnostics: { channel: 'text_fallback' }
    })).toBe('Extraction failed: invalid (channel=text_fallback)');
  });

  test('never invents a channel — llm_error diagnostics carry none', () => {
    expect(L.formatLlmErrorMessage({
      errorName: 'StructuredOutputExtractionError',
      error: 'invalid',
      diagnostics: { stopReason: 'end_turn', channel: null }
    })).toBe('Extraction failed: invalid');
  });

  test('survives an empty payload', () => {
    expect(L.formatLlmErrorMessage({})).toBe('Model call failed: unknown');
    expect(L.formatLlmErrorMessage(null)).toBe('Model call failed: unknown');
  });
});

describe('formatFailureMessage', () => {
  test('prefers `details` (the real cause) over the generic `error` headline', () => {
    expect(L.formatFailureMessage({
      error: 'Internal server error',
      details: 'SDK result error (authentication_failed, HTTP 401) - Arc analysis'
    })).toBe('SDK result error (authentication_failed, HTTP 401) - Arc analysis');
  });

  test('reads the LAST element of the append-only errors array, not the first', () => {
    expect(L.formatFailureMessage({
      errors: [
        { message: 'evidence preprocessing degraded' },
        { message: 'Cannot revise: no previous outline available' }
      ]
    })).toBe('Cannot revise: no previous outline available');
  });

  test('falls back through details -> error -> last error -> a constant', () => {
    expect(L.formatFailureMessage({ error: 'Workflow error' })).toBe('Workflow error');
    expect(L.formatFailureMessage({})).toBe('Workflow failed');
    expect(L.formatFailureMessage(null)).toBe('Workflow failed');
  });

  test('tolerates an errors array of bare strings', () => {
    expect(L.formatFailureMessage({ errors: ['first', 'second'] })).toBe('second');
  });

  test('shows apiErrorStatus when present', () => {
    expect(L.formatFailureMessage({
      details: 'SDK result error (authentication_failed) - Arc analysis',
      apiErrorStatus: 401
    })).toBe('SDK result error (authentication_failed) - Arc analysis (HTTP 401)');
  });

  test('does not repeat a status the message already names', () => {
    expect(L.formatFailureMessage({
      details: 'SDK result error (authentication_failed, HTTP 401) - Arc analysis',
      apiErrorStatus: 401
    })).toBe('SDK result error (authentication_failed, HTTP 401) - Arc analysis');
  });
});

/**
 * Review fix 1: openProgressStream hands back an OPEN EventSource, and the POST that
 * follows it can throw — a dropped request, or a non-JSON 502/504 from the tunnel
 * making res.json() reject. The exception used to propagate straight out of
 * approve/resume/rollback, so app.js's assignSse never ran: sseRef.current stayed
 * null while the stream stayed open, untracked, and still closed over the SSE
 * handler — so it kept dispatching, including a later 'complete' that drove
 * CHECKPOINT_RECEIVED into a console already showing the error.
 */
describe('closeOnThrow', () => {
  function fakeStream() {
    return { closed: 0, close() { this.closed += 1; } };
  }

  test('passes the resolved value through and leaves the stream open', async () => {
    const stream = fakeStream();
    await expect(L.closeOnThrow(stream, async () => 'body')).resolves.toBe('body');
    expect(stream.closed).toBe(0);
  });

  test('closes the stream and rethrows the SAME error', async () => {
    const stream = fakeStream();
    const boom = new Error('Failed to fetch');
    await expect(L.closeOnThrow(stream, async () => { throw boom; })).rejects.toBe(boom);
    expect(stream.closed).toBe(1);
  });

  test('closes exactly once', async () => {
    const stream = fakeStream();
    await L.closeOnThrow(stream, async () => { throw new Error('x'); }).catch(() => {});
    expect(stream.closed).toBe(1);
  });

  test('rethrows a synchronous throw too, and still closes', async () => {
    const stream = fakeStream();
    await expect(L.closeOnThrow(stream, () => { throw new Error('sync'); }))
      .rejects.toThrow('sync');
    expect(stream.closed).toBe(1);
  });

  test('a failing close never masks the original error', async () => {
    const stream = { close() { throw new Error('close blew up'); } };
    await expect(L.closeOnThrow(stream, async () => { throw new Error('the real cause'); }))
      .rejects.toThrow('the real cause');
  });

  test('tolerates a missing or closeless stream', async () => {
    await expect(L.closeOnThrow(null, async () => { throw new Error('real'); }))
      .rejects.toThrow('real');
    await expect(L.closeOnThrow({}, async () => { throw new Error('real'); }))
      .rejects.toThrow('real');
  });
});

describe('formatFailureMessage with a non-string headline', () => {
  test('does not throw when details is an object (Minor, folded in)', () => {
    expect(() => L.formatFailureMessage({ details: { code: 500 }, apiErrorStatus: 500 }))
      .not.toThrow();
  });
});

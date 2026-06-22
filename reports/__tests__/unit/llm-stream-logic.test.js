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

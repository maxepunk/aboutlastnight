const { createProgressFromTrace, _resetDeltaBuffers } = require('../progress-bridge');
const { progressEmitter } = require('../progress-emitter');
const { SSE_EVENT_TYPES } = require('../constants');

describe('progress-bridge llm_delta coalescing', () => {
  let originalSdkProgress;
  let emitted;
  let unsubscribe;
  const SESSION = 'test-delta-session';

  beforeAll(() => {
    originalSdkProgress = process.env.SDK_PROGRESS;
    process.env.SDK_PROGRESS = 'true';
  });
  afterAll(() => {
    if (originalSdkProgress === undefined) delete process.env.SDK_PROGRESS;
    else process.env.SDK_PROGRESS = originalSdkProgress;
  });

  beforeEach(() => {
    jest.useFakeTimers();
    emitted = [];
    _resetDeltaBuffers();
    unsubscribe = progressEmitter.subscribe(SESSION, (d) => emitted.push(d));
  });
  afterEach(() => {
    unsubscribe();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  const deltas = () => emitted.filter((e) => e.type === SSE_EVENT_TYPES.LLM_DELTA);

  test('coalesces sub-threshold deltas into one flushed event after <=250ms', () => {
    const logger = createProgressFromTrace('genOutline', SESSION);
    logger({ type: 'llm_delta', phase: 'writing', deltaText: 'Hel', tokenCount: 1, ttftMs: 120, elapsed: 0.3 });
    logger({ type: 'llm_delta', phase: 'writing', deltaText: 'lo ', tokenCount: 2, ttftMs: 120, elapsed: 0.4 });
    expect(deltas().length).toBe(0);            // nothing flushed yet (sub-threshold)
    jest.advanceTimersByTime(250);
    expect(deltas().length).toBe(1);
    const d = deltas()[0];
    expect(d.phase).toBe('writing');
    expect(d.deltaText).toBe('Hello ');         // accumulated text since last flush
    expect(d.tokenCount).toBe(2);               // latest cumulative token count
    expect(d.ttftMs).toBe(120);
    expect(d.context).toBe('genOutline');
  });

  test('flushes immediately when >=50 tokens accumulate since last flush', () => {
    const logger = createProgressFromTrace('genArticle', SESSION);
    for (let i = 1; i <= 50; i++) {
      logger({ type: 'llm_delta', phase: 'thinking', deltaText: 'x', tokenCount: i, ttftMs: 90, elapsed: i / 100 });
    }
    expect(deltas().length).toBe(1);            // 50-token threshold tripped a synchronous flush
    expect(deltas()[0].tokenCount).toBe(50);
    expect(deltas()[0].deltaText.length).toBe(50);
  });

  test('keeps coalescing PAST 50 tokens — threshold is since-last-flush, not cumulative', () => {
    const logger = createProgressFromTrace('genArticle', SESSION);
    for (let i = 1; i <= 120; i++) {
      logger({ type: 'llm_delta', phase: 'writing', deltaText: 'x', tokenCount: i, ttftMs: 90, elapsed: i / 100 });
    }
    expect(deltas().length).toBe(2);            // synchronous flushes at cumulative 50 and 100 ONLY
    expect(deltas()[0].tokenCount).toBe(50);
    expect(deltas()[1].tokenCount).toBe(100);
    jest.advanceTimersByTime(250);
    expect(deltas().length).toBe(3);            // trailing 101..120 drained by the timer, not per-token
    expect(deltas()[2].tokenCount).toBe(120);
  });

  test('a phase change flushes the prior phase buffer immediately', () => {
    const logger = createProgressFromTrace('genArticle', SESSION);
    logger({ type: 'llm_delta', phase: 'thinking', deltaText: 'mm', tokenCount: 1, ttftMs: 80, elapsed: 0.2 });
    logger({ type: 'llm_delta', phase: 'writing', deltaText: 'go', tokenCount: 2, ttftMs: 80, elapsed: 0.3 });
    const d = deltas();
    expect(d.length).toBe(1);                   // the thinking buffer flushed on phase switch
    expect(d[0].phase).toBe('thinking');
    expect(d[0].deltaText).toBe('mm');
  });

  test('llm_complete flushes any pending delta buffer before completing', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createProgressFromTrace('genOutline', SESSION);
    logger({ type: 'llm_delta', phase: 'writing', deltaText: 'tail', tokenCount: 3, ttftMs: 100, elapsed: 0.5 });
    logger({ type: 'llm_complete', elapsed: 1.0, result: { ok: true } });
    const d = deltas();
    expect(d.length).toBe(1);
    expect(d[0].deltaText).toBe('tail');
    logSpy.mockRestore();
  });
});

const { StructuredOutputExtractionError } = require('../structured-output-extractor');
const { setMockQuery, clearMockQuery } = require('@anthropic-ai/claude-agent-sdk');
const { sdkQueryImpl } = require('../client');

const SIMPLE_SCHEMA = {
  type: 'object',
  required: ['ok'],
  properties: { ok: { type: 'boolean' } }
};

function makeAsyncIterable(messages) {
  return (async function* () {
    for (const m of messages) yield m;
  })();
}

describe('sdkQueryImpl contract', () => {
  afterEach(() => {
    clearMockQuery();
  });

  test('returns structured_output when present and schema-valid', async () => {
    setMockQuery(() => makeAsyncIterable([
      { type: 'result', subtype: 'success', result: '{"ok":true}', structured_output: { ok: true } }
    ]));

    const result = await sdkQueryImpl({
      prompt: 'test',
      jsonSchema: SIMPLE_SCHEMA,
      model: 'haiku'
    });

    expect(result).toEqual({ ok: true });
  });

  test('falls back to text extraction when structured_output missing on success', async () => {
    setMockQuery(() => makeAsyncIterable([
      { type: 'result', subtype: 'success', result: '```json\n{"ok":true}\n```' }
    ]));

    const result = await sdkQueryImpl({
      prompt: 'test',
      jsonSchema: SIMPLE_SCHEMA,
      model: 'haiku'
    });

    expect(result).toEqual({ ok: true });
  });

  test('throws StructuredOutputExtractionError when both paths fail', async () => {
    setMockQuery(() => makeAsyncIterable([
      { type: 'result', subtype: 'success', result: 'no json here' }
    ]));

    await expect(sdkQueryImpl({
      prompt: 'test',
      jsonSchema: SIMPLE_SCHEMA,
      model: 'haiku',
      label: 'contract-test'
    })).rejects.toThrow(StructuredOutputExtractionError);
  });

  test('passes through non-schema text result unchanged', async () => {
    setMockQuery(() => makeAsyncIterable([
      { type: 'result', subtype: 'success', result: 'plain text response' }
    ]));

    const result = await sdkQueryImpl({
      prompt: 'test',
      model: 'haiku'
    });

    expect(result).toBe('plain text response');
  });

  test('settingSources: [] is set when loadProjectSettings is false', async () => {
    let capturedOptions = null;
    setMockQuery(({ options }) => {
      capturedOptions = options;
      return makeAsyncIterable([
        { type: 'result', subtype: 'success', result: 'ok' }
      ]);
    });

    await sdkQueryImpl({
      prompt: 'test',
      model: 'haiku',
      loadProjectSettings: false
    });

    expect(capturedOptions.settingSources).toEqual([]);
  });

  test("settingSources is ['project'] when loadProjectSettings is true (project-only scope)", async () => {
    let capturedOptions = null;
    setMockQuery(({ options }) => {
      capturedOptions = options;
      return makeAsyncIterable([
        { type: 'result', subtype: 'success', result: 'ok' }
      ]);
    });

    await sdkQueryImpl({
      prompt: 'test',
      model: 'haiku',
      loadProjectSettings: true
    });

    expect(capturedOptions.settingSources).toEqual(['project']);
  });

  test("settingSources is ['project'] when loadProjectSettings is omitted (default)", async () => {
    let capturedOptions = null;
    setMockQuery(({ options }) => {
      capturedOptions = options;
      return makeAsyncIterable([
        { type: 'result', subtype: 'success', result: 'ok' }
      ]);
    });

    await sdkQueryImpl({ prompt: 'test', model: 'haiku' });
    expect(capturedOptions.settingSources).toEqual(['project']);
  });

  test('idle timer resets on each streamed message (long-but-active call does not abort)', async () => {
    jest.useFakeTimers();
    // A generator that yields an intermediate assistant message after a long gap,
    // then the success result after another long gap. Each gap is < the idle window
    // only because the timer is reset per message.
    setMockQuery(() => (async function* () {
      // advance 14 min, then emit activity (resets idle)
      jest.advanceTimersByTime(14 * 60 * 1000);
      yield { type: 'assistant', message: { content: [{ type: 'text', text: 'working' }] } };
      // advance another 14 min, then the result (idle never hit 15 min between events)
      jest.advanceTimersByTime(14 * 60 * 1000);
      yield { type: 'result', subtype: 'success', result: 'done' };
    })());

    const p = sdkQueryImpl({ prompt: 'test', model: 'sonnet' });
    await expect(p).resolves.toBe('done');
    jest.useRealTimers();
  });

  test('abort message reports idle stall, not total limit', async () => {
    // Force an abort by aborting from inside the loop before a result arrives.
    setMockQuery(({ options }) => (async function* () {
      options.abortController.abort();
      yield { type: 'assistant', message: { content: [] } };
    })());

    await expect(
      sdkQueryImpl({ prompt: 'test', model: 'haiku', label: 'idle-test' })
    ).rejects.toThrow(/idle .* with no streamed activity/);
  });

  test('passes includePartialMessages: true to the SDK', async () => {
    let capturedOptions = null;
    setMockQuery(({ options }) => {
      capturedOptions = options;
      return makeAsyncIterable([{ type: 'result', subtype: 'success', result: 'ok' }]);
    });
    await sdkQueryImpl({ prompt: 'test', model: 'haiku' });
    expect(capturedOptions.includePartialMessages).toBe(true);
  });

  test('emits llm_delta with phase=writing for a text_delta stream_event', async () => {
    const events = [];
    setMockQuery(() => makeAsyncIterable([
      { type: 'stream_event', event: { type: 'message_start' } },
      { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } } },
      { type: 'result', subtype: 'success', result: 'Hello world' }
    ]));

    await sdkQueryImpl({
      prompt: 'test', model: 'sonnet',
      onProgress: (m) => { if (m.type === 'llm_delta') events.push(m); }
    });

    expect(events).toHaveLength(2);
    expect(events[0].phase).toBe('preparing');
    expect(events[0].ttftMs).toBeNull();  // message_start carries no non-empty delta yet
    expect(events[1].phase).toBe('writing');
    expect(events[1].deltaText).toBe('Hello');
    expect(events[1].tokenCount).toBeGreaterThan(0);
    expect(typeof events[1].ttftMs).toBe('number');
  });

  test('emits llm_delta with phase=thinking for a thinking_delta stream_event', async () => {
    const events = [];
    setMockQuery(() => makeAsyncIterable([
      { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'reasoning...' } } },
      { type: 'result', subtype: 'success', result: 'done' }
    ]));

    await sdkQueryImpl({
      prompt: 'test', model: 'opus',
      onProgress: (m) => { if (m.type === 'llm_delta') events.push(m); }
    });

    expect(events).toHaveLength(1);
    expect(events[0].phase).toBe('thinking');
    expect(events[0].deltaText).toBe('reasoning...');
  });

  test('ttftMs is set by the first non-empty delta of any kind (thinking) and held across later deltas', async () => {
    const events = [];
    setMockQuery(() => makeAsyncIterable([
      { type: 'stream_event', event: { type: 'message_start' } },
      { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'reason' } } },
      { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } } },
      { type: 'result', subtype: 'success', result: 'Hi' }
    ]));

    await sdkQueryImpl({
      prompt: 'test', model: 'opus',
      onProgress: (m) => { if (m.type === 'llm_delta') events.push(m); }
    });

    expect(events).toHaveLength(3);
    // preparing: no non-empty delta yet
    expect(events[0].phase).toBe('preparing');
    expect(events[0].ttftMs).toBeNull();
    // thinking: first non-empty delta sets TTFT (before any text)
    expect(events[1].phase).toBe('thinking');
    expect(typeof events[1].ttftMs).toBe('number');
    // writing: TTFT is held, not reset by the later text delta
    expect(events[2].phase).toBe('writing');
    expect(events[2].ttftMs).toBe(events[1].ttftMs);
  });
});

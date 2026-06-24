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

  test('passes a per-model maxBudgetUsd to the SDK', async () => {
    let capturedOptions = null;
    setMockQuery(({ options }) => {
      capturedOptions = options;
      return makeAsyncIterable([{ type: 'result', subtype: 'success', result: 'ok' }]);
    });
    await sdkQueryImpl({ prompt: 'test', model: 'opus' });
    expect(typeof capturedOptions.maxBudgetUsd).toBe('number');
    expect(capturedOptions.maxBudgetUsd).toBeGreaterThan(0);
  });

  test('explicit maxBudgetUsd option overrides the model default', async () => {
    let capturedOptions = null;
    setMockQuery(({ options }) => {
      capturedOptions = options;
      return makeAsyncIterable([{ type: 'result', subtype: 'success', result: 'ok' }]);
    });
    await sdkQueryImpl({ prompt: 'test', model: 'haiku', maxBudgetUsd: 0.42 });
    expect(capturedOptions.maxBudgetUsd).toBe(0.42);
  });

  test('error_max_budget_usd result throws a labeled, non-transient error', async () => {
    const { isTransientError } = require('../retry');
    setMockQuery(() => makeAsyncIterable([
      { type: 'result', subtype: 'error_max_budget_usd', total_cost_usd: 5.01, errors: ['budget exceeded'] }
    ]));

    let thrown;
    try {
      await sdkQueryImpl({ prompt: 'test', model: 'opus', label: 'budget-test' });
    } catch (e) { thrown = e; }

    expect(thrown).toBeDefined();
    expect(thrown.message).toMatch(/budget/i);
    expect(thrown.sdkSubtype).toBe('error_max_budget_usd');
    expect(isTransientError(thrown)).toBe(false);
  });

  test('a budget error racing the idle abort is preserved, not reclassified as a transient timeout', async () => {
    const { isTransientError } = require('../retry');
    // Simulate the race: the idle timer fires (abortController.signal.aborted === true)
    // in the SAME tick the buffered budget result arrives from the stream loop. The
    // budget branch throws budgetErr; the catch sees signal.aborted true and would —
    // without Fix 1 — rewrite it as "SDK timeout after ..." (transient).
    setMockQuery(({ options }) => (async function* () {
      options.abortController.abort();
      yield { type: 'result', subtype: 'error_max_budget_usd', total_cost_usd: 5.01, errors: ['budget exceeded'] };
    })());

    let thrown;
    try {
      await sdkQueryImpl({ prompt: 'test', model: 'opus', label: 'budget-race' });
    } catch (e) { thrown = e; }

    expect(thrown).toBeDefined();
    expect(thrown.sdkSubtype).toBe('error_max_budget_usd');
    expect(thrown.message).not.toMatch(/SDK timeout after/);
    expect(isTransientError(thrown)).toBe(false);
  });
});

describe('sanitizeSchemaForSdk (#277 channel-skip guardrail)', () => {
  const { sanitizeSchemaForSdk } = require('../client');

  it('strips ONLY format, recursively, and keeps safe keywords', () => {
    const original = {
      $id: 'x', $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object', additionalProperties: false,
      properties: {
        ts: { type: 'string', format: 'date-time', minLength: 1 },
        nested: { type: 'array', minItems: 1, items: { type: 'string', format: 'email', maxLength: 99 } },
        choice: { oneOf: [{ type: 'string' }, { type: 'number' }] }
      }
    };
    const out = sanitizeSchemaForSdk(original);
    expect(out.properties.ts.format).toBeUndefined();
    expect(out.properties.nested.items.format).toBeUndefined();
    expect(out.properties.ts.minLength).toBe(1);
    expect(out.properties.nested.minItems).toBe(1);
    expect(out.properties.nested.items.maxLength).toBe(99);
    expect(out.properties.choice.oneOf).toHaveLength(2);
    expect(out.additionalProperties).toBe(false);
    expect(out.$id).toBeUndefined();
    expect(out.$schema).toBeUndefined();
    expect(original.properties.ts.format).toBe('date-time'); // original not mutated
    expect(original.$id).toBe('x');
  });

  it('memoizes: same original -> same sanitized object (stable identity)', () => {
    const original = { $id: 'memo', type: 'object', properties: { ts: { type: 'string', format: 'date-time' } } };
    expect(sanitizeSchemaForSdk(original)).toBe(sanitizeSchemaForSdk(original));
  });

  it('preserves a DATA property named "format" while stripping the format keyword', () => {
    const original = { type: 'object', properties: { format: { type: 'string', format: 'date-time' } } };
    const out = sanitizeSchemaForSdk(original);
    expect(out.properties.format).toBeDefined();          // data property survives
    expect(out.properties.format.type).toBe('string');
    expect(out.properties.format.format).toBeUndefined();  // inner format KEYWORD stripped
  });
});

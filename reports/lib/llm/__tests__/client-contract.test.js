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

  // H22: the default used to be ['project'], which loaded reports/CLAUDE.md
  // (~9.4K tokens), .claude/settings.json enabledPlugins (including
  // superpowers' "invoke a skill before ANY response"), skill frontmatter and
  // nine agent descriptions into the five largest generation calls -- roughly
  // 15.5K tokens per call, ~75K per session, none of it read by the pipeline
  // (ThemeLoader reads prompt files with fs). The nine utility calls were the
  // ones opting out. The polarity is now the other way round.
  test('settingSources is [] when loadProjectSettings is omitted (default)', async () => {
    let capturedOptions = null;
    setMockQuery(({ options }) => {
      capturedOptions = options;
      return makeAsyncIterable([
        { type: 'result', subtype: 'success', result: 'ok' }
      ]);
    });

    await sdkQueryImpl({ prompt: 'test', model: 'haiku' });
    expect(capturedOptions.settingSources).toEqual([]);
  });

  // H21: `allowedTools` is an auto-ALLOW list in this SDK, not a restriction
  // (installed sdk.d.ts: "to restrict which tools are available, use the `tools`
  // option"). Under permissionMode: 'bypassPermissions', a call that passes only
  // allowedTools runs with the full tool set -- Bash, Write, Edit -- and can
  // write into reports/ and data/<other-session>/ with no prompt.
  describe('tool gating (H21)', () => {
    function captureOptions() {
      const captured = {};
      setMockQuery(({ options }) => {
        captured.options = options;
        return makeAsyncIterable([
          { type: 'result', subtype: 'success', result: 'ok' }
        ]);
      });
      return captured;
    }

    test('tools: [...] restricts the tool set', async () => {
      const captured = captureOptions();
      await sdkQueryImpl({ prompt: 'test', model: 'haiku', tools: ['Read'] });
      expect(captured.options.tools).toEqual(['Read']);
    });

    test('disableTools: true sets an empty tool set', async () => {
      const captured = captureOptions();
      await sdkQueryImpl({ prompt: 'test', model: 'haiku', disableTools: true });
      expect(captured.options.tools).toEqual([]);
    });

    test('disableTools wins over tools when both are passed', async () => {
      const captured = captureOptions();
      await sdkQueryImpl({ prompt: 'test', model: 'haiku', disableTools: true, tools: ['Read'] });
      expect(captured.options.tools).toEqual([]);
    });

    test('tools is left unset when neither option is passed', async () => {
      const captured = captureOptions();
      await sdkQueryImpl({ prompt: 'test', model: 'haiku' });
      expect(captured.options.tools).toBeUndefined();
    });

    test('allowedTools is still forwarded (permission auto-allow, not a restriction)', async () => {
      const captured = captureOptions();
      await sdkQueryImpl({ prompt: 'test', model: 'haiku', tools: ['Read'], allowedTools: ['Read'] });
      expect(captured.options.allowedTools).toEqual(['Read']);
      expect(captured.options.tools).toEqual(['Read']);
    });

    // Brief 2.0: the server-start health call was the one ungated call left, and the
    // SDK's default tool set changed across the 0.3 line.
    test('the server-start health call runs with no tools', async () => {
      const { isClaudeAvailable } = require('../client');
      const captured = captureOptions();
      await expect(isClaudeAvailable(sdkQueryImpl)).resolves.toBe(true);
      expect(captured.options.tools).toEqual([]);
      expect(captured.options.model).toBe('claude-haiku-4-5');
    });
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

  it('passes a format-free, $id-free schema to the SDK outputFormat', async () => {
    let capturedOptions = null;
    setMockQuery(({ options }) => {
      capturedOptions = options;
      return makeAsyncIterable([
        { type: 'result', subtype: 'success', result: '{"ok":true}', structured_output: { ok: true } }
      ]);
    });

    const schema = {
      $id: 'cap',
      type: 'object',
      properties: { ts: { type: 'string', format: 'date-time' } }
    };

    await sdkQueryImpl({
      prompt: 'test',
      model: 'haiku',
      jsonSchema: schema
    });

    expect(capturedOptions.outputFormat).toBeDefined();
    expect(JSON.stringify(capturedOptions.outputFormat.schema)).not.toContain('"format"');
    expect(capturedOptions.outputFormat.schema.$id).toBeUndefined();
  });
});

describe('sdkQueryImpl is_error result handling (terminal API failure wrapped as success)', () => {
  const { isTransientError } = require('../retry');
  afterEach(() => clearMockQuery());

  // Live-verified shape (2026-07-22, expired-OAuth probe): the CLI exhausts its internal
  // api_retry attempts, emits an assistant msg with error:'authentication_failed', then a
  // result with subtype:'success' BUT is_error:true + api_error_status:401 whose .result
  // text is the 401 error string — NOT model output.
  const AUTH_FAIL_TEXT = 'Failed to authenticate. API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"OAuth access token has expired. Re-authenticate to continue."},"request_id":null}';
  const authFailureStream = () => makeAsyncIterable([
    { type: 'assistant', error: 'authentication_failed', message: { content: [{ type: 'text', text: AUTH_FAIL_TEXT }] } },
    { type: 'result', subtype: 'success', is_error: true, api_error_status: 401, result: AUTH_FAIL_TEXT, stop_reason: 'stop_sequence', duration_api_ms: 0, usage: { output_tokens: 0 } }
  ]);

  test('schema call: throws enriched auth error with re-login hint, NOT a schema-extraction error', async () => {
    setMockQuery(authFailureStream);

    let thrown;
    try {
      await sdkQueryImpl({ prompt: 'test', jsonSchema: SIMPLE_SCHEMA, model: 'haiku', label: 'auth-test' });
    } catch (e) { thrown = e; }

    expect(thrown).toBeDefined();
    expect(thrown).not.toBeInstanceOf(StructuredOutputExtractionError);
    expect(thrown.message).toMatch(/authentication_failed/);
    expect(thrown.message).toMatch(/HTTP 401/);
    expect(thrown.message).toMatch(/claude \/login/);
    expect(thrown.apiErrorStatus).toBe(401);
    expect(isTransientError(thrown)).toBe(false);
  });

  test('text call (no schema): throws instead of returning the error text as content', async () => {
    setMockQuery(authFailureStream);
    await expect(
      sdkQueryImpl({ prompt: 'test', model: 'haiku', label: 'auth-text-test' })
    ).rejects.toThrow(/authentication_failed/);
  });

  test('emits llm_error (not llm_complete) with the diagnostics envelope', async () => {
    setMockQuery(authFailureStream);
    const events = [];

    try {
      await sdkQueryImpl({ prompt: 'test', jsonSchema: SIMPLE_SCHEMA, model: 'haiku', label: 'auth-envelope-test', onProgress: (m) => events.push(m) });
    } catch { /* expected */ }

    expect(events.filter(e => e.type === 'llm_complete')).toHaveLength(0);
    const errEvents = events.filter(e => e.type === 'llm_error');
    expect(errEvents).toHaveLength(1);
    expect(errEvents[0].error).toMatch(/authentication_failed/);
    expect(errEvents[0].apiErrorStatus).toBe(401);          // sdkDiagnostics envelope present
    expect(errEvents[0].structuredOutputPresent).toBe(false);
  });

  test('a transient-status is_error result (HTTP 529) stays auto-retryable', async () => {
    setMockQuery(() => makeAsyncIterable([
      { type: 'result', subtype: 'success', is_error: true, api_error_status: 529, result: 'API Error: 529 overloaded' }
    ]));

    let thrown;
    try {
      await sdkQueryImpl({ prompt: 'test', model: 'haiku', label: 'overload-test' });
    } catch (e) { thrown = e; }

    expect(thrown).toBeDefined();
    expect(thrown.apiErrorStatus).toBe(529);
    expect(thrown.message).not.toMatch(/claude \/login/);   // hint is auth-specific
    expect(isTransientError(thrown)).toBe(true);
  });

  // CLAUDE_CODE_NO_MODEL_FALLBACK leaves the CLI no other model for an overload: after
  // its own retries it ends the turn with the assistant error `server_error` and the
  // text below (bundled CLI 2.1.282). The status rides on the result when the CLI can
  // read it from the underlying error; both shapes must reach the node retry policy as
  // transient, so the call is retried on the same model.
  const REPEATED_529 = 'API Error: Repeated 529 Overloaded errors. The API is at capacity — this is usually temporary. Try again in a moment.';
  test.each([
    ['with the status', { api_error_status: 529 }],
    ['without a status', {}]
  ])('an overload the CLI could not route elsewhere is thrown transient (%s)', async (_name, status) => {
    setMockQuery(() => makeAsyncIterable([
      { type: 'assistant', error: 'server_error', message: { content: [{ type: 'text', text: REPEATED_529 }] } },
      { type: 'result', subtype: 'success', is_error: true, result: REPEATED_529, stop_reason: 'stop_sequence', ...status }
    ]));

    let thrown;
    try {
      await sdkQueryImpl({ prompt: 'test', jsonSchema: SIMPLE_SCHEMA, model: 'opus', label: 'no-fallback-overload' });
    } catch (e) { thrown = e; }

    expect(thrown).toBeDefined();
    expect(thrown).not.toBeInstanceOf(StructuredOutputExtractionError);
    expect(thrown.sdkSubtype).toBe('server_error');
    expect(thrown.message).toMatch(/Repeated 529 Overloaded errors/);
    expect(isTransientError(thrown)).toBe(true);
  });
});

describe('sdkQueryImpl declined requests (refusal, brief 2.0)', () => {
  const { isTransientError } = require('../retry');
  const { SdkRefusalError, refusalOf } = require('../refusal');
  afterEach(() => clearMockQuery());

  // Shapes from the 0.3.282 types (no live refusal captured yet): the assistant frame
  // carries message.stop_reason 'refusal' + message.stop_details; the turn's stop
  // reason arrives on the result.
  const refusedFrame = (category = 'bio', explanation = 'This request may relate to biological harm.') => ({
    type: 'assistant',
    parent_tool_use_id: null,
    message: { content: [], stop_reason: 'refusal', stop_details: { type: 'refusal', category, explanation } }
  });
  const refusedResult = (extra = {}) => ({
    type: 'result', subtype: 'success', is_error: false, stop_reason: 'refusal',
    result: 'I cannot help with that.', duration_api_ms: 900, usage: { output_tokens: 12 }, ...extra
  });

  async function run(messages, opts = {}) {
    const events = [];
    setMockQuery(() => makeAsyncIterable(messages));
    let thrown;
    let value;
    try {
      value = await sdkQueryImpl({ prompt: 'test', model: 'opus', label: 'refusal-test', onProgress: (m) => events.push(m), ...opts });
    } catch (e) { thrown = e; }
    return { events, thrown, value };
  }

  test('schema call: throws a named refusal with its category, not a schema mismatch', async () => {
    const { thrown, events } = await run([refusedFrame('bio'), refusedResult()], { jsonSchema: SIMPLE_SCHEMA });

    expect(thrown).toBeInstanceOf(SdkRefusalError);
    expect(thrown).not.toBeInstanceOf(StructuredOutputExtractionError);
    expect(thrown.message).toMatch(/declined the request/);
    expect(thrown.message).toMatch(/category: bio/);
    expect(thrown.message).toMatch(/claude-opus-5-5/);
    expect(thrown.message).toMatch(/refusal-test/);
    expect(thrown.refusalCategory).toBe('bio');
    expect(thrown.sdkSubtype).toBe('refusal');
    expect(isTransientError(thrown)).toBe(false);

    const errEvents = events.filter((e) => e.type === 'llm_error');
    expect(errEvents).toHaveLength(1);
    expect(errEvents[0].errorName).toBe('SdkRefusalError');
    expect(errEvents[0].refusal).toEqual({ category: 'bio', explanation: 'This request may relate to biological harm.' });
    expect(errEvents[0].stopReason).toBe('refusal');   // the result's envelope rides along
    expect(events.filter((e) => e.type === 'llm_complete')).toHaveLength(0);
  });

  test('text call: throws instead of returning the refusal text as content', async () => {
    const { thrown, value } = await run([refusedFrame('cyber'), refusedResult()]);
    expect(value).toBeUndefined();
    expect(thrown).toBeInstanceOf(SdkRefusalError);
    expect(thrown.message).toMatch(/category: cyber/);
  });

  test('the result stop_reason alone is enough (no assistant frame)', async () => {
    const { thrown } = await run([refusedResult()]);
    expect(thrown).toBeInstanceOf(SdkRefusalError);
    expect(thrown.message).toMatch(/category: none given/);
    expect(thrown.refusalCategory).toBeNull();
  });

  test('a message_delta refusal is read without onProgress (stream events are not skipped)', async () => {
    setMockQuery(() => makeAsyncIterable([
      { type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_delta', delta: { stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'reasoning_extraction', explanation: null } } } },
      { type: 'result', subtype: 'success', is_error: false, stop_reason: null, result: '' }
    ]));
    await expect(sdkQueryImpl({ prompt: 'test', model: 'opus', jsonSchema: SIMPLE_SCHEMA }))
      .rejects.toThrow(/category: reasoning_extraction/);
  });

  test('the CLI no-fallback notice names the category even when the result does not', async () => {
    const { thrown } = await run([
      { type: 'system', subtype: 'model_refusal_no_fallback', original_model: 'claude-opus-5-5', api_refusal_category: 'cyber', api_refusal_explanation: 'Declined.', content: 'declined' },
      { type: 'result', subtype: 'success', is_error: false, stop_reason: 'end_turn', result: 'Claude Code is unable to respond to this request.' }
    ]);
    expect(thrown).toBeInstanceOf(SdkRefusalError);
    expect(thrown.message).toMatch(/category: cyber/);
  });

  test('a refusal wrapped as an is_error result is named as the refusal', async () => {
    const { thrown } = await run([
      { ...refusedFrame('bio'), error: 'unknown' },
      { type: 'result', subtype: 'success', is_error: true, api_error_status: 400, stop_reason: null, result: 'API Error' }
    ]);
    expect(thrown).toBeInstanceOf(SdkRefusalError);
    expect(thrown.message).not.toMatch(/SDK result error/);
    expect(isTransientError(thrown)).toBe(false);
  });

  test('a refusal followed by an error-subtype result is named as the refusal', async () => {
    const { thrown } = await run([
      refusedFrame('bio'),
      { type: 'result', subtype: 'error_max_structured_output_retries', errors: ['StructuredOutput was not called'] }
    ], { jsonSchema: SIMPLE_SCHEMA });
    expect(thrown).toBeInstanceOf(SdkRefusalError);
    expect(thrown.message).toMatch(/category: bio/);
  });

  test('an unsuperseded refusal signal names a schema failure on a clean finish, with the schema failure as its cause', async () => {
    const { thrown, events } = await run([
      refusedFrame('bio'),
      { type: 'result', subtype: 'success', is_error: false, stop_reason: 'end_turn', result: 'no json here' }
    ], { jsonSchema: SIMPLE_SCHEMA });
    expect(thrown).toBeInstanceOf(SdkRefusalError);
    expect(thrown.cause).toBeInstanceOf(StructuredOutputExtractionError);
    const errEvents = events.filter((e) => e.type === 'llm_error');
    expect(errEvents).toHaveLength(1);
    expect(errEvents[0].errorName).toBe('SdkRefusalError');
  });

  test('a refusal signal followed by a clean, schema-valid finish returns the result and records refusalSignal', async () => {
    const { thrown, value, events } = await run([
      refusedFrame('bio'),
      { type: 'result', subtype: 'success', is_error: false, stop_reason: 'end_turn', result: '{"ok":true}', structured_output: { ok: true } }
    ], { jsonSchema: SIMPLE_SCHEMA });
    expect(thrown).toBeUndefined();
    expect(value).toEqual({ ok: true });
    const complete = events.find((e) => e.type === 'llm_complete');
    expect(complete.refusalSignal).toEqual({ category: 'bio', explanation: 'This request may relate to biological harm.' });
    expect(complete.refusalFallback).toBeNull();
    expect(events.filter((e) => e.type === 'llm_error')).toHaveLength(0);
  });

  // Integrator ruling 2026-09-25: a declined request is never answered by another model.
  // The CLI's own fallback routes are off (CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK); one that
  // runs anyway on the main thread is a declined request.
  describe('a CLI fallback on the main thread is a declined request', () => {
    async function runStream(gen, opts = {}) {
      const events = [];
      setMockQuery(gen);
      let thrown;
      let value;
      try {
        value = await sdkQueryImpl({ prompt: 'test', model: 'opus', label: 'refusal-test', onProgress: (m) => events.push(m), ...opts });
      } catch (e) { thrown = e; }
      return { events, thrown, value };
    }
    const notice = (extra = {}) => ({
      type: 'system', subtype: 'model_refusal_fallback', trigger: 'refusal', direction: 'retry', scope: 'session',
      original_model: 'claude-opus-5-5', fallback_model: 'claude-opus-5', api_refusal_category: 'bio', content: 'retried', ...extra
    });
    const fallbackFrame = (model = 'claude-opus-5') => ({
      type: 'assistant', parent_tool_use_id: null, supersedes: ['u-refused'],
      message: { model, content: [{ type: 'text', text: 'ok' }], stop_reason: null }
    });

    test('the fallback notice throws at once, naming the category and the fallback model', async () => {
      let readPastNotice = false;
      const { thrown, value, events } = await runStream(() => (async function* () {
        yield refusedFrame('bio');
        yield notice();
        readPastNotice = true;
        yield fallbackFrame();
        yield { type: 'result', subtype: 'success', is_error: false, stop_reason: 'end_turn', result: 'ok' };
      })());

      expect(value).toBeUndefined();
      expect(thrown).toBeInstanceOf(SdkRefusalError);
      expect(thrown.message).toMatch(/category: bio/);
      expect(thrown.message).toMatch(/claude-opus-5-5 declined the request/);
      expect(thrown.message).toMatch(/retried it on claude-opus-5;/);
      expect(thrown.refusalCategory).toBe('bio');
      expect(thrown.refusalFallbackModel).toBe('claude-opus-5');
      expect(isTransientError(thrown)).toBe(false);
      expect(readPastNotice).toBe(false);   // nothing of the fallback's output is read

      const errEvents = events.filter((e) => e.type === 'llm_error');
      expect(errEvents).toHaveLength(1);
      expect(errEvents[0].errorName).toBe('SdkRefusalError');
      expect(errEvents[0].refusal).toEqual({ category: 'bio', explanation: 'This request may relate to biological harm.' });
      expect(errEvents[0].refusalFallback).toEqual({ originalModel: 'claude-opus-5-5', fallbackModel: 'claude-opus-5', category: 'bio', scope: 'session' });
      expect(events.filter((e) => e.type === 'llm_complete')).toHaveLength(0);
    });

    test('a notice with no scope (an older CLI; the types say to read it as session) is declined too', async () => {
      const { thrown } = await runStream(() => makeAsyncIterable([
        refusedFrame('cyber'),
        notice({ scope: undefined, fallback_model: 'claude-opus-4-8', api_refusal_category: 'cyber' }),
        { type: 'result', subtype: 'success', is_error: false, stop_reason: 'end_turn', result: 'ok' }
      ]));
      expect(thrown).toBeInstanceOf(SdkRefusalError);
      expect(thrown.refusalFallbackModel).toBe('claude-opus-4-8');
      expect(thrown.message).toMatch(/category: cyber/);
    });

    test('a frame that supersedes the refused frames is the fallback leg, declined before its notice arrives', async () => {
      const { thrown, events } = await runStream(() => makeAsyncIterable([
        refusedFrame('cyber'),
        fallbackFrame('claude-opus-4-8'),
        notice({ fallback_model: 'claude-opus-4-8', api_refusal_category: 'cyber' }),
        { type: 'result', subtype: 'success', is_error: false, stop_reason: 'end_turn', result: 'ok' }
      ]));
      expect(thrown).toBeInstanceOf(SdkRefusalError);
      expect(thrown.refusalCategory).toBe('cyber');
      expect(thrown.refusalFallbackModel).toBe('claude-opus-4-8');
      const err = events.find((e) => e.type === 'llm_error');
      expect(err.refusalFallback).toEqual({ originalModel: 'claude-opus-5-5', fallbackModel: 'claude-opus-4-8', category: 'cyber', scope: null });
    });

    test('a local fallback (a subagent\'s) is recorded, and the call returns', async () => {
      const { thrown, value, events } = await runStream(() => makeAsyncIterable([
        notice({ scope: 'local', api_refusal_category: 'cyber', fallback_model: 'claude-opus-4-8' }),
        { type: 'result', subtype: 'success', is_error: false, stop_reason: 'end_turn', result: 'ok' }
      ]));
      expect(thrown).toBeUndefined();
      expect(value).toBe('ok');
      expect(events.find((e) => e.type === 'llm_complete').refusalFallback)
        .toEqual({ originalModel: 'claude-opus-5-5', fallbackModel: 'claude-opus-4-8', category: 'cyber', scope: 'local' });
    });
  });

  test('an ordinary call carries refusalFallback and refusalSignal as null on llm_complete', async () => {
    const { events } = await run([{ type: 'result', subtype: 'success', stop_reason: 'end_turn', result: 'ok' }]);
    const complete = events.find((e) => e.type === 'llm_complete');
    expect(complete.refusalFallback).toBeNull();
    expect(complete.refusalSignal).toBeNull();
  });

  // A failure that reaches the catch after a refusal signal is named as the refusal,
  // with the failure kept as its cause.
  describe('the catch names a failure that follows a refusal signal', () => {
    const { isSdkTimeoutError } = require('../client');

    async function runStream(gen, opts = {}) {
      const events = [];
      setMockQuery(gen);
      let thrown;
      try {
        await sdkQueryImpl({ prompt: 'test', model: 'opus', label: 'refusal-test', onProgress: (m) => events.push(m), ...opts });
      } catch (e) { thrown = e; }
      return { events, thrown };
    }

    test('an iterator throw after a refusal signal is the refusal, with the throw as its cause', async () => {
      const reset = new Error('read ECONNRESET');
      reset.code = 'ECONNRESET';
      expect(isTransientError(reset)).toBe(true);   // on its own, retried

      const { thrown, events } = await runStream(() => (async function* () {
        yield refusedFrame('bio');
        throw reset;
      })());

      expect(thrown).toBeInstanceOf(SdkRefusalError);
      expect(thrown.message).toMatch(/category: bio/);
      expect(thrown.cause).toBe(reset);
      expect(isTransientError(thrown)).toBe(false);
      const errEvents = events.filter((e) => e.type === 'llm_error');
      expect(errEvents).toHaveLength(1);
      expect(errEvents[0].errorName).toBe('SdkRefusalError');
      expect(errEvents[0].error).toBe(thrown.message);
      expect(errEvents[0].refusal).toEqual({ category: 'bio', explanation: 'This request may relate to biological harm.' });
    });

    test('an idle abort after a refusal signal is the refusal, not a transient SDK timeout', async () => {
      const { thrown, events } = await runStream(({ options }) => (async function* () {
        yield refusedFrame('cyber');
        await new Promise((resolve) => options.abortController.signal.addEventListener('abort', resolve, { once: true }));
        const abortErr = new Error('The operation was aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      })(), { timeoutMs: 20 });

      expect(thrown).toBeInstanceOf(SdkRefusalError);
      expect(thrown.message).toMatch(/category: cyber/);
      expect(isSdkTimeoutError(thrown)).toBe(false);
      expect(isTransientError(thrown)).toBe(false);
      expect(thrown.cause.message).toMatch(/^SDK timeout after .* with no streamed activity/);
      const errEvents = events.filter((e) => e.type === 'llm_error');
      expect(errEvents).toHaveLength(1);
      expect(errEvents[0].errorName).toBe('SdkRefusalError');
    });

    test('a stream that ends after a refusal signal with no result is the refusal', async () => {
      const { thrown } = await runStream(() => makeAsyncIterable([refusedFrame('bio')]));
      expect(thrown).toBeInstanceOf(SdkRefusalError);
      expect(thrown.cause.message).toMatch(/No result received/);
    });

    test('with no refusal signal the same failures keep their old errors', async () => {
      const { thrown } = await runStream(() => makeAsyncIterable([{ type: 'assistant', parent_tool_use_id: null, message: { content: [], stop_reason: null } }]));
      expect(thrown).not.toBeInstanceOf(SdkRefusalError);
      expect(thrown.message).toMatch(/No result received/);
    });
  });

  test('the catch keeps the refusal (sdkSubtype preserved) and does not emit a second llm_error', async () => {
    const { thrown, events } = await run([refusedResult()]);
    expect(refusalOf(thrown)).toEqual({ category: null, explanation: null });
    expect(events.filter((e) => e.type === 'llm_error')).toHaveLength(1);
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

describe('sdkQueryImpl callId (spec 2026-09-19 §3.1)', () => {
  afterEach(() => clearMockQuery());

  async function capture() {
    const events = [];
    setMockQuery(() => makeAsyncIterable([
      { type: 'system', subtype: 'init', model: 'claude-haiku-4-5', tools: [] },
      { type: 'result', subtype: 'success', result: 'ok' }
    ]));
    await sdkQueryImpl({ prompt: 'x', model: 'haiku', onProgress: (e) => events.push(e) });
    return events;
  }

  test('every progress message of one call carries the same non-empty callId', async () => {
    const events = await capture();
    const types = events.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['llm_start', 'system', 'llm_complete']));
    const ids = new Set(events.map((e) => e.callId));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test('two calls get different callIds', async () => {
    const first = (await capture())[0].callId;
    const second = (await capture())[0].callId;
    expect(first).not.toBe(second);
  });
});

describe('sdkQueryImpl closes the record on every failure path (fix round 1)', () => {
  afterEach(() => clearMockQuery());

  /**
   * Every throw out of sdkQueryImpl must be preceded by exactly one llm_error, so the
   * per-call log's prompt-only file gets an outcome and its in-flight entry (which
   * holds the full prompt) is freed. Only two sites emitted one before this fix.
   */
  async function runAndCollect(mockImpl, opts = {}) {
    const events = [];
    setMockQuery(mockImpl);
    let thrown;
    try {
      await sdkQueryImpl({ prompt: 'test', model: 'haiku', label: 'err-test', onProgress: (m) => events.push(m), ...opts });
    } catch (e) { thrown = e; }
    expect(thrown).toBeDefined();
    const errEvents = events.filter((e) => e.type === 'llm_error');
    expect(events.filter((e) => e.type === 'llm_complete')).toHaveLength(0);
    return { events, errEvents, thrown };
  }

  test('an idle/stall abort emits one llm_error carrying the thrown timeout message', async () => {
    const { events, errEvents, thrown } = await runAndCollect(
      ({ options }) => (async function* () {
        await new Promise((resolve) => options.abortController.signal.addEventListener('abort', resolve, { once: true }));
        const abortErr = new Error('The operation was aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      })(),
      { timeoutMs: 20 }
    );

    expect(errEvents).toHaveLength(1);
    expect(errEvents[0].error).toBe(thrown.message);
    expect(errEvents[0].error).toMatch(/^SDK timeout after/);
    expect(typeof errEvents[0].elapsed).toBe('number');
    expect(errEvents[0].callId).toBe(events[0].callId);   // pairs with the llm_start file
  });

  test('error_max_budget_usd emits one llm_error', async () => {
    const { errEvents, thrown } = await runAndCollect(() => makeAsyncIterable([
      { type: 'result', subtype: 'error_max_budget_usd', total_cost_usd: 5.5, errors: [] }
    ]));

    expect(errEvents).toHaveLength(1);
    expect(errEvents[0].error).toBe(thrown.message);
    expect(errEvents[0].error).toMatch(/error_max_budget_usd/);
    expect(errEvents[0].errorName).toBe('Error');
  });

  test('a generic error result emits one llm_error', async () => {
    const { errEvents, thrown } = await runAndCollect(() => makeAsyncIterable([
      { type: 'result', subtype: 'error_during_execution', errors: ['overloaded_error'] }
    ]));

    expect(errEvents).toHaveLength(1);
    expect(errEvents[0].error).toBe(thrown.message);
    expect(errEvents[0].error).toMatch(/overloaded_error/);
  });

  test('a stream that ends with no result emits one llm_error', async () => {
    const { errEvents, thrown } = await runAndCollect(() => makeAsyncIterable([
      { type: 'system', subtype: 'init', model: 'claude-haiku-4-5', tools: [] }
    ]));

    expect(errEvents).toHaveLength(1);
    expect(errEvents[0].error).toBe(thrown.message);
    expect(errEvents[0].error).toMatch(/No result received/);
  });

  test('an iterator that throws emits one llm_error naming the error', async () => {
    const { errEvents, thrown } = await runAndCollect(() => (async function* () {
      throw new TypeError('socket exploded');
    })());

    expect(errEvents).toHaveLength(1);
    expect(errEvents[0].error).toBe(thrown.message);
    expect(errEvents[0].errorName).toBe('TypeError');
  });

  test('the two in-loop emitters are not double-counted by the catch', async () => {
    const isError = await runAndCollect(() => makeAsyncIterable([
      { type: 'result', subtype: 'success', is_error: true, api_error_status: 529, result: 'API Error: 529 overloaded' }
    ]));
    expect(isError.errEvents).toHaveLength(1);
    expect(isError.errEvents[0].apiErrorStatus).toBe(529);   // still the in-loop envelope, not the catch's

    const extraction = await runAndCollect(
      () => makeAsyncIterable([{ type: 'result', subtype: 'success', result: 'no json here' }]),
      { jsonSchema: SIMPLE_SCHEMA }
    );
    expect(extraction.thrown).toBeInstanceOf(StructuredOutputExtractionError);
    expect(extraction.errEvents).toHaveLength(1);
    expect(extraction.errEvents[0].structuredOutputPresent).toBe(false);
  });
});

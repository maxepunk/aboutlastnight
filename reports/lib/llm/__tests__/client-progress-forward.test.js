const { setMockQuery, clearMockQuery } = require('@anthropic-ai/claude-agent-sdk');
const { sdkQueryImpl } = require('../client');

function makeAsyncIterable(messages) {
  return (async function* () { for (const m of messages) yield m; })();
}

async function captureForward(sdkMessages) {
  const events = [];
  setMockQuery(() => makeAsyncIterable([
    ...sdkMessages,
    { type: 'result', subtype: 'success', result: 'ok' }
  ]));
  await sdkQueryImpl({ prompt: 'x', model: 'haiku', onProgress: (e) => events.push(e) });
  return events;
}

describe('client onProgress forward — api_retry', () => {
  afterEach(() => clearMockQuery());

  it('forwards a structured retry field with attempt/reason/status/backoff', async () => {
    const events = await captureForward([
      { type: 'system', subtype: 'api_retry', attempt: 2, max_retries: 10, retry_delay_ms: 30000, error_status: 429, error: 'rate_limit' }
    ]);
    const retry = events.find(e => e.subtype === 'api_retry');
    expect(retry).toBeDefined();
    expect(retry.retry).toEqual({ attempt: 2, maxRetries: 10, delayMs: 30000, errorStatus: 429, reason: 'rate_limit' });
  });
});

describe('client onProgress forward — init & status', () => {
  afterEach(() => clearMockQuery());

  it('forwards init model/betas/toolCount/toolNames/permissionMode', async () => {
    const events = await captureForward([
      { type: 'system', subtype: 'init', model: 'claude-opus-4-8', betas: ['context-1m-2025-08-07'], tools: ['Read', 'Write', 'Bash'], permissionMode: 'bypassPermissions' }
    ]);
    const init = events.find(e => e.subtype === 'init');
    expect(init.init).toEqual({
      model: 'claude-opus-4-8', betas: ['context-1m-2025-08-07'],
      toolCount: 3, toolNames: ['Read', 'Write', 'Bash'], permissionMode: 'bypassPermissions'
    });
  });

  // A leaked tool set should say which tools leaked (an MCP server shows by its prefix).
  it('forwards the tool names beside the count, and leaves both undefined when init lists no tools', async () => {
    const leaked = await captureForward([
      { type: 'system', subtype: 'init', model: 'claude-opus-5-5', tools: ['Read', 'mcp__gmail__send'], permissionMode: 'bypassPermissions' }
    ]);
    expect(leaked.find(e => e.subtype === 'init').init.toolNames).toEqual(['Read', 'mcp__gmail__send']);

    const none = await captureForward([{ type: 'system', subtype: 'init', model: 'claude-opus-5-5' }]);
    const init = none.find(e => e.subtype === 'init').init;
    expect(init.toolNames).toBeUndefined();
    expect(init.toolCount).toBeUndefined();
  });

  // Brief 2.0: the gate reads memory paths and the applied effort off init. Neither is
  // in the 0.3.282 public SDKSystemMessage for query() calls (memory_paths not at all,
  // effort only on Remote Control frames), so both are forwarded raw when present.
  it('forwards init effort and memory paths', async () => {
    const events = await captureForward([
      { type: 'system', subtype: 'init', model: 'claude-opus-5-5', tools: [], permissionMode: 'bypassPermissions', effort: 'xhigh', memory_paths: { auto: 'C:/Users/x/.claude/projects/p/memory' } }
    ]);
    const init = events.find(e => e.subtype === 'init').init;
    expect(init.effort).toBe('xhigh');
    expect(init.memoryPaths).toEqual({ auto: 'C:/Users/x/.claude/projects/p/memory' });
    expect(init.toolCount).toBe(0);
  });

  it('leaves effort and memoryPaths undefined when init omits them', async () => {
    const events = await captureForward([
      { type: 'system', subtype: 'init', model: 'claude-haiku-4-5', tools: ['Read'], permissionMode: 'bypassPermissions' }
    ]);
    const init = events.find(e => e.subtype === 'init').init;
    expect(init.effort).toBeUndefined();
    expect(init.memoryPaths).toBeUndefined();
    expect(init.toolCount).toBe(1);
  });

  it('forwards the status enum as sdkStatus', async () => {
    const events = await captureForward([
      { type: 'system', subtype: 'status', status: 'requesting' }
    ]);
    expect(events.find(e => e.subtype === 'status').sdkStatus).toBe('requesting');
  });
});

describe('client onProgress forward — hooks', () => {
  afterEach(() => clearMockQuery());
  it('forwards hook name/event/outcome/exitCode', async () => {
    const events = await captureForward([
      { type: 'system', subtype: 'hook_response', hook_name: 'PreToolUse', hook_event: 'PreToolUse', outcome: 'error', exit_code: 1 }
    ]);
    expect(events.find(e => e.subtype === 'hook_response').hook).toEqual({ name: 'PreToolUse', event: 'PreToolUse', outcome: 'error', exitCode: 1 });
  });
});

describe('client onProgress forward — mirror_error & notification', () => {
  afterEach(() => clearMockQuery());
  it('forwards mirror_error text and notification text/priority', async () => {
    const events = await captureForward([
      { type: 'system', subtype: 'mirror_error', error: 'disk write failed', key: { projectKey: 'p', sessionId: 's' } },
      { type: 'system', subtype: 'notification', key: 'k', text: 'context window 80% full', priority: 'high' }
    ]);
    expect(events.find(e => e.subtype === 'mirror_error').mirrorError).toBe('disk write failed');
    expect(events.find(e => e.subtype === 'notification').notification).toEqual({ text: 'context window 80% full', priority: 'high' });
  });
});

describe('client onProgress forward — is_error result', () => {
  afterEach(() => clearMockQuery());
  it('forwards resultIsError + apiErrorStatus on the result event (call throws)', async () => {
    // Self-contained (captureForward appends its own success result and expects resolution;
    // an is_error result makes sdkQueryImpl throw).
    const events = [];
    setMockQuery(() => makeAsyncIterable([
      { type: 'result', subtype: 'success', is_error: true, api_error_status: 401, result: 'Failed to authenticate. API Error: 401' }
    ]));
    try {
      await sdkQueryImpl({ prompt: 'x', model: 'haiku', onProgress: (e) => events.push(e) });
    } catch { /* expected */ }
    const resultEvent = events.find(e => e.type === 'result');
    expect(resultEvent).toBeDefined();
    expect(resultEvent.resultIsError).toBe(true);
    expect(resultEvent.apiErrorStatus).toBe(401);
  });
});

describe('client llm_complete — the served model (brief 2.0)', () => {
  afterEach(() => clearMockQuery());

  async function complete(result) {
    const events = [];
    setMockQuery(() => makeAsyncIterable([{ type: 'result', subtype: 'success', result: 'ok', ...result }]));
    await sdkQueryImpl({ prompt: 'x', model: 'opus', onProgress: (e) => events.push(e) });
    return events.find(e => e.type === 'llm_complete');
  }

  it('reads the served model from the result modelUsage, preferring canonicalModel', async () => {
    const event = await complete({ modelUsage: { 'claude-opus-5-5[1m]': { outputTokens: 10, canonicalModel: 'claude-opus-5-5' } } });
    expect(event.servedModels).toEqual(['claude-opus-5-5']);
  });

  it('falls back to the modelUsage key when there is no canonicalModel', async () => {
    const event = await complete({ modelUsage: { 'claude-opus-5-5': { outputTokens: 3 } } });
    expect(event.servedModels).toEqual(['claude-opus-5-5']);
  });

  // Round 3 (corrected 2026-09-26): another model on the answer's own frames fails the call
  // (SdkModelSubstitutionError); the llm_error carries both lists, what the CLI used
  // (servedModels) and what wrote the answer (answerModels).
  it('lists every model the CLI used and every model that wrote the answer on the llm_error', async () => {
    const events = [];
    setMockQuery(() => makeAsyncIterable([
      { type: 'assistant', parent_tool_use_id: null, message: { model: 'claude-opus-4-8', content: [{ type: 'text', text: 'ok' }] } },
      {
        type: 'result', subtype: 'success', result: 'ok',
        modelUsage: { 'claude-opus-5-5': { outputTokens: 3 }, 'claude-opus-4-8': { outputTokens: 900 } }
      }
    ]));
    await expect(sdkQueryImpl({ prompt: 'x', model: 'opus', onProgress: (e) => events.push(e) }))
      .rejects.toThrow(/SDK model substitution/);
    expect(events.find(e => e.type === 'llm_complete')).toBeUndefined();
    const err = events.find(e => e.type === 'llm_error');
    expect(err.servedModels).toEqual(['claude-opus-5-5', 'claude-opus-4-8']);
    expect(err.answerModels).toEqual(['claude-opus-4-8']);
  });

  // The live case, 2026-09-26: the CLI's own Haiku helper in modelUsage, every frame of the
  // answer the pinned model's. The call completes and the record shows both lists.
  it('records a helper model in servedModels without failing a pinned-model answer', async () => {
    const events = [];
    setMockQuery(() => makeAsyncIterable([
      { type: 'assistant', parent_tool_use_id: null, message: { model: 'claude-sonnet-5', content: [{ type: 'text', text: 'ok' }] } },
      { type: 'result', subtype: 'success', result: 'ok', modelUsage: { 'claude-haiku-4-5': { outputTokens: 40 }, 'claude-sonnet-5': { outputTokens: 7988 } } }
    ]));
    await sdkQueryImpl({ prompt: 'x', model: 'sonnet', onProgress: (e) => events.push(e) });
    const done = events.find(e => e.type === 'llm_complete');
    expect(done.servedModels).toEqual(['claude-haiku-4-5', 'claude-sonnet-5']);
    expect(done.answerModels).toEqual(['claude-sonnet-5']);
  });

  it('is null when the result has no modelUsage', async () => {
    const event = await complete({});
    expect(event.servedModels).toBeNull();
  });
});

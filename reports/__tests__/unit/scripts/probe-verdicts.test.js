/**
 * The 2.0 gate probes fail as specified (brief 2.0). The live calls are the integrator's;
 * here the rules run on hand-built observations, and each probe runs through the real
 * wrapper (sdkQueryImpl) over the Jest SDK mock.
 */
const { setMockQuery, clearMockQuery } = require('@anthropic-ai/claude-agent-sdk');
const { sdkQueryImpl, MODEL_IDS } = require('../../../lib/llm/client');
const { isolationVerdict, channelVerdict } = require('../../../scripts/lib/probe-verdicts');

afterEach(() => clearMockQuery());

// servedModelMatches moved to lib/llm/sdk-fields.js (the wrapper uses it); its cases
// are in lib/llm/__tests__/sdk-fields.test.js.

describe('isolationVerdict', () => {
  const good = {
    alias: 'opus', pinnedId: 'claude-opus-5-5',
    inits: [{ model: 'claude-opus-5-5', toolCount: 0 }],
    thinkingChars: 420, servedModels: ['claude-opus-5-5'], error: null
  };

  test('a clean pipeline-shaped call passes', () => {
    expect(isolationVerdict(good)).toEqual({ ok: true, failures: [] });
  });

  test.each([
    ['more than one tool', { inits: [{ toolCount: 103 }] }, /103 tools/],
    ['an init that does not report its tools', { inits: [{ model: 'x' }] }, /did not report its tools/],
    ['no init frame', { inits: [] }, /no init frame/],
    ['a loaded memory path', { inits: [{ toolCount: 0, memoryPaths: { auto: '/m' } }] }, /memory loaded/],
    ['no thinking text on Opus', { thinkingChars: 0 }, /no readable thinking/],
    ['no served model', { servedModels: null }, /no served model/],
    ['a fallback model among the served', { servedModels: ['claude-opus-5-5', 'claude-opus-4-8'] }, /served by claude-opus-4-8/],
    ['a failed call', { error: 'SDK timeout after 900s' }, /call failed/]
  ])('fails on %s', (_name, override, message) => {
    const verdict = isolationVerdict({ ...good, ...override });
    expect(verdict.ok).toBe(false);
    expect(verdict.failures.join('\n')).toMatch(message);
  });

  test('Haiku needs no thinking text, and one tool (Read) is allowed', () => {
    expect(isolationVerdict({ ...good, alias: 'haiku', pinnedId: 'claude-haiku-4-5', inits: [{ toolCount: 1 }], thinkingChars: 0, servedModels: ['claude-haiku-4-5'] }).ok).toBe(true);
  });

  test('a repeated per-turn init reports the same failure once', () => {
    const verdict = isolationVerdict({ ...good, inits: [{ toolCount: 5 }, { toolCount: 5 }] });
    expect(verdict.failures.filter((f) => /5 tools/.test(f))).toHaveLength(1);
  });

  test('a failure on the tool count names the tools, capped for a large leak', () => {
    const three = isolationVerdict({ ...good, inits: [{ toolCount: 3, toolNames: ['Read', 'Bash', 'mcp__gmail__send'] }] });
    expect(three.failures).toContain('init reported 3 tools (a pipeline call has 0 or 1): Read, Bash, mcp__gmail__send');

    const names = Array.from({ length: 103 }, (_, i) => `mcp__srv__tool${i}`);
    const big = isolationVerdict({ ...good, inits: [{ toolCount: 103, toolNames: names }] });
    const line = big.failures.find((f) => /103 tools/.test(f));
    expect(line).toMatch(/: mcp__srv__tool0, .*mcp__srv__tool24 and 78 more$/);
    expect(line).not.toMatch(/tool25\b/);

    // One allowed tool is not a failure, so its name is not printed.
    expect(isolationVerdict({ ...good, inits: [{ toolCount: 1, toolNames: ['Read'] }] }).ok).toBe(true);
  });
});

describe('channelVerdict', () => {
  test('passes only on the SDK channel', () => {
    expect(channelVerdict({ channel: 'structured_output' }).ok).toBe(true);
    expect(channelVerdict({ channel: 'text_fallback' })).toEqual({ ok: false, failures: [expect.stringMatching(/text fallback/)] });
    expect(channelVerdict({ channel: null }).ok).toBe(false);
    expect(channelVerdict({ channel: 'structured_output', error: 'boom' }).ok).toBe(false);
  });
});

describe('scripts/probe-sdk-isolation.js through the wrapper', () => {
  const { PROBE_CALLS, probeOne, parseModels } = require('../../../scripts/probe-sdk-isolation');

  function stream({ tools = [], thinking = 'Cascade: 4200 after the reversal.', served = { 'claude-opus-5-5': { canonicalModel: 'claude-opus-5-5' } }, memory } = {}) {
    let captured;
    setMockQuery(({ options }) => {
      captured = options;
      return (async function* () {
        yield { type: 'system', subtype: 'init', model: options.model, tools, permissionMode: 'bypassPermissions', ...(memory && { memory_paths: memory }) };
        if (thinking) yield { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking } } };
        yield { type: 'result', subtype: 'success', stop_reason: 'end_turn', result: '', structured_output: { account: 'Ember Trust', total: 5250 }, modelUsage: served };
      })();
    });
    return () => captured;
  }

  test('passes on a clean Opus call and sends the pipeline options unchanged', async () => {
    const options = stream();
    const { verdict, obs } = await probeOne('opus', { sdkQuery: sdkQueryImpl, modelIds: MODEL_IDS });
    expect(verdict).toEqual({ ok: true, failures: [] });
    expect(obs.answer).toEqual({ account: 'Ember Trust', total: 5250 });
    expect(options().tools).toEqual([]);
    expect(options().mcpServers).toEqual({});
    expect(options().strictMcpConfig).toBe(true);
    expect(options().settingSources).toEqual([]);
    expect(options().env.CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe('1');
    expect(options().env.CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK).toBe('1');
    expect(options().env.CLAUDE_CODE_NO_MODEL_FALLBACK).toBe('1');
    expect(options().thinking).toEqual({ type: 'adaptive', display: 'summarized' });
  });

  test('the Haiku call carries the one-tool image shape', async () => {
    const options = stream({ tools: ['Read'], thinking: null, served: { 'claude-haiku-4-5': {} } });
    const { verdict } = await probeOne('haiku', { sdkQuery: sdkQueryImpl, modelIds: MODEL_IDS });
    expect(verdict.ok).toBe(true);
    expect(options().tools).toEqual(['Read']);
    expect(PROBE_CALLS.haiku.allowedTools).toEqual(['Read']);
  });

  test('fails on a leaked tool set, loaded memory, silent thinking and a fallback model', async () => {
    stream({ tools: ['Read', 'Bash', 'mcp__gmail__send'], thinking: null, memory: { auto: '/home/x/memory' }, served: { 'claude-opus-4-8': {} } });
    const { verdict } = await probeOne('opus', { sdkQuery: sdkQueryImpl, modelIds: MODEL_IDS });
    const text = verdict.failures.join('\n');
    expect(verdict.ok).toBe(false);
    expect(text).toMatch(/3 tools \(a pipeline call has 0 or 1\): Read, Bash, mcp__gmail__send/);
    expect(text).toMatch(/memory loaded/);
    expect(text).toMatch(/no readable thinking/);
    expect(text).toMatch(/served by claude-opus-4-8, not claude-opus-5-5/);
  });

  test('--model selects aliases and rejects unknown ones', () => {
    expect(parseModels([])).toEqual(['opus', 'sonnet', 'haiku']);
    expect(parseModels(['--model', 'opus,haiku'])).toEqual(['opus', 'haiku']);
    expect(() => parseModels(['--model', 'fable'])).toThrow(/comma list/);
    expect(() => parseModels(['--model'])).toThrow(/comma list/);
  });
});

describe('scripts/check-model-freshness.js through the wrapper', () => {
  const { checkModel } = require('../../../scripts/check-model-freshness');

  function stream(initModel, served) {
    let captured;
    setMockQuery(({ options }) => {
      captured = options;
      return (async function* () {
        yield { type: 'system', subtype: 'init', model: initModel, tools: [] };
        yield { type: 'result', subtype: 'success', stop_reason: 'end_turn', result: 'OK', modelUsage: served };
      })();
    });
    return () => captured;
  }

  test('passes the wrapper\'s isolation options and accepts a matching model', async () => {
    const options = stream('claude-opus-5-5', { 'claude-opus-5-5': {} });
    const r = await checkModel('opus', 'claude-opus-5-5', { sdkQuery: sdkQueryImpl });
    expect(r.ok).toBe(true);
    expect(options().mcpServers).toEqual({});
    expect(options().strictMcpConfig).toBe(true);
    expect(options().settingSources).toEqual([]);
    expect(options().env.CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe('1');
    expect(options().env.CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK).toBe('1');
    expect(options().env.CLAUDE_CODE_NO_MODEL_FALLBACK).toBe('1');
    expect(options().tools).toEqual([]);
  });

  test('flags an init or served model that is not the pinned id', async () => {
    stream('claude-opus-4-8', { 'claude-opus-4-8': {} });
    expect((await checkModel('opus', 'claude-opus-5-5', { sdkQuery: sdkQueryImpl })).ok).toBe(false);
    stream('claude-opus-5-5', { 'claude-opus-4-8': {} });
    expect((await checkModel('opus', 'claude-opus-5-5', { sdkQuery: sdkQueryImpl })).ok).toBe(false);
    stream('claude-opus-4-8', { 'claude-opus-5-5': {} });
    expect((await checkModel('opus', 'claude-opus-5-5', { sdkQuery: sdkQueryImpl })).ok).toBe(false);
  });

  // The init model goes through servedModelMatches, as the served model does.
  test('tolerates a [1m] or dated suffix on the init model, as on the served model', async () => {
    stream('claude-opus-5-5[1m]', { 'claude-opus-5-5[1m]': {} });
    expect((await checkModel('opus', 'claude-opus-5-5', { sdkQuery: sdkQueryImpl })).ok).toBe(true);
    stream('claude-haiku-4-5-20251001', { 'claude-haiku-4-5-20251001': {} });
    expect((await checkModel('haiku', 'claude-haiku-4-5', { sdkQuery: sdkQueryImpl })).ok).toBe(true);
    stream('claude-opus-5-5-lite', { 'claude-opus-5-5': {} });
    expect((await checkModel('opus', 'claude-opus-5-5', { sdkQuery: sdkQueryImpl })).ok).toBe(false);
  });
});

describe('requiring a probe makes no model call', () => {
  test.each([
    '../../../scripts/probe-sdk-isolation',
    '../../../scripts/probe-content-bundle-channel',
    '../../../scripts/check-model-freshness'
  ])('%s', (modulePath) => {
    const called = jest.fn();
    setMockQuery(() => { called(); return (async function* () {})(); });
    jest.isolateModules(() => { require(modulePath); });
    expect(called).not.toHaveBeenCalled();
  });
});

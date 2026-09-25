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

// Round 2 item 3 (live gate, 2026-09-25): CLI 2.1.282 counts its own structured-output
// tool at init. The rule is exact: the init's tool names are the tools the call
// declared, plus StructuredOutput when the call has a schema. Any other tool fails and
// is named; so does a missing one.
describe('isolationVerdict', () => {
  const init = (toolNames, extra = {}) => ({ model: 'claude-opus-5-5', toolCount: toolNames.length, toolNames, ...extra });
  const good = {
    alias: 'opus', pinnedId: 'claude-opus-5-5',
    declaredTools: [], hasSchema: true,
    inits: [init(['StructuredOutput'])],
    thinkingChars: 420, servedModels: ['claude-opus-5-5'], error: null
  };

  test('a clean pipeline-shaped call passes', () => {
    expect(isolationVerdict(good)).toEqual({ ok: true, failures: [] });
  });

  test('the live gate\'s shapes pass: Opus disableTools + schema, Haiku Read + schema', () => {
    expect(isolationVerdict(good).ok).toBe(true);
    expect(isolationVerdict({
      ...good, alias: 'haiku', pinnedId: 'claude-haiku-4-5', declaredTools: ['Read'],
      inits: [init(['Read', 'StructuredOutput'])], thinkingChars: 0, servedModels: ['claude-haiku-4-5']
    })).toEqual({ ok: true, failures: [] });
  });

  test('without a schema, StructuredOutput is not expected (and fails if it appears)', () => {
    expect(isolationVerdict({ ...good, hasSchema: false, inits: [init([])] }).ok).toBe(true);
    const verdict = isolationVerdict({ ...good, hasSchema: false, inits: [init(['StructuredOutput'])] });
    expect(verdict.failures).toContain('init reported undeclared tools: StructuredOutput (expected exactly: none)');
  });

  test.each([
    ['an undeclared tool', { inits: [init(['StructuredOutput', 'Bash'])] }, /undeclared tools: Bash \(expected exactly: StructuredOutput\)/],
    ['a missing StructuredOutput on a schema call', { inits: [init([])] }, /missing expected tools: StructuredOutput/],
    ['a missing declared tool', { declaredTools: ['Read'], inits: [init(['StructuredOutput'])] }, /missing expected tools: Read \(expected exactly: Read, StructuredOutput\)/],
    ['an init that does not report its tools', { inits: [{ model: 'x', toolCount: 1 }] }, /did not report its tools/],
    ['a call that declared no tool set', { declaredTools: null }, /declared no tool set/],
    ['no init frame', { inits: [] }, /no init frame/],
    ['a loaded memory path', { inits: [init(['StructuredOutput'], { memoryPaths: { auto: '/m' } })] }, /memory loaded/],
    ['no thinking text on Opus', { thinkingChars: 0 }, /no readable thinking/],
    ['no served model', { servedModels: null }, /no served model/],
    ['a fallback model among the served', { servedModels: ['claude-opus-5-5', 'claude-opus-4-8'] }, /served by claude-opus-4-8/],
    ['a failed call', { error: 'SDK timeout after 900s' }, /call failed/]
  ])('fails on %s', (_name, override, message) => {
    const verdict = isolationVerdict({ ...good, ...override });
    expect(verdict.ok).toBe(false);
    expect(verdict.failures.join('\n')).toMatch(message);
  });

  test('the old "0 or 1" rule is gone: one undeclared tool fails, two declared ones pass', () => {
    expect(isolationVerdict({ ...good, hasSchema: false, inits: [init(['Read'])] }).ok).toBe(false);
    expect(isolationVerdict({ ...good, declaredTools: ['Read', 'Glob'], hasSchema: false, inits: [init(['Glob', 'Read'])] }).ok).toBe(true);
  });

  test('a repeated per-turn init reports the same failure once', () => {
    const verdict = isolationVerdict({ ...good, inits: [init(['StructuredOutput', 'Bash']), init(['StructuredOutput', 'Bash'])] });
    expect(verdict.failures.filter((f) => /undeclared tools: Bash/.test(f))).toHaveLength(1);
  });

  test('the failure names every undeclared tool, capped for a large leak', () => {
    const three = isolationVerdict({ ...good, inits: [init(['Read', 'Bash', 'mcp__gmail__send', 'StructuredOutput'])] });
    expect(three.failures).toContain('init reported undeclared tools: Read, Bash, mcp__gmail__send (expected exactly: StructuredOutput)');

    const names = Array.from({ length: 103 }, (_, i) => `mcp__srv__tool${i}`);
    const big = isolationVerdict({ ...good, inits: [init(['StructuredOutput', ...names])] });
    const line = big.failures.find((f) => /undeclared tools/.test(f));
    expect(line).toMatch(/: mcp__srv__tool0, .*mcp__srv__tool24 and 78 more \(expected exactly: StructuredOutput\)$/);
    expect(line).not.toMatch(/tool25\b/);
  });
});

describe('declaredToolsOf / expectedInitTools', () => {
  const { declaredToolsOf, expectedInitTools } = require('../../../scripts/lib/probe-verdicts');

  test('disableTools wins and declares none; tools declares its list; neither declares nothing', () => {
    expect(declaredToolsOf({ disableTools: true, tools: ['Read'] })).toEqual([]);
    expect(declaredToolsOf({ tools: ['Read'], allowedTools: ['Bash'] })).toEqual(['Read']);
    expect(declaredToolsOf({ allowedTools: ['Read'] })).toBeNull();
  });

  test('a schema adds StructuredOutput once', () => {
    expect(expectedInitTools([], true)).toEqual(['StructuredOutput']);
    expect(expectedInitTools(['Read'], true)).toEqual(['Read', 'StructuredOutput']);
    expect(expectedInitTools(['Read'], false)).toEqual(['Read']);
    expect(expectedInitTools(['StructuredOutput'], true)).toEqual(['StructuredOutput']);
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
  const { PROBE_CALLS, probeOne, parseModels, report } = require('../../../scripts/probe-sdk-isolation');

  // The init tool lists default to what CLI 2.1.282 reported at the live gate.
  function stream({ tools = ['StructuredOutput'], thinking = 'Cascade: 4200 after the reversal.', served = { 'claude-opus-5-5': { canonicalModel: 'claude-opus-5-5' } }, memory } = {}) {
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
    expect(obs.declaredTools).toEqual([]);
    expect(obs.hasSchema).toBe(true);
    expect(options().tools).toEqual([]);
    expect(options().mcpServers).toEqual({});
    expect(options().strictMcpConfig).toBe(true);
    expect(options().settingSources).toEqual([]);
    expect(options().env.CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe('1');
    expect(options().env.CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK).toBe('1');
    expect(options().env.CLAUDE_CODE_NO_MODEL_FALLBACK).toBe('1');
    expect(options().thinking).toEqual({ type: 'adaptive', display: 'summarized' });
  });

  test('the Haiku call carries the one-tool image shape, and Read plus StructuredOutput passes', async () => {
    const options = stream({ tools: ['Read', 'StructuredOutput'], thinking: null, served: { 'claude-haiku-4-5': {} } });
    const { verdict, obs } = await probeOne('haiku', { sdkQuery: sdkQueryImpl, modelIds: MODEL_IDS });
    expect(verdict).toEqual({ ok: true, failures: [] });
    expect(obs.declaredTools).toEqual(['Read']);
    expect(options().tools).toEqual(['Read']);
    expect(PROBE_CALLS.haiku.allowedTools).toEqual(['Read']);
  });

  test('fails on a leaked tool set, loaded memory, silent thinking and a fallback model', async () => {
    stream({ tools: ['Read', 'Bash', 'mcp__gmail__send'], thinking: null, memory: { auto: '/home/x/memory' }, served: { 'claude-opus-4-8': {} } });
    const { verdict } = await probeOne('opus', { sdkQuery: sdkQueryImpl, modelIds: MODEL_IDS });
    const text = verdict.failures.join('\n');
    expect(verdict.ok).toBe(false);
    expect(text).toMatch(/undeclared tools: Read, Bash, mcp__gmail__send \(expected exactly: StructuredOutput\)/);
    expect(text).toMatch(/missing expected tools: StructuredOutput/);
    expect(text).toMatch(/memory loaded/);
    expect(text).toMatch(/no readable thinking/);
    expect(text).toMatch(/served by claude-opus-4-8, not claude-opus-5-5/);
  });

  test('every init line prints the tool names, on a pass as on a failure', async () => {
    stream({ tools: ['Read', 'StructuredOutput'], thinking: null, served: { 'claude-haiku-4-5': {} } });
    const passed = await probeOne('haiku', { sdkQuery: sdkQueryImpl, modelIds: MODEL_IDS });
    const passText = report(passed);
    expect(passText).toMatch(/PASS/);
    expect(passText).toMatch(/init 1: model=claude-haiku-4-5 tools=2 \[Read, StructuredOutput\]/);
    expect(passText).toMatch(/expected tools: \[Read, StructuredOutput\] \(declared \[Read\], plus StructuredOutput for the schema\)/);

    stream({ tools: ['StructuredOutput', 'Bash'] });
    const failed = await probeOne('opus', { sdkQuery: sdkQueryImpl, modelIds: MODEL_IDS });
    const failText = report(failed);
    expect(failText).toMatch(/FAIL/);
    expect(failText).toMatch(/init 1: model=claude-opus-5-5 tools=2 \[StructuredOutput, Bash\]/);
    expect(failText).toMatch(/x init reported undeclared tools: Bash/);
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
